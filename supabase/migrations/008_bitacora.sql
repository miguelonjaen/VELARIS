-- ==========================================================
-- TABLA: bitacora
-- ==========================================================

create table if not exists public.bitacora (

    id uuid primary key default gen_random_uuid(),

    created_at timestamptz not null default now(),

    barco_id uuid
        references public.barcos(id)
        on delete cascade,

    user_id uuid
        references public.usuarios(id)
        on delete cascade,

    capitan_id uuid
        references public.usuarios(id)
        on delete set null,

    fecha date not null,

    time text,

    titulo text,

    categoria text not null,

    descripcion text,

    texto text,

    is_auto boolean default false,

    tipo_navegacion text,

    destino_planificado text,

    ubicacion_texto text,

    lat double precision,
    lng double precision,

    latitud double precision,
    longitud double precision,

    viento_nudos real,
    velocidad_gps real,
    rumbo real,

    viento text,
    estado_del_mar text,

    horas_motor real,

    litros_repostados real,
    precio_litro real,
    puerto_repostaje text,

    waypoints text,

    recomendacion_tactica text,

    configuracion_velas text,

    propulsion_objetivo text,

    distancia_total real,

    eta text
);

create index if not exists idx_bitacora_barco
on bitacora(barco_id);

create index if not exists idx_bitacora_usuario
on bitacora(user_id);

create index if not exists idx_bitacora_fecha
on bitacora(fecha);