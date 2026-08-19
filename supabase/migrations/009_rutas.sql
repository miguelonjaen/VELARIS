-- ==========================================================
-- TABLA: rutas
-- ==========================================================

create table if not exists public.rutas (

    id uuid primary key default gen_random_uuid(),

    created_at timestamptz not null default now(),

    barco_id uuid not null
        references public.barcos(id)
        on delete cascade,

    nombre text not null,

    origen text,

    destino text,

    waypoints jsonb,

    distancia real,

    tiempo_estimado interval,

    estado text not null default 'activa'
);

create index if not exists idx_rutas_barco
on rutas(barco_id);

create index if not exists idx_rutas_estado
on rutas(estado);