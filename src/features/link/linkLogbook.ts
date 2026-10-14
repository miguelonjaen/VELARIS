import type { LogEntry } from '../../shared/types';
import type { LinkLogEvent } from './velarisLinkTypes';

/**
 * Los eventos de VELARIS Link se guardan con la misma forma que una fila de `bitacora`
 * (categoria, titulo, descripcion, is_auto, lat/lng, fecha, time) para mostrarse en el
 * Logbook existente y poder subirse a Supabase más adelante sin un segundo sistema.
 * Se distinguen por el prefijo del id: no se editan ni se borran desde el Logbook.
 */
export const LINK_ENTRY_PREFIX = 'link:';

export function isLinkEntryId(id: LogEntry['id']): boolean {
  return typeof id === 'string' && id.startsWith(LINK_ENTRY_PREFIX);
}

function localDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function linkEventToLogEntry(event: LinkLogEvent, barcoId: string | number | null): LogEntry {
  return {
    id: `${LINK_ENTRY_PREFIX}${event.eventId}`,
    barco_id: barcoId,
    user_id: '',
    fecha: localDate(event.at),
    created_at: new Date(event.at).toISOString(),
    time: new Date(event.at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
    titulo: event.title || event.kind,
    categoria: event.auto ? 'Track' : 'Anotación',
    descripcion: `${event.text}${event.text ? ' · ' : ''}${event.deviceName} (VELARIS Link, local)`,
    is_auto: event.auto,
    ...(event.lat !== null && event.lon !== null ? { lat: event.lat, lng: event.lon } : {})
  };
}
