-- Run after fleet_installation_3d using the migration owner's connection.
-- Validation only: no vessel or user records are written.
begin;
do $$
declare document jsonb := '{"version":1,"components":[{"id":"bank","kind":"bank","name":"Service","location":"","manufacturer":"","model":"","purpose":"service","topology":"parallel"}],"installation":{"nodes":[{"id":"solar","kind":"solar","name":"Panel","location":"","manufacturer":"","model":""}],"links":[{"id":"charge","from":"solar","to":"bank","medium":"cable","name":"Solar charge"}]}}'::jsonb;
 rejected boolean;
begin
  perform public.fleet_validate_inventory(document);
  perform public.fleet_validate_inventory(document - 'installation');
  document := jsonb_set(document,'{installation,bindings}','[{"targetId":"charge","metric":"current","channel":"solar-current","sensor":"SOLAR0_OUT","connection":"test-only-endpoint"}]');
  perform public.fleet_validate_inventory(document);
  rejected := false;
  begin
    perform public.fleet_validate_inventory(jsonb_set(document,'{installation,bindings,0,channel}','"battery-current"'));
  exception when invalid_parameter_value then rejected := true; end;
  if not rejected then raise exception 'Net battery current accepted as branch current'; end if;
  rejected := false;
  begin
    perform public.fleet_validate_inventory(jsonb_set(document,'{installation,bindings,0,sensor}','"ALT_ENGINE1_SIM"'));
  exception when invalid_parameter_value then rejected := true; end;
  if not rejected then raise exception 'Simulated sensor accepted as solar measurement'; end if;
  rejected := false;
  begin
    perform public.fleet_validate_inventory(jsonb_set(document,'{installation,links,0,id}','"bank"'));
  exception when invalid_parameter_value then rejected := true; end;
  if not rejected then raise exception 'Link and component identity collision accepted'; end if;

  rejected := false;
  begin
    perform public.fleet_validate_inventory(jsonb_set(document,'{installation,links,0,to}','"another-vessel-bank"'));
  exception when foreign_key_violation then rejected := true; end;
  if not rejected then raise exception 'Foreign endpoint accepted'; end if;
  rejected := false;
  begin
    perform public.fleet_validate_inventory(jsonb_set(document,'{installation,links,0,medium}','"pipe"'));
  exception when foreign_key_violation then rejected := true; end;
  if not rejected then raise exception 'Invalid medium accepted'; end if;
  rejected := false;
  begin
    perform public.fleet_validate_inventory(jsonb_set(document,'{installation,nodes,0,id}','"bank"'));
  exception when invalid_parameter_value then rejected := true; end;
  if not rejected then raise exception 'Duplicate identity accepted'; end if;
  rejected := false;
  begin
    perform public.fleet_validate_inventory(jsonb_set(document,'{installation,links}',(document#>'{installation,links}')||(document#>'{installation,links}')));
  exception when invalid_parameter_value then rejected := true; end;
  if not rejected then raise exception 'Duplicate link accepted'; end if;
end $$;
rollback;
