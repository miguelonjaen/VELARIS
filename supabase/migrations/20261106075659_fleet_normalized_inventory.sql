-- Requires 022. Normalized inventory + transactional compatibility with the v1 JSON client.
-- No existing stock inventory, vessel status or navigation contracts are changed.
begin;
-- Block concurrent writes during import and trigger installation; ordinary reads can continue.
lock table public.barcos in share row exclusive mode;

create table public.barco_componentes (
  barco_id uuid not null references public.barcos(id) on delete cascade,
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

create table public.barco_depositos (
  barco_id uuid not null,
  component_id text not null,
  kind text not null default 'tank' check (kind = 'tank'),
  fluid text not null check (fluid in ('diesel', 'petrol', 'freshwater', 'greywater', 'blackwater', 'other')),
  capacity_l numeric check (capacity_l > 0),
  primary key (barco_id, component_id),
  foreign key (barco_id, component_id, kind) references public.barco_componentes(barco_id, id, kind) on delete cascade
);

create table public.barco_bancos (
  barco_id uuid not null,
  component_id text not null,
  kind text not null default 'bank' check (kind = 'bank'),
  purpose text not null check (purpose in ('service', 'starter', 'other')),
  topology text not null check (topology in ('parallel', 'series', 'unknown')),
  primary key (barco_id, component_id),
  foreign key (barco_id, component_id, kind) references public.barco_componentes(barco_id, id, kind) on delete cascade
);

create table public.barco_baterias (
  barco_id uuid not null,
  component_id text not null,
  kind text not null default 'battery' check (kind = 'battery'),
  bank_id text,
  chemistry text not null check (chemistry in ('AGM', 'GEL', 'flooded', 'LiFePO4', 'other', 'unknown')),
  capacity_ah numeric check (capacity_ah > 0),
  nominal_v numeric check (nominal_v > 0),
  primary key (barco_id, component_id),
  foreign key (barco_id, component_id, kind) references public.barco_componentes(barco_id, id, kind) on delete cascade,
  foreign key (barco_id, bank_id) references public.barco_bancos(barco_id, component_id)
);
create index barco_baterias_bank on public.barco_baterias(barco_id, bank_id);

create table public.barco_lecturas_componentes (
  barco_id uuid not null,
  component_id text not null,
  kind text not null,
  metric text not null,
  value numeric,
  origin text not null check (origin in ('unknown', 'manual', 'measured')),
  observed_at timestamptz,
  sensor text,
  primary key (barco_id, component_id, metric),
  foreign key (barco_id, component_id, kind) references public.barco_componentes(barco_id, id, kind) on delete cascade,
  check ((kind = 'tank' and metric = 'level') or (kind = 'battery' and metric in ('voltage', 'soc'))),
  check (
    (origin = 'unknown' and value is null and observed_at is null and sensor is null)
    or (origin in ('manual', 'measured') and value is not null and observed_at is not null
      and ((origin = 'manual' and sensor is null)
        or (origin = 'measured' and sensor is not null and length(sensor) between 1 and 240 and sensor !~ '^[[:space:]]*$')))
  ),
  check (value is null or (value >= 0 and value <= case when metric = 'voltage' then 1000 else 100 end))
);

create table public.barco_inventario_revisiones (
  barco_id uuid not null references public.barcos(id) on delete cascade,
  revision integer not null check (revision >= 0),
  inventory jsonb not null,
  saved_at timestamptz not null default now(),
  saved_by uuid,
  source text not null check (source in ('legacy_import', 'client')),
  primary key (barco_id, revision)
);

-- Authenticated clients can read only their vessels. Writes go through the checked transaction.
do $$
declare table_name text;
begin
  foreach table_name in array array['barco_componentes', 'barco_depositos', 'barco_bancos',
    'barco_baterias', 'barco_lecturas_componentes', 'barco_inventario_revisiones'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role', table_name);
    execute format('grant select on table public.%I to authenticated', table_name);
    execute format('create policy vessel_owner_read on public.%I for select to authenticated using (
      exists (select 1 from public.barcos b where b.id = barco_id
        and (b.user_id = auth.uid() or b.capitan_id = auth.uid())))', table_name);
  end loop;
end $$;

create function public.fleet_valid_reading(p_reading jsonb, p_max numeric)
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

create function public.fleet_validate_inventory(p_inventory jsonb)
returns void language plpgsql immutable set search_path = '' as $$
declare c jsonb; field_name text; allowed text[];
begin
  if jsonb_typeof(p_inventory) is distinct from 'object'
    or p_inventory->'version' is distinct from '1'::jsonb
    or jsonb_typeof(p_inventory->'components') is distinct from 'array'
    or p_inventory - array['version', 'components'] <> '{}'::jsonb then
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
end $$;

-- Private helper: called only by the guarded trigger and the one-time import below.
create function public.fleet_store_normalized_inventory(p_ship_id uuid, p_inventory jsonb, p_revision integer, p_actor uuid, p_source text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.fleet_validate_inventory(p_inventory);
  if exists (select 1 from public.barco_componentes old
    join jsonb_array_elements(p_inventory->'components') c on old.id = c->>'id'
    where old.barco_id = p_ship_id and old.kind <> c->>'kind') then
    raise exception 'A component identity cannot change its type' using errcode = '22023';
  end if;

  insert into public.barco_componentes (barco_id, id, kind, name, location, manufacturer, model, position)
    select p_ship_id, c->>'id', c->>'kind', c->>'name', c->>'location', c->>'manufacturer', c->>'model', (n - 1)::integer
    from jsonb_array_elements(p_inventory->'components') with ordinality as entry(c, n)
  on conflict (barco_id, id) do update set name = excluded.name, location = excluded.location,
    manufacturer = excluded.manufacturer, model = excluded.model, position = excluded.position, retired_at = null, updated_at = now();

  insert into public.barco_depositos (barco_id, component_id, fluid, capacity_l)
    select p_ship_id, c->>'id', c->>'fluid', (c->>'capacityL')::numeric
    from jsonb_array_elements(p_inventory->'components') c where c->>'kind' = 'tank'
  on conflict (barco_id, component_id) do update set fluid = excluded.fluid, capacity_l = excluded.capacity_l;

  -- Insert all banks before batteries; JSON order must not affect relationship integrity.
  insert into public.barco_bancos (barco_id, component_id, purpose, topology)
    select p_ship_id, c->>'id', c->>'purpose', c->>'topology'
    from jsonb_array_elements(p_inventory->'components') c where c->>'kind' = 'bank'
  on conflict (barco_id, component_id) do update set purpose = excluded.purpose, topology = excluded.topology;

  insert into public.barco_baterias (barco_id, component_id, bank_id, chemistry, capacity_ah, nominal_v)
    select p_ship_id, c->>'id', c->>'bankId', c->>'chemistry', (c->>'capacityAh')::numeric, (c->>'nominalV')::numeric
    from jsonb_array_elements(p_inventory->'components') c where c->>'kind' = 'battery'
  on conflict (barco_id, component_id) do update set bank_id = excluded.bank_id, chemistry = excluded.chemistry,
    capacity_ah = excluded.capacity_ah, nominal_v = excluded.nominal_v;

  insert into public.barco_lecturas_componentes (barco_id, component_id, kind, metric, value, origin, observed_at, sensor)
    select p_ship_id, c->>'id', c->>'kind', metric, (r->>'value')::numeric, r->>'origin', (r->>'at')::timestamptz, r->>'sensor'
    from jsonb_array_elements(p_inventory->'components') c
    cross join lateral (values ('level', c->'level'), ('voltage', c->'voltage'), ('soc', c->'soc')) readings(metric, r)
    where (c->>'kind' = 'tank' and metric = 'level') or (c->>'kind' = 'battery' and metric in ('voltage', 'soc'))
  on conflict (barco_id, component_id, metric) do update set value = excluded.value, origin = excluded.origin,
    observed_at = excluded.observed_at, sensor = excluded.sensor;

  -- Retirement preserves identities and old readings; history also retains the previous snapshot.
  update public.barco_componentes existing set retired_at = now(), updated_at = now()
    where existing.barco_id = p_ship_id and existing.retired_at is null
      and not exists (select 1 from jsonb_array_elements(p_inventory->'components') c where c->>'id' = existing.id);

  insert into public.barco_inventario_revisiones (barco_id, revision, inventory, saved_by, source)
    values (p_ship_id, p_revision, p_inventory, p_actor, p_source);
end $$;

create function public.fleet_inventory_document(p_ship_id uuid)
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
  ), '[]'::jsonb))
  from public.barco_componentes c
  left join public.barco_depositos t on t.barco_id = c.barco_id and t.component_id = c.id
  left join public.barco_bancos bank on bank.barco_id = c.barco_id and bank.component_id = c.id
  left join public.barco_baterias battery on battery.barco_id = c.barco_id and battery.component_id = c.id
  left join public.barco_lecturas_componentes level on level.barco_id = c.barco_id and level.component_id = c.id and level.metric = 'level'
  left join public.barco_lecturas_componentes voltage on voltage.barco_id = c.barco_id and voltage.component_id = c.id and voltage.metric = 'voltage'
  left join public.barco_lecturas_componentes soc on soc.barco_id = c.barco_id and soc.component_id = c.id and soc.metric = 'soc'
  where c.barco_id = p_ship_id and c.retired_at is null;
$$;

-- A legacy JSON write must use the same revision discipline and cannot bypass SQL validation.
create function public.fleet_sync_inventory()
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
  perform public.fleet_store_normalized_inventory(new.id, new.technical_inventory, new.technical_revision, auth.uid(), 'client');
  return new;
end $$;

-- Fail the entire migration on incompatible legacy data; never silently discard attributes or relations.
do $$
declare vessel record;
begin
  for vessel in select id, technical_inventory, technical_revision from public.barcos
    where technical_inventory is not null for update loop
    perform public.fleet_store_normalized_inventory(vessel.id, vessel.technical_inventory, vessel.technical_revision, null, 'legacy_import');
  end loop;
end $$;

create trigger sync_fleet_technical_inventory
after insert or update of technical_inventory, technical_revision on public.barcos
for each row execute function public.fleet_sync_inventory();

create function public.load_vessel_technical_inventory(p_ship_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  -- One statement/snapshot: a concurrent writer cannot mix old revision with new components.
  select jsonb_build_object('revision', b.technical_revision, 'inventory', public.fleet_inventory_document(b.id)) into result
    from public.barcos b where b.id = p_ship_id and (b.user_id = auth.uid() or b.capitan_id = auth.uid());
  if result is null then raise exception 'Vessel unavailable' using errcode = '42501'; end if;
  return result;
end $$;

create function public.save_vessel_technical_inventory(p_ship_id uuid, p_expected_revision integer, p_inventory jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare revision integer; actor uuid := auth.uid();
begin
  if actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select b.technical_revision into revision from public.barcos b
    where b.id = p_ship_id and (b.user_id = actor or b.capitan_id = actor) for update;
  if not found then raise exception 'Vessel unavailable' using errcode = '42501'; end if;
  if p_expected_revision is null or p_expected_revision < 0 then raise exception 'Invalid expected revision' using errcode = '22023'; end if;
  if revision <> p_expected_revision then raise exception 'Inventory revision conflict' using errcode = '40001'; end if;
  -- The guarded trigger normalizes all rows and records the revision in this same transaction.
  update public.barcos set technical_inventory = p_inventory, technical_revision = revision + 1 where id = p_ship_id;
  return jsonb_build_object('revision', revision + 1, 'inventory', public.fleet_inventory_document(p_ship_id));
end $$;

revoke all on function public.fleet_valid_reading(jsonb, numeric) from public, anon, authenticated, service_role;
revoke all on function public.fleet_validate_inventory(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.fleet_store_normalized_inventory(uuid, jsonb, integer, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.fleet_sync_inventory() from public, anon, authenticated, service_role;
revoke all on function public.fleet_inventory_document(uuid) from public, anon, authenticated, service_role;
revoke all on function public.load_vessel_technical_inventory(uuid) from public, anon, authenticated, service_role;
revoke all on function public.save_vessel_technical_inventory(uuid, integer, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.fleet_inventory_document(uuid) to authenticated;
grant execute on function public.load_vessel_technical_inventory(uuid) to authenticated;
grant execute on function public.save_vessel_technical_inventory(uuid, integer, jsonb) to authenticated;

commit;
