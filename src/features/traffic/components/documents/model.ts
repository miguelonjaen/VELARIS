export const DOCUMENT_BUCKET = 'fleet-documents';
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;
export const DOCUMENT_CATEGORIES = [
  ['docs_certificado_navegabilidad', 'Navegabilidad'],
  ['docs_permiso_navegacion', 'Permiso de navegación'],
  ['docs_seguro_vigente', 'Seguro'],
  ['docs_itb_vigente', 'ITB'],
  ['docs_dni_tripulacion', 'Identidad de tripulación'],
  ['docs_titulacion_patron', 'Titulación del patrón'],
  ['docs_leb_mmsi', 'Radio / MMSI'],
  ['manual', 'Manuales'], ['procedure', 'Procedimientos'],
  ['invoice', 'Facturas'], ['repository', 'Repositorio externo'], ['other', 'Otros'],
] as const;
export type DocumentCategory = typeof DOCUMENT_CATEGORIES[number][0];
export type DocumentPermission = 'read' | 'edit' | 'manage';
export interface DocumentVessel {
  id: string; nombre: string; can_edit: boolean; can_manage: boolean; sensitive_access: boolean;
}
export interface VesselDocumentLink {
  document_id: string; vessel_id: string; issued_on: string | null; expires_on: string | null;
}
export interface DocumentVersion {
  id: string; document_id: string; uploaded_by: string; bucket_id: string; object_path: string;
  original_name: string; mime_type: string; byte_size: number; sha256: string;
  state: 'pending' | 'ready' | 'failed'; created_at: string;
}
export interface LibraryDocument {
  id: string; owner_id: string; origin_vessel_id: string | null; title: string; category: string;
  kind: 'file' | 'link'; sensitive: boolean; archived: boolean; revision: number;
  external_url: string | null; created_at: string; updated_at: string;
  can_edit: boolean; can_manage: boolean;
  latest_version: DocumentVersion | null; vessels: VesselDocumentLink[];
}
export interface DocumentDraft {
  title: string; category: DocumentCategory; kind: 'file' | 'link'; sensitive: boolean;
  externalUrl: string; vesselId: string | null; expiresOn: string; issuedOn: string;
}
export interface DocumentGrant { document_id: string; user_id: string; permission: 'read' | 'edit'; email?: string }
export interface VesselMember { vessel_id: string; user_id: string; permission: DocumentPermission; sensitive_access: boolean; email?: string }
export interface DocumentEvent { id: number; actor_id: string | null; event: string; created_at: string }
export interface DocumentAlert { document_id: string; title: string; vessel_id: string; expires_on: string; threshold: 0 | 7 | 30 | 60 }

export const requiresSensitiveAccess = (category: string): boolean => category === 'docs_dni_tripulacion' || category === 'docs_titulacion_patron';
export function validateExternalUrl(input: string): string {
  const url = new URL(input.trim());
  if (url.protocol !== 'https:' || url.username || url.password || input.length > 4096) {
    throw new Error('El enlace debe usar HTTPS, sin credenciales en la dirección.');
  }
  return url.href;
}
export function validateDocumentDates(issuedOn: string, expiresOn: string): void {
  for (const value of [issuedOn, expiresOn]) {
    if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0,10) !== value)) {
      throw new Error('Fecha documental no válida.');
    }
  }
  if (issuedOn && expiresOn && issuedOn > expiresOn) throw new Error('La caducidad no puede ser anterior a la emisión.');
}
export function detectedDocumentMime(header: Uint8Array): string | null {
  if (header[0] === 0x25 && header[1] === 0x50 && header[2] === 0x44 && header[3] === 0x46 && header[4] === 0x2d) return 'application/pdf';
  if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) return 'image/jpeg';
  if ([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a].every((byte,index) => header[index] === byte)) return 'image/png';
  if (String.fromCharCode(...header.slice(0,4)) === 'RIFF' && String.fromCharCode(...header.slice(8,12)) === 'WEBP') return 'image/webp';
  return null;
}
export function documentExpiryLabel(expiresOn: string | null, today = new Date().toISOString().slice(0,10)): string {
  if (!expiresOn) return 'Sin caducidad registrada';
  const days = Math.round((Date.parse(expiresOn) - Date.parse(today)) / 86400000);
  return days < 0 ? `Vencido · ${expiresOn}` : days === 0 ? 'Vence hoy' : days <= 60 ? `Vence en ${days} días · ${expiresOn}` : `Vence el ${expiresOn}`;
}
export const documentError = (error: unknown): string => error instanceof Error ? error.message : 'No se pudo completar la operación documental.';
