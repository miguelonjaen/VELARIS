-- Exact-email lookup is available only within an access scope the caller manages.
-- No user directory or privileged table is exposed to the client.
revoke all on function public.document_accessible_vessels(),public.document_capabilities(uuid),public.document_library_page(uuid,integer,text,text,boolean),public.document_due_alerts() from anon;
create function document_private.access_users(p_vessel uuid,p_document uuid,p_email text default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_account_active() or
   not ((p_vessel is not null and p_document is null and document_private.vessel_owner(p_vessel))
    or (p_document is not null and p_vessel is null and document_private.document_access(p_document,'manage'))) then
   raise exception 'Access management is not authorized' using errcode='42501';
 end if;
 if p_email is not null then
   return coalesce((select jsonb_build_object('id',u.id,'email',u.email) from public.usuarios u where lower(u.email)=lower(btrim(p_email)) limit 1),'null'::jsonb);
 end if;
 if p_vessel is not null then
   return coalesce((select jsonb_agg(to_jsonb(m)||jsonb_build_object('email',u.email)) from public.document_vessel_members m join public.usuarios u on u.id=m.user_id where m.vessel_id=p_vessel),'[]'::jsonb);
 end if;
 return coalesce((select jsonb_agg(to_jsonb(g)||jsonb_build_object('email',u.email)) from public.document_grants g join public.usuarios u on u.id=g.user_id where g.document_id=p_document),'[]'::jsonb);
end;
$$;
revoke all on function document_private.access_users(uuid,uuid,text) from public,anon;
grant execute on function document_private.access_users(uuid,uuid,text) to authenticated;
create function public.document_access_users(p_vessel uuid default null,p_document uuid default null,p_email text default null)
returns jsonb language sql stable security invoker set search_path='' as $$
 select document_private.access_users(p_vessel,p_document,p_email);
$$;
revoke all on function public.document_access_users(uuid,uuid,text) from public,anon;
grant execute on function public.document_access_users(uuid,uuid,text) to authenticated;
notify pgrst, 'reload schema';
