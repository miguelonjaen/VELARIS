-- Add optional onboard systems to the same revisioned inventory.
-- No vessel rows, equipment, documents or maintenance records are rewritten.
begin;
create or replace function public.fleet_validate_systems(p_inventory jsonb)
returns void language plpgsql immutable set search_path='' as $systems$
declare systems jsonb; equipment jsonb; link jsonb; item jsonb; field text; source_section text; target_section text; ids text[]; external_ids text[]; routes text[] := array[]::text[]; route text;
begin
 if not (p_inventory ? 'systems') then return; end if;
 systems := p_inventory->'systems';
 if jsonb_typeof(systems) is distinct from 'object' or systems->'version' is distinct from '1'::jsonb or systems-array['version','equipment','links']<>'{}'::jsonb or jsonb_typeof(systems->'equipment') is distinct from 'array' or jsonb_typeof(systems->'links') is distinct from 'array' then raise exception 'Invalid onboard systems format' using errcode='22023'; end if;
 equipment := systems->'equipment';
 if jsonb_array_length(equipment)>2000 or jsonb_array_length(systems->'links')>4000 then raise exception 'Onboard systems limit exceeded' using errcode='22023'; end if;
 select coalesce(array_agg(x->>'id'),array[]::text[]) into external_ids from jsonb_array_elements(coalesce(p_inventory->'components','[]'::jsonb)||coalesce(p_inventory#>'{installation,nodes}','[]'::jsonb)||coalesce(p_inventory#>'{installation,links}','[]'::jsonb)||coalesce(p_inventory#>'{electrical,wires}','[]'::jsonb)) x;
 ids := external_ids;
 for item in select * from jsonb_array_elements(equipment) loop
  if jsonb_typeof(item) is distinct from 'object' or item-array['id','section','catalogId','name','manufacturer','model','serial','location','specification','condition','lastService','nextService','notes','archived']<>'{}'::jsonb or not (item ?& array['id','section','catalogId','name','manufacturer','model','serial','location','specification','condition','lastService','nextService','notes','archived']) then raise exception 'Invalid onboard equipment fields' using errcode='22023'; end if;
  foreach field in array array['id','section','catalogId','name','manufacturer','model','serial','location','specification','condition','lastService','nextService','notes'] loop
   if jsonb_typeof(item->field) is distinct from 'string' or length(item->>field)>(case when field='notes' then 4000 else 240 end) then raise exception 'Invalid equipment text field' using errcode='22023'; end if;
  end loop;
  if item->>'id' ~ '^[[:space:]]*$' or item->>'name' ~ '^[[:space:]]*$' or item->>'id'=any(ids) or jsonb_typeof(item->'archived') is distinct from 'boolean' or item->>'condition' not in ('unknown','declared-operational','needs-service','out-of-service') or not exists (select 1 from (values ('propulsion','engine'),('propulsion','gearbox'),('propulsion','shaft'),('propulsion','propeller'),('propulsion','saildrive'),('propulsion','cooling'),('electronics','gps'),('electronics','ais'),('electronics','vhf'),('electronics','plotter'),('electronics','radar'),('electronics','sounder'),('electronics','network'),('electronics','autopilot'),('rigging','mast'),('rigging','standing'),('rigging','running'),('rigging','boom'),('rigging','mainsail'),('rigging','headsail'),('rigging','winch'),('safety','liferaft'),('safety','lifejacket'),('safety','extinguisher'),('safety','epirb'),('safety','lifebuoy'),('safety','flares'),('safety','firstaid'),('safety','bilgepump'),('propulsion','custom-propulsion'),('electronics','custom-electronics'),('rigging','custom-rigging'),('safety','custom-safety')) as catalog(section,id) where catalog.section=item->>'section' and catalog.id=item->>'catalogId') then raise exception 'Invalid onboard equipment identity or classification' using errcode='22023'; end if;
  foreach field in array array['lastService','nextService'] loop
   if item->>field='' then continue; end if;
   if item->>field !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid equipment date' using errcode='22023'; end if;
   begin
    if substring(item->>field,1,4)::integer<100 or to_char(to_date(item->>field,'YYYY-MM-DD'),'YYYY-MM-DD')<>item->>field then raise exception 'Invalid equipment date' using errcode='22023'; end if;
   exception when others then raise exception 'Invalid equipment date' using errcode='22023'; end;
  end loop;
  ids := array_append(ids,item->>'id');
 end loop;
 for link in select * from jsonb_array_elements(systems->'links') loop
  if jsonb_typeof(link) is distinct from 'object' or link-array['id','from','to','label']<>'{}'::jsonb or not (link ?& array['id','from','to','label']) then raise exception 'Invalid onboard relationship fields' using errcode='22023'; end if;
  foreach field in array array['id','from','to','label'] loop
   if jsonb_typeof(link->field) is distinct from 'string' or length(link->>field)>240 or link->>field ~ '^[[:space:]]*$' then raise exception 'Invalid relationship field' using errcode='22023'; end if;
  end loop;
  select x->>'section' into source_section from jsonb_array_elements(equipment) x where x->>'id'=link->>'from';
  select x->>'section' into target_section from jsonb_array_elements(equipment) x where x->>'id'=link->>'to';
  route := jsonb_build_array(link->>'from',link->>'to')::text;
  if link->>'id'=any(ids) or source_section is null or target_section is null or source_section<>target_section or link->>'from'=link->>'to' or route=any(routes) then raise exception 'Duplicate or incompatible onboard relationship' using errcode='23503'; end if;
  ids := array_append(ids,link->>'id'); routes := array_append(routes,route);
 end loop;
end $systems$;
revoke all on function public.fleet_validate_systems(jsonb) from public,anon,authenticated,service_role;
create or replace function public.fleet_validate_inventory(p_inventory jsonb)
returns void language plpgsql immutable set search_path = '' as $$
declare c jsonb; field_name text; allowed text[]; installation jsonb; n jsonb; l jsonb; f text; source_kind text; target_kind text; binding jsonb; channel text; expected_metric text; source_id text;
begin
  if jsonb_typeof(p_inventory) is distinct from 'object'
    or p_inventory->'version' is distinct from '1'::jsonb
    or jsonb_typeof(p_inventory->'components') is distinct from 'array'
    or p_inventory - array['version', 'components', 'installation', 'electrical', 'systems'] <> '{}'::jsonb then
    raise exception 'Unsupported inventory format' using errcode = '22023';
  end if;
  if jsonb_array_length(p_inventory->'components') > 2000 then
    raise exception 'Too many components' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_inventory->'components') x group by x->>'id' having count(*) > 1) then
    raise exception 'Duplicate component identity' using errcode = '22023';
  end if;
  for c in select * from jsonb_array_elements(p_inventory->'components') loop
    if jsonb_typeof(c) is distinct from 'object' then raise exception 'Invalid component' using errcode = '22023'; end if;
    foreach field_name in array array['id', 'name', 'location', 'manufacturer', 'model', 'kind'] loop
      if jsonb_typeof(c->field_name) is distinct from 'string' or length(c->>field_name) > 240 then
        raise exception 'Invalid component field: %', field_name using errcode = '22023';
      end if;
    end loop;
    if c->>'id' ~ '^[[:space:]]*$' or c->>'name' ~ '^[[:space:]]*$' then
      raise exception 'Component identity and name are required' using errcode = '22023';
    end if;
    allowed := array['id', 'name', 'location', 'manufacturer', 'model', 'kind'];
    case c->>'kind'
      when 'tank' then
        allowed := allowed || array['fluid', 'capacityL', 'level'];
        if jsonb_typeof(c->'fluid') is distinct from 'string' or c->>'fluid' not in ('diesel', 'petrol', 'freshwater', 'greywater', 'blackwater', 'other')
          or public.fleet_valid_reading(c->'level', 100) is not true then
          raise exception 'Invalid tank' using errcode = '22023';
        end if;
        foreach field_name in array array['capacityL'] loop
          if c->field_name = 'null'::jsonb then continue; end if;
          if jsonb_typeof(c->field_name) is distinct from 'number' then raise exception 'Invalid capacity' using errcode = '22023'; end if;
          if (c->>field_name)::numeric <= 0 then raise exception 'Invalid capacity' using errcode = '22023'; end if;
        end loop;
      when 'bank' then
        allowed := allowed || array['purpose', 'topology'];
        if jsonb_typeof(c->'purpose') is distinct from 'string' or c->>'purpose' not in ('service', 'starter', 'auxiliary', 'other')
          or jsonb_typeof(c->'topology') is distinct from 'string' or c->>'topology' not in ('parallel', 'series', 'series-parallel', 'unknown') then
          raise exception 'Invalid battery bank' using errcode = '22023';
        end if;
      when 'battery' then
        allowed := allowed || array['bankId', 'chemistry', 'capacityAh', 'nominalV', 'voltage', 'soc'];
        if jsonb_typeof(c->'chemistry') is distinct from 'string' or c->>'chemistry' not in ('AGM', 'GEL', 'flooded', 'LiFePO4', 'other', 'unknown')
          or public.fleet_valid_reading(c->'voltage', 1000) is not true or public.fleet_valid_reading(c->'soc', 100) is not true then
          raise exception 'Invalid battery' using errcode = '22023';
        end if;
        if c->'bankId' is distinct from 'null'::jsonb then
          if jsonb_typeof(c->'bankId') is distinct from 'string' or not exists (
            select 1 from jsonb_array_elements(p_inventory->'components') b where b->>'kind' = 'bank' and b->>'id' = c->>'bankId'
          ) then raise exception 'Bank must be active in the same vessel inventory' using errcode = '23503'; end if;
        end if;
        foreach field_name in array array['capacityAh', 'nominalV'] loop
          if c->field_name = 'null'::jsonb then continue; end if;
          if jsonb_typeof(c->field_name) is distinct from 'number' then raise exception 'Invalid battery specification' using errcode = '22023'; end if;
          if (c->>field_name)::numeric <= 0 then raise exception 'Invalid battery specification' using errcode = '22023'; end if;
        end loop;
      else raise exception 'Unsupported component type' using errcode = '22023';
    end case;
    if c - allowed <> '{}'::jsonb or not (c ?& allowed) then
      raise exception 'Unexpected or missing component fields' using errcode = '22023';
    end if;
  end loop;

  perform public.fleet_validate_electrical(p_inventory);
  perform public.fleet_validate_systems(p_inventory);
  if not (p_inventory ? 'installation') then return; end if;
  installation := p_inventory->'installation';
  if jsonb_typeof(installation) is distinct from 'object'
    or installation - array['nodes','links','bindings'] <> '{}'::jsonb
    or jsonb_typeof(installation->'nodes') is distinct from 'array'
    or jsonb_typeof(installation->'links') is distinct from 'array' then
    raise exception 'Invalid installation format' using errcode='22023';
  end if;
  if jsonb_array_length(installation->'nodes') > 2000 or jsonb_array_length(installation->'links') > 4000 then
    raise exception 'Installation limit exceeded' using errcode='22023';
  end if;
  if exists (select 1 from jsonb_array_elements((p_inventory->'components') || (installation->'nodes')) component_entry group by component_entry->>'id' having count(*) > 1)
    or exists (select 1 from jsonb_array_elements(installation->'links') component_entry group by component_entry->>'id' having count(*) > 1)
    or exists (select 1 from jsonb_array_elements(installation->'links') component_entry group by component_entry->>'from',component_entry->>'to',component_entry->>'medium' having count(*) > 1) then
    raise exception 'Duplicate installation identity or route' using errcode='22023';
  end if;
  for n in select * from jsonb_array_elements(installation->'nodes') loop
    if jsonb_typeof(n) is distinct from 'object' or n - array['id','kind','name','location','manufacturer','model'] <> '{}'::jsonb then
      raise exception 'Invalid installation node' using errcode='22023';
    end if;
    foreach f in array array['id','kind','name','location','manufacturer','model'] loop
      if jsonb_typeof(n->f) is distinct from 'string' or length(n->>f)>240 then raise exception 'Invalid node field' using errcode='22023'; end if;
    end loop;
    if n->>'kind' not in ('alternator','solar','shore','controller','charger','distributor','consumer','electrical') or n->>'id' ~ '^[[:space:]]*$' or n->>'name' ~ '^[[:space:]]*$' then
      raise exception 'Invalid node identity or kind' using errcode='22023';
    end if;
  end loop;
  for l in select * from jsonb_array_elements(installation->'links') loop
    if jsonb_typeof(l) is distinct from 'object' or l - array['id','from','to','medium','name'] <> '{}'::jsonb then
      raise exception 'Invalid installation link' using errcode='22023';
    end if;
    foreach f in array array['id','from','to','medium','name'] loop
      if jsonb_typeof(l->f) is distinct from 'string' or length(l->>f)>240 or l->>f ~ '^[[:space:]]*$' then
        raise exception 'Invalid link field' using errcode='22023';
      end if;
    end loop;
    select component_entry->>'kind' into source_kind from jsonb_array_elements((p_inventory->'components') || (installation->'nodes')) component_entry where component_entry->>'id'=l->>'from';
    select component_entry->>'kind' into target_kind from jsonb_array_elements((p_inventory->'components') || (installation->'nodes')) component_entry where component_entry->>'id'=l->>'to';
    if (coalesce((l->>'medium'='pipe' and ((source_kind='tank' and target_kind='consumer') or (source_kind='consumer' and target_kind='tank')))
      or (l->>'medium'='cable' and ((source_kind in ('alternator','solar','controller','charger') and target_kind in ('bank','distributor'))
        or (source_kind='solar' and target_kind='controller')
        or (source_kind='shore' and target_kind='charger')
        or (source_kind='distributor' and target_kind='bank')
        or (source_kind='bank' and target_kind='consumer'))),false)) is not true then
      raise exception 'Incompatible or missing installation endpoint' using errcode='23503';
    end if;
  end loop;
  -- All selectable targets have globally unambiguous identities within this vessel.
  if exists (select 1 from jsonb_array_elements((p_inventory->'components') || (installation->'nodes') || (installation->'links')) component_entry group by component_entry->>'id' having count(*) > 1) then
    raise exception 'Ambiguous installation target identity' using errcode='22023';
  end if;
  if installation ? 'bindings' then
    if jsonb_typeof(installation->'bindings') is distinct from 'array' then raise exception 'Invalid sensor bindings' using errcode='22023'; end if;
    if jsonb_array_length(installation->'bindings') > 4000 then raise exception 'Too many sensor bindings' using errcode='22023'; end if;
    if exists (select 1 from jsonb_array_elements(installation->'bindings') b group by b->>'targetId',b->>'metric' having count(*)>1)
      or exists (select 1 from jsonb_array_elements(installation->'bindings') b group by b->>'connection',b->>'channel',b->>'sensor' having count(*)>1) then
      raise exception 'Duplicate sensor or target assignment' using errcode='22023';
    end if;
    for binding in select * from jsonb_array_elements(installation->'bindings') loop
      if jsonb_typeof(binding) is distinct from 'object' or binding - array['targetId','metric','channel','sensor','connection'] <> '{}'::jsonb then raise exception 'Invalid sensor binding' using errcode='22023'; end if;
      foreach f in array array['targetId','metric','channel','sensor','connection'] loop
        if jsonb_typeof(binding->f) is distinct from 'string' or length(binding->>f) > (case when f='connection' then 1024 else 240 end) or binding->>f ~ '^[[:space:]]*$' then
          raise exception 'Invalid sensor binding field' using errcode='22023';
        end if;
      end loop;
      channel := binding->>'channel';
      expected_metric := case channel when 'tank-level' then 'level' when 'battery-voltage' then 'voltage' when 'battery-soc' then 'soc' when 'battery-current' then 'current' when 'solar-current' then 'current' when 'alternator-current' then 'current' when 'solar-voltage' then 'voltage' when 'alternator-voltage' then 'voltage' end;
      if expected_metric is null or binding->>'metric' <> expected_metric then raise exception 'Invalid sensor channel or metric' using errcode='22023'; end if;
      select component_entry->>'kind' into target_kind from jsonb_array_elements(p_inventory->'components') component_entry where component_entry->>'id'=binding->>'targetId';
      if channel='tank-level' then
        if target_kind is distinct from 'tank' then raise exception 'Invalid tank sensor target' using errcode='22023'; end if;
      elsif channel in ('battery-voltage','battery-soc') then
        if coalesce(target_kind in ('battery','bank'),false) is not true then raise exception 'Invalid battery sensor target' using errcode='22023'; end if;
      elsif channel='battery-current' then
        if coalesce(target_kind in ('battery','bank'),false) is not true then raise exception 'Net battery current cannot measure a branch' using errcode='22023'; end if;
      else
        select d->>'catalogId' into target_kind from jsonb_array_elements(coalesce(p_inventory#>'{electrical,devices}','[]'::jsonb)) d where d->>'componentId'=binding->>'targetId';
        if (channel in ('solar-current','solar-voltage') and target_kind='controller') or (channel in ('alternator-current','alternator-voltage') and target_kind='alternator') then
          if binding->>'sensor' is distinct from (case when channel in ('solar-current','solar-voltage') then 'SOLAR0_OUT' else 'alternator-common' end) then raise exception 'Invalid common output sensor' using errcode='22023'; end if;
        else
          if channel in ('solar-voltage','alternator-voltage') then raise exception 'Source voltage requires explicit device target' using errcode='22023'; end if;
        select x->>'from' into source_id from jsonb_array_elements(installation->'links') x where x->>'id'=binding->>'targetId' and x->>'medium'='cable';
        select node_entry->>'kind' into source_kind from jsonb_array_elements(installation->'nodes') node_entry where node_entry->>'id'=source_id;
        if source_kind is distinct from (case when channel='solar-current' then 'solar' else 'alternator' end)
          or (select count(*) from jsonb_array_elements(installation->'links') x where x->>'from'=source_id) <> 1
          or (channel='solar-current' and exists (select 1 from jsonb_array_elements(installation->'links') x join jsonb_array_elements(installation->'nodes') node_entry on node_entry->>'id'=x->>'to' where x->>'id'=binding->>'targetId' and node_entry->>'kind'='controller'))
          or binding->>'sensor' <> (case when channel='solar-current' then 'SOLAR0_OUT' else 'alternator-common' end) then
          raise exception 'Source sensor requires one explicitly dedicated connection' using errcode='22023';
        end if;
        end if;
      end if;
    end loop;
  end if;
end $$;
revoke all on function public.fleet_validate_inventory(jsonb) from public,anon,authenticated,service_role;
create or replace function public.fleet_inventory_document(p_ship_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('version', 1, 'components', coalesce(jsonb_agg(
    jsonb_build_object('id', c.id, 'kind', c.kind, 'name', c.name, 'location', c.location, 'manufacturer', c.manufacturer, 'model', c.model)
    || case c.kind
      when 'tank' then jsonb_build_object('fluid', t.fluid, 'capacityL', t.capacity_l, 'level',
        jsonb_build_object('value', level.value, 'origin', level.origin, 'at', level.observed_at, 'sensor', level.sensor))
      when 'bank' then jsonb_build_object('purpose', bank.purpose, 'topology', bank.topology)
      when 'battery' then jsonb_build_object('bankId', battery.bank_id, 'chemistry', battery.chemistry,
        'capacityAh', battery.capacity_ah, 'nominalV', battery.nominal_v,
        'voltage', jsonb_build_object('value', voltage.value, 'origin', voltage.origin, 'at', voltage.observed_at, 'sensor', voltage.sensor),
        'soc', jsonb_build_object('value', soc.value, 'origin', soc.origin, 'at', soc.observed_at, 'sensor', soc.sensor))
    end order by c.position, c.id
  ), '[]'::jsonb)) || coalesce((select case when b.technical_inventory ? 'installation' then jsonb_build_object('installation',b.technical_inventory->'installation') else '{}'::jsonb end from public.barcos b where b.id=p_ship_id), '{}'::jsonb)
  || coalesce((select case when b.technical_inventory ? 'electrical' then jsonb_build_object('electrical',b.technical_inventory->'electrical') else '{}'::jsonb end from public.barcos b where b.id=p_ship_id), '{}'::jsonb)
  || coalesce((select case when b.technical_inventory ? 'systems' then jsonb_build_object('systems',b.technical_inventory->'systems') else '{}'::jsonb end from public.barcos b where b.id=p_ship_id), '{}'::jsonb)
  from public.barco_componentes c
  left join public.barco_depositos t on t.barco_id = c.barco_id and t.component_id = c.id
  left join public.barco_bancos bank on bank.barco_id = c.barco_id and bank.component_id = c.id
  left join public.barco_baterias battery on battery.barco_id = c.barco_id and battery.component_id = c.id
  left join public.barco_lecturas_componentes level on level.barco_id = c.barco_id and level.component_id = c.id and level.metric = 'level'
  left join public.barco_lecturas_componentes voltage on voltage.barco_id = c.barco_id and voltage.component_id = c.id and voltage.metric = 'voltage'
  left join public.barco_lecturas_componentes soc on soc.barco_id = c.barco_id and soc.component_id = c.id and soc.metric = 'soc'
  where c.barco_id = p_ship_id and c.retired_at is null;
$$;
revoke all on function public.fleet_inventory_document(uuid) from public,anon,authenticated,service_role;
grant execute on function public.fleet_inventory_document(uuid) to authenticated;


create or replace function public.fleet_protect_installation()
returns trigger language plpgsql set search_path='' as $$
begin
  if (old.technical_inventory ? 'installation' and not coalesce(new.technical_inventory ? 'installation',false)) or (old.technical_inventory ? 'electrical' and not coalesce(new.technical_inventory ? 'electrical',false)) or (old.technical_inventory ? 'systems' and not coalesce(new.technical_inventory ? 'systems',false)) then
    raise exception 'Update client: technical inventory extensions must be preserved' using errcode='22023';
  end if;
  return new;
end $$;
revoke all on function public.fleet_protect_installation() from public,anon,authenticated,service_role;
commit;
