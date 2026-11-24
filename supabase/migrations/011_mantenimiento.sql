-- ==========================================================
-- TABLA: mantenimiento
-- ==========================================================

create table if not exists public.mantenimiento (

    id uuid primary key default gen_random_uuid(),

    created_at timestamptz not null default now(),

    barco_id uuid not null
        references public.barcos(id)
        on delete cascade,

    tarea text not null,

    categoria text,

    ultima_revision date,

    proxima_revision date,

    estado maintenance_status default 'ok',

    observaciones text
);

create index if not exists idx_mantenimiento_barco
on mantenimiento(barco_id);

create index if not exists idx_mantenimiento_estado
on mantenimiento(estado);