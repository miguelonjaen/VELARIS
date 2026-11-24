import type { SupabaseClient } from '@supabase/supabase-js';
import type { LogEntry } from '../shared/types';

// The DATE column is the journal day; created_at is only a legacy fallback.
export function logbookDate(entry: Pick<LogEntry, 'fecha' | 'created_at'>): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(entry.fecha || '')) return entry.fecha;
  const date = new Date(entry.created_at || entry.fecha);
  if (!Number.isFinite(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function isPersistentLogEntry(id: LogEntry['id']): boolean {
  return !/^(link:|trial:|auto:)/.test(String(id));
}

/** Delete only the confirmed snapshot, scoped to its vessel. Never touches voyage storage. */
export async function deleteLogbookEntries(client: SupabaseClient, shipId: string | number, ids: LogEntry['id'][]): Promise<LogEntry['id'][]> {
  if (String(shipId).trim() === '' || !ids.length || ids.some(id => !String(id).trim() || !isPersistentLogEntry(id))) {
    throw new Error('Selección de borrado inválida.');
  }
  const { data, error } = await client.from('bitacora').delete().eq('barco_id', shipId).in('id', [...new Set(ids)]).select('id');
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error('No se eliminó ningún registro. Puede que ya no exista o que la sesión/permisos RLS no permitan borrarlo.');
  return data.map((row: {id: LogEntry['id']}) => row.id);
}


const EXCLUSIONS_KEY = 'GAULOS_logbook_exclusions_v1';

type Exclusions = Record<string, string[]>;

function readExclusions(): Exclusions {
  const raw = localStorage.getItem(EXCLUSIONS_KEY);
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([, ids]) => Array.isArray(ids))
      .map(([ship, ids]) => [ship, (ids as unknown[]).filter((id): id is string => typeof id === 'string')]));
  } catch { return {}; }
}

export function excludedLogbookIds(shipId: string | number | null): ReadonlySet<string> {
  return new Set(shipId === null ? [] : readExclusions()[String(shipId)] ?? []);
}

export function excludeLogbookIds(shipId: string | number, ids: readonly string[]): void {
  const current = readExclusions();
  const ship = String(shipId);
  current[ship] = [...new Set([...(current[ship] ?? []), ...ids])];
  localStorage.setItem(EXCLUSIONS_KEY, JSON.stringify(current));
}
