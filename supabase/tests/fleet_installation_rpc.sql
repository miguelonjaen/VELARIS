-- Isolated database only, after fleet_installation_3d. Existing test user/vessel required.
-- psql -X -v ON_ERROR_STOP=1 -v fleet_test_database=isolated -v owner_a=UUID -v vessel_a=UUID -f supabase/tests/fleet_installation_rpc.sql
\set ON_ERROR_STOP on
select :'fleet_test_database' = 'isolated' as isolated_test_database \gset
\if :isolated_test_database
\else
  \echo 'Refusing to run outside an explicitly isolated test database.'
  \quit 3
\endif
begin;
select set_config('fleet_test.owner_a', :'owner_a', true), set_config('fleet_test.vessel_a', :'vessel_a', true);
do $$ begin
  if not exists(select 1 from public.barcos where id=current_setting('fleet_test.vessel_a')::uuid and capitan_id=current_setting('fleet_test.owner_a')::uuid) then raise exception 'Test vessel must belong to the supplied test principal'; end if;
end $$;
select set_config('request.jwt.claim.sub', current_setting('fleet_test.owner_a'), true);
set local role authenticated;
do $$
declare ship uuid:=current_setting('fleet_test.vessel_a')::uuid; initial jsonb; saved jsonb; changed jsonb; invalid jsonb; revision integer; rejected boolean;
  document jsonb:='{"version":1,"components":[{"id":"rpc-bank","kind":"bank","name":"Test service","location":"","manufacturer":"","model":"","purpose":"service","topology":"parallel"}],"installation":{"nodes":[{"id":"rpc-solar","kind":"solar","name":"Test solar","location":"","manufacturer":"","model":""}],"links":[{"id":"rpc-cable","from":"rpc-solar","to":"rpc-bank","medium":"cable","name":"Test dedicated branch"}],"bindings":[{"targetId":"rpc-cable","metric":"current","channel":"solar-current","sensor":"SOLAR0_OUT","connection":"isolated-test-endpoint"}]}}';
begin
  initial:=public.load_vessel_technical_inventory(ship);
  revision:=(initial->>'revision')::integer;
  saved:=public.save_vessel_technical_inventory(ship,revision,document);
  if saved#>'{inventory,installation}' is distinct from document->'installation' then raise exception 'Save response lost installation or bindings'; end if;
  if public.load_vessel_technical_inventory(ship) is distinct from saved then raise exception 'RPC roundtrip mismatch'; end if;
  if not exists(select 1 from public.barco_inventario_revisiones h where h.barco_id=ship and h.revision=revision+1 and h.inventory=document) then raise exception 'History lost extension'; end if;
  rejected:=false;
  begin perform public.save_vessel_technical_inventory(ship,revision,document); exception when serialization_failure then rejected:=true; end;
  if not rejected then raise exception 'Stale revision accepted'; end if;
  rejected:=false;
  begin perform public.save_vessel_technical_inventory(ship,revision+1,document-'installation'); exception when invalid_parameter_value then rejected:=true; end;
  if not rejected then raise exception 'Legacy client dropped installation'; end if;
  invalid:=jsonb_set(document,'{installation,bindings,0,channel}','"battery-current"');
  rejected:=false;
  begin perform public.save_vessel_technical_inventory(ship,revision+1,invalid); exception when invalid_parameter_value then rejected:=true; end;
  if not rejected then raise exception 'Battery net current accepted for a source branch'; end if;
  if public.load_vessel_technical_inventory(ship) is distinct from saved then raise exception 'Rejected operation changed persisted state'; end if;
  document:=jsonb_set(document,'{installation,links,0,name}','"Renamed branch"');
  changed:=public.save_vessel_technical_inventory(ship,revision+1,document);
  if (changed->>'revision')::integer<>revision+2 or changed#>'{inventory,installation}' is distinct from document->'installation' then raise exception 'Edit lost bindings or revision'; end if;
end $$;
reset role;
rollback;
