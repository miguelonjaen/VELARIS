-- Isolated copies of the actual schema and RPC, entirely in pg_temp and rolled back. No real vessel rows are read or changed.
begin;
create temporary table barcos(id uuid primary key,user_id uuid,capitan_id uuid,technical_inventory jsonb,technical_revision integer not null default 0);
create temporary table barco_componentes (
  barco_id uuid not null references pg_temp.barcos(id) on delete cascade,
  id text not null check (length(id) between 1 and 240 and id !~ '^[[:space:]]*$'),
  kind text not null check (kind in ('tank', 'bank', 'battery')),
  name text not null check (length(name) between 1 and 240 and name !~ '^[[:space:]]*$'),
  location text not null check (length(location) <= 240),
  manufacturer text not null check (length(manufacturer) <= 240),
  model text not null check (length(model) <= 240),
  position integer not null check (position between 0 and 1999),
  retired_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (barco_id, id),
  unique (barco_id, id, kind)
);

create temporary table barco_depositos (
  barco_id uuid not null,
  component_id text not null,
  kind text not null default 'tank' check (kind = 'tank'),
  fluid text not null check (fluid in ('diesel', 'petrol', 'freshwater', 'greywater', 'blackwater', 'other')),
  capacity_l numeric check (capacity_l > 0),
  primary key (barco_id, component_id),
  foreign key (barco_id, component_id, kind) references pg_temp.barco_componentes(barco_id, id, kind) on delete cascade
);

create temporary table barco_bancos (
  barco_id uuid not null,
  component_id text not null,
  kind text not null default 'bank' check (kind = 'bank'),
  purpose text not null check (purpose in ('service', 'starter', 'other')),
  topology text not null check (topology in ('parallel', 'series', 'unknown')),
  primary key (barco_id, component_id),
  foreign key (barco_id, component_id, kind) references pg_temp.barco_componentes(barco_id, id, kind) on delete cascade
);

create temporary table barco_baterias (
  barco_id uuid not null,
  component_id text not null,
  kind text not null default 'battery' check (kind = 'battery'),
  bank_id text,
  chemistry text not null check (chemistry in ('AGM', 'GEL', 'flooded', 'LiFePO4', 'other', 'unknown')),
  capacity_ah numeric check (capacity_ah > 0),
  nominal_v numeric check (nominal_v > 0),
  primary key (barco_id, component_id),
  foreign key (barco_id, component_id, kind) references pg_temp.barco_componentes(barco_id, id, kind) on delete cascade,
  foreign key (barco_id, bank_id) references pg_temp.barco_bancos(barco_id, component_id)
);
create index barco_baterias_bank on pg_temp.barco_baterias(barco_id, bank_id);

create temporary table barco_lecturas_componentes (
  barco_id uuid not null,
  component_id text not null,
  kind text not null,
  metric text not null,
  value numeric,
  origin text not null check (origin in ('unknown', 'manual', 'measured')),
  observed_at timestamptz,
  sensor text,
  primary key (barco_id, component_id, metric),
  foreign key (barco_id, component_id, kind) references pg_temp.barco_componentes(barco_id, id, kind) on delete cascade,
  check ((kind = 'tank' and metric = 'level') or (kind = 'battery' and metric in ('voltage', 'soc'))),
  check (
    (origin = 'unknown' and value is null and observed_at is null and sensor is null)
    or (origin in ('manual', 'measured') and value is not null and observed_at is not null
      and ((origin = 'manual' and sensor is null)
        or (origin = 'measured' and sensor is not null and length(sensor) between 1 and 240 and sensor !~ '^[[:space:]]*$')))
  ),
  check (value is null or (value >= 0 and value <= case when metric = 'voltage' then 1000 else 100 end))
);

create temporary table barco_inventario_revisiones (
  barco_id uuid not null references pg_temp.barcos(id) on delete cascade,
  revision integer not null check (revision >= 0),
  inventory jsonb not null,
  saved_at timestamptz not null default now(),
  saved_by uuid,
  source text not null check (source in ('legacy_import', 'client')),
  primary key (barco_id, revision)
);



-- Clone the deployed functions into this transaction's temporary schema only.
do $clone$ declare signature text; definition text; begin
 foreach signature in array array['fleet_valid_reading(jsonb,numeric)','fleet_validate_electrical(jsonb)','fleet_validate_systems(jsonb)','fleet_validate_inventory(jsonb)','fleet_inventory_document(uuid)','fleet_protect_installation()','fleet_store_normalized_inventory(uuid,jsonb,integer,uuid,text)','fleet_sync_inventory()','load_vessel_technical_inventory(uuid)','save_vessel_technical_inventory(uuid,integer,jsonb)'] loop
  definition:=pg_get_functiondef(('public.'||signature)::regprocedure);
  execute replace(definition,'public.','pg_temp.');
 end loop;
end $clone$;
create trigger test_sync after insert or update of technical_inventory,technical_revision on pg_temp.barcos for each row execute function pg_temp.fleet_sync_inventory();
create trigger test_preserve before update of technical_inventory on pg_temp.barcos for each row execute function pg_temp.fleet_protect_installation();
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
insert into pg_temp.barcos(id,user_id,capitan_id) values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','22222222-2222-4222-8222-222222222222');
do $test$ declare document jsonb := '{"version":1,"components":[],"systems":{"version":1,"equipment":[{"id":"engine","section":"propulsion","catalogId":"engine","name":"engine","manufacturer":"","model":"","serial":"","location":"","specification":"","condition":"unknown","lastService":"","nextService":"","notes":"","archived":false},{"id":"propeller","section":"propulsion","catalogId":"propeller","name":"propeller","manufacturer":"","model":"","serial":"","location":"","specification":"","condition":"unknown","lastService":"","nextService":"","notes":"","archived":false},{"id":"gps","section":"electronics","catalogId":"gps","name":"gps","manufacturer":"","model":"","serial":"","location":"","specification":"","condition":"unknown","lastService":"","nextService":"","notes":"","archived":false},{"id":"mast","section":"rigging","catalogId":"mast","name":"mast","manufacturer":"","model":"","serial":"","location":"","specification":"","condition":"unknown","lastService":"","nextService":"","notes":"","archived":false},{"id":"raft","section":"safety","catalogId":"liferaft","name":"raft","manufacturer":"","model":"","serial":"","location":"","specification":"","condition":"unknown","lastService":"","nextService":"","notes":"","archived":false}],"links":[{"id":"drive","from":"engine","to":"propeller","label":"Explicit mechanical relationship"}]}}'::jsonb; result jsonb; changed jsonb; expected jsonb; rejected boolean; begin

 result:=pg_temp.save_vessel_technical_inventory('11111111-1111-4111-8111-111111111111',0,document);
 if result->'inventory' is distinct from document or result->>'revision'<>'1' then raise exception 'Save lost systems'; end if;
 if pg_temp.load_vessel_technical_inventory('11111111-1111-4111-8111-111111111111') is distinct from result then raise exception 'Read lost systems'; end if;
 if not exists(select 1 from pg_temp.barco_inventario_revisiones where revision=1 and inventory=document) then raise exception 'History lost systems'; end if;
 changed:=jsonb_set(jsonb_set(document,'{systems,equipment,0,archived}','true'),'{systems,equipment,0,notes}','"Inspection record retained"');
 result:=pg_temp.save_vessel_technical_inventory('11111111-1111-4111-8111-111111111111',1,changed);
 if result->'inventory' is distinct from changed or result->>'revision'<>'2' then raise exception 'Archive or notes lost'; end if;
 expected:=result;
 rejected:=false; begin perform pg_temp.save_vessel_technical_inventory('11111111-1111-4111-8111-111111111111',0,document); exception when serialization_failure then rejected:=true; end;
 if not rejected then raise exception 'Stale revision accepted'; end if;
 rejected:=false; begin perform pg_temp.save_vessel_technical_inventory('11111111-1111-4111-8111-111111111111',2,changed-'systems'); exception when invalid_parameter_value then rejected:=true; end;
 if not rejected then raise exception 'Older client dropped systems'; end if;
 rejected:=false; begin perform pg_temp.save_vessel_technical_inventory('11111111-1111-4111-8111-111111111111',2,jsonb_set(changed,'{systems,links,0,to}','"foreign"')); exception when foreign_key_violation then rejected:=true; end;
 if not rejected then raise exception 'Foreign target accepted'; end if;
 if pg_temp.load_vessel_technical_inventory('11111111-1111-4111-8111-111111111111') is distinct from expected then raise exception 'Rejected save changed inventory'; end if;
 perform set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
 rejected:=false; begin perform pg_temp.load_vessel_technical_inventory('11111111-1111-4111-8111-111111111111'); exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'Foreign principal read inventory'; end if;
 rejected:=false; begin perform pg_temp.save_vessel_technical_inventory('11111111-1111-4111-8111-111111111111',2,changed); exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'Foreign principal wrote inventory'; end if;
end $test$;
rollback;
select 'passed' as rpc_integration, 'temporary tables and deployed function copies; all changes rolled back' as isolation;
