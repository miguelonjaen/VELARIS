-- Phase 1: additive vessel configuration; existing rows and stock inventory remain untouched.
begin;
alter table public.barcos
  alter column matricula drop not null,
  alter column eslora drop not null,
  alter column manga drop not null,
  alter column calado drop not null;
alter table public.barcos add column if not exists technical_inventory jsonb;
alter table public.barcos add column if not exists technical_revision integer not null default 0;
alter table public.barcos add constraint barcos_technical_inventory_v1 check (
  technical_inventory is null or (
    jsonb_typeof(technical_inventory) = 'object'
    and technical_inventory->>'version' = '1'
    and jsonb_typeof(technical_inventory->'components') = 'array'
  ) is true
);
alter table public.barcos add constraint barcos_technical_revision_positive check (technical_revision >= 0);
-- Existing barcos RLS protects these columns under the same ownership contract.
-- No migration of default stock entries or aggregate fuel/water levels into installed equipment.
-- Atomic activation keeps the profile and vessel flags consistent under concurrent clients.
create or replace function public.set_active_vessel(p_user_id uuid, p_ship_id uuid)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if auth.uid() is distinct from p_user_id then
    raise exception 'Invalid user' using errcode = '42501';
  end if;
  perform 1 from public.usuarios where id = p_user_id for update;
  if not found then raise exception 'Profile unavailable'; end if;
  perform 1 from public.barcos where id = p_ship_id and capitan_id = p_user_id for update;
  if not found then raise exception 'Vessel unavailable' using errcode = '42501'; end if;
  update public.barcos set is_active = (id = p_ship_id) where capitan_id = p_user_id;
  update public.usuarios set barco_activo_id = p_ship_id where id = p_user_id;
end;
$$;
revoke all on function public.set_active_vessel(uuid, uuid) from public;
grant execute on function public.set_active_vessel(uuid, uuid) to authenticated;
commit;
