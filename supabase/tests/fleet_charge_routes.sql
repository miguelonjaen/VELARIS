-- Run after fleet_charge_routes, as the migration owner. No vessel records written.
begin;
do $$
declare
  document jsonb := '{"version":1,"components":[{"id":"service","kind":"bank","name":"Service","location":"","manufacturer":"","model":"","purpose":"service","topology":"parallel"},{"id":"starter","kind":"bank","name":"Starter","location":"","manufacturer":"","model":"","purpose":"starter","topology":"unknown"}],"installation":{"nodes":[],"links":[]}}'::jsonb;
  device jsonb;
  node_kind text;
  from_id text;
  to_id text;
  route jsonb;
  good jsonb;
  bad jsonb;
  rejected boolean;
begin
  foreach node_kind in array array['solar','controller','shore','charger','alternator','distributor','consumer'] loop
    device := jsonb_build_object('id',node_kind,'kind',node_kind,'name',node_kind,'location','','manufacturer','','model','');
    document := jsonb_set(document,'{installation,nodes}',(document#>'{installation,nodes}') || jsonb_build_array(device));
  end loop;
  perform public.fleet_validate_inventory(document);
  foreach from_id in array array['solar','controller','shore','charger','alternator','distributor','service','starter','consumer'] loop
    foreach to_id in array array['solar','controller','shore','charger','alternator','distributor','service','starter','consumer'] loop
      route := jsonb_build_array(jsonb_build_object('id','route','from',from_id,'to',to_id,'medium','cable','name','Test cable'));
      bad := jsonb_set(document,'{installation,links}',route);
      rejected := false;
      begin perform public.fleet_validate_inventory(bad);
      exception when foreign_key_violation then rejected := true; end;
      if (from_id in ('solar','controller','charger','alternator') and to_id in ('service','starter','distributor'))
        or (from_id='solar' and to_id='controller') or (from_id='shore' and to_id='charger')
        or (from_id='distributor' and to_id in ('service','starter')) or (from_id in ('service','starter') and to_id='consumer') then
        if rejected then raise exception 'Valid route rejected: % -> %', from_id,to_id; end if;
      else
        if not rejected then raise exception 'Invalid route accepted: % -> %',from_id,to_id; end if;
      end if;
    end loop;
  end loop;
  good := jsonb_set(document,'{installation,links}','[{"id":"pv","from":"solar","to":"controller","medium":"cable","name":"PV input"},{"id":"reg","from":"controller","to":"distributor","medium":"cable","name":"Regulated CC"},{"id":"house","from":"distributor","to":"service","medium":"cable","name":"House output"},{"id":"start","from":"distributor","to":"starter","medium":"cable","name":"Start output"},{"id":"ac","from":"shore","to":"charger","medium":"cable","name":"AC input"},{"id":"dc","from":"charger","to":"service","medium":"cable","name":"Charger output"}]');
  perform public.fleet_validate_inventory(good);
  rejected := false;
  begin
    perform public.fleet_validate_inventory(jsonb_set(good,'{installation,bindings}','[{"targetId":"pv","metric":"current","channel":"solar-current","sensor":"SOLAR0_OUT","connection":"fixture"}]'));
  exception when invalid_parameter_value then rejected := true; end;
  if not rejected then raise exception 'Solar output sensor accepted on PV input'; end if;
  rejected := false;
  begin perform public.fleet_validate_inventory(jsonb_set(good,'{installation,links,0,to}','"foreign-bank"'));
  exception when foreign_key_violation then rejected := true; end;
  if not rejected then raise exception 'Foreign endpoint accepted'; end if;
end $$;
rollback;
