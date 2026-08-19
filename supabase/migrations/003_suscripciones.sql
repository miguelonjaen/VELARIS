-- ==========================================================
-- TABLA: suscripciones
-- ==========================================================

create table if not exists public.suscripciones (

    id uuid primary key default gen_random_uuid(),

    created_at timestamptz not null default now(),

    usuario_id uuid not null
        references public.usuarios(id)
        on delete cascade,

    plan_nivel plan_nivel not null default 'gratis',

    plan_tactico plan_tactico not null default 'basico',

    activa boolean not null default true,

    fecha_inicio timestamptz not null default now(),

    fecha_fin timestamptz,

    renovacion_automatica boolean not null default true,

    stripe_customer_id text,

    stripe_subscription_id text,

    ultima_facturacion timestamptz,

    observaciones text
);

create unique index if not exists idx_suscripciones_usuario
on suscripciones(usuario_id);

create index if not exists idx_suscripciones_plan
on suscripciones(plan_nivel);

create index if not exists idx_suscripciones_activa
on suscripciones(activa);