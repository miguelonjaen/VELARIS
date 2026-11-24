-- Additive terminal editor extension. No vessel rows rewritten; existing RPC signatures and RLS retained.
begin;
create or replace function public.fleet_validate_electrical(p_inventory jsonb)
returns void language plpgsql immutable set search_path='' as $$
declare
  v_system jsonb:=p_inventory->'electrical'; v_device jsonb; v_terminal jsonb; v_node jsonb; v_wire jsonb; v_endpoint jsonb; v_bank jsonb; v_string jsonb; v_member jsonb;
  v_field text; v_kind text; v_ids text[]:='{}'; v_members text[]:='{}';
  v_catalog jsonb:='{"shore":"shore","alternator":"alternator","solar":"solar","generator":"electrical","custom-source":"electrical","charger":"charger","dc-charger":"electrical","inverter":"electrical","inverter-charger":"electrical","controller":"controller","acr":"electrical","distributor":"distributor","dc-distribution":"electrical","ac-transfer":"electrical","bus-positive":"electrical","bus-negative":"electrical","battery":"battery","bank-starter":"bank","bank-service":"bank","bank-auxiliary":"bank","bank-custom":"bank","fuse":"electrical","breaker":"electrical","rcd":"electrical","switch":"electrical","shunt":"electrical","terminal":"electrical","ac-panel":"electrical","dc-panel":"electrical","monitor":"electrical","ac-socket":"consumer","lighting":"consumer","navigation":"consumer","pump":"consumer","fridge":"consumer","windlass":"consumer","autopilot":"consumer","custom-consumer":"consumer"}'::jsonb;
begin
  if v_system is null then return; end if;
  if jsonb_typeof(v_system) is distinct from 'object' or v_system->'version' is distinct from '1'::jsonb
    or v_system-array['version','devices','nodes','wires','banks','viewport','origin']<>'{}'::jsonb
    or not(v_system ?& array['version','devices','nodes','wires','banks','viewport','origin'])
    or jsonb_typeof(v_system->'origin') is distinct from 'string' or v_system->>'origin' not in ('custom','template','legacy') then raise exception 'Invalid electrical document' using errcode='22023'; end if;
  foreach v_field in array array['devices','nodes','wires','banks'] loop
    if jsonb_typeof(v_system->v_field) is distinct from 'array' then raise exception 'Invalid electrical collection' using errcode='22023'; end if;
  end loop;
  if jsonb_array_length(v_system->'devices')>4000 or jsonb_array_length(v_system->'nodes')>4000 or jsonb_array_length(v_system->'wires')>16000 then raise exception 'Electrical document resource limit' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(v_system->'devices') e group by e->>'componentId' having count(*)>1)
    or exists(select 1 from jsonb_array_elements(v_system->'nodes') e group by e->>'componentId' having count(*)>1)
    or exists(select 1 from jsonb_array_elements(v_system->'wires') e group by e->>'id' having count(*)>1)
    or exists(select 1 from jsonb_array_elements(v_system->'wires') e group by least((e->'from')::text,(e->'to')::text),greatest((e->'from')::text,(e->'to')::text) having count(*)>1)
    then raise exception 'Duplicate electrical identity or wire' using errcode='22023'; end if;
  for v_device in select * from jsonb_array_elements(v_system->'devices') loop
    if jsonb_typeof(v_device) is distinct from 'object'
      or v_device-array['componentId','catalogId','terminals','nominalV','ratedA','ratedW','installedOn','condition','notes','provenance']<>'{}'::jsonb
      or not(v_device ?& array['componentId','catalogId','terminals','nominalV','ratedA','ratedW','installedOn','condition','notes','provenance']) then raise exception 'Invalid electrical device' using errcode='22023'; end if;
    foreach v_field in array array['componentId','catalogId','installedOn','condition','notes','provenance'] loop
      if jsonb_typeof(v_device->v_field) is distinct from 'string' or length(v_device->>v_field)>(case when v_field='notes' then 4000 else 240 end) then raise exception 'Invalid device metadata' using errcode='22023'; end if;
    end loop;
    select e->>'kind' into v_kind from jsonb_array_elements((p_inventory->'components')||coalesce(p_inventory#>'{installation,nodes}','[]'::jsonb)) e where e->>'id'=v_device->>'componentId';
    if v_kind is null or v_catalog->> (v_device->>'catalogId') is distinct from v_kind or v_device->>'provenance' not in ('manual','template','legacy') then raise exception 'Electrical device must match vessel inventory' using errcode='23503'; end if;
    foreach v_field in array array['nominalV','ratedA','ratedW'] loop
      if v_device->v_field='null'::jsonb then continue; end if;
      if jsonb_typeof(v_device->v_field) is distinct from 'number' then raise exception 'Invalid device rating' using errcode='22023'; end if;
      if (v_device->>v_field)::numeric<=0 then raise exception 'Invalid device rating' using errcode='22023'; end if;
    end loop;
    if jsonb_typeof(v_device->'terminals') is distinct from 'array' then raise exception 'Invalid terminals' using errcode='22023'; end if;
    if jsonb_array_length(v_device->'terminals')>256 or exists(select 1 from jsonb_array_elements(v_device->'terminals') e group by e->>'id' having count(*)>1) then raise exception 'Duplicate terminal or resource limit' using errcode='22023'; end if;
    for v_terminal in select * from jsonb_array_elements(v_device->'terminals') loop
      if jsonb_typeof(v_terminal) is distinct from 'object' or v_terminal-array['id','label','domain','direction','pole','nominalV']<>'{}'::jsonb or not(v_terminal ?& array['id','label','domain','direction','pole','nominalV']) then raise exception 'Invalid terminal' using errcode='22023'; end if;
      foreach v_field in array array['id','label','domain','direction','pole'] loop
        if jsonb_typeof(v_terminal->v_field) is distinct from 'string' or length(v_terminal->>v_field)>240 or v_terminal->>v_field ~ '^[[:space:]]*$' then raise exception 'Invalid terminal field' using errcode='22023'; end if;
      end loop;
      if v_terminal->>'domain' not in ('AC','DC','PV','unknown') or v_terminal->>'direction' not in ('in','out','bidirectional') or v_terminal->>'pole' not in ('positive','negative','line','neutral','earth','unknown') then raise exception 'Unsupported terminal type' using errcode='22023'; end if;
      if v_terminal->'nominalV'<>'null'::jsonb then
        if jsonb_typeof(v_terminal->'nominalV') is distinct from 'number' then raise exception 'Invalid terminal rating' using errcode='22023'; end if;
        if (v_terminal->>'nominalV')::numeric<=0 then raise exception 'Invalid terminal rating' using errcode='22023'; end if;
      end if;
    end loop;
  end loop;
  for v_node in select * from jsonb_array_elements(v_system->'nodes') loop
    if jsonb_typeof(v_node) is distinct from 'object' or v_node-array['componentId','x','y']<>'{}'::jsonb or not(v_node ?& array['componentId','x','y']) or jsonb_typeof(v_node->'componentId') is distinct from 'string' or not exists(select 1 from jsonb_array_elements(v_system->'devices') e where e->>'componentId'=v_node->>'componentId') then raise exception 'Invalid electrical node' using errcode='23503'; end if;
    foreach v_field in array array['x','y'] loop
      if jsonb_typeof(v_node->v_field) is distinct from 'number' then raise exception 'Invalid node position' using errcode='22023'; end if;
      if abs((v_node->>v_field)::numeric)>10000000 then raise exception 'Node position resource limit' using errcode='22023'; end if;
    end loop;
  end loop;
  for v_wire in select * from jsonb_array_elements(v_system->'wires') loop
    if jsonb_typeof(v_wire) is distinct from 'object' or v_wire-array['id','from','to','domain','nominalV','cable','sectionMm2','lengthM','protectionId','notes','provenance','bankId']<>'{}'::jsonb or not(v_wire ?& array['id','from','to','domain','nominalV','cable','sectionMm2','lengthM','protectionId','notes','provenance','bankId']) then raise exception 'Invalid electrical wire' using errcode='22023'; end if;
    foreach v_field in array array['id','domain','cable','notes','provenance'] loop
      if jsonb_typeof(v_wire->v_field) is distinct from 'string' or length(v_wire->>v_field)>(case when v_field='notes' then 4000 else 240 end) then raise exception 'Invalid wire metadata' using errcode='22023'; end if;
    end loop;
    if v_wire->>'id' ~ '^[[:space:]]*$' or v_wire->>'domain' not in ('AC','DC','PV','unknown') or v_wire->>'provenance' not in ('manual','template','legacy') then raise exception 'Invalid wire type' using errcode='22023'; end if;
    foreach v_field in array array['nominalV','sectionMm2','lengthM'] loop
      if v_wire->v_field='null'::jsonb then continue; end if;
      if jsonb_typeof(v_wire->v_field) is distinct from 'number' then raise exception 'Invalid wire rating' using errcode='22023'; end if;
      if (v_wire->>v_field)::numeric<0 or (v_field<>'lengthM' and (v_wire->>v_field)::numeric=0) then raise exception 'Invalid wire rating' using errcode='22023'; end if;
    end loop;
    foreach v_field in array array['from','to'] loop
      v_endpoint:=v_wire->v_field;
      if jsonb_typeof(v_endpoint) is distinct from 'object' or v_endpoint-array['componentId','terminalId']<>'{}'::jsonb or not(v_endpoint ?& array['componentId','terminalId']) or jsonb_typeof(v_endpoint->'componentId') is distinct from 'string' or jsonb_typeof(v_endpoint->'terminalId') is distinct from 'string' or not exists(select 1 from jsonb_array_elements(v_system->'devices') d cross join lateral jsonb_array_elements(d->'terminals') t where d->>'componentId'=v_endpoint->>'componentId' and t->>'id'=v_endpoint->>'terminalId') then raise exception 'Missing electrical endpoint' using errcode='23503'; end if;
    end loop;
    if v_wire->'from'=v_wire->'to' then raise exception 'Self terminal connection' using errcode='22023'; end if;
    if v_wire->'protectionId'<>'null'::jsonb and (jsonb_typeof(v_wire->'protectionId') is distinct from 'string' or not exists(select 1 from jsonb_array_elements(v_system->'devices') d where d->>'componentId'=v_wire->>'protectionId')) then raise exception 'Foreign protection' using errcode='23503'; end if;
    if v_wire->'bankId'<>'null'::jsonb and (jsonb_typeof(v_wire->'bankId') is distinct from 'string' or not exists(select 1 from jsonb_array_elements(p_inventory->'components') d where d->>'id'=v_wire->>'bankId' and d->>'kind'='bank')) then raise exception 'Foreign bank' using errcode='23503'; end if;
  end loop;
  for v_bank in select * from jsonb_array_elements(v_system->'banks') loop
    if jsonb_typeof(v_bank) is distinct from 'object' or v_bank-array['bankId','strings']<>'{}'::jsonb or not(v_bank ?& array['bankId','strings']) or jsonb_typeof(v_bank->'bankId') is distinct from 'string' or v_bank->>'bankId'=any(v_ids) or jsonb_typeof(v_bank->'strings') is distinct from 'array' or not exists(select 1 from jsonb_array_elements(p_inventory->'components') d where d->>'id'=v_bank->>'bankId' and d->>'kind'='bank') then raise exception 'Invalid bank configuration' using errcode='23503'; end if;
    v_ids:=array_append(v_ids,v_bank->>'bankId');
    for v_string in select * from jsonb_array_elements(v_bank->'strings') loop
      if jsonb_typeof(v_string) is distinct from 'array' then raise exception 'Invalid bank string' using errcode='22023'; end if;
      if jsonb_array_length(v_string)=0 then raise exception 'Empty bank string' using errcode='22023'; end if;
      for v_member in select * from jsonb_array_elements(v_string) loop
        if jsonb_typeof(v_member) is distinct from 'string' or (v_member#>>'{}')=any(v_members) or not exists(select 1 from jsonb_array_elements(p_inventory->'components') d where d->>'id'=(v_member#>>'{}') and d->>'kind'='battery' and d->>'bankId'=v_bank->>'bankId') then raise exception 'Duplicate or foreign bank member' using errcode='23503'; end if;
        v_members:=array_append(v_members,v_member#>>'{}');
      end loop;
    end loop;
  end loop;
  if jsonb_typeof(v_system->'viewport') is distinct from 'object' or (v_system->'viewport')-array['x','y','zoom']<>'{}'::jsonb or not((v_system->'viewport') ?& array['x','y','zoom']) then raise exception 'Invalid viewport' using errcode='22023'; end if;
  foreach v_field in array array['x','y','zoom'] loop
    if jsonb_typeof(v_system#>array['viewport',v_field]) is distinct from 'number' then raise exception 'Invalid viewport number' using errcode='22023'; end if;
  end loop;
  if (v_system#>>'{viewport,zoom}')::numeric<0.05 or (v_system#>>'{viewport,zoom}')::numeric>4 then raise exception 'Invalid zoom' using errcode='22023'; end if;
end $$;
revoke all on function public.fleet_validate_electrical(jsonb) from public,anon,authenticated,service_role;

alter table public.barco_bancos drop constraint barco_bancos_purpose_check;
alter table public.barco_bancos add constraint barco_bancos_purpose_check check(purpose in ('service','starter','auxiliary','other'));
alter table public.barco_bancos drop constraint barco_bancos_topology_check;
alter table public.barco_bancos add constraint barco_bancos_topology_check check(topology in ('parallel','series','series-parallel','unknown'));

create or replace function public.fleet_validate_inventory(p_inventory jsonb)
returns void language plpgsql immutable set search_path = '' as $$
declare c jsonb; field_name text; allowed text[]; installation jsonb; n jsonb; l jsonb; f text; source_kind text; target_kind text; binding jsonb; channel text; expected_metric text; source_id text;
begin
  if jsonb_typeof(p_inventory) is distinct from 'object'
    or p_inventory->'version' is distinct from '1'::jsonb
    or jsonb_typeof(p_inventory->'components') is distinct from 'array'
    or p_inventory - array['version', 'components', 'installation', 'electrical'] <> '{}'::jsonb then
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
    if (coalesce((l->>'medium'='pipe' and source_kind='tank' and target_kind='consumer')
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
  if (old.technical_inventory ? 'installation' and not coalesce(new.technical_inventory ? 'installation',false)) or (old.technical_inventory ? 'electrical' and not coalesce(new.technical_inventory ? 'electrical',false)) then
    raise exception 'Update client: electrical extensions must be preserved' using errcode='22023';
  end if;
  return new;
end $$;
revoke all on function public.fleet_protect_installation() from public,anon,authenticated,service_role;
commit;
