-- ==========================================================
-- SINCRONIZACIÓN auth.users -> usuarios
-- ==========================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin

  insert into public.usuarios (
      id,
      email,
      nombre,
      rol,
      created_at
  )
  values (
      new.id,
      new.email,
      coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)),
      'capitan',
      now()
  )
  on conflict (id) do nothing;

  return new;

end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();