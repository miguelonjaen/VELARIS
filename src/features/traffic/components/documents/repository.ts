import { supabase } from '../../../../supabaseClient';
import {
  DOCUMENT_BUCKET, MAX_DOCUMENT_BYTES, detectedDocumentMime, requiresSensitiveAccess,
  validateDocumentDates, validateExternalUrl,
  type DocumentAlert, type DocumentDraft, type DocumentEvent, type DocumentGrant,
  type DocumentVersion, type DocumentVessel, type LibraryDocument, type VesselMember,
} from './model';

function confirmed<T>(result: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (result.error) throw new Error(result.error.message);
  if (result.data == null) throw new Error('Supabase no confirmó la operación. Actualiza y comprueba el estado antes de reintentar.');
  return result.data;
}
async function currentUser(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('La sesión ha caducado. Inicia sesión para acceder a los documentos.');
  return data.user.id;
}
export async function loadDocumentPage(vesselId: string | null, offset: number, search: string, category: string, archived: boolean): Promise<LibraryDocument[]> {
  const result = await supabase.rpc('document_library_page', { p_vessel: vesselId, p_offset: offset, p_search: search, p_category: category, p_archived: archived }).abortSignal(AbortSignal.timeout(15000));
  const data: unknown = confirmed(result);
  if (!Array.isArray(data)) throw new Error('Respuesta documental no válida. Comprueba la migración unified_document_library.');
  return data as LibraryDocument[];
}
export async function loadDocumentVessels(): Promise<DocumentVessel[]> {
  return confirmed(await supabase.rpc('document_accessible_vessels').abortSignal(AbortSignal.timeout(15000))) as DocumentVessel[];
}
export async function loadVersions(documentId: string): Promise<DocumentVersion[]> {
  return confirmed(await supabase.from('document_versions').select('*').eq('document_id',documentId).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(100));
}
export async function uploadDocumentVersion(documentId: string, file: File): Promise<void> {
  if (file.size < 1 || file.size > MAX_DOCUMENT_BYTES) throw new Error('El archivo debe ocupar entre 1 byte y 25 MiB.');
  if (file.name.length > 240) throw new Error('El nombre del archivo supera los 240 caracteres.');
  const mime = detectedDocumentMime(new Uint8Array(await file.slice(0,12).arrayBuffer()));
  if (!mime) throw new Error('Formato no admitido. Usa PDF, JPEG, PNG o WebP.');
  const digest = await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
  const sha256 = Array.from(new Uint8Array(digest),byte => byte.toString(16).padStart(2,'0')).join('');
  const duplicate = confirmed(await supabase.from('document_versions').select('id').eq('document_id',documentId).eq('sha256',sha256).eq('state','ready').limit(1));
  if (duplicate.length) throw new Error('Este archivo ya está guardado en las versiones del documento.');
  const userId = await currentUser();
  const id = crypto.randomUUID();
  const path = `${userId}/${documentId}/${id}`;
  confirmed(await supabase.from('document_versions').insert({ id,document_id:documentId,uploaded_by:userId,object_path:path,original_name:file.name,mime_type:mime,byte_size:file.size,sha256 }).select('id').single());
  // Keep pending rows on ambiguous failures: an upload/finalization may have succeeded.
  // They can be recovered explicitly without losing an older ready version.
  const upload = await supabase.storage.from(DOCUMENT_BUCKET).upload(path,file,{contentType:mime,upsert:false});
  if (upload.error) throw new Error(`La carga no se confirmó: ${upload.error.message}. Revisa las versiones pendientes antes de reintentar.`);
  await finalizeVersion(id);
}
export async function finalizeVersion(id: string): Promise<void> {
  confirmed(await supabase.from('document_versions').update({state:'ready'}).eq('id',id).eq('state','pending').select('id').single());
}
export async function abandonVersion(version: DocumentVersion): Promise<void> {
  if (version.state !== 'pending') throw new Error('Solo se pueden cancelar cargas pendientes.');
  const removed=await supabase.storage.from(DOCUMENT_BUCKET).remove([version.object_path]);
  if (removed.error) throw new Error(`No se pudo limpiar la carga: ${removed.error.message}`);
  confirmed(await supabase.from('document_versions').update({state:'failed'}).eq('id',version.id).eq('state','pending').select('id').single());
}
export async function createDocument(draft: DocumentDraft, file: File | null): Promise<string> {
  const title = draft.title.trim();
  if (!title || title.length > 240) throw new Error('Introduce un título de hasta 240 caracteres.');
  validateDocumentDates(draft.issuedOn,draft.expiresOn);
  if (!draft.vesselId && (draft.issuedOn || draft.expiresOn)) throw new Error('Asocia una embarcación para registrar emisión o caducidad.');
  if (draft.kind === 'file' && !file) throw new Error('Selecciona el archivo que quieres guardar.');
  if (file && draft.kind === 'file') {
    if (file.size<1 || file.size>MAX_DOCUMENT_BYTES) throw new Error('El archivo debe ocupar entre 1 byte y 25 MiB.');
    if (!detectedDocumentMime(new Uint8Array(await file.slice(0,12).arrayBuffer()))) throw new Error('Formato no admitido. Usa PDF, JPEG, PNG o WebP.');
  }
  const externalUrl = draft.kind === 'link' ? validateExternalUrl(draft.externalUrl) : null;
  const userId = await currentUser();
  const id = crypto.randomUUID();
  confirmed(await supabase.from('documents').insert({ id,owner_id:userId,origin_vessel_id:draft.vesselId,title,category:draft.category,kind:draft.kind,sensitive:draft.sensitive || requiresSensitiveAccess(draft.category),external_url:externalUrl }).select('id').single());
  try {
    if (draft.vesselId) await linkDocument(id,draft.vesselId,draft.issuedOn,draft.expiresOn);
    if (file && draft.kind === 'file') await uploadDocumentVersion(id,file);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Error desconocido';
    throw new Error(`El registro «${title}» se creó en el repositorio, pero falta completar la asociación o la carga. ${reason}`);
  }
  return id;
}
export async function linkDocument(id: string,vesselId: string,issuedOn = '',expiresOn = ''): Promise<void> {
  validateDocumentDates(issuedOn,expiresOn);
  confirmed(await supabase.from('document_vessels').insert({document_id:id,vessel_id:vesselId,issued_on:issuedOn || null,expires_on:expiresOn || null}).select('document_id').single());
}
export async function updateDocumentDates(id: string,vesselId: string,issuedOn: string,expiresOn: string): Promise<void> {
  validateDocumentDates(issuedOn,expiresOn);
  confirmed(await supabase.from('document_vessels').update({issued_on:issuedOn || null,expires_on:expiresOn || null}).eq('document_id',id).eq('vessel_id',vesselId).select('document_id').single());
}
export async function unlinkDocument(id: string,vesselId: string): Promise<void> {
  confirmed(await supabase.from('document_vessels').delete().eq('document_id',id).eq('vessel_id',vesselId).select('document_id').single());
}
export async function updateDocument(document: LibraryDocument,patch: { title?: string; external_url?: string; archived?: boolean }): Promise<void> {
  if (patch.external_url !== undefined) patch.external_url=validateExternalUrl(patch.external_url);
  confirmed(await supabase.from('documents').update(patch).eq('id',document.id).eq('revision',document.revision).select('id').single());
}
export async function documentAccessUrl(document: LibraryDocument,version: DocumentVersion | null,download: boolean): Promise<string> {
  if (document.kind === 'link') return validateExternalUrl(document.external_url || '');
  if (!version || version.state !== 'ready') throw new Error('No hay una versión de archivo confirmada.');
  // A signed URL is a bearer credential valid for 60 seconds. Never persist it.
  const data = confirmed(await supabase.storage.from(DOCUMENT_BUCKET).createSignedUrl(version.object_path,60,download ? {download:version.original_name} : undefined));
  return data.signedUrl;
}
export async function loadGrants(id: string): Promise<DocumentGrant[]> {
  return confirmed(await supabase.rpc('document_access_users',{p_document:id})) as DocumentGrant[];
}
export async function resolveAccessUser(email: string,scope: {vesselId: string} | {documentId: string}): Promise<string> {
  const args='vesselId' in scope ? {p_vessel:scope.vesselId,p_email:email.trim()} : {p_document:scope.documentId,p_email:email.trim()};
  const result=await supabase.rpc('document_access_users',args);
  if (result.error) throw new Error(result.error.message);
  const account=result.data as {id?: string} | null;
  if (!account?.id) throw new Error('No existe una cuenta de GAULOS con ese correo.');
  return account.id;
}
export async function saveGrant(documentId: string,userId: string,permission: 'read' | 'edit'): Promise<void> {
  confirmed(await supabase.from('document_grants').upsert({document_id:documentId,user_id:userId,permission}).select('user_id').single());
}
export async function removeGrant(documentId: string,userId: string): Promise<void> {
  confirmed(await supabase.from('document_grants').delete().eq('document_id',documentId).eq('user_id',userId).select('user_id').single());
}
export async function loadMembers(vesselId: string): Promise<VesselMember[]> {
  return confirmed(await supabase.rpc('document_access_users',{p_vessel:vesselId})) as VesselMember[];
}
export async function saveMember(member: VesselMember): Promise<void> {
  confirmed(await supabase.from('document_vessel_members').upsert(member).select('user_id').single());
}
export async function removeMember(vesselId: string,userId: string): Promise<void> {
  confirmed(await supabase.from('document_vessel_members').delete().eq('vessel_id',vesselId).eq('user_id',userId).select('user_id').single());
}
export async function loadDocumentEvents(id: string): Promise<DocumentEvent[]> {
  return confirmed(await supabase.from('document_events').select('*').eq('document_id',id).order('created_at',{ascending:false}).limit(100));
}
export async function loadDueAlerts(): Promise<DocumentAlert[]> {
  return confirmed(await supabase.rpc('document_due_alerts').abortSignal(AbortSignal.timeout(15000))) as DocumentAlert[];
}
export async function acknowledgeAlert(alert: DocumentAlert): Promise<void> {
  const userId = await currentUser();
  const { error } = await supabase.from('document_alert_receipts').upsert({user_id:userId,document_id:alert.document_id,vessel_id:alert.vessel_id,expires_on:alert.expires_on,threshold:alert.threshold},{ignoreDuplicates:true});
  if (error) throw new Error(error.message);
}
