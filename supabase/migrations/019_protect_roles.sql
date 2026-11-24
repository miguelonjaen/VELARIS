-- ==========================================================
-- EL ROL SOLO CAMBIA POR OPERACION DE SERVIDOR
-- ==========================================================

create or replace function public.prevent_protected_user_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.id <> old.id or new.rol <> old.rol then
    raise exception 'user identity and role are server-managed'
      using errcode = '42501';
  end if;

  if not public.is_admin()
     and coalesce(current_setting('velaris.touch_access', true), '') <> 'true' then
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
