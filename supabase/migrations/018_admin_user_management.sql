-- ==========================================================
-- ADMINISTRACION SEGURA DE USUARIOS Y PRESENCIA
-- ==========================================================

alter table public.usuarios
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists last_access_at timestamptz,
  add column if not exists last_seen_at timestamptz,
  add column if not exists cuenta_activa boolean not null default true;

update public.usuarios
set updated_at = coalesce(updated_at, created_at, now()),
    cuenta_activa = coalesce(cuenta_activa, suscripcion_activa, true)
where updated_at is null or cuenta_activa is null;

create or replace function public.is_admin()
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
      and rol = 'admin'::user_role
      and cuenta_activa = true
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create or replace function public.touch_current_user_access()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('velaris.touch_access', 'true', true);

  update public.usuarios
  set last_access_at = now(),
      last_seen_at = now(),
      updated_at = now()
  where id = auth.uid();
end;
$$;

revoke all on function public.touch_current_user_access() from public;
grant execute on function public.touch_current_user_access() to authenticated;

create or replace function public.admin_update_user_plan(
  target_user_id uuid,
  target_plan plan_nivel,
  target_tactical_plan plan_tactico default null,
  target_active boolean default null
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

  update public.usuarios
  set plan_nivel = target_plan,
      suscripcion_activa = coalesce(target_active, suscripcion_activa),
      updated_at = now()
  where id = target_user_id;

  if not found then
    raise exception 'user not found' using errcode = 'P0002';
  end if;

  insert into public.suscripciones (usuario_id, plan_nivel, plan_tactico, activa)
  values (
    target_user_id,
    target_plan,
    coalesce(target_tactical_plan, case target_plan
      when 'gratis' then 'basico'::plan_tactico
      when 'plata' then 'capitan'::plan_tactico
      when 'oro' then 'almirante'::plan_tactico
    end),
    coalesce(target_active, true)
  )
  on conflict (usuario_id) do update
  set plan_nivel = excluded.plan_nivel,
      plan_tactico = excluded.plan_tactico,
      activa = excluded.activa;
end;
$$;

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

revoke all on function public.admin_update_user_plan(uuid, plan_nivel, plan_tactico, boolean) from public;
grant execute on function public.admin_update_user_plan(uuid, plan_nivel, plan_tactico, boolean) to authenticated;
revoke all on function public.admin_update_user_account(uuid, boolean) from public;
grant execute on function public.admin_update_user_account(uuid, boolean) to authenticated;

drop policy if exists usuarios_select on public.usuarios;
drop policy if exists usuarios_update on public.usuarios;
drop policy if exists usuarios_admin_select on public.usuarios;
drop policy if exists usuarios_self_update on public.usuarios;

create policy usuarios_select
on public.usuarios
for select
to authenticated
using (auth.uid() = id or public.is_admin());

create policy usuarios_self_update
on public.usuarios
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create policy usuarios_admin_update
on public.usuarios
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists suscripciones_select on public.suscripciones;
drop policy if exists suscripciones_update on public.suscripciones;
drop policy if exists suscripciones_insert on public.suscripciones;

alter table public.suscripciones enable row level security;

create policy suscripciones_select
on public.suscripciones
for select
to authenticated
using (usuario_id = auth.uid() or public.is_admin());

create policy suscripciones_admin_update
on public.suscripciones
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy suscripciones_admin_insert
on public.suscripciones
for insert
to authenticated
with check (public.is_admin());

create or replace function public.prevent_protected_user_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin()
     and current_setting('velaris.touch_access', true) <> 'true' then
    if new.id <> old.id
       or new.rol <> old.rol
       or new.plan_nivel <> old.plan_nivel
       or new.suscripcion_activa <> old.suscripcion_activa
       or new.cuenta_activa <> old.cuenta_activa
       or new.last_access_at is distinct from old.last_access_at
       or new.last_seen_at is distinct from old.last_seen_at then
      raise exception 'protected user fields can only be changed by the server or an admin'
        using errcode = '42501';
    end if;
  end if;

  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists protect_user_fields on public.usuarios;
create trigger protect_user_fields
before update on public.usuarios
for each row execute function public.prevent_protected_user_changes();
