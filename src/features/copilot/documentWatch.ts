import type { LibraryDocument } from '../traffic/components/documents/model';

export type DocumentWatchStatus = 'CURRENT' | 'DUE_SOON' | 'EXPIRED' | 'NO_DATE' | 'UNAVAILABLE' | 'ERROR';
export interface DocumentWatchItem { id: string; title: string; status: DocumentWatchStatus; expiresOn: string | null; detail: string }

const MUTATION = /\b(subir|cargar|borrar|eliminar|modificar|editar|renov\w*|renuev\w*|archivar|compartir|vincular|desvincular)\b/i;
const DOCUMENT = /\b(documentaci[oó]n|documentos?|certificados?|seguro|itb|permiso de navegaci[oó]n|caducid(?:ad|ades)|vencid[oa]s?)\b/i;
const QUERY = /\b(consulta|consultar|estado|lista|listar|muestra|mostrar|qu[eé]|cu[aá]l(?:es)?|hay|vence|vencen|caduca|caducan)\b/i;

export function isReadOnlyDocumentQuery(text: string): boolean {
  const normalized = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/^[\u00bf\u00a1]+|[?!.]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized || normalized.length > 500) return false;

  const renewalQuery =
    /^(?:que|cual(?:es)?) (?:documentacion|documentos?|certificados?|seguros?|itb|permiso de navegacion) (?:(?:tengo|tenemos) pendiente(?:s)? de renovar|(?:debo|debemos|hay que|tengo que|tenemos que) renovar|necesita(?:n)? renovacion)$/;

  if (renewalQuery.test(normalized)) return true;

  return DOCUMENT.test(normalized)
    && QUERY.test(normalized)
    && !MUTATION.test(normalized)
    && !/\b(?:anade|agrega|crea|marca|registra|cambia|activa|desactiva|calcula|traza|ruta|derrota|rumbo|waypoint|destino)\b/.test(normalized);
}

export function classifyDocuments(documents: readonly LibraryDocument[], vesselId: string, today: string, leadDays: number): DocumentWatchItem[] {
  const todayAt = Date.parse(`${today}T00:00:00Z`);
  return documents.map(document => {
    const link = document.vessels.find(value => value.vessel_id === vesselId);
    if (!link) return { id: document.id, title: document.title, status: 'UNAVAILABLE' as const, expiresOn: null, detail: 'No existe asociación visible con el buque seleccionado.' };
    if (document.kind === 'file' && document.latest_version?.state !== 'ready') return { id: document.id, title: document.title, status: 'UNAVAILABLE' as const, expiresOn: link.expires_on, detail: 'No existe una versión de archivo confirmada.' };
    if (!link.expires_on) return { id: document.id, title: document.title, status: 'NO_DATE' as const, expiresOn: null, detail: 'Sin fecha de caducidad registrada.' };
    const expiry = Date.parse(`${link.expires_on}T00:00:00Z`);
    if (!Number.isFinite(expiry) || !Number.isFinite(todayAt)) return { id: document.id, title: document.title, status: 'ERROR' as const, expiresOn: link.expires_on, detail: 'Fecha documental no válida.' };
    const days = Math.round((expiry - todayAt) / 86_400_000);
    const status: DocumentWatchStatus = days < 0 ? 'EXPIRED' : days <= leadDays ? 'DUE_SOON' : 'CURRENT';
    return { id: document.id, title: document.title, status, expiresOn: link.expires_on, detail: days < 0 ? `Vencido hace ${Math.abs(days)} día(s).` : `Vence en ${days} día(s).` };
  });
}

export function formatDocumentAnswer(items: readonly DocumentWatchItem[], vesselName: string): string {
  if (!items.length) return `OFICIAL VIRTUAL · DOCUMENTACIÓN · ${vesselName}\nNo hay documentos visibles asociados. Esto indica ausencia de registros, no conformidad documental.`;
  const order: DocumentWatchStatus[] = ['ERROR', 'EXPIRED', 'DUE_SOON', 'NO_DATE', 'UNAVAILABLE', 'CURRENT'];
  const rows = [...items].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || a.title.localeCompare(b.title));
  return `OFICIAL VIRTUAL · DOCUMENTACIÓN · ${vesselName}\n${rows.map(value => `- ${value.status} · ${value.title} · ${value.detail}`).join('\n')}`;
}
