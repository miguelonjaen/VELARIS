-- Run only on an isolated test database AFTER migrations 022 and 023.
-- Provide two existing test users and one vessel owned by each. Everything below is rolled back.
-- psql -X -v ON_ERROR_STOP=1 -v fleet_test_database=isolated -v owner_a=UUID -v owner_b=UUID
--   -v vessel_a=UUID -v vessel_b=UUID -f supabase/tests/fleet_inventory.sql
\set ON_ERROR_STOP on
select :'fleet_test_database' = 'isolated' as isolated_test_database \gset
\if :isolated_test_database
\else
  \echo 'Refusing to run: fleet_test_database must be isolated.'
  \quit 3
\endif

begin;
select set_config('fleet_test.owner_a', :'owner_a', true), set_config('fleet_test.owner_b', :'owner_b', true),
  set_config('fleet_test.vessel_a', :'vessel_a', true), set_config('fleet_test.vessel_b', :'vessel_b', true);

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
\echo 'PASS: fleet inventory SQL suite finished; fixture changes rolled back.'
