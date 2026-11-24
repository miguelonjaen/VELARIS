-- ==========================================================
-- TABLA: usuarios
-- ==========================================================

create table if not exists public.usuarios (

    id uuid primary key
        references auth.users(id)
        on delete cascade,

    email text not null unique,

    nombre text,

    rol user_role not null default 'capitan',

    created_at timestamptz not null default now(),

    nombre_completo text,
    telefono text,
    licencia_nautica text,
    dni_nie text,
    fecha_nacimiento date,

    foto_perfil_url text,

    nacionalidad text,
    direccion text,
    poblacion text,
    codigo_postal text,
    provincia text,

    contacto_emergencia_nombre text,
    contacto_emergencia_telefono text,

    grupo_sanguineo text,
    observaciones_medicas text,

    plan_nivel plan_nivel not null default 'gratis',

    suscripcion_activa boolean not null default true,

    total_barcos integer not null default 0,

    barco_activo_id uuid
);

create index if not exists idx_usuarios_email
on usuarios(email);

create index if not exists idx_usuarios_plan
on usuarios(plan_nivel);

create index if not exists idx_usuarios_barco_activo
on usuarios(barco_activo_id);