-- ==========================================================
-- TABLA: barcos
-- ==========================================================

create table if not exists public.barcos (

    id uuid primary key default gen_random_uuid(),

    created_at timestamptz not null default now(),

    user_id uuid not null
        references public.usuarios(id)
        on delete cascade,

    capitan_id uuid not null
        references public.usuarios(id)
        on delete cascade,

    nombre text not null,

    marca text not null,

    modelo text not null,

    matricula text not null,

    eslora numeric(6,2) not null,

    manga numeric(6,2) not null,

    calado numeric(6,2) not null,

    potencia_cv integer default 0,

    numero_serie_casco text,

    fecha_itb date,

    fecha_seguro date,

    foto_url text,

    documentacion_url text,

    manual_pdf text,

    lat double precision,

    lng double precision,

    cog real,

    sog real,

    tipo_barco text,

    is_active boolean default false,

    horas_motor real default 0,

    mmsi text,

    ais text,

    ultimo_mantenimiento_motor date,

    ultima_revision_balsa date,

    ultima_revision_extintores date,

    fuel_level integer default 100,

    water_level integer default 100,

    docs_certificado_navegabilidad boolean default false,
    docs_permiso_navegacion boolean default false,
    docs_seguro_vigente boolean default false,
    docs_itb_vigente boolean default false,
    docs_dni_tripulacion boolean default false,
    docs_titulacion_patron boolean default false,
    docs_leb_mmsi boolean default false,

    url_certificado_navegabilidad text,
    url_permiso_navegacion text,
    url_seguro text,
    url_itb text,
    url_dni_tripulacion text,
    url_titulacion_patron text,
    url_leb_mmsi text
);

create index idx_barcos_user
on barcos(user_id);

create index idx_barcos_capitan
on barcos(capitan_id);

create index idx_barcos_active
on barcos(is_active);

create index idx_barcos_mmsi
on barcos(mmsi);