-- ==========================================================
-- TABLA: tripulacion
-- ==========================================================

create table if not exists public.tripulacion (

    id uuid primary key default gen_random_uuid(),

    created_at timestamptz not null default now(),

    barco_id uuid not null
        references public.barcos(id)
        on delete cascade,

    nombre text not null,

    apellidos text,

    dni text,

    telefono text,

    email text,

    licencia text,

    rol text,

    fecha_embarque date,

    observaciones text
);

create index if not exists idx_tripulacion_barco
on tripulacion(barco_id);