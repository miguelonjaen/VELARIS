-- Cover the composite subtype FK lookups and evaluate the caller identity once per statement.
begin;
create index if not exists barco_depositos_component_kind on public.barco_depositos(barco_id, component_id, kind);
create index if not exists barco_bancos_component_kind on public.barco_bancos(barco_id, component_id, kind);
create index if not exists barco_baterias_component_kind on public.barco_baterias(barco_id, component_id, kind);
create index if not exists barco_lecturas_component_kind on public.barco_lecturas_componentes(barco_id, component_id, kind);

do $$
declare table_name text;
begin
  foreach table_name in array array['barco_componentes', 'barco_depositos', 'barco_bancos',
    'barco_baterias', 'barco_lecturas_componentes', 'barco_inventario_revisiones'] loop
    execute format('alter policy vessel_owner_read on public.%I using (
      exists (select 1 from public.barcos b where b.id = barco_id
        and (b.user_id = (select auth.uid()) or b.capitan_id = (select auth.uid()))))', table_name);
  end loop;
end $$;
commit;
