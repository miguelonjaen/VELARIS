create table if not exists public.configuracion_hub (

    user_id uuid primary key
        references public.usuarios(id)
        on delete cascade,

    pagina_actual integer not null default 0,

    updated_at timestamptz not null default now()
);