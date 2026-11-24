-- Unified private document library. Legacy columns and objects are retained.
create schema if not exists document_private;
revoke all on schema document_private from public;
grant usage on schema document_private to authenticated;

create table public.document_vessel_members (
  vessel_id uuid not null references public.barcos(id) on delete cascade,
  user_id uuid not null references public.usuarios(id) on delete cascade,
  permission text not null check (permission in ('read','edit','manage')),
  sensitive_access boolean not null default false,
  primary key (vessel_id,user_id)
);
create index document_members_user_idx on public.document_vessel_members(user_id,vessel_id);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.usuarios(id),
  origin_vessel_id uuid references public.barcos(id) on delete set null,
  kind text not null check (kind in ('file','link')),
  title text not null check (length(btrim(title)) between 1 and 240),
  category text not null check (length(category) between 1 and 80),
  sensitive boolean not null default false,
  external_url text check (external_url is null or (length(external_url) <= 4096 and external_url ~* '^https://[^[:space:]]+$')),
  archived boolean not null default false,
  revision integer not null default 0,
  legacy_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind='file' and external_url is null) or (kind='link' and external_url is not null)),
  check (category not in ('docs_dni_tripulacion','docs_titulacion_patron') or sensitive)
);
create index documents_owner_idx on public.documents(owner_id);
create index documents_origin_idx on public.documents(origin_vessel_id);

create table public.document_vessels (
  document_id uuid not null references public.documents(id),
  vessel_id uuid not null references public.barcos(id) on delete cascade,
  issued_on date,
  expires_on date,
  primary key (document_id,vessel_id),
  check (issued_on is null or expires_on is null or issued_on <= expires_on)
);
create index document_vessels_vessel_idx on public.document_vessels(vessel_id,document_id);
create index document_vessels_expiry_idx on public.document_vessels(expires_on) where expires_on is not null;

create table public.document_grants (
  document_id uuid not null references public.documents(id),
  user_id uuid not null references public.usuarios(id) on delete cascade,
  permission text not null check (permission in ('read','edit')),
  primary key (document_id,user_id)
);
create index document_grants_user_idx on public.document_grants(user_id,document_id);

create table public.document_versions (
  id uuid primary key,
  document_id uuid not null references public.documents(id),
  uploaded_by uuid not null references public.usuarios(id),
  bucket_id text not null default 'fleet-documents' check (bucket_id='fleet-documents'),
  object_path text not null unique,
  original_name text not null check (length(original_name) between 1 and 240),
  mime_type text not null check (mime_type in ('application/pdf','image/jpeg','image/png','image/webp')),
  byte_size bigint not null check (byte_size between 1 and 26214400),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  state text not null default 'pending' check (state in ('pending','ready','failed')),
  created_at timestamptz not null default now(),
  check (object_path=uploaded_by::text || '/' || document_id::text || '/' || id::text)
);
create index document_versions_doc_idx on public.document_versions(document_id,created_at desc);
create index document_versions_uploader_idx on public.document_versions(uploaded_by);

create table public.document_events (
  id bigint generated always as identity primary key,
  document_id uuid not null references public.documents(id),
  actor_id uuid,
  event text not null,
  created_at timestamptz not null default now()
);
create index document_events_doc_idx on public.document_events(document_id,created_at desc);
create table public.document_alert_receipts (
  user_id uuid not null references public.usuarios(id) on delete cascade,
  document_id uuid not null,
  vessel_id uuid not null,
  expires_on date not null,
  threshold integer not null check (threshold in (60,30,7,0)),
  acknowledged_at timestamptz not null default now(),
  primary key (user_id,document_id,vessel_id,expires_on,threshold),
  foreign key (document_id,vessel_id) references public.document_vessels(document_id,vessel_id) on delete cascade
);

-- Non-exposed helpers intentionally bypass RLS to avoid recursive membership policies.
-- They always derive the caller from auth.uid(), never from a client-supplied user id.
create function document_private.vessel_access(p_vessel uuid, p_level text default 'read', p_sensitive boolean default false)
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and public.is_account_active() and (
    exists (select 1 from public.barcos b where b.id=p_vessel and auth.uid() in (b.user_id,b.capitan_id))
    or exists (select 1 from public.document_vessel_members m where m.vessel_id=p_vessel and m.user_id=auth.uid()
      and (not p_sensitive or m.sensitive_access)
      and case p_level when 'read' then true when 'edit' then m.permission in ('edit','manage') when 'manage' then m.permission='manage' else false end)
  );
$$;
create function document_private.document_access(p_document uuid, p_level text default 'read')
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and public.is_account_active() and exists (
    select 1 from public.documents d where d.id=p_document and (
      d.owner_id=auth.uid()
      or document_private.vessel_access(d.origin_vessel_id,p_level,d.sensitive)
      or (p_level in ('read','edit') and exists (select 1 from public.document_grants g where g.document_id=d.id and g.user_id=auth.uid() and (p_level='read' or g.permission='edit')))
      or (p_level='read' and exists (select 1 from public.document_vessels v where v.document_id=d.id and document_private.vessel_access(v.vessel_id,'read',d.sensitive)))
    )
  );
$$;
revoke all on function document_private.vessel_access(uuid,text,boolean), document_private.document_access(uuid,text) from public;
grant execute on function document_private.vessel_access(uuid,text,boolean), document_private.document_access(uuid,text) to authenticated;

alter table public.document_vessel_members enable row level security;
alter table public.documents enable row level security;
alter table public.document_vessels enable row level security;
alter table public.document_grants enable row level security;
alter table public.document_versions enable row level security;
alter table public.document_events enable row level security;
alter table public.document_alert_receipts enable row level security;

create policy document_members_read on public.document_vessel_members for select to authenticated using (user_id=(select auth.uid()) or document_private.vessel_access(vessel_id,'manage'));
-- Only owner/captain may administer membership: a delegate cannot promote themselves.
create function document_private.vessel_owner(p_vessel uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and public.is_account_active() and exists (select 1 from public.barcos where id=p_vessel and auth.uid() in (user_id,capitan_id));
$$;
revoke all on function document_private.vessel_owner(uuid) from public;
grant execute on function document_private.vessel_owner(uuid) to authenticated;
create policy document_members_insert on public.document_vessel_members for insert to authenticated with check (document_private.vessel_owner(vessel_id));
create policy document_members_update on public.document_vessel_members for update to authenticated using (document_private.vessel_owner(vessel_id)) with check (document_private.vessel_owner(vessel_id));
create policy document_members_delete on public.document_vessel_members for delete to authenticated using (document_private.vessel_owner(vessel_id));

create policy documents_read on public.documents for select to authenticated using (document_private.document_access(id));
create policy documents_insert on public.documents for insert to authenticated with check (
 owner_id=(select auth.uid()) and public.is_account_active() and (origin_vessel_id is null or document_private.vessel_access(origin_vessel_id,'edit',sensitive)) and legacy_key is null and revision=0 and not archived
);
create policy documents_update on public.documents for update to authenticated using (document_private.document_access(id,'edit')) with check (document_private.document_access(id,'edit'));
create policy document_links_read on public.document_vessels for select to authenticated using (document_private.document_access(document_id) and document_private.vessel_access(vessel_id));
create policy document_links_insert on public.document_vessels for insert to authenticated with check (document_private.document_access(document_id,'manage') and document_private.vessel_access(vessel_id,'edit',(select sensitive from public.documents where id=document_id)));
create policy document_links_update on public.document_vessels for update to authenticated using (document_private.document_access(document_id,'edit') and document_private.vessel_access(vessel_id,'edit')) with check (document_private.document_access(document_id,'edit') and document_private.vessel_access(vessel_id,'edit'));
create policy document_links_delete on public.document_vessels for delete to authenticated using (document_private.document_access(document_id,'manage') and document_private.vessel_access(vessel_id,'edit'));
create policy document_grants_read on public.document_grants for select to authenticated using (user_id=(select auth.uid()) or document_private.document_access(document_id,'manage'));
create policy document_grants_insert on public.document_grants for insert to authenticated with check (document_private.document_access(document_id,'manage'));
create policy document_grants_update on public.document_grants for update to authenticated using (document_private.document_access(document_id,'manage')) with check (document_private.document_access(document_id,'manage'));
create policy document_grants_delete on public.document_grants for delete to authenticated using (document_private.document_access(document_id,'manage'));
create policy document_versions_read on public.document_versions for select to authenticated using (document_private.document_access(document_id) and (state='ready' or document_private.document_access(document_id,'edit')));
create policy document_versions_insert on public.document_versions for insert to authenticated with check (uploaded_by=(select auth.uid()) and state='pending' and document_private.document_access(document_id,'edit') and exists(select 1 from public.documents where id=document_id and kind='file' and not archived));
create policy document_versions_update on public.document_versions for update to authenticated using (uploaded_by=(select auth.uid()) and state='pending' and document_private.document_access(document_id,'edit')) with check (uploaded_by=(select auth.uid()) and document_private.document_access(document_id,'edit'));
create policy document_events_read on public.document_events for select to authenticated using (document_private.document_access(document_id));
create policy document_receipts_read on public.document_alert_receipts for select to authenticated using (user_id=(select auth.uid()) and document_private.document_access(document_id));
create policy document_receipts_insert on public.document_alert_receipts for insert to authenticated with check (user_id=(select auth.uid()) and document_private.document_access(document_id) and document_private.vessel_access(vessel_id));

revoke all on public.documents,public.document_versions,public.document_vessels,public.document_vessel_members,public.document_grants,public.document_events,public.document_alert_receipts from authenticated;
grant select,insert,update on public.documents,public.document_versions to authenticated;
grant select,insert,update,delete on public.document_vessels,public.document_vessel_members,public.document_grants to authenticated;
grant select on public.document_events to authenticated;
grant select,insert on public.document_alert_receipts to authenticated;
revoke all on public.documents, public.document_versions, public.document_vessels, public.document_vessel_members, public.document_grants, public.document_events, public.document_alert_receipts from anon;

create function document_private.guard_document() returns trigger language plpgsql set search_path='' as $$
begin
 if new.id<>old.id or new.owner_id<>old.owner_id or (new.origin_vessel_id is distinct from old.origin_vessel_id and not (new.origin_vessel_id is null and not exists(select 1 from public.barcos where id=old.origin_vessel_id))) or new.kind<>old.kind or new.legacy_key is distinct from old.legacy_key or new.created_at<>old.created_at then
   raise exception 'Document identity is immutable' using errcode='42501';
 end if;
 if (new.sensitive<>old.sensitive or new.archived<>old.archived) and not document_private.document_access(old.id,'manage') then
   raise exception 'Document manager required' using errcode='42501';
 end if;
 new.revision:=old.revision+1;
 new.updated_at:=now();
 return new;
end;
$$;
create trigger guard_document before update on public.documents for each row execute function document_private.guard_document();

create function document_private.guard_link() returns trigger language plpgsql set search_path='' as $$
begin
 if new.document_id<>old.document_id or new.vessel_id<>old.vessel_id then raise exception 'Document associations are immutable; unlink and link explicitly'; end if;
 return new;
end;
$$;
revoke all on function document_private.guard_link() from public;
create trigger guard_document_link before update on public.document_vessels for each row execute function document_private.guard_link();

create function document_private.guard_version() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not document_private.document_access(old.document_id,'edit') then raise exception 'Access denied' using errcode='42501'; end if;
 if (to_jsonb(new)-'state') is distinct from (to_jsonb(old)-'state') or old.state<>'pending' or new.state not in ('ready','failed') then
   raise exception 'Versions are immutable; only pending uploads may be finalized';
 end if;
 if new.state='ready' and not exists (
   select 1 from storage.objects o where o.bucket_id=new.bucket_id and o.name=new.object_path
     and (o.metadata->>'size')::bigint=new.byte_size and o.metadata->>'mimetype'=new.mime_type
 ) then raise exception 'Uploaded object not confirmed'; end if;
 return new;
end;
$$;
revoke all on function document_private.guard_version(), document_private.guard_document() from public;
create trigger guard_version before update on public.document_versions for each row execute function document_private.guard_version();

create function document_private.audit_change() returns trigger language plpgsql security definer set search_path='' as $$
declare doc_id uuid;
begin
 if tg_table_name='documents' then doc_id:=coalesce(new.id,old.id); else doc_id:=coalesce(new.document_id,old.document_id); end if;
 insert into public.document_events(document_id,actor_id,event) values(doc_id,auth.uid(),tg_table_name || ':' || tg_op);
 return coalesce(new,old);
end;
$$;
revoke all on function document_private.audit_change() from public;
create trigger audit_document after insert or update on public.documents for each row execute function document_private.audit_change();
create trigger audit_document_version after insert or update on public.document_versions for each row execute function document_private.audit_change();
create trigger audit_document_vessel after insert or update or delete on public.document_vessels for each row execute function document_private.audit_change();
create trigger audit_document_grant after insert or update or delete on public.document_grants for each row execute function document_private.audit_change();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('fleet-documents','fleet-documents',false,26214400,array['application/pdf','image/jpeg','image/png','image/webp']);

create function document_private.object_access(p_path text,p_write boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists (
  select 1 from public.document_versions v join public.documents d on d.id=v.document_id
  where v.object_path=p_path and not d.archived and (
   (not p_write and v.state='ready' and document_private.document_access(v.document_id))
   or (p_write and v.state='pending' and v.uploaded_by=auth.uid() and document_private.document_access(v.document_id,'edit'))
  )
 );
$$;
revoke all on function document_private.object_access(text,boolean) from public;
grant execute on function document_private.object_access(text,boolean) to authenticated;
create policy fleet_documents_select on storage.objects for select to authenticated using (bucket_id='fleet-documents' and document_private.object_access(name));
create policy fleet_documents_insert on storage.objects for insert to authenticated with check (bucket_id='fleet-documents' and document_private.object_access(name,true));
-- No UPDATE policy: replacements are new immutable versions. Only pending objects can be cleaned.
create policy fleet_documents_pending_delete on storage.objects for delete to authenticated using (bucket_id='fleet-documents' and document_private.object_access(name,true));
create policy fleet_documents_pending_select on storage.objects for select to authenticated using (bucket_id='fleet-documents' and document_private.object_access(name,true));

-- A minimal projection avoids exposing legacy personal URLs through full vessel rows.
create function document_private.accessible_vessels() returns table(id uuid,nombre text,can_edit boolean,can_manage boolean,sensitive_access boolean)
language sql stable security definer set search_path='' as $$
 select b.id,b.nombre,document_private.vessel_access(b.id,'edit'),document_private.vessel_owner(b.id),document_private.vessel_access(b.id,'read',true)
 from public.barcos b where document_private.vessel_access(b.id);
$$;
revoke all on function document_private.accessible_vessels() from public;
grant execute on function document_private.accessible_vessels() to authenticated;
create function public.document_accessible_vessels() returns table(id uuid,nombre text,can_edit boolean,can_manage boolean,sensitive_access boolean)
language sql stable security invoker set search_path='' as $$ select * from document_private.accessible_vessels(); $$;
revoke all on function public.document_accessible_vessels() from public;
grant execute on function public.document_accessible_vessels() to authenticated;

create function public.document_capabilities(p_document uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('read',document_private.document_access(p_document),'edit',document_private.document_access(p_document,'edit'),'manage',document_private.document_access(p_document,'manage'));
$$;
revoke all on function public.document_capabilities(uuid) from public;
grant execute on function public.document_capabilities(uuid) to authenticated;

create function public.document_library_page(p_vessel uuid default null,p_offset integer default 0,p_search text default '',p_category text default '',p_archived boolean default false)
returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(page)),'[]'::jsonb) from (
  select d.*,document_private.document_access(d.id,'edit') can_edit,document_private.document_access(d.id,'manage') can_manage,
   (select to_jsonb(v) from public.document_versions v where v.document_id=d.id and v.state='ready' order by v.created_at desc,v.id desc limit 1) latest_version,
   coalesce((select jsonb_agg(to_jsonb(l)) from public.document_vessels l where l.document_id=d.id),'[]'::jsonb) vessels
  from public.documents d
  where d.archived=p_archived and (p_vessel is null or exists(select 1 from public.document_vessels l where l.document_id=d.id and l.vessel_id=p_vessel))
   and (p_category='' or d.category=p_category) and (p_search='' or strpos(lower(d.title),lower(left(p_search,240)))>0)
  order by d.created_at desc,d.id desc limit 51 offset greatest(0,least(p_offset,100000))
 ) page;
$$;
revoke all on function public.document_library_page(uuid,integer,text,text,boolean) from public;
grant execute on function public.document_library_page(uuid,integer,text,text,boolean) to authenticated;

-- Durable acknowledgements, separate from document expiry and signed URL lifetime.
create function public.document_due_alerts() returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) from (
  select d.id document_id,d.title,l.vessel_id,l.expires_on,
   case when l.expires_on<=(now() at time zone 'UTC')::date then 0 when l.expires_on<=(now() at time zone 'UTC')::date+7 then 7 when l.expires_on<=(now() at time zone 'UTC')::date+30 then 30 else 60 end threshold
  from public.documents d join public.document_vessels l on l.document_id=d.id
  where not d.archived and l.expires_on<=(now() at time zone 'UTC')::date+60
 ) a where not exists (select 1 from public.document_alert_receipts r where r.user_id=(select auth.uid()) and r.document_id=a.document_id and r.vessel_id=a.vessel_id and r.expires_on=a.expires_on and r.threshold=a.threshold);
$$;
revoke all on function public.document_due_alerts() from public;
grant execute on function public.document_due_alerts() to authenticated;

-- Import references, not remote contents. Stable keys make the mapping traceable.
-- No legacy fields, original files or external folders are changed or deleted.
do $$
declare r record; doc_id uuid;
begin
 for r in
  select b.id vessel_id,b.user_id owner_id,x.category,x.title,x.url,x.sensitive,x.expires_on
  from public.barcos b cross join lateral (values
   ('repository','Repositorio externo',b.documentacion_url,false,null::date),
   ('manual','Manual de operaciones',b.manual_pdf,false,null::date),
   ('docs_certificado_navegabilidad','Certificado de navegabilidad',b.url_certificado_navegabilidad,false,null::date),
   ('docs_permiso_navegacion','Permiso de navegación',b.url_permiso_navegacion,false,null::date),
   ('docs_seguro_vigente','Seguro',b.url_seguro,false,b.fecha_seguro),
   ('docs_itb_vigente','ITB',b.url_itb,false,b.fecha_itb),
   ('docs_dni_tripulacion','Identidad de tripulación',b.url_dni_tripulacion,true,null::date),
   ('docs_titulacion_patron','Titulación del patrón',b.url_titulacion_patron,true,null::date),
   ('docs_leb_mmsi','Radio / MMSI',b.url_leb_mmsi,false,null::date)
  ) x(category,title,url,sensitive,expires_on)
  where nullif(btrim(x.url),'') is not null and btrim(x.url) ~* '^https://[^[:space:]]+$'
 loop
  insert into public.documents(owner_id,origin_vessel_id,kind,title,category,sensitive,external_url,legacy_key)
  values(r.owner_id,r.vessel_id,'link',r.title,r.category,r.sensitive,btrim(r.url),r.vessel_id::text || ':' || r.category) returning id into doc_id;
  insert into public.document_vessels(document_id,vessel_id,expires_on) values(doc_id,r.vessel_id,r.expires_on);
 end loop;
end;
$$;
notify pgrst, 'reload schema';
