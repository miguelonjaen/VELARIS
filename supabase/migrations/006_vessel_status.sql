-- ==========================================================
-- TABLA: vessel_status
-- ==========================================================

create table if not exists public.vessel_status (

    id uuid primary key default gen_random_uuid(),

    barco_id uuid not null
        references public.barcos(id)
        on delete cascade,

    fuel_level integer not null default 100
        check (fuel_level between 0 and 100),

    water_level integer not null default 100
        check (water_level between 0 and 100),

    oil_status text not null default 'OK',

    is_navigating boolean not null default false,

    engine_hours real default 0,

    battery_voltage real default 12.6,

    updated_at timestamptz not null default now(),

    unique(barco_id)
);

create index if not exists idx_vessel_status_barco
on vessel_status(barco_id);