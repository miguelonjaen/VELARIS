import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, Upload, Download, ExternalLink, RefreshCw, Library, ShieldCheck } from 'lucide-react';
import { DOCUMENT_CATEGORIES, documentError, documentExpiryLabel, requiresSensitiveAccess,
  type DocumentAlert, type DocumentDraft, type DocumentEvent, type DocumentGrant, type DocumentVersion,
  type DocumentVessel, type LibraryDocument, type VesselMember } from './model';
import * as repository from './repository';
import './documentLibrary.css';

interface Props { vesselId?: string; vesselName?: string; userId: string }
type Action = (operation: () => Promise<void>) => Promise<void>;
const emptyDraft = (vesselId?: string): DocumentDraft => ({title:'',category:'other',kind:'file',sensitive:false,externalUrl:'',vesselId:vesselId || null,issuedOn:'',expiresOn:''});
const vesselName = (vessels: DocumentVessel[],id: string): string => vessels.find(vessel => vessel.id === id)?.nombre || 'Embarcación autorizada';
const formatBytes = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(2)} MiB`;

export function DocumentLibrary({ vesselId,vesselName: name,userId }: Props) {
  const [scope,setScope] = useState<'vessel' | 'library'>(vesselId ? 'vessel' : 'library');
  const [documents,setDocuments] = useState<LibraryDocument[]>([]);
  const [vessels,setVessels] = useState<DocumentVessel[]>([]);
  const [alerts,setAlerts] = useState<DocumentAlert[]>([]);
  const [search,setSearch] = useState('');
  const [query,setQuery] = useState('');
  const [category,setCategory] = useState('');
  const [archived,setArchived] = useState(false);
  const [offset,setOffset] = useState(0);
  const [more,setMore] = useState(false);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [creating,setCreating] = useState(false);
  const [draft,setDraft] = useState<DocumentDraft>(() => emptyDraft(vesselId));
  const [file,setFile] = useState<File | null>(null);
  const [fileKey,setFileKey] = useState(0);
  const generation = useRef(0);
  const locked = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current=true; return () => { mounted.current=false; generation.current++; }; },[]);
  useEffect(() => { const timer = window.setTimeout(() => { setQuery(search);setOffset(0); },300);return () => window.clearTimeout(timer); },[search]);
  const reload = useCallback(async () => {
    const ticket = ++generation.current;
    setLoading(true);
    try {
      const [page,ships,due] = await Promise.all([
        repository.loadDocumentPage(scope === 'vessel' ? vesselId || null : null,offset,query,category,archived),
        repository.loadDocumentVessels(),repository.loadDueAlerts(),
      ]);
      if (!mounted.current || ticket !== generation.current) return;
      setDocuments(page.slice(0,50));setMore(page.length > 50);setVessels(ships);setAlerts(due);setError('');
    } catch (reason) {
      if (mounted.current && ticket === generation.current) setError(`${documentError(reason)} No se ha confirmado la actualización de la biblioteca.`);
    } finally { if (mounted.current && ticket === generation.current) setLoading(false); }
  },[scope,vesselId,offset,query,category,archived]);
  useEffect(() => { void reload(); },[reload]);
  useEffect(() => {
    // Refresh expiry notices while this view is open, including after midnight.
    const timer=window.setInterval(() => { if (!locked.current && document.visibilityState === 'visible') void reload(); },60000);
    return () => window.clearInterval(timer);
  },[reload]);
  const run: Action = async operation => {
    if (locked.current) return;
    locked.current=true;setBusy(true);setError('');setNotice('');
    try { await operation(); if (mounted.current) { setNotice('Operación completada.'); await reload(); } }
    catch (reason) { if (mounted.current) { await reload();setError(documentError(reason)); } }
    finally { locked.current=false;if (mounted.current) setBusy(false); }
  };
  const selectedVessel = vessels.find(vessel => vessel.id === vesselId);
  const canCreate = scope === 'library' || selectedVessel?.can_edit === true;
  const visibleAlerts = alerts.filter(alert => scope === 'library' || alert.vessel_id === vesselId);
  return <section className="dl-root" aria-label="Gestor documental">
    <div className="dl-toolbar"><div><h4><Library size={18}/> {scope === 'vessel' ? `Archivo documental · ${name || 'Embarcación'}` : 'Repositorio de documentación'}</h4><p>Archivos privados y enlaces · guardado independiente de la ficha</p></div>
      <div className="dl-actions">{vesselId && <button type="button" disabled={busy} onClick={() => {setScope(scope === 'vessel' ? 'library' : 'vessel');setOffset(0);}}>{scope === 'vessel' ? 'Ver repositorio' : 'Ver archivo del barco'}</button>}<button type="button" disabled={busy || loading} onClick={() => void reload()} aria-label="Actualizar biblioteca"><RefreshCw size={16}/></button><button type="button" disabled={busy || loading || !canCreate} onClick={() => {setDraft(emptyDraft(scope === 'vessel' ? vesselId : undefined));setFile(null);setCreating(!creating);}}>Añadir documento</button></div>
    </div>
    {error && <p role="alert" className="dl-error">{error}</p>}
    {notice && <p role="status" className="dl-notice">{notice}</p>}
    {busy && <p role="status">Guardando… Espera a la confirmación antes de cerrar esta vista.</p>}
    {visibleAlerts.length > 0 && <details className="dl-alerts" open><summary>{visibleAlerts.length} avisos de caducidad · 60 / 30 / 7 días y vencimiento</summary>{visibleAlerts.map(alert => <div key={`${alert.document_id}:${alert.vessel_id}:${alert.threshold}`}><span><strong>{alert.title}</strong> · {vesselName(vessels,alert.vessel_id)} · {documentExpiryLabel(alert.expires_on)}</span><button type="button" disabled={busy} onClick={() => void run(() => repository.acknowledgeAlert(alert))}>Marcar visto</button></div>)}</details>}
    {creating && <div className="dl-editor" aria-label="Nuevo documento">
      <h5>Nuevo documento</h5><div className="dl-fields">
        <label>Título<input maxLength={240} value={draft.title} onChange={event => setDraft({...draft,title:event.target.value})}/></label>
        <label>Categoría<select value={draft.category} onChange={event => setDraft({...draft,category:event.target.value as DocumentDraft['category']})}>{DOCUMENT_CATEGORIES.map(([id,label]) => <option value={id} key={id}>{label}</option>)}</select></label>
        <label>Contenido<select value={draft.kind} onChange={event => setDraft({...draft,kind:event.target.value as 'file' | 'link'})}><option value="file">Archivo privado</option><option value="link">Enlace externo HTTPS</option></select></label>
        <label>Asociar a embarcación<select value={draft.vesselId || ''} onChange={event => setDraft({...draft,vesselId:event.target.value || null})}><option value="">Solo biblioteca personal</option>{vessels.filter(vessel => vessel.can_edit).map(vessel => <option key={vessel.id} value={vessel.id}>{vessel.nombre}</option>)}</select></label>
        {draft.kind === 'file' ? <label>Archivo · PDF, JPEG, PNG o WebP · máx. 25 MiB<input key={fileKey} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={event => setFile(event.target.files?.[0] || null)}/></label> : <label>Dirección externa<input type="url" placeholder="https://…" maxLength={4096} value={draft.externalUrl} onChange={event => setDraft({...draft,externalUrl:event.target.value})}/></label>}
        <label className="dl-check"><input type="checkbox" checked={draft.sensitive || requiresSensitiveAccess(draft.category)} disabled={requiresSensitiveAccess(draft.category)} onChange={event => setDraft({...draft,sensitive:event.target.checked})}/>Documento sensible · acceso restringido</label>
        {draft.vesselId && <><label>Emisión<input type="date" value={draft.issuedOn} onChange={event => setDraft({...draft,issuedOn:event.target.value})}/></label><label>Caducidad<input type="date" value={draft.expiresOn} onChange={event => setDraft({...draft,expiresOn:event.target.value})}/></label></>}
      </div><div className="dl-actions"><button type="button" disabled={busy} onClick={() => void run(async () => {await repository.createDocument(draft,file);setCreating(false);setFile(null);setFileKey(value => value+1);setOffset(0);})}>Guardar documento</button><button type="button" disabled={busy} onClick={() => setCreating(false)}>Cancelar</button></div>
      <p>Los enlaces conservan una referencia externa. Su contenido no se copia a GAULOS.</p>
    </div>}
    <div className="dl-filters"><label>Buscar<input type="search" placeholder="Título del documento" value={search} onChange={event => setSearch(event.target.value)}/></label><label>Categoría<select value={category} onChange={event => {setCategory(event.target.value);setOffset(0);}}><option value="">Todas</option>{DOCUMENT_CATEGORIES.map(([id,label]) => <option key={id} value={id}>{label}</option>)}</select></label><label className="dl-check"><input type="checkbox" checked={archived} onChange={event => {setArchived(event.target.checked);setOffset(0);}}/>Ver archivados</label></div>
    {loading && <p role="status">Consultando documentos…</p>}
    {!loading && !error && !documents.length && <p className="dl-empty">No hay documentos en esta vista. Añade uno o vincula un documento del repositorio.</p>}
    <div className="dl-grid" aria-busy={loading || busy}>{documents.map(doc => <DocumentCard key={`${doc.id}:${doc.revision}:${doc.latest_version?.id || ''}`} doc={doc} vessels={vessels} userId={userId} busy={busy || loading} run={run}/>)}</div>
    <div className="dl-actions"><button type="button" disabled={offset === 0 || loading || busy} onClick={() => setOffset(value => Math.max(0,value-50))}>Anterior</button><span>Página {offset / 50 + 1}</span><button type="button" disabled={!more || loading || busy} onClick={() => setOffset(value => value+50)}>Siguiente</button></div>
    {vesselId && selectedVessel?.can_manage && <VesselPermissions vesselId={vesselId} busy={busy} run={run}/>}
    <p className="dl-footnote">Los avisos se actualizan al abrir esta vista y cada minuto mientras está visible; no envían correos. Los indicadores no certifican vigencia legal. Los originales permanecen en Storage privado; no están disponibles sin conexión.</p>
  </section>;
}

function DocumentCard({doc,vessels,userId,busy,run}: {doc: LibraryDocument;vessels: DocumentVessel[];userId: string;busy: boolean;run: Action}) {
  const [expanded,setExpanded] = useState(false);
  const [versions,setVersions] = useState<DocumentVersion[]>([]);
  const [events,setEvents] = useState<DocumentEvent[]>([]);
  const [grants,setGrants] = useState<DocumentGrant[]>([]);
  const [detailError,setDetailError] = useState('');
  const [title,setTitle] = useState(doc.title);
  const [url,setUrl] = useState(doc.external_url || '');
  const [target,setTarget] = useState('');
  const [grantUser,setGrantUser] = useState('');
  const [grantPermission,setGrantPermission] = useState<'read' | 'edit'>('read');
  const loadDetails = useCallback(async () => {
    try {
      const [history,audit,shares] = await Promise.all([repository.loadVersions(doc.id),repository.loadDocumentEvents(doc.id),doc.can_manage ? repository.loadGrants(doc.id) : Promise.resolve([])]);
      setVersions(history);setEvents(audit);setGrants(shares);setDetailError('');
    } catch (reason) {setDetailError(documentError(reason));}
  },[doc.id,doc.can_manage]);
  useEffect(() => {if(expanded) void loadDetails();},[expanded,loadDetails,busy]);
  const access = (version: DocumentVersion | null,download: boolean) => {
    // Open synchronously to avoid popup blocking after the signing request.
    const tab = !download ? window.open('about:blank','_blank') : null;
    if (tab) tab.opener=null;
    void run(async () => {
      try {
        const destination = await repository.documentAccessUrl(doc,version,download);
        if (tab) tab.location.replace(destination);
        else {const anchor=document.createElement('a');anchor.href=destination;anchor.target='_blank';anchor.rel='noopener noreferrer';anchor.referrerPolicy='no-referrer';anchor.click();}
      } catch (reason) {tab?.close();throw reason;}
    });
  };
  return <article className="dl-card">
    <div className="dl-card-heading"><FileText size={20}/><div><h5>{doc.title}</h5><span>{DOCUMENT_CATEGORIES.find(([id]) => id === doc.category)?.[1] || doc.category}</span></div>{doc.sensitive && <span className="dl-sensitive"><ShieldCheck size={14}/>Sensible</span>}</div>
    <p>{doc.kind === 'link' ? 'Enlace externo · contenido alojado fuera de GAULOS' : doc.latest_version ? `${doc.latest_version.original_name} · ${formatBytes(doc.latest_version.byte_size)}` : 'Registro guardado · falta confirmar un archivo'}</p>
    {doc.vessels.map(link => <p className={link.expires_on && link.expires_on <= new Date().toISOString().slice(0,10) ? 'dl-expired' : ''} key={link.vessel_id}>{vesselName(vessels,link.vessel_id)} · {documentExpiryLabel(link.expires_on)}</p>)}
    <div className="dl-actions"><button type="button" disabled={busy || doc.archived || (doc.kind === 'file' && !doc.latest_version)} onClick={() => access(doc.latest_version,false)}><ExternalLink size={14}/>Abrir</button>{doc.kind === 'file' && <button type="button" disabled={busy || doc.archived || !doc.latest_version} onClick={() => access(doc.latest_version,true)}><Download size={14}/>Descargar</button>}{doc.can_edit && doc.kind === 'file' && !doc.archived && <label className={`dl-upload ${busy ? 'dl-disabled' : ''}`}><Upload size={14}/>Nueva versión<input type="file" disabled={busy} accept="application/pdf,image/jpeg,image/png,image/webp" onChange={event => {const file=event.target.files?.[0];event.target.value='';if(file) void run(() => repository.uploadDocumentVersion(doc.id,file));}}/></label>}<button type="button" disabled={busy} onClick={() => setExpanded(!expanded)}>{expanded ? 'Cerrar detalle' : 'Detalle y versiones'}</button></div>
    {expanded && <div className="dl-detail">
      {detailError && <p role="alert" className="dl-error">{detailError}</p>}
      {doc.can_edit && <><label>Título<input value={title} maxLength={240} onChange={event => setTitle(event.target.value)}/></label>{doc.kind === 'link' && <label>Enlace HTTPS<input type="url" value={url} onChange={event => setUrl(event.target.value)}/></label>}<button type="button" disabled={busy || !title.trim()} onClick={() => void run(() => repository.updateDocument(doc,{title:title.trim(),...(doc.kind === 'link' ? {external_url:url} : {})}))}>Guardar datos</button></>}
      {doc.vessels.map(link => <DocumentDates key={link.vessel_id} doc={doc} link={link} vessel={vessels.find(vessel => vessel.id === link.vessel_id)} busy={busy} run={run}/>)}
      {doc.can_manage && <><label>Compartir con otra embarcación<select value={target} onChange={event => setTarget(event.target.value)}><option value="">Seleccionar…</option>{vessels.filter(vessel => vessel.can_edit && (!doc.sensitive || vessel.sensitive_access) && !doc.vessels.some(link => link.vessel_id === vessel.id)).map(vessel => <option key={vessel.id} value={vessel.id}>{vessel.nombre}</option>)}</select></label><button type="button" disabled={busy || !target} onClick={() => void run(async () => {await repository.linkDocument(doc.id,target);setTarget('');})}>Vincular sin copiar archivo</button>
        <details><summary>Acceso específico por usuario</summary><p>Introduce el correo de una cuenta existente de GAULOS. Este permiso también autoriza documentos sensibles.</p><label>Correo del usuario<input type="email" value={grantUser} onChange={event => setGrantUser(event.target.value.trim())}/></label><label>Permiso<select value={grantPermission} onChange={event => setGrantPermission(event.target.value as 'read' | 'edit')}><option value="read">Lectura</option><option value="edit">Edición</option></select></label><button type="button" disabled={busy || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(grantUser)} onClick={() => void run(async () => {const accountId=await repository.resolveAccessUser(grantUser,{documentId:doc.id});await repository.saveGrant(doc.id,accountId,grantPermission);await loadDetails();setGrantUser('');})}>Guardar acceso</button>{grants.map(grant => <div className="dl-permission" key={grant.user_id}><span>{grant.email || 'Usuario autorizado'} · {grant.permission === 'read' ? 'Lectura' : 'Edición'}</span><button type="button" disabled={busy} onClick={() => void run(async () => {await repository.removeGrant(doc.id,grant.user_id);await loadDetails();})}>Revocar</button></div>)}</details>
        <button type="button" disabled={busy} onClick={() => void run(() => repository.updateDocument(doc,{archived:!doc.archived}))}>{doc.archived ? 'Restaurar documento' : 'Archivar · conservar originales'}</button></>}
      {doc.kind === 'file' && <><h6>Versiones · últimas 100</h6>{versions.length === 0 && <p>No hay cargas registradas.</p>}{versions.map(version => <div className="dl-version" key={version.id}><span>{version.original_name} · {new Date(version.created_at).toLocaleString('es-ES')} · {version.state === 'ready' ? 'Confirmada' : version.state === 'pending' ? 'Pendiente' : 'Fallida'}<small>{formatBytes(version.byte_size)} · SHA-256 {version.sha256}</small></span>{version.state === 'ready' && <button type="button" disabled={busy || doc.archived} onClick={() => access(version,true)}>Descargar versión</button>}{version.state === 'pending' && version.uploaded_by === userId && <button type="button" disabled={busy || doc.archived} onClick={() => void run(async () => {await repository.finalizeVersion(version.id);await loadDetails();})}>Comprobar carga y confirmar</button>}{version.state === 'pending' && version.uploaded_by === userId && <button type="button" disabled={busy || doc.archived} onClick={() => void run(async () => {await repository.abandonVersion(version);await loadDetails();})}>Cancelar carga pendiente</button>}</div>)}</>}
      <details><summary>Historial de cambios · últimos 100</summary>{events.map(event => <p key={event.id}>{new Date(event.created_at).toLocaleString('es-ES')} · {event.event} · {event.actor_id || 'Migración'}</p>)}</details>
    </div>}
  </article>;
}

function DocumentDates({doc,link,vessel,busy,run}: {doc: LibraryDocument;link: LibraryDocument['vessels'][number];vessel?: DocumentVessel;busy: boolean;run: Action}) {
  const [issued,setIssued] = useState(link.issued_on || '');
  const [expires,setExpires] = useState(link.expires_on || '');
  useEffect(() => {setIssued(link.issued_on || '');setExpires(link.expires_on || '');},[link.issued_on,link.expires_on]);
  return <div className="dl-dates"><strong>{vessel?.nombre || 'Embarcación'}</strong><label>Emisión<input type="date" disabled={!doc.can_edit || !vessel?.can_edit} value={issued} onChange={event => setIssued(event.target.value)}/></label><label>Caducidad<input type="date" disabled={!doc.can_edit || !vessel?.can_edit} value={expires} onChange={event => setExpires(event.target.value)}/></label>{doc.can_edit && vessel?.can_edit && <button type="button" disabled={busy} onClick={() => void run(() => repository.updateDocumentDates(doc.id,link.vessel_id,issued,expires))}>Guardar fechas</button>}{doc.can_manage && vessel?.can_edit && <button type="button" disabled={busy} onClick={() => void run(() => repository.unlinkDocument(doc.id,link.vessel_id))}>Desvincular del barco</button>}</div>;
}

function VesselPermissions({vesselId,busy,run}: {vesselId: string;busy: boolean;run: Action}) {
  const [members,setMembers] = useState<VesselMember[]>([]);
  const [userId,setUserId] = useState('');
  const [permission,setPermission] = useState<VesselMember['permission']>('read');
  const [sensitive,setSensitive] = useState(false);
  const [error,setError] = useState('');
  const load=useCallback(async () => {try {setMembers(await repository.loadMembers(vesselId));setError('');} catch(reason) {setError(documentError(reason));}},[vesselId]);
  useEffect(() => {void load();},[load]);
  return <details className="dl-members"><summary>Permisos documentales de esta embarcación</summary><p>Solo propietario y capitán administran estos accesos. No modifica permisos de navegación ni de inventario.</p>{error && <p role="alert">{error}</p>}<div className="dl-fields"><label>Correo del usuario de GAULOS<input type="email" value={userId} onChange={event => setUserId(event.target.value.trim())}/></label><label>Permiso<select value={permission} onChange={event => setPermission(event.target.value as VesselMember['permission'])}><option value="read">Lectura</option><option value="edit">Edición y carga</option><option value="manage">Administración documental</option></select></label><label className="dl-check"><input type="checkbox" checked={sensitive} onChange={event => setSensitive(event.target.checked)}/>Permitir documentos sensibles</label></div><button type="button" disabled={busy || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userId)} onClick={() => void run(async () => {const accountId=await repository.resolveAccessUser(userId,{vesselId});await repository.saveMember({vessel_id:vesselId,user_id:accountId,permission,sensitive_access:sensitive});await load();setUserId('');})}>Guardar permiso</button>{members.map(member => <div key={member.user_id} className="dl-permission"><span>{member.email || 'Usuario autorizado'} · {member.permission === 'read' ? 'Lectura' : member.permission === 'edit' ? 'Edición' : 'Administración'} · {member.sensitive_access ? 'Incluye sensibles' : 'Sin sensibles'}</span><button type="button" disabled={busy} onClick={() => void run(async () => {await repository.removeMember(vesselId,member.user_id);await load();})}>Revocar</button></div>)}</details>;
}
