-- ==========================================================
-- BOOTSTRAP CONTROLADO DEL PRIMER ADMINISTRADOR
-- ==========================================================
--
-- Esta funcion solo puede ejecutarse desde el SQL Editor con el
-- contexto privilegiado de PostgreSQL. No es una RPC publica.
--

create or replace function public.bootstrap_first_admin(target_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user_id uuid;
begin
  if session_user <> 'postgres' then
    raise exception 'bootstrap is only available from the privileged SQL Editor context'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.usuarios
    where rol = 'admin'::user_role
  ) then
    raise exception 'an administrator already exists; bootstrap is closed'
      using errcode = '42501';
  end if;

  select id
  into target_user_id
  from public.usuarios
  where lower(email) = lower(trim(target_email));

  if target_user_id is null then
    raise exception 'target user does not exist in public.usuarios'
      using errcode = 'P0002';
  end if;

  perform set_config('velaris.bootstrap_admin', 'true', true);

  update public.usuarios
  set rol = 'admin'::user_role,
      cuenta_activa = true,
      suscripcion_activa = true,
      updated_at = now()
  where id = target_user_id;
end;
$$;

revoke all on function public.bootstrap_first_admin(text) from public;
revoke all on function public.bootstrap_first_admin(text) from anon;
revoke all on function public.bootstrap_first_admin(text) from authenticated;

create or replace function public.prevent_protected_user_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('velaris.bootstrap_admin', true), '') <> 'true'
     and (new.id <> old.id or new.rol <> old.rol) then
    raise exception 'user identity and role are server-managed'
      using errcode = '42501';
  end if;

  if not public.is_admin()
     and coalesce(current_setting('velaris.touch_access', true), '') <> 'true'
     and coalesce(current_setting('velaris.bootstrap_admin', true), '') <> 'true' then
    if new.plan_nivel <> old.plan_nivel
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
