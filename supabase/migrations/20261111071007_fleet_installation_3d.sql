-- Extends the existing revisioned master document. No stock or telemetry changes.
begin;
create or replace function public.fleet_validate_inventory(p_inventory jsonb)
returns void language plpgsql immutable set search_path = '' as $$
declare c jsonb; field_name text; allowed text[]; installation jsonb; n jsonb; l jsonb; f text; source_kind text; target_kind text; binding jsonb; channel text; expected_metric text; source_id text;
begin
  if jsonb_typeof(p_inventory) is distinct from 'object'
    or p_inventory->'version' is distinct from '1'::jsonb
    or jsonb_typeof(p_inventory->'components') is distinct from 'array'
    or p_inventory - array['version', 'components', 'installation'] <> '{}'::jsonb then
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
        if jsonb_typeof(c->'purpose') is distinct from 'string' or c->>'purpose' not in ('service', 'starter', 'other')
          or jsonb_typeof(c->'topology') is distinct from 'string' or c->>'topology' not in ('parallel', 'series', 'unknown') then
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
    if n->>'kind' not in ('alternator','solar','consumer') or n->>'id' ~ '^[[:space:]]*$' or n->>'name' ~ '^[[:space:]]*$' then
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
    if (coalesce((l->>'medium'='pipe' and source_kind='tank' and target_kind='consumer')
      or (l->>'medium'='cable' and ((source_kind in ('alternator','solar') and target_kind='bank')
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
      expected_metric := case channel when 'tank-level' then 'level' when 'battery-voltage' then 'voltage' when 'battery-soc' then 'soc' when 'battery-current' then 'current' when 'solar-current' then 'current' when 'alternator-current' then 'current' end;
      if expected_metric is null or binding->>'metric' <> expected_metric then raise exception 'Invalid sensor channel or metric' using errcode='22023'; end if;
      select component_entry->>'kind' into target_kind from jsonb_array_elements(p_inventory->'components') component_entry where component_entry->>'id'=binding->>'targetId';
      if channel='tank-level' then
        if target_kind is distinct from 'tank' then raise exception 'Invalid tank sensor target' using errcode='22023'; end if;
      elsif channel in ('battery-voltage','battery-soc') then
        if target_kind is distinct from 'battery' then raise exception 'Invalid battery sensor target' using errcode='22023'; end if;
      elsif channel='battery-current' then
        if coalesce(target_kind in ('battery','bank'),false) is not true then raise exception 'Net battery current cannot measure a branch' using errcode='22023'; end if;
      else
        select x->>'from' into source_id from jsonb_array_elements(installation->'links') x where x->>'id'=binding->>'targetId' and x->>'medium'='cable';
        select node_entry->>'kind' into source_kind from jsonb_array_elements(installation->'nodes') node_entry where node_entry->>'id'=source_id;
        if source_kind is distinct from (case when channel='solar-current' then 'solar' else 'alternator' end)
          or (select count(*) from jsonb_array_elements(installation->'links') x where x->>'from'=source_id) <> 1
          or binding->>'sensor' <> (case when channel='solar-current' then 'SOLAR0_OUT' else 'alternator-common' end) then
          raise exception 'Source sensor requires one explicitly dedicated connection' using errcode='22023';
        end if;
      end if;
    end loop;
  end if;
end $$;
revoke all on function public.fleet_validate_inventory(jsonb) from public,anon,authenticated,service_role;

-- Normalized equipment remains authoritative; the extension is kept in the same
-- master JSON and revision history, under the existing transaction and vessel RLS.
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

-- An older client cannot silently drop connections it does not understand.
create function public.fleet_protect_installation()
returns trigger language plpgsql set search_path='' as $$
begin
  if old.technical_inventory ? 'installation' and not coalesce(new.technical_inventory ? 'installation',false) then
    raise exception 'Update client: installation must be preserved' using errcode='22023';
  end if;
  return new;
end $$;
revoke all on function public.fleet_protect_installation() from public,anon,authenticated,service_role;
create trigger protect_fleet_installation before update of technical_inventory on public.barcos
for each row execute function public.fleet_protect_installation();
commit;
