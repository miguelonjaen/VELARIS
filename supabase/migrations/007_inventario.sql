-- ==========================================================
-- TABLA: inventario
-- ==========================================================

create table if not exists public.inventario (

    id uuid primary key default gen_random_uuid(),

    created_at timestamptz not null default now(),

    barco_id uuid
        references public.barcos(id)
        on delete cascade,

    nombre text not null,

    referencia text,

    cantidad_actual numeric default 0,

    cantidad_minima numeric default 0,

    unidad text,

    ubicacion text,

    categoria inventory_category not null,

    fecha_caducidad date
);

create index if not exists idx_inventario_barco
on inventario(barco_id);

create index if not exists idx_inventario_categoria
on inventario(categoria);