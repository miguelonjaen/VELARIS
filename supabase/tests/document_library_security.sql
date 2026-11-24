-- Execute inside a transaction and ROLLBACK. Synthetic users/vessels only.
begin;
do $$
<<security_smoke>>
declare
 owner_id uuid:=gen_random_uuid(); reader_id uuid:=gen_random_uuid(); outsider_id uuid:=gen_random_uuid();
 vessel_id uuid:=gen_random_uuid(); other_vessel uuid:=gen_random_uuid();
 document_id uuid:=gen_random_uuid(); sensitive_id uuid:=gen_random_uuid(); version_id uuid:=gen_random_uuid();
 row_count integer;
begin
 insert into auth.users(id,email,raw_user_meta_data) values
 (owner_id,owner_id::text||'@document-test.invalid','{}'),
 (reader_id,reader_id::text||'@document-test.invalid','{}'),
 (outsider_id,outsider_id::text||'@document-test.invalid','{}');
 insert into public.usuarios(id,email) values
 (owner_id,owner_id::text||'@document-test.invalid'),(reader_id,reader_id::text||'@document-test.invalid'),(outsider_id,outsider_id::text||'@document-test.invalid') on conflict(id) do nothing;
 insert into public.barcos(id,user_id,capitan_id,nombre,marca,modelo,matricula,eslora,manga,calado) values
 (vessel_id,owner_id,owner_id,'Document test vessel','Test','Test',vessel_id::text,10,3,1),
 (other_vessel,outsider_id,outsider_id,'Other test vessel','Test','Test',other_vessel::text,10,3,1);

 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
 set local role authenticated;
 insert into public.documents(id,owner_id,origin_vessel_id,kind,title,category) values(document_id,owner_id,vessel_id,'file','Test manual','manual') returning id into document_id;
 insert into public.document_vessels(document_id,vessel_id,expires_on) values(document_id,vessel_id,current_date+5);
 insert into public.documents(id,owner_id,origin_vessel_id,kind,title,category,sensitive) values(sensitive_id,owner_id,vessel_id,'file','Test identity','docs_dni_tripulacion',true);
 insert into public.document_vessels(document_id,vessel_id) values(sensitive_id,vessel_id);
 insert into public.document_vessel_members(vessel_id,user_id,permission) values(vessel_id,reader_id,'read');
 if (public.document_access_users(p_vessel=>vessel_id,p_email=>reader_id::text||'@document-test.invalid')->>'id')::uuid<>reader_id then raise exception 'TEST FAILURE: owner email lookup failed'; end if;
 insert into public.document_versions(id,document_id,uploaded_by,object_path,original_name,mime_type,byte_size,sha256)
 values(version_id,document_id,owner_id,owner_id::text||'/'||document_id::text||'/'||version_id::text,'test.pdf','application/pdf',5,repeat('a',64));
 begin
  update public.document_versions set state='ready' where id=version_id;
  raise exception 'TEST FAILURE: missing storage object was finalized';
 exception when raise_exception then if sqlerrm like 'TEST FAILURE:%' then raise; end if;
 end;
 begin
  insert into public.document_vessels(document_id,vessel_id) values(document_id,other_vessel);
  raise exception 'TEST FAILURE: sharing with unauthorized vessel';
 exception when insufficient_privilege then null;
 end;
 if jsonb_array_length(public.document_due_alerts())<>1 then raise exception 'TEST FAILURE: expiry alerts missing'; end if;
 insert into public.document_alert_receipts(user_id,document_id,vessel_id,expires_on,threshold) values(owner_id,document_id,vessel_id,current_date+5,7);
 if jsonb_array_length(public.document_due_alerts())<>0 then raise exception 'TEST FAILURE: acknowledged alert repeated'; end if;

 perform set_config('request.jwt.claim.sub',reader_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',reader_id,'role','authenticated')::text,true);
 if not exists(select 1 from public.documents where id=document_id) then raise exception 'TEST FAILURE: member cannot read'; end if;
 begin
  perform public.document_access_users(p_vessel=>vessel_id,p_email=>owner_id::text||'@document-test.invalid');
  raise exception 'TEST FAILURE: reader can look up accounts';
 exception when insufficient_privilege then null;
 end;
 if exists(select 1 from public.documents where id=sensitive_id) then raise exception 'TEST FAILURE: sensitive document leaked'; end if;
 update public.documents set title='Unauthorized edit' where id=document_id;
 get diagnostics row_count=row_count;
 if row_count<>0 then raise exception 'TEST FAILURE: reader edited document'; end if;
 begin
  insert into public.document_vessel_members(vessel_id,user_id,permission) values(vessel_id,outsider_id,'manage');
  raise exception 'TEST FAILURE: reader granted access';
 exception when insufficient_privilege then null;
 end;
 if jsonb_array_length(public.document_library_page())<>1 then raise exception 'TEST FAILURE: library RLS mismatch'; end if;

 perform set_config('request.jwt.claim.sub',outsider_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',outsider_id,'role','authenticated')::text,true);
 if exists(select 1 from public.documents where id in (document_id,sensitive_id)) then raise exception 'TEST FAILURE: outsider can read'; end if;
 if document_private.object_access(owner_id::text||'/'||document_id::text||'/'||version_id::text,true) then raise exception 'TEST FAILURE: outsider can upload'; end if;

 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
 insert into public.document_grants(document_id,user_id,permission) values(sensitive_id,reader_id,'read');
 perform set_config('request.jwt.claim.sub',reader_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',reader_id,'role','authenticated')::text,true);
 if not exists(select 1 from public.documents where id=sensitive_id) then raise exception 'TEST FAILURE: explicit sensitive grant ignored'; end if;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
 delete from public.document_grants g where g.document_id=sensitive_id and g.user_id=reader_id;
 update public.document_vessel_members set permission='edit' where document_vessel_members.vessel_id=security_smoke.vessel_id and user_id=reader_id;
 perform set_config('request.jwt.claim.sub',reader_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',reader_id,'role','authenticated')::text,true);
 update public.documents set title='Authorized edit' where id=document_id;
 get diagnostics row_count=row_count;
 if row_count<>1 then raise exception 'TEST FAILURE: editor cannot edit'; end if;
 begin
  update public.documents set owner_id=reader_id where id=document_id;
  raise exception 'TEST FAILURE: editor reassigned ownership';
 exception when insufficient_privilege then null;
 end;
 if exists(select 1 from public.documents where id=sensitive_id) then raise exception 'TEST FAILURE: revoked sensitive grant remains active'; end if;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
 delete from public.barcos where id=vessel_id;
 if not exists(select 1 from public.documents where id=document_id and origin_vessel_id is null) then raise exception 'TEST FAILURE: deleting vessel lost documents'; end if;
 reset role;
end;
$$;
select 'document security smoke passed' as result;
rollback;
