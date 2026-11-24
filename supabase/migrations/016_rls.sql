-- ==========================================================
-- ROW LEVEL SECURITY
-- ==========================================================

alter table usuarios enable row level security;
alter table barcos enable row level security;
alter table vessel_status enable row level security;
alter table inventario enable row level security;
alter table bitacora enable row level security;
alter table rutas enable row level security;
alter table tripulacion enable row level security;
alter table mantenimiento enable row level security;
alter table configuracion_hub enable row level security;
alter table ai_logs enable row level security;

-- ==========================================================
-- USUARIOS
-- ==========================================================

create policy usuarios_select
on usuarios
for select
using (auth.uid() = id);

create policy usuarios_update
on usuarios
for update
using (auth.uid() = id);

-- ==========================================================
-- BARCOS
-- ==========================================================

create policy barcos_all
on barcos
for all
using (
    auth.uid() = user_id
    or
    auth.uid() = capitan_id
)
with check (
    auth.uid() = user_id
    or
    auth.uid() = capitan_id
);

-- ==========================================================
-- RESTO DE TABLAS
-- ==========================================================

create policy vessel_status_all
on vessel_status
for all
using (
    exists (
        select 1
        from barcos b
        where b.id = barco_id
        and (
            b.user_id = auth.uid()
            or
            b.capitan_id = auth.uid()
        )
    )
);

create policy inventario_all
on inventario
for all
using (
    exists (
        select 1
        from barcos b
        where b.id = barco_id
        and (
            b.user_id = auth.uid()
            or
            b.capitan_id = auth.uid()
        )
    )
);

create policy bitacora_all
on bitacora
for all
using (
    exists (
        select 1
        from barcos b
        where b.id = barco_id
        and (
            b.user_id = auth.uid()
            or
            b.capitan_id = auth.uid()
        )
    )
);

create policy rutas_all
on rutas
for all
using (
    exists (
        select 1
        from barcos b
        where b.id = barco_id
        and (
            b.user_id = auth.uid()
            or
            b.capitan_id = auth.uid()
        )
    )
);

create policy tripulacion_all
on tripulacion
for all
using (
    exists (
        select 1
        from barcos b
        where b.id = barco_id
        and (
            b.user_id = auth.uid()
            or
            b.capitan_id = auth.uid()
        )
    )
);

create policy mantenimiento_all
on mantenimiento
for all
using (
    exists (
        select 1
        from barcos b
        where b.id = barco_id
        and (
            b.user_id = auth.uid()
            or
            b.capitan_id = auth.uid()
        )
    )
);

create policy configuracion_hub_all
on configuracion_hub
for all
using (auth.uid() = user_id);

create policy ai_logs_all
on ai_logs
for all
using (auth.uid() = user_id);