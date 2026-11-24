create table public.barco_seguridad_equipos (
    barco_id uuid not null references public.barcos(id) on delete cascade,
    inventario_id uuid not null,
    linked_at timestamptz not null default now(),
    linked_by uuid not null default auth.uid(),
    primary key (barco_id, inventario_id)
);
create index idx_barco_seguridad_equipos_inventario on public.barco_seguridad_equipos(inventario_id);
create unique index if not exists idx_inventario_id_barco_unique on public.inventario(id, barco_id);
alter table public.barco_seguridad_equipos add constraint fk_seguridad_inventario_barco foreign key (inventario_id, barco_id) references public.inventario(id, barco_id) on update restrict on delete cascade;
alter table public.barco_seguridad_equipos enable row level security;
create policy barco_seguridad_equipos_access on public.barco_seguridad_equipos for all to authenticated
using (public.is_account_active() and exists (select 1 from public.barcos b where b.id = barco_id and (b.user_id = auth.uid() or b.capitan_id = auth.uid())))
with check (public.is_account_active() and exists (select 1 from public.barcos b where b.id = barco_id and (b.user_id = auth.uid() or b.capitan_id = auth.uid())));
grant select, insert, delete on public.barco_seguridad_equipos to authenticated;;
