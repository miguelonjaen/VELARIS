-- Isolated copies of the actual schema and RPC, entirely in pg_temp and rolled back. No real vessel rows are read or changed.
begin;
create temporary table barcos(id uuid primary key,user_id uuid,capitan_id uuid,technical_inventory jsonb,technical_revision integer not null default 0);
create temporary table barco_componentes (
  barco_id uuid not null references pg_temp.barcos(id) on delete cascade,
  id text not null check (length(id) between 1 and 240 and id !~ '^[[:space:]]*$'),
  kind text not null check (kind in ('tank', 'bank', 'battery')),
  name text not null check (length(name) between 1 and 240 and name !~ '^[[:space:]]*$'),
  location text not null check (length(location) <= 240),
  manufacturer text not null check (length(manufacturer) <= 240),
  model text not null check (length(model) <= 240),
  position integer not null check (position between 0 and 1999),
  retired_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (barco_id, id),
  unique (barco_id, id, kind)
);

create temporary table barco_depositos (
  barco_id uuid not null,
  component_id text not null,
  kind text not null default 'tank' check (kind = 'tank'),
  fluid text not null check (fluid in ('diesel', 'petrol', 'freshwater', 'greywater', 'blackwater', 'other')),
  capacity_l numeric check (capacity_l > 0),
  primary key (barco_id, component_id),
  foreign key (barco_id, component_id, kind) references pg_temp.barco_componentes(barco_id, id, kind) on delete cascade
);

create temporary table barco_bancos (
  barco_id uuid not null,
  component_id text not null,
  kind text not null default 'bank' check (kind = 'bank'),
  purpose text not null check (purpose in ('service', 'starter', 'other')),
  topology text not null check (topology in ('parallel', 'series', 'unknown')),
  primary key (barco_id, component_id),
  foreign key (barco_id, component_id, kind) references pg_temp.barco_componentes(barco_id, id, kind) on delete cascade
);

create temporary table barco_baterias (
  barco_id uuid not null,
  component_id text not null,
  kind text not null default 'battery' check (kind = 'battery'),
  bank_id text,
  chemistry text not null check (chemistry in ('AGM', 'GEL', 'flooded', 'LiFePO4', 'other', 'unknown')),
  capacity_ah numeric check (capacity_ah > 0),
  nominal_v numeric check (nominal_v > 0),
  primary key (barco_id, component_id),
  foreign key (barco_id, component_id, kind) references pg_temp.barco_componentes(barco_id, id, kind) on delete cascade,
  foreign key (barco_id, bank_id) references pg_temp.barco_bancos(barco_id, component_id)
);
create index barco_baterias_bank on pg_temp.barco_baterias(barco_id, bank_id);

create temporary table barco_lecturas_componentes (
  barco_id uuid not null,
  component_id text not null,
  kind text not null,
  metric text not null,
  value numeric,
  origin text not null check (origin in ('unknown', 'manual', 'measured')),
  observed_at timestamptz,
  sensor text,
  primary key (barco_id, component_id, metric),
  foreign key (barco_id, component_id, kind) references pg_temp.barco_componentes(barco_id, id, kind) on delete cascade,
  check ((kind = 'tank' and metric = 'level') or (kind = 'battery' and metric in ('voltage', 'soc'))),
  check (
    (origin = 'unknown' and value is null and observed_at is null and sensor is null)
    or (origin in ('manual', 'measured') and value is not null and observed_at is not null
      and ((origin = 'manual' and sensor is null)
        or (origin = 'measured' and sensor is not null and length(sensor) between 1 and 240 and sensor !~ '^[[:space:]]*$')))
  ),
  check (value is null or (value >= 0 and value <= case when metric = 'voltage' then 1000 else 100 end))
);

create temporary table barco_inventario_revisiones (
  barco_id uuid not null references pg_temp.barcos(id) on delete cascade,
  revision integer not null check (revision >= 0),
  inventory jsonb not null,
  saved_at timestamptz not null default now(),
  saved_by uuid,
  source text not null check (source in ('legacy_import', 'client')),
  primary key (barco_id, revision)
);


create function pg_temp.fleet_valid_reading(p_reading jsonb, p_max numeric)
returns boolean language plpgsql immutable set search_path = '' as $$
declare observed timestamptz;
begin
  if jsonb_typeof(p_reading) is distinct from 'object'
    or p_reading - array['value', 'origin', 'at', 'sensor'] <> '{}'::jsonb
    or not (p_reading ?& array['value', 'origin', 'at', 'sensor']) then return false; end if;
  if p_reading->'value' = 'null'::jsonb then
    return p_reading->>'origin' = 'unknown' and p_reading->'at' = 'null'::jsonb and p_reading->'sensor' = 'null'::jsonb;
  end if;
  if jsonb_typeof(p_reading->'value') is distinct from 'number'
    or jsonb_typeof(p_reading->'origin') is distinct from 'string'
    or p_reading->>'origin' not in ('manual', 'measured')
    or jsonb_typeof(p_reading->'at') is distinct from 'string' then return false; end if;
  if (p_reading->>'value')::numeric < 0 or (p_reading->>'value')::numeric > p_max then return false; end if;
  if p_reading->>'at' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$' then return false; end if;
  observed := (p_reading->>'at')::timestamptz;
  if not isfinite(observed) then return false; end if;
  if p_reading->>'origin' = 'manual' then return p_reading->'sensor' = 'null'::jsonb; end if;
  return jsonb_typeof(p_reading->'sensor') = 'string' and length(p_reading->>'sensor') between 1 and 240
    and p_reading->>'sensor' !~ '^[[:space:]]*$';
exception when others then return false;
end $$;


create or replace function pg_temp.fleet_validate_electrical(p_inventory jsonb)
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
revoke all on function pg_temp.fleet_validate_electrical(jsonb) from public,anon,authenticated,service_role;

alter table pg_temp.barco_bancos drop constraint barco_bancos_purpose_check;
alter table pg_temp.barco_bancos add constraint barco_bancos_purpose_check check(purpose in ('service','starter','auxiliary','other'));
alter table pg_temp.barco_bancos drop constraint barco_bancos_topology_check;
alter table pg_temp.barco_bancos add constraint barco_bancos_topology_check check(topology in ('parallel','series','series-parallel','unknown'));

create or replace function pg_temp.fleet_validate_inventory(p_inventory jsonb)
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
          or pg_temp.fleet_valid_reading(c->'level', 100) is not true then
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
          or pg_temp.fleet_valid_reading(c->'voltage', 1000) is not true or pg_temp.fleet_valid_reading(c->'soc', 100) is not true then
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

  perform pg_temp.fleet_validate_electrical(p_inventory);
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
revoke all on function pg_temp.fleet_validate_inventory(jsonb) from public,anon,authenticated,service_role;


create or replace function pg_temp.fleet_inventory_document(p_ship_id uuid)
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
  ), '[]'::jsonb)) || coalesce((select case when b.technical_inventory ? 'installation' then jsonb_build_object('installation',b.technical_inventory->'installation') else '{}'::jsonb end from pg_temp.barcos b where b.id=p_ship_id), '{}'::jsonb)
  || coalesce((select case when b.technical_inventory ? 'electrical' then jsonb_build_object('electrical',b.technical_inventory->'electrical') else '{}'::jsonb end from pg_temp.barcos b where b.id=p_ship_id), '{}'::jsonb)
  from pg_temp.barco_componentes c
  left join pg_temp.barco_depositos t on t.barco_id = c.barco_id and t.component_id = c.id
  left join pg_temp.barco_bancos bank on bank.barco_id = c.barco_id and bank.component_id = c.id
  left join pg_temp.barco_baterias battery on battery.barco_id = c.barco_id and battery.component_id = c.id
  left join pg_temp.barco_lecturas_componentes level on level.barco_id = c.barco_id and level.component_id = c.id and level.metric = 'level'
  left join pg_temp.barco_lecturas_componentes voltage on voltage.barco_id = c.barco_id and voltage.component_id = c.id and voltage.metric = 'voltage'
  left join pg_temp.barco_lecturas_componentes soc on soc.barco_id = c.barco_id and soc.component_id = c.id and soc.metric = 'soc'
  where c.barco_id = p_ship_id and c.retired_at is null;
$$;
revoke all on function pg_temp.fleet_inventory_document(uuid) from public,anon,authenticated,service_role;
grant execute on function pg_temp.fleet_inventory_document(uuid) to authenticated;


create or replace function pg_temp.fleet_protect_installation()
returns trigger language plpgsql set search_path='' as $$
begin
  if (old.technical_inventory ? 'installation' and not coalesce(new.technical_inventory ? 'installation',false)) or (old.technical_inventory ? 'electrical' and not coalesce(new.technical_inventory ? 'electrical',false)) then
    raise exception 'Update client: electrical extensions must be preserved' using errcode='22023';
  end if;
  return new;
end $$;
revoke all on function pg_temp.fleet_protect_installation() from public,anon,authenticated,service_role;

create function pg_temp.fleet_store_normalized_inventory(p_ship_id uuid, p_inventory jsonb, p_revision integer, p_actor uuid, p_source text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform pg_temp.fleet_validate_inventory(p_inventory);
  if exists (select 1 from pg_temp.barco_componentes old
    join jsonb_array_elements(p_inventory->'components') c on old.id = c->>'id'
    where old.barco_id = p_ship_id and old.kind <> c->>'kind') then
    raise exception 'A component identity cannot change its type' using errcode = '22023';
  end if;

  insert into pg_temp.barco_componentes (barco_id, id, kind, name, location, manufacturer, model, position)
    select p_ship_id, c->>'id', c->>'kind', c->>'name', c->>'location', c->>'manufacturer', c->>'model', (n - 1)::integer
    from jsonb_array_elements(p_inventory->'components') with ordinality as entry(c, n)
  on conflict (barco_id, id) do update set name = excluded.name, location = excluded.location,
    manufacturer = excluded.manufacturer, model = excluded.model, position = excluded.position, retired_at = null, updated_at = now();

  insert into pg_temp.barco_depositos (barco_id, component_id, fluid, capacity_l)
    select p_ship_id, c->>'id', c->>'fluid', (c->>'capacityL')::numeric
    from jsonb_array_elements(p_inventory->'components') c where c->>'kind' = 'tank'
  on conflict (barco_id, component_id) do update set fluid = excluded.fluid, capacity_l = excluded.capacity_l;

  -- Insert all banks before batteries; JSON order must not affect relationship integrity.
  insert into pg_temp.barco_bancos (barco_id, component_id, purpose, topology)
    select p_ship_id, c->>'id', c->>'purpose', c->>'topology'
    from jsonb_array_elements(p_inventory->'components') c where c->>'kind' = 'bank'
  on conflict (barco_id, component_id) do update set purpose = excluded.purpose, topology = excluded.topology;

  insert into pg_temp.barco_baterias (barco_id, component_id, bank_id, chemistry, capacity_ah, nominal_v)
    select p_ship_id, c->>'id', c->>'bankId', c->>'chemistry', (c->>'capacityAh')::numeric, (c->>'nominalV')::numeric
    from jsonb_array_elements(p_inventory->'components') c where c->>'kind' = 'battery'
  on conflict (barco_id, component_id) do update set bank_id = excluded.bank_id, chemistry = excluded.chemistry,
    capacity_ah = excluded.capacity_ah, nominal_v = excluded.nominal_v;

  insert into pg_temp.barco_lecturas_componentes (barco_id, component_id, kind, metric, value, origin, observed_at, sensor)
    select p_ship_id, c->>'id', c->>'kind', metric, (r->>'value')::numeric, r->>'origin', (r->>'at')::timestamptz, r->>'sensor'
    from jsonb_array_elements(p_inventory->'components') c
    cross join lateral (values ('level', c->'level'), ('voltage', c->'voltage'), ('soc', c->'soc')) readings(metric, r)
    where (c->>'kind' = 'tank' and metric = 'level') or (c->>'kind' = 'battery' and metric in ('voltage', 'soc'))
  on conflict (barco_id, component_id, metric) do update set value = excluded.value, origin = excluded.origin,
    observed_at = excluded.observed_at, sensor = excluded.sensor;

  -- Retirement preserves identities and old readings; history also retains the previous snapshot.
  update pg_temp.barco_componentes existing set retired_at = now(), updated_at = now()
    where existing.barco_id = p_ship_id and existing.retired_at is null
      and not exists (select 1 from jsonb_array_elements(p_inventory->'components') c where c->>'id' = existing.id);

  insert into pg_temp.barco_inventario_revisiones (barco_id, revision, inventory, saved_by, source)
    values (p_ship_id, p_revision, p_inventory, p_actor, p_source);
end $$;


create function pg_temp.fleet_sync_inventory()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.technical_revision <> 0 then raise exception 'Initial revision must be zero' using errcode = '22023'; end if;
    if new.technical_inventory is null then return new; end if;
  else
    if new.technical_inventory is not distinct from old.technical_inventory
      and new.technical_revision = old.technical_revision then return new; end if;
    if new.technical_revision <> old.technical_revision + 1 then
      raise exception 'Inventory revision conflict' using errcode = '40001';
    end if;
  end if;
  if new.technical_inventory is null then
    raise exception 'Use an explicit empty inventory to retire all components' using errcode = '22023';
  end if;
  perform pg_temp.fleet_store_normalized_inventory(new.id, new.technical_inventory, new.technical_revision, auth.uid(), 'client');
  return new;
end $$;


create function pg_temp.load_vessel_technical_inventory(p_ship_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  -- One statement/snapshot: a concurrent writer cannot mix old revision with new components.
  select jsonb_build_object('revision', b.technical_revision, 'inventory', pg_temp.fleet_inventory_document(b.id)) into result
    from pg_temp.barcos b where b.id = p_ship_id and (b.user_id = auth.uid() or b.capitan_id = auth.uid());
  if result is null then raise exception 'Vessel unavailable' using errcode = '42501'; end if;
  return result;
end $$;

create function pg_temp.save_vessel_technical_inventory(p_ship_id uuid, p_expected_revision integer, p_inventory jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare revision integer; actor uuid := auth.uid();
begin
  if actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select b.technical_revision into revision from pg_temp.barcos b
    where b.id = p_ship_id and (b.user_id = actor or b.capitan_id = actor) for update;
  if not found then raise exception 'Vessel unavailable' using errcode = '42501'; end if;
  if p_expected_revision is null or p_expected_revision < 0 then raise exception 'Invalid expected revision' using errcode = '22023'; end if;
  if revision <> p_expected_revision then raise exception 'Inventory revision conflict' using errcode = '40001'; end if;
  -- The guarded trigger normalizes all rows and records the revision in this same transaction.
  update pg_temp.barcos set technical_inventory = p_inventory, technical_revision = revision + 1 where id = p_ship_id;
  return jsonb_build_object('revision', revision + 1, 'inventory', pg_temp.fleet_inventory_document(p_ship_id));
end $$;


create trigger test_sync after insert or update of technical_inventory,technical_revision on pg_temp.barcos for each row execute function pg_temp.fleet_sync_inventory();
create trigger test_preserve before update of technical_inventory on pg_temp.barcos for each row execute function pg_temp.fleet_protect_installation();
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
insert into pg_temp.barcos(id,user_id,capitan_id) values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','22222222-2222-4222-8222-222222222222');
do $$
declare document jsonb := '{"version":1,"components":[{"id":"item-battery","name":"Batería","location":"","manufacturer":"","model":"","kind":"battery","bankId":"item-bank-service","chemistry":"AGM","capacityAh":100,"nominalV":12,"voltage":{"value":null,"origin":"unknown","at":null,"sensor":null},"soc":{"value":null,"origin":"unknown","at":null,"sensor":null}},{"id":"item-bank-starter","name":"Banco de arranque","location":"","manufacturer":"","model":"","kind":"bank","purpose":"starter","topology":"unknown"},{"id":"item-bank-service","name":"Banco de servicio","location":"","manufacturer":"","model":"","kind":"bank","purpose":"service","topology":"series-parallel"},{"id":"item-bank-auxiliary","name":"Banco de auxiliares","location":"","manufacturer":"","model":"","kind":"bank","purpose":"auxiliary","topology":"unknown"},{"id":"item-bank-custom","name":"Banco de uso personalizado","location":"","manufacturer":"","model":"","kind":"bank","purpose":"other","topology":"unknown"},{"id":"battery-2","name":"Batería 2","location":"","manufacturer":"","model":"","kind":"battery","bankId":"item-bank-service","chemistry":"AGM","capacityAh":100,"nominalV":12,"voltage":{"value":null,"origin":"unknown","at":null,"sensor":null},"soc":{"value":null,"origin":"unknown","at":null,"sensor":null}},{"id":"battery-3","name":"Batería 3","location":"","manufacturer":"","model":"","kind":"battery","bankId":"item-bank-service","chemistry":"AGM","capacityAh":100,"nominalV":12,"voltage":{"value":null,"origin":"unknown","at":null,"sensor":null},"soc":{"value":null,"origin":"unknown","at":null,"sensor":null}},{"id":"battery-4","name":"Batería 4","location":"","manufacturer":"","model":"","kind":"battery","bankId":"item-bank-service","chemistry":"AGM","capacityAh":100,"nominalV":12,"voltage":{"value":null,"origin":"unknown","at":null,"sensor":null},"soc":{"value":null,"origin":"unknown","at":null,"sensor":null}}],"electrical":{"version":1,"devices":[{"componentId":"item-shore","catalogId":"shore","terminals":[{"id":"ACL","label":"AC L","domain":"AC","direction":"out","pole":"line","nominalV":null},{"id":"ACN","label":"AC N","domain":"AC","direction":"out","pole":"neutral","nominalV":null},{"id":"ACPE","label":"AC PE","domain":"AC","direction":"bidirectional","pole":"earth","nominalV":null}],"nominalV":null,"ratedA":null,"ratedW":null,"installedOn":"","condition":"Sin comprobar","notes":"","provenance":"manual"},{"componentId":"item-alternator","catalogId":"alternator","terminals":[{"id":"DC+","label":"DC +","domain":"DC","direction":"out","pole":"positive","nominalV":null},{"id":"DC-","label":"DC −","domain":"DC","direction":"out","pole":"negative","nominalV":null}],"nominalV":null,"ratedA":null,"ratedW":null,"installedOn":"","condition":"Sin comprobar","notes":"","provenance":"manual"},{"componentId":"item-solar","catalogId":"solar","terminals":[{"id":"PV+","label":"PV +","domain":"PV","direction":"out","pole":"positive","nominalV":null},{"id":"PV-","label":"PV −","domain":"PV","direction":"out","pole":"negative","nominalV":null}],"nominalV":null,"ratedA":null,"ratedW":null,"installedOn":"","condition":"Sin comprobar","notes":"","provenance":"manual"},{"componentId":"item-generator","catalogId":"generator","terminals":[{"id":"ACL","label":"AC L","domain":"AC","direction":"out","pole":"line","nominalV":null},{"id":"ACN","label":"AC N","domain":"AC","direction":"out","pole":"neutral","nominalV":null},{"id":"ACPE","label":"AC PE","domain":"AC","direction":"bidirectional","pole":"earth","nominalV":null}],"nominalV":null,"ratedA":null,"ratedW":null,"installedOn":"","condition":"Sin comprobar","notes":"","provenance":"manual"},{"componentId":"item-custom-source","catalogId":"custom-source","terminals":[{"id":"out","label":"Salida","domain":"unknown","direction":"out","pole":"unknown","nominalV":null}],"nominalV":null,"ratedA":null,"ratedW":null,"installedOn":"","condition":"Sin comprobar","notes":"","provenance":"manual"},{"componentId":"item-charger","catalogId":"charger","terminals":[{"id":"ACL","label":"AC L","domain":"AC","direction":"in","pole":"line","nominalV":null},{"id":"ACN","label":"AC N","domain":"AC","direction":"in","pole":"neutral","nominalV":null},{"id":"ACPE","label":"AC PE","domain":"AC","direction":"bidirectional","pole":"earth","nominalV":null},{"id":"DC+","label":"DC +","domain":"DC","direction":"out","pole":"positive","nominalV":null},{"id":"DC-","label":"DC −","domain":"DC","direction":"out","pole":"negative","nominalV":null}],"nominalV":null,"ratedA":null,"ratedW":null,"installedOn":"","condition":"Sin comprobar","notes":"","provenance":"manual"},{"componentId":"item-dc-charger","catalogId":"dc-charger","terminals":[{"id":"IN+","label":"IN +","domain":"DC","direction":"in","pole":"positive","nominalV":null},{"id":"IN-","label":"IN −","domain":"DC","direction":"in","pole":"negative","nominalV":null},{"id":"OUT+","label":"OUT +","domain":"DC","direction":"out","pole":"positive","nominalV":null},{"id":"OUT-","label":"OUT −","domain":"DC","direction":"out","pole":"negative","nominalV":null}],"nominalV":null,"ratedA":null,"ratedW":null,"installedOn":"","condition":"Sin comprobar","notes":"","provenance":"manual"},{"componentId":"item-inverter","catalogId":"inverter","terminals":[{"id":"DC+","label":"DC +","domain":"DC","direction":"in","pole":"positive","nominalV":null},{"id":"DC-","label":"DC −","domain":"DC","direction":"in","pole":"negative","nominalV":null},{"id":"ACL","label":"AC L","domain":"AC","direction":"out","pole":"line","nominalV":null},{"id":"ACN","label":"AC N","domain":"AC","direction":"out","pole":"neutral","nominalV":null},{"id":"ACPE","label":"AC PE","domain":"AC","direction":"bidirectional","pole":"earth","nominalV":null}],"nominalV":null,"ratedA":null,"ratedW":null,"installedOn":"","condition":"Sin comprobar","notes":"","provenance":"manual"},{"componentId":"item-inverter-charger","catalogId":"inverter-charger","terminals":[{"id":"INL","label":"IN L","domain":"AC","direction":"in","pole":"line","nominalV":null},{"id":"INN","label":"IN N","domain":"AC","direction":"in","pole":"neutral","nominalV":null},{"id":"INPE","label":"IN PE","domain":"AC","direction":"bidirectional","pole":"earth","nominalV":null},{"id":"OUTL","label":"OUT L","domain":"AC","direction":"out","pole":"line","nominalV":null},{"id":"OUTN","label":"OUT N","domain":"AC","direction":"out","pole":"neutral","nominalV":null},{"id":"OUTPE","label":"OUT PE","domain":"AC","direction":"bidirectional","pole":"earth","nominalV":null},{"id":"BAT+","label":"BAT +","domain":"DC","direction":"bidirectional","pole":"positive","nominalV":null},{"id":"BAT-","label":"BAT −","domain":"DC","direction":"bidirectional","pole":"negative","nominalV":null}],"nominalV":null,"ratedA":null,"ratedW":null,"installedOn":"","condition":"Sin comprobar","notes":"","provenance":"manual"},{"componentId":"item-controller","catalogId":"controller","terminals":[{"id":"PV+","label":"PV +","domain":"PV","direction":"in","pole":"positive","nominalV":null},{"id":"PV-","label":"PV −","domain":"PV","direction":"in","pole":"negative","nominalV":null},{"id":"BAT+","label":"BAT +","domain":"DC","direction":"out","pole":"positive","nominalV":null},{"id":"BAT-","label":"BAT −","domain":"DC","direction":"out","pole":"negative","nominalV":null}],"nominalV":null,"ratedA":null,"ratedW":null,"installedOn":"","condition":"Sin comprobar","notes":"","provenance":"manual"},{"componentId":"item-acr","catalogId":"acr","terminals":[{"id":"A+","label":"A +","domain":"DC","direction":"bidirectional","pole":"positive","nominalV":null},{"id":"A-","label":"A −","domain":"DC","direction":"bidirectional","pole":"negative","nominalV":null},{"id":"B+","label":"B +","domain":"DC","direction":"bidirectional","pole":"positive","nominalV":null},{"id":"B-","label":"B −","domain":"DC","direction":"bidirectional","pole":"negative","nominalV":null}],"nominalV":null,"ratedA":null,"ratedW":null,"installedOn":"","condition":"Sin comprobar","notes":"","provenance":"manual"},{"componentId":"item-distributor","catalogId":"distributor","terminals":[{"id":"IN+","label":"IN +","domain":"DC","direction":"in","pole":"positive","nominalV":null},{"id":"IN-","label":"IN −","domain":"DC","direction":"in","pole":"negative","nominalV":null},{"id":"OUT1+","label":"OUT1 +","domain":"DC","direction":"out","pole":"positive","nominalV":null},{"id":"OUT1-","label":"OUT1 −","domain":"DC","direction":"out","pole":"negative","nominalV":null},{"id":"OUT2+","label":"OUT2 +","domain":"DC","direction":"out","pole":"positive","nominalV":null},{"id":"OUT2-","label":"OUT2 −","domain":"DC","direction":"out","pole":"negative","nominalV":null}],"nominalV":null,"ratedA":null,"ratedW":null,"installedOn":"","condition":"Sin comprobar","notes":"","provenance":"manual"},{"componentId":"item-dc-distribution","catalogId":"dc-distribution","terminals":[{"id":"IN+","label":"IN +","domain":"DC","direction":"in","pole":"positive","nominalV":null},{"id":"IN-","label":"IN −","domain":"DC","direction":"in","pole":"negative","nominalV":null},{"id":"OUT+","label":"OUT +","domain":"DC","direction":"out","pole":"positive","nominalV":null},{"id":"OUT-","label":"OUT −","domain":"DC","direction":"out","pole":"negative","nominalV":null}],"nominalV":null,"ratedA":null,"ratedW":null,"installedOn":"","condition":"Sin comprobar","notes":"","provenance":"manual"},{"componentId":"item-ac-transfer","catalogId":"ac-transfer","terminals":[{"id":"IN1L","label":"IN1 L","domain":"AC","direction":"in","pole":"line","nominalV":null},{"id":"IN1N","label":"IN1 N","domain":"AC","direction":"in","pole":"neutral","nominalV":null},{"id":"IN1PE","label":"IN1 PE","domain":"AC","direction":"bidirectional","pole":"earth","nominalV":null},{"id":"IN2L","label":"IN2 L","domain":"AC","direction":"in","pole":"line","nominalV":null},{"id":"IN2N","label":"IN2 N","domain":"AC","direction":"in","pole":"neutral","nominalV":null},{"id":"IN2PE","label":"IN2 PE","domain":"AC","direction":"bidirectional","pole":"earth","nominalV":null},{"id":"OUTL","label":"OUT L","domain":"AC","direction":"out","pole":"line","nominalV":null},{"id":"OUTN","label":"OUT N","domain":"AC","direction":"out","pole":"neutral","nominalV":null},{"id":"OUTPE","label":"OUT PE","domain":"AC","direction":"bidirectional","pole":"earth","nominalV":null}],"nominalV":null,"ratedA":null,"ratedW":null,"installedOn":"","condition":"Sin comprobar","notes":"","provenance":"manual"},{"componentId":"item-bus-positive","catalogId":"bus-positive","terminals":[{"id":"bus1","label":"Positivo 1","domain":"DC","direction":"bidirectional","pole":"positive","nominalV":null},{"id":"bus2","label":"Positivo 2","domain":"DC","direction":"bidirectional","pole":"positive","nominalV":null}],"nominalV":null,"ratedA":null,"ratedW":null,"installedOn":"","condition":"Sin comprobar","notes":"","provenance":"manual"},{"componentId":"item-bus-negative","catalogId":"bus-negative","terminals":[{"id":"bus1","label":"Negativo 1","domain":"DC","direction":"bidirectional","pole":"negative","nominalV":null},{"id":"bus2","label":"Negativo 2","domain":"DC","direction":"bidirectional","pole":"negative","nominalV":null}],"nominalV":null,"ratedA":null,"ratedW":null,"installedOn":"","condition":"Sin comprobar","notes":"","provenance":"manual"},{"componentId":"item-battery","catalogId":"battery","terminals":[{"id":"BAT+","label":"BAT +","domain":"DC","direction":"bidirectional","pole":"positive","nominalV":null},{"id":"BAT-","label":"BAT −","domain":"DC","direction":"bidirectional","pole":"negative","nominalV":null}],"nominalV":null,"ratedA":null,"ratedW":null,"installedOn":"","condition":"Sin comprobar","notes":"","provenance":"manual"},{"componentId":"item-bank-starter","catalogId":"bank-starter","terminals":[{"id":"BANK+","label":"BANK +","domain":"DC","direction":"bidirectional","pole":"positive","nominalV":null},{"id":"BANK-","label":"BANK −","domain":"DC","direction":"bidirectional","pole":"negative","nominalV":null}],"nominalV":null,"ratedA":null,"ratedW":null,"installedOn":"","condition":"Sin comprobar","notes":"","provenance":"manual"},{"componentId":"item-bank-service","catalogId":"bank-service","terminals":[{"id":"BANK+","label":"BANK +","domain":"DC","direction":"bidirectional","pole":"positive","nominalV":null},{"id":"BANK-","label":"BANK −","domain":"DC","direction":"bidirectional","pole":"negative","nominalV":null}],"nominalV":null,"ratedA":null,"ratedW":null,"installedOn":"","condition":"Sin comprobar","notes":"","provenance":"manual"},{"componentId":"item-bank-auxiliary","catalogId":"bank-auxiliary","terminals":[{"id":"BANK+","label":"BANK +","domain":"DC","direction":"bidirectional","pole":"positive","nominalV":null},{"id":"BANK-","label":"BANK −","domain":"DC","direction":"bidirectional","pole":"negative","nominalV":null}],"nominalV":null,"ratedA":null,"ratedW":null,"installedOn":"","condition":"Sin comprobar","notes":"","provenance":"manual"},{"componentId":"item-bank-custom","catalogId":"bank-custom","terminals":[{"id":"BANK+","label":"BANK +","domain":"DC","direction":"bidirectional","pole":"positive","nominalV":null},{"id":"BANK-","label":"BANK −","domain":"DC","direction":"bidirectional","pole":"negative","nominalV":null}],"nominalV":null,"ratedA":null,"ratedW":null,"installedOn":"","condition":"Sin comprobar","notes":"","provenance":"manual"},{"componentId":"item-fuse","catalogId":"fuse","terminals":[{"id":"in","label":"Entrada","domain":"unknown","direction":"in","pole":"unknown","nominalV":null},{"id":"out","label":"Salida","domain":"unknown","direction":"out","pole":"unknown","nominalV":null}],"nominalV":null,"ratedA":null,"ratedW":null,"installedOn":"","condition":"Sin comprobar","notes":"","provenance":"manual"},{"componentId":"item-breaker","catalogId":"breaker","terminals":[{"id":"in","label":"Entrada","domain":"unknown","direction":"in","pole":"unknown","nominalV":null},{"id":"out","label":"Salida","domain":"unknown","direction":"out","pole":"unknown","nominalV":null}],"nominalV":null,"ratedA":null,"ratedW":null,"installedOn":"","condition":"Sin comprobar","notes":"","provenance":"manual"},{"componentId":"item-rcd","catalogId":"rcd","terminals":[{"id":"in","label":"Entrada","domain":"unknown","direction":"in","pole":"unknown","nominalV":null},{"id":"out","label":"Salida","domain":"unknown","direction":"out","pole":"unknown","nominalV":null}],"nominalV":null,"ratedA":null,"ratedW":null,"installedOn":"","condition":"Sin comprobar","notes":"","provenance":"manual"},{"componentId":"item-switch","catalogId":"switch","terminals":[{"id":"in","label":"Entrada","domain":"unknown","direction":"in","pole":"unknown","nominalV":null},{"id":"out","label":"Salida","domain":"unknown","direction":"out","pole":"unknown","nominalV":null}],"nominalV":null,"ratedA":null,"ratedW":null,"installedOn":"","condition":"Sin comprobar","notes":"","provenance":"manual"},{"componentId":"item-shunt","catalogId":"shunt","terminals":[{"id":"in","label":"Entrada","domain":"unknown","direction":"in","pole":"unknown","nominalV":null},{"id":"out","label":"Salida","domain":"unknown","direction":"out","pole":"unknown","nominalV":null}],"nominalV":null,"ratedA":null,"ratedW":null,"installedOn":"","condition":"Sin comprobar","notes":"","provenance":"manual"},{"componentId":"item-terminal","catalogId":"terminal","terminals":[{"id":"in","label":"Entrada","domain":"unknown","direction":"in","pole":"unknown","nominalV":null},{"id":"out","label":"Salida","domain":"unknown","direction":"out","pole":"unknown","nominalV":null}],"nominalV":null,"ratedA":null,"ratedW":null,"installedOn":"","condition":"Sin comprobar","notes":"","provenance":"manual"},{"componentId":"item-ac-panel","catalogId":"ac-panel","terminals":[{"id":"INL","label":"IN L","domain":"AC","direction":"in","pole":"line","nominalV":null},{"id":"INN","label":"IN N","domain":"AC","direction":"in","pole":"neutral","nominalV":null},{"id":"INPE","label":"IN PE","domain":"AC","direction":"bidirectional","pole":"earth","nominalV":null},{"id":"OUTL","label":"OUT L","domain":"AC","direction":"out","pole":"line","nominalV":null},{"id":"OUTN","label":"OUT N","domain":"AC","direction":"out","pole":"neutral","nominalV":null},{"id":"OUTPE","label":"OUT PE","domain":"AC","direction":"bidirectional","pole":"earth","nominalV":null}],"nominalV":null,"ratedA":null,"ratedW":null,"installedOn":"","condition":"Sin comprobar","notes":"","provenance":"manual"},{"componentId":"item-dc-panel","catalogId":"dc-panel","terminals":[{"id":"IN+","label":"IN +","domain":"DC","direction":"in","pole":"positive","nominalV":null},{"id":"IN-","label":"IN −","domain":"DC","direction":"in","pole":"negative","nominalV":null},{"id":"OUT+","label":"OUT +","domain":"DC","direction":"out","pole":"positive","nominalV":null},{"id":"OUT-","label":"OUT −","domain":"DC","direction":"out","pole":"negative","nominalV":null}],"nominalV":null,"ratedA":null,"ratedW":null,"installedOn":"","condition":"Sin comprobar","notes":"","provenance":"manual"},{"componentId":"item-monitor","catalogId":"monitor","terminals":[{"id":"DC+","label":"DC +","domain":"DC","direction":"in","pole":"positive","nominalV":null},{"id":"DC-","label":"DC −","domain":"DC","direction":"in","pole":"negative","nominalV":null}],"nominalV":null,"ratedA":null,"ratedW":null,"installedOn":"","condition":"Sin comprobar","notes":"","provenance":"manual"},{"componentId":"item-ac-socket","catalogId":"ac-socket","terminals":[{"id":"ACL","label":"AC L","domain":"AC","direction":"in","pole":"line","nominalV":null},{"id":"ACN","label":"AC N","domain":"AC","direction":"in","pole":"neutral","nominalV":null},{"id":"ACPE","label":"AC PE","domain":"AC","direction":"bidirectional","pole":"earth","nominalV":null}],"nominalV":null,"ratedA":null,"ratedW":null,"installedOn":"","condition":"Sin comprobar","notes":"","provenance":"manual"},{"componentId":"item-lighting","catalogId":"lighting","terminals":[{"id":"DC+","label":"DC +","domain":"DC","direction":"in","pole":"positive","nominalV":null},{"id":"DC-","label":"DC −","domain":"DC","direction":"in","pole":"negative","nominalV":null}],"nominalV":null,"ratedA":null,"ratedW":null,"installedOn":"","condition":"Sin comprobar","notes":"","provenance":"manual"},{"componentId":"item-navigation","catalogId":"navigation","terminals":[{"id":"DC+","label":"DC +","domain":"DC","direction":"in","pole":"positive","nominalV":null},{"id":"DC-","label":"DC −","domain":"DC","direction":"in","pole":"negative","nominalV":null}],"nominalV":null,"ratedA":null,"ratedW":null,"installedOn":"","condition":"Sin comprobar","notes":"","provenance":"manual"},{"componentId":"item-pump","catalogId":"pump","terminals":[{"id":"DC+","label":"DC +","domain":"DC","direction":"in","pole":"positive","nominalV":null},{"id":"DC-","label":"DC −","domain":"DC","direction":"in","pole":"negative","nominalV":null}],"nominalV":null,"ratedA":null,"ratedW":null,"installedOn":"","condition":"Sin comprobar","notes":"","provenance":"manual"},{"componentId":"item-fridge","catalogId":"fridge","terminals":[{"id":"DC+","label":"DC +","domain":"DC","direction":"in","pole":"positive","nominalV":null},{"id":"DC-","label":"DC −","domain":"DC","direction":"in","pole":"negative","nominalV":null}],"nominalV":null,"ratedA":null,"ratedW":null,"installedOn":"","condition":"Sin comprobar","notes":"","provenance":"manual"},{"componentId":"item-windlass","catalogId":"windlass","terminals":[{"id":"DC+","label":"DC +","domain":"DC","direction":"in","pole":"positive","nominalV":null},{"id":"DC-","label":"DC −","domain":"DC","direction":"in","pole":"negative","nominalV":null}],"nominalV":null,"ratedA":null,"ratedW":null,"installedOn":"","condition":"Sin comprobar","notes":"","provenance":"manual"},{"componentId":"item-autopilot","catalogId":"autopilot","terminals":[{"id":"DC+","label":"DC +","domain":"DC","direction":"in","pole":"positive","nominalV":null},{"id":"DC-","label":"DC −","domain":"DC","direction":"in","pole":"negative","nominalV":null}],"nominalV":null,"ratedA":null,"ratedW":null,"installedOn":"","condition":"Sin comprobar","notes":"","provenance":"manual"},{"componentId":"item-custom-consumer","catalogId":"custom-consumer","terminals":[{"id":"DC+","label":"DC +","domain":"DC","direction":"in","pole":"positive","nominalV":null},{"id":"DC-","label":"DC −","domain":"DC","direction":"in","pole":"negative","nominalV":null}],"nominalV":null,"ratedA":null,"ratedW":null,"installedOn":"","condition":"Sin comprobar","notes":"","provenance":"manual"},{"componentId":"battery-2","catalogId":"battery","terminals":[{"id":"BAT+","label":"BAT +","domain":"DC","direction":"bidirectional","pole":"positive","nominalV":null},{"id":"BAT-","label":"BAT −","domain":"DC","direction":"bidirectional","pole":"negative","nominalV":null}],"nominalV":null,"ratedA":null,"ratedW":null,"installedOn":"","condition":"Sin comprobar","notes":"","provenance":"manual"},{"componentId":"battery-3","catalogId":"battery","terminals":[{"id":"BAT+","label":"BAT +","domain":"DC","direction":"bidirectional","pole":"positive","nominalV":null},{"id":"BAT-","label":"BAT −","domain":"DC","direction":"bidirectional","pole":"negative","nominalV":null}],"nominalV":null,"ratedA":null,"ratedW":null,"installedOn":"","condition":"Sin comprobar","notes":"","provenance":"manual"},{"componentId":"battery-4","catalogId":"battery","terminals":[{"id":"BAT+","label":"BAT +","domain":"DC","direction":"bidirectional","pole":"positive","nominalV":null},{"id":"BAT-","label":"BAT −","domain":"DC","direction":"bidirectional","pole":"negative","nominalV":null}],"nominalV":null,"ratedA":null,"ratedW":null,"installedOn":"","condition":"Sin comprobar","notes":"","provenance":"manual"}],"nodes":[{"componentId":"item-shore","x":200,"y":300},{"componentId":"item-alternator","x":200,"y":300},{"componentId":"item-solar","x":200,"y":300},{"componentId":"item-generator","x":200,"y":300},{"componentId":"item-custom-source","x":200,"y":300},{"componentId":"item-charger","x":200,"y":300},{"componentId":"item-dc-charger","x":200,"y":300},{"componentId":"item-inverter","x":200,"y":300},{"componentId":"item-inverter-charger","x":200,"y":300},{"componentId":"item-controller","x":200,"y":300},{"componentId":"item-acr","x":200,"y":300},{"componentId":"item-distributor","x":200,"y":300},{"componentId":"item-dc-distribution","x":200,"y":300},{"componentId":"item-ac-transfer","x":200,"y":300},{"componentId":"item-bus-positive","x":200,"y":300},{"componentId":"item-bus-negative","x":200,"y":300},{"componentId":"item-battery","x":200,"y":300},{"componentId":"item-bank-starter","x":200,"y":300},{"componentId":"item-bank-service","x":200,"y":300},{"componentId":"item-bank-auxiliary","x":200,"y":300},{"componentId":"item-bank-custom","x":200,"y":300},{"componentId":"item-fuse","x":200,"y":300},{"componentId":"item-breaker","x":200,"y":300},{"componentId":"item-rcd","x":200,"y":300},{"componentId":"item-switch","x":200,"y":300},{"componentId":"item-shunt","x":200,"y":300},{"componentId":"item-terminal","x":200,"y":300},{"componentId":"item-ac-panel","x":200,"y":300},{"componentId":"item-dc-panel","x":200,"y":300},{"componentId":"item-monitor","x":200,"y":300},{"componentId":"item-ac-socket","x":200,"y":300},{"componentId":"item-lighting","x":200,"y":300},{"componentId":"item-navigation","x":200,"y":300},{"componentId":"item-pump","x":200,"y":300},{"componentId":"item-fridge","x":200,"y":300},{"componentId":"item-windlass","x":200,"y":300},{"componentId":"item-autopilot","x":200,"y":300},{"componentId":"item-custom-consumer","x":200,"y":300},{"componentId":"battery-2","x":400,"y":500},{"componentId":"battery-3","x":600,"y":500},{"componentId":"battery-4","x":800,"y":500}],"wires":[{"id":"6289a63d-098d-4573-844c-5c3d433a0e38","from":{"componentId":"item-bank-service","terminalId":"BANK+"},"to":{"componentId":"item-battery","terminalId":"BAT+"},"domain":"DC","nominalV":null,"cable":"","sectionMm2":null,"lengthM":null,"protectionId":null,"notes":"","provenance":"manual","bankId":"item-bank-service"},{"id":"c7fdcc8e-a7a1-41b0-8926-1ec160f23a5e","from":{"componentId":"item-battery","terminalId":"BAT-"},"to":{"componentId":"battery-2","terminalId":"BAT+"},"domain":"DC","nominalV":null,"cable":"","sectionMm2":null,"lengthM":null,"protectionId":null,"notes":"","provenance":"manual","bankId":"item-bank-service"},{"id":"ba8517c7-07f7-46ec-b030-2da1b26740c7","from":{"componentId":"battery-2","terminalId":"BAT-"},"to":{"componentId":"item-bank-service","terminalId":"BANK-"},"domain":"DC","nominalV":null,"cable":"","sectionMm2":null,"lengthM":null,"protectionId":null,"notes":"","provenance":"manual","bankId":"item-bank-service"},{"id":"e465cc50-83a8-4af7-8887-2c3009bc72af","from":{"componentId":"item-bank-service","terminalId":"BANK+"},"to":{"componentId":"battery-3","terminalId":"BAT+"},"domain":"DC","nominalV":null,"cable":"","sectionMm2":null,"lengthM":null,"protectionId":null,"notes":"","provenance":"manual","bankId":"item-bank-service"},{"id":"35b41f94-a0a5-438a-a0ef-3e76403bfcc1","from":{"componentId":"battery-3","terminalId":"BAT-"},"to":{"componentId":"battery-4","terminalId":"BAT+"},"domain":"DC","nominalV":null,"cable":"","sectionMm2":null,"lengthM":null,"protectionId":null,"notes":"","provenance":"manual","bankId":"item-bank-service"},{"id":"ecdf4a2e-c6ee-47d0-a7ef-ccb6f03535e2","from":{"componentId":"battery-4","terminalId":"BAT-"},"to":{"componentId":"item-bank-service","terminalId":"BANK-"},"domain":"DC","nominalV":null,"cable":"","sectionMm2":null,"lengthM":null,"protectionId":null,"notes":"","provenance":"manual","bankId":"item-bank-service"},{"id":"shore-wire","from":{"componentId":"item-shore","terminalId":"ACL"},"to":{"componentId":"item-charger","terminalId":"ACL"},"domain":"AC","nominalV":null,"cable":"H07RN-F","sectionMm2":2.5,"lengthM":10,"protectionId":null,"notes":"","provenance":"manual","bankId":null}],"banks":[{"bankId":"item-bank-starter","strings":[]},{"bankId":"item-bank-auxiliary","strings":[]},{"bankId":"item-bank-custom","strings":[]},{"bankId":"item-bank-service","strings":[["item-battery","battery-2"],["battery-3","battery-4"]]}],"viewport":{"x":143.5,"y":-92.25,"zoom":1.125},"origin":"legacy"},"installation":{"nodes":[{"id":"item-shore","kind":"shore","name":"Toma de puerto 230 V AC","location":"","manufacturer":"","model":""},{"id":"item-alternator","kind":"alternator","name":"Alternador","location":"","manufacturer":"","model":""},{"id":"item-solar","kind":"solar","name":"Panel solar","location":"","manufacturer":"","model":""},{"id":"item-generator","kind":"electrical","name":"Generador AC","location":"","manufacturer":"","model":""},{"id":"item-custom-source","kind":"electrical","name":"Fuente personalizada","location":"","manufacturer":"","model":""},{"id":"item-charger","kind":"charger","name":"Cargador AC/DC","location":"","manufacturer":"","model":""},{"id":"item-dc-charger","kind":"electrical","name":"Cargador DC/DC","location":"","manufacturer":"","model":""},{"id":"item-inverter","kind":"electrical","name":"Inversor DC/AC","location":"","manufacturer":"","model":""},{"id":"item-inverter-charger","kind":"electrical","name":"Inversor/cargador","location":"","manufacturer":"","model":""},{"id":"item-controller","kind":"controller","name":"Regulador PWM/MPPT","location":"","manufacturer":"","model":""},{"id":"item-acr","kind":"electrical","name":"Relé ACR/VSR","location":"","manufacturer":"","model":""},{"id":"item-distributor","kind":"distributor","name":"Aislador / repartidor","location":"","manufacturer":"","model":""},{"id":"item-dc-distribution","kind":"electrical","name":"Distribuidor CC","location":"","manufacturer":"","model":""},{"id":"item-ac-transfer","kind":"electrical","name":"Conmutador de fuentes AC","location":"","manufacturer":"","model":""},{"id":"item-bus-positive","kind":"electrical","name":"Barra positiva","location":"","manufacturer":"","model":""},{"id":"item-bus-negative","kind":"electrical","name":"Barra negativa","location":"","manufacturer":"","model":""},{"id":"item-fuse","kind":"electrical","name":"Fusible","location":"","manufacturer":"","model":""},{"id":"item-breaker","kind":"electrical","name":"Magnetotérmico","location":"","manufacturer":"","model":""},{"id":"item-rcd","kind":"electrical","name":"Diferencial","location":"","manufacturer":"","model":""},{"id":"item-switch","kind":"electrical","name":"Interruptor / seccionador","location":"","manufacturer":"","model":""},{"id":"item-shunt","kind":"electrical","name":"Shunt","location":"","manufacturer":"","model":""},{"id":"item-terminal","kind":"electrical","name":"Borne / punto de conexión","location":"","manufacturer":"","model":""},{"id":"item-ac-panel","kind":"electrical","name":"Cuadro AC","location":"","manufacturer":"","model":""},{"id":"item-dc-panel","kind":"electrical","name":"Cuadro DC","location":"","manufacturer":"","model":""},{"id":"item-monitor","kind":"electrical","name":"Monitor de baterías","location":"","manufacturer":"","model":""},{"id":"item-ac-socket","kind":"consumer","name":"Toma de corriente 230 V","location":"","manufacturer":"","model":""},{"id":"item-lighting","kind":"consumer","name":"Iluminación","location":"","manufacturer":"","model":""},{"id":"item-navigation","kind":"consumer","name":"Electrónica de navegación","location":"","manufacturer":"","model":""},{"id":"item-pump","kind":"consumer","name":"Bomba","location":"","manufacturer":"","model":""},{"id":"item-fridge","kind":"consumer","name":"Nevera","location":"","manufacturer":"","model":""},{"id":"item-windlass","kind":"consumer","name":"Molinete","location":"","manufacturer":"","model":""},{"id":"item-autopilot","kind":"consumer","name":"Piloto automático","location":"","manufacturer":"","model":""},{"id":"item-custom-consumer","kind":"consumer","name":"Consumidor personalizado","location":"","manufacturer":"","model":""}],"links":[],"bindings":[{"targetId":"item-controller","metric":"current","channel":"solar-current","sensor":"SOLAR0_OUT","connection":"isolated-fixture"},{"targetId":"item-controller","metric":"voltage","channel":"solar-voltage","sensor":"SOLAR0_OUT","connection":"isolated-fixture"},{"targetId":"item-bank-service","metric":"voltage","channel":"battery-voltage","sensor":"BAT_HOUSE","connection":"isolated-fixture"}]}}'::jsonb; result jsonb; before jsonb; rejected boolean; changed jsonb;
begin
  perform pg_temp.fleet_validate_inventory(document);
  result:=pg_temp.save_vessel_technical_inventory('11111111-1111-4111-8111-111111111111',0,document);
  if result->'inventory' is distinct from document or (result->>'revision')::integer<>1 then raise exception 'Save lost terminal editor data'; end if;
  if pg_temp.load_vessel_technical_inventory('11111111-1111-4111-8111-111111111111') is distinct from result then raise exception 'Load does not recover exact diagram'; end if;
  if not exists(select 1 from pg_temp.barco_inventario_revisiones h where h.revision=1 and h.inventory=document) then raise exception 'History lost graph'; end if;
  before:=result;
  rejected:=false;
  begin perform pg_temp.save_vessel_technical_inventory('11111111-1111-4111-8111-111111111111',0,document); exception when serialization_failure then rejected:=true; end;
  if not rejected then raise exception 'Stale revision accepted'; end if;
  rejected:=false;
  begin perform pg_temp.save_vessel_technical_inventory('11111111-1111-4111-8111-111111111111',1,document-'electrical'); exception when invalid_parameter_value then rejected:=true; end;
  if not rejected then raise exception 'Old client silently dropped graph'; end if;
  rejected:=false;
  begin perform pg_temp.save_vessel_technical_inventory('11111111-1111-4111-8111-111111111111',1,jsonb_set(document,'{electrical,wires,0,to,terminalId}','"missing"')); exception when foreign_key_violation then rejected:=true; end;
  if not rejected then raise exception 'Missing terminal accepted'; end if;
  if pg_temp.load_vessel_technical_inventory('11111111-1111-4111-8111-111111111111') is distinct from before then raise exception 'Rejected edit changed document'; end if;
  changed:=jsonb_set(document,'{electrical,viewport,zoom}','0.75');
  result:=pg_temp.save_vessel_technical_inventory('11111111-1111-4111-8111-111111111111',1,changed);
  if result#>'{inventory,electrical}' is distinct from changed->'electrical' or (result->>'revision')::integer<>2 then raise exception 'Viewport edit not preserved'; end if;
  perform set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
  rejected:=false;
  begin perform pg_temp.load_vessel_technical_inventory('11111111-1111-4111-8111-111111111111'); exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'Foreign principal read vessel'; end if;
end $$;
rollback;
select 'terminal editor migration and RPC integration passed; zero permanent changes' as result;