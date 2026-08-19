create table if not exists public.ai_logs (

    id uuid primary key default gen_random_uuid(),

    created_at timestamptz not null default now(),

    user_id uuid
        references public.usuarios(id)
        on delete cascade,

    barco_id uuid
        references public.barcos(id)
        on delete cascade,

    prompt text,

    response text,

    model text,

    tokens integer,

    latency_ms integer
);

create index if not exists idx_ai_logs_user
on ai_logs(user_id);

create index if not exists idx_ai_logs_barco
on ai_logs(barco_id);