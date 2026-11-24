-- Integration smoke test: creates two disposable vessels for existing active principals.
-- Never updates existing vessels/users; all fixture writes are rolled back, including on session abort.
begin;
-- Disposable fixtures only. Existing vessels and profiles are never updated by this suite.
do $fixture$
declare owners uuid[]; ship_a uuid := gen_random_uuid(); ship_b uuid := gen_random_uuid();
begin
  select array_agg(id order by id) into owners from (
    select id from public.usuarios where cuenta_activa and suscripcion_activa order by id limit 2
  ) active;
  if cardinality(owners) is distinct from 2 then raise exception 'Two active test principals required'; end if;
  perform set_config('fleet_test.owner_a', owners[1]::text, true);
  perform set_config('fleet_test.owner_b', owners[2]::text, true);
  perform set_config('fleet_test.vessel_a', ship_a::text, true);
  perform set_config('fleet_test.vessel_b', ship_b::text, true);
  insert into public.barcos (id, user_id, capitan_id, nombre, marca, modelo, matricula, tipo_barco,
    eslora, manga, calado, lat, lng, fuel_level, water_level, horas_motor, potencia_cv)
  values
    (ship_a, owners[1], owners[1], '__fleet_transaction_test_A__', 'Test', 'Test', null, 'Otro', null, null, null, null, null, null, null, null, null),
    (ship_b, owners[2], owners[2], '__fleet_transaction_test_B__', 'Test', 'Test', null, 'Otro', null, null, null, null, null, null, null, null, null);
end $fixture$;
do $$
begin
  if current_setting('fleet_test.owner_a') = current_setting('fleet_test.owner_b')
    or current_setting('fleet_test.vessel_a') = current_setting('fleet_test.vessel_b') then raise exception 'Fixtures must be distinct'; end if;
  if not exists (select 1 from public.barcos where id = current_setting('fleet_test.vessel_a')::uuid
    and capitan_id = current_setting('fleet_test.owner_a')::uuid) then raise exception 'Fixture A has wrong owner'; end if;
  if not exists (select 1 from public.barcos where id = current_setting('fleet_test.vessel_b')::uuid
    and capitan_id = current_setting('fleet_test.owner_b')::uuid) then raise exception 'Fixture B has wrong owner'; end if;
end $$;

select set_config('request.jwt.claim.sub', current_setting('fleet_test.owner_a'), true);
set local role authenticated;

do $$
declare ship uuid := current_setting('fleet_test.vessel_a')::uuid;
  initial jsonb; saved jsonb; loaded jsonb; bad jsonb; rev integer;
  unknown_reading jsonb := '{"value":null,"origin":"unknown","at":null,"sensor":null}';
  inventory jsonb;
begin
  initial := public.load_vessel_technical_inventory(ship);
  perform set_config('fleet_test.initial_revision', initial->>'revision', true);
  inventory := jsonb_build_object('version', 1, 'components', jsonb_build_array(
    -- Battery intentionally precedes its bank in the payload.
    jsonb_build_object('id','test:battery','kind','battery','name','Servicio 1','location','','manufacturer','','model','',
      'bankId','test:bank','chemistry','AGM','capacityAh',100,'nominalV',12,'voltage',unknown_reading,'soc',unknown_reading),
    jsonb_build_object('id','test:bank','kind','bank','name','Banco servicio','location','','manufacturer','','model','',
      'purpose','service','topology','parallel'),
    jsonb_build_object('id','test:water','kind','tank','name','Agua proa','location','','manufacturer','','model','',
      'fluid','freshwater','capacityL',200,'level',jsonb_build_object('value',0,'origin','manual','at','2026-11-06T08:00:00Z','sensor',null))
  ));
  rev := (initial->>'revision')::integer;
  saved := public.save_vessel_technical_inventory(ship, rev, inventory);
  if (saved->>'revision')::integer <> rev + 1 then raise exception 'Revision not advanced'; end if;
  loaded := public.load_vessel_technical_inventory(ship);
  if loaded <> saved then raise exception 'Load does not match acknowledged save'; end if;
  if jsonb_array_length(loaded->'inventory'->'components') <> 3 then raise exception 'Lost components'; end if;
  if not exists (select 1 from public.barco_baterias where barco_id = ship and component_id = 'test:battery' and bank_id = 'test:bank') then
    raise exception 'Bank relationship not persisted'; end if;
  if not exists (select 1 from public.barco_lecturas_componentes where barco_id = ship and component_id = 'test:water'
    and value = 0 and origin = 'manual' and observed_at = '2026-11-06T08:00:00Z') then raise exception 'Known zero reading lost'; end if;
  if not exists (select 1 from public.barco_lecturas_componentes where barco_id = ship and component_id = 'test:battery'
    and metric = 'voltage' and value is null and origin = 'unknown' and observed_at is null) then raise exception 'Unknown reading fabricated'; end if;
  if not exists (select 1 from public.barco_inventario_revisiones h where h.barco_id = ship and h.revision = rev + 1
    and h.inventory = (select b.technical_inventory from public.barcos b where b.id = ship)
    and h.saved_by = auth.uid() and h.source = 'client') then
    raise exception 'Revision history unavailable'; end if;
  if (select technical_inventory from public.barcos where id = ship) <> inventory then raise exception 'Compatibility mirror differs'; end if;
  begin
    perform public.save_vessel_technical_inventory(ship, rev, inventory);
    raise exception 'Stale revision unexpectedly accepted';
  exception when serialization_failure then null; end;
  if public.load_vessel_technical_inventory(ship) <> saved then raise exception 'Conflict changed persisted data'; end if;

  bad := jsonb_set(inventory, '{components,0,bankId}', '"a-bank-not-in-this-vessel"');
  begin
    perform public.save_vessel_technical_inventory(ship, rev + 1, bad);
    raise exception 'Foreign bank accepted';
  exception when foreign_key_violation then null; end;
  bad := jsonb_set(inventory, '{components,2,level,value}', '101');
  begin
    perform public.save_vessel_technical_inventory(ship, rev + 1, bad);
    raise exception 'Invalid tank level accepted';
  exception when invalid_parameter_value then null; end;
  bad := jsonb_set(inventory, '{components,2,level,origin}', '"measured"');
  begin
    perform public.save_vessel_technical_inventory(ship, rev + 1, bad);
    raise exception 'Measurement without source accepted';
  exception when invalid_parameter_value then null; end;
  bad := jsonb_set(inventory, '{components,2,capacityL}', '"200"');
  begin
    perform public.save_vessel_technical_inventory(ship, rev + 1, bad);
    raise exception 'Numeric string accepted';
  exception when invalid_parameter_value then null; end;
  bad := inventory || '{"futureExtension":true}';
  begin
    perform public.save_vessel_technical_inventory(ship, rev + 1, bad);
    raise exception 'Unknown attributes silently truncated';
  exception when invalid_parameter_value then null; end;
  if public.load_vessel_technical_inventory(ship) <> saved then raise exception 'Invalid save was not atomic'; end if;

  -- Legacy client compatibility: a direct JSON+CAS update follows the same guarded path.
  update public.barcos set technical_inventory = jsonb_set(inventory, '{components,1,name}', '"Servicio actualizado"'),
    technical_revision = rev + 2 where id = ship and technical_revision = rev + 1;
  if not found then raise exception 'Legacy update failed'; end if;
  if not exists (select 1 from public.barco_componentes where barco_id = ship and id = 'test:bank' and name = 'Servicio actualizado') then
    raise exception 'Legacy update did not normalize'; end if;
  begin
    update public.barcos set technical_inventory = inventory where id = ship;
    raise exception 'Legacy write bypassed revision discipline';
  exception when serialization_failure then null; end;

  -- Retire the whole installation explicitly. No physical deletion of component records/history.
  saved := public.save_vessel_technical_inventory(ship, rev + 2, '{"version":1,"components":[]}');
  if jsonb_array_length(saved->'inventory'->'components') <> 0 then raise exception 'Retired equipment still active'; end if;
  if not exists (select 1 from public.barco_componentes where barco_id = ship and id = 'test:battery' and retired_at is not null) then
    raise exception 'Retired component was deleted'; end if;
  if (select count(*) from public.barco_inventario_revisiones where barco_id = ship and revision > rev) <> 3 then
    raise exception 'Lost revision history'; end if;
  begin
    update public.barco_componentes set name = 'bypass' where barco_id = ship;
    raise exception 'Authenticated direct writes unexpectedly allowed';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS: remote roundtrip, relationships, readings, CAS, validation, legacy writes, retirement and write privileges';
end $$;

-- A second authenticated user must not read or modify the first vessel or its revision history.
select set_config('request.jwt.claim.sub', current_setting('fleet_test.owner_b'), true);
do $$
declare ship uuid := current_setting('fleet_test.vessel_a')::uuid;
begin
  if exists (select 1 from public.barco_componentes where barco_id = ship)
    or exists (select 1 from public.barco_inventario_revisiones where barco_id = ship) then raise exception 'RLS leaked another vessel'; end if;
  begin
    perform public.load_vessel_technical_inventory(ship);
    raise exception 'Other user can load inventory';
  exception when insufficient_privilege then null; end;
  begin
    perform public.save_vessel_technical_inventory(ship, 0, '{"version":1,"components":[]}');
    raise exception 'Other user can save inventory';
  exception when insufficient_privilege then null; end;
  -- Same textual component ID in a different vessel is not a cross-vessel relation.
  perform public.save_vessel_technical_inventory(current_setting('fleet_test.vessel_b')::uuid,
    (public.load_vessel_technical_inventory(current_setting('fleet_test.vessel_b')::uuid)->>'revision')::integer,
    '{"version":1,"components":[{"id":"test:bank","kind":"bank","name":"Banco B","location":"","manufacturer":"","model":"","purpose":"service","topology":"unknown"},{"id":"test:foreign-bank","kind":"bank","name":"Exclusivo B","location":"","manufacturer":"","model":"","purpose":"service","topology":"unknown"}]}');
  raise notice 'PASS: user isolation and independent vessel identities';
end $$;

set local role anon;
do $$
begin
  begin
    perform public.load_vessel_technical_inventory(current_setting('fleet_test.vessel_a')::uuid);
    raise exception 'Anonymous load unexpectedly allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.save_vessel_technical_inventory(current_setting('fleet_test.vessel_a')::uuid, 0, '{"version":1,"components":[]}');
    raise exception 'Anonymous write unexpectedly allowed';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS: anonymous access denied';
end $$;

reset role;
-- Exercise the composite FK directly as test administrator, independently of RPC validation.
do $$
declare ship uuid := current_setting('fleet_test.vessel_a')::uuid;
begin
  begin
    insert into public.barco_baterias (barco_id, component_id, bank_id, chemistry)
      values (ship, 'test:water', 'test:bank', 'unknown');
    raise exception 'Tank accepted as battery subtype';
  exception when foreign_key_violation then null; end;
  begin
    update public.barco_baterias set bank_id = 'test:foreign-bank' where barco_id = ship and component_id = 'test:battery';
    raise exception 'Cross-vessel bank accepted by FK';
  exception when foreign_key_violation then null; end;
  raise notice 'PASS: database subtype and relationship constraints';
end $$;

rollback;
select jsonb_build_object('transactional_sql_suite', 'passed',
  'vessels_after_rollback', (select count(*) from public.barcos),
  'stock_after_rollback', (select count(*) from public.inventario),
  'remaining_test_vessels', (select count(*) from public.barcos where nombre like '__fleet_transaction_test_%'),
  'normalized_components', (select count(*) from public.barco_componentes)) as result;
