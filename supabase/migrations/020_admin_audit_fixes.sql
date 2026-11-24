-- ==========================================================
-- CORRECCIONES DE AUDITORIA DE ADMINISTRACION
-- ==========================================================

create or replace function public.is_account_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios
    where id = auth.uid()
      and cuenta_activa = true
  );
$$;

revoke all on function public.is_account_active() from public;
grant execute on function public.is_account_active() to authenticated;

create or replace function public.touch_current_user_access()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_account_active() then
    raise exception 'account is inactive' using errcode = '42501';
  end if;

  perform set_config('velaris.touch_access', 'true', true);
  update public.usuarios
  set last_seen_at = now(),
      updated_at = now()
  where id = auth.uid();
end;
$$;

create or replace function public.record_current_user_access()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_account_active() then
    raise exception 'account is inactive' using errcode = '42501';
  end if;

  perform set_config('velaris.touch_access', 'true', true);
  update public.usuarios
  set last_access_at = now(),
      last_seen_at = now(),
      updated_at = now()
  where id = auth.uid();
end;
$$;

revoke all on function public.record_current_user_access() from public;
grant execute on function public.record_current_user_access() to authenticated;

create or replace function public.admin_update_user_account(
  target_user_id uuid,
  target_active boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admin privileges required' using errcode = '42501';
  end if;

  if target_user_id = auth.uid() and not target_active then
    raise exception 'administrators cannot deactivate themselves' using errcode = '42501';
  end if;

  update public.usuarios
  set cuenta_activa = target_active,
      suscripcion_activa = target_active,
      updated_at = now()
  where id = target_user_id;

  if not found then
    raise exception 'user not found' using errcode = 'P0002';
  end if;

  update public.suscripciones
  set activa = target_active
  where usuario_id = target_user_id;
end;
$$;

revoke all on function public.touch_current_user_access() from public;
grant execute on function public.touch_current_user_access() to authenticated;
revoke all on function public.admin_update_user_account(uuid, boolean) from public;
grant execute on function public.admin_update_user_account(uuid, boolean) to authenticated;

-- Active accounts are required for application data access.
drop policy if exists barcos_all on public.barcos;
create policy barcos_all on public.barcos for all to authenticated
using (public.is_account_active() and (auth.uid() = user_id or auth.uid() = capitan_id))
with check (public.is_account_active() and (auth.uid() = user_id or auth.uid() = capitan_id));

drop policy if exists vessel_status_all on public.vessel_status;
create policy vessel_status_all on public.vessel_status for all to authenticated
using (public.is_account_active() and exists (
  select 1 from public.barcos b
  where b.id = barco_id and (b.user_id = auth.uid() or b.capitan_id = auth.uid())
))
with check (public.is_account_active() and exists (
  select 1 from public.barcos b
  where b.id = barco_id and (b.user_id = auth.uid() or b.capitan_id = auth.uid())
));

drop policy if exists inventario_all on public.inventario;
create policy inventario_all on public.inventario for all to authenticated
using (public.is_account_active() and exists (
  select 1 from public.barcos b
  where b.id = barco_id and (b.user_id = auth.uid() or b.capitan_id = auth.uid())
))
with check (public.is_account_active() and exists (
  select 1 from public.barcos b
  where b.id = barco_id and (b.user_id = auth.uid() or b.capitan_id = auth.uid())
));

drop policy if exists bitacora_all on public.bitacora;
create policy bitacora_all on public.bitacora for all to authenticated
using (public.is_account_active() and exists (
  select 1 from public.barcos b
  where b.id = barco_id and (b.user_id = auth.uid() or b.capitan_id = auth.uid())
))
with check (public.is_account_active() and exists (
  select 1 from public.barcos b
  where b.id = barco_id and (b.user_id = auth.uid() or b.capitan_id = auth.uid())
));

drop policy if exists rutas_all on public.rutas;
create policy rutas_all on public.rutas for all to authenticated
using (public.is_account_active() and exists (
  select 1 from public.barcos b
  where b.id = barco_id and (b.user_id = auth.uid() or b.capitan_id = auth.uid())
))
with check (public.is_account_active() and exists (
  select 1 from public.barcos b
  where b.id = barco_id and (b.user_id = auth.uid() or b.capitan_id = auth.uid())
));

drop policy if exists tripulacion_all on public.tripulacion;
create policy tripulacion_all on public.tripulacion for all to authenticated
using (public.is_account_active() and exists (
  select 1 from public.barcos b
  where b.id = barco_id and (b.user_id = auth.uid() or b.capitan_id = auth.uid())
))
with check (public.is_account_active() and exists (
  select 1 from public.barcos b
  where b.id = barco_id and (b.user_id = auth.uid() or b.capitan_id = auth.uid())
));

drop policy if exists mantenimiento_all on public.mantenimiento;
create policy mantenimiento_all on public.mantenimiento for all to authenticated
using (public.is_account_active() and exists (
  select 1 from public.barcos b
  where b.id = barco_id and (b.user_id = auth.uid() or b.capitan_id = auth.uid())
))
with check (public.is_account_active() and exists (
  select 1 from public.barcos b
  where b.id = barco_id and (b.user_id = auth.uid() or b.capitan_id = auth.uid())
));

drop policy if exists configuracion_hub_all on public.configuracion_hub;
create policy configuracion_hub_all on public.configuracion_hub for all to authenticated
using (public.is_account_active() and auth.uid() = user_id)
with check (public.is_account_active() and auth.uid() = user_id);

drop policy if exists ai_logs_all on public.ai_logs;
create policy ai_logs_all on public.ai_logs for all to authenticated
using (public.is_account_active() and auth.uid() = user_id)
with check (public.is_account_active() and auth.uid() = user_id);
