import type { LogEntry } from '../../shared/types';
export interface ManualBoatEvent {
  version: 1;
  vesselId: string;
  equipmentId: string;
  label: string;
  at: string;
  origin: 'desktop.manual';
  result: 'declared';
  previous: boolean | null;
  value: boolean;
}
const PREFIX = 'GAULOS_MANUAL_V1\n';
export const serializeManualBoatEvent = (event: ManualBoatEvent): string => PREFIX + JSON.stringify(event);
export function parseManualBoatEvent(text: string): ManualBoatEvent | null {
  if (!text.startsWith(PREFIX)) return null;
  try {
    const value: unknown = JSON.parse(text.slice(PREFIX.length));
    if (!value || typeof value !== 'object') return null;
    const e = value as Record<string, unknown>;
    if (e.version !== 1 || typeof e.vesselId !== 'string' || !e.vesselId || typeof e.equipmentId !== 'string' || !e.equipmentId || typeof e.label !== 'string' || typeof e.at !== 'string' || !Number.isFinite(Date.parse(e.at)) || e.origin !== 'desktop.manual' || e.result !== 'declared' || typeof e.value !== 'boolean' || !(e.previous === null || typeof e.previous === 'boolean')) return null;
    return e as unknown as ManualBoatEvent;
  } catch { return null; }
}
/** The journal remains the source of manual state; no second persistent register. */
export function manualBoatState(entries: readonly LogEntry[], vesselId: string): ReadonlyMap<string, ManualBoatEvent> {
  const state = new Map<string, ManualBoatEvent>();
  for (const entry of entries) {
    if (String(entry.barco_id) !== vesselId) continue;
    const e = parseManualBoatEvent(entry.descripcion);
    if (!e || e.vesselId !== vesselId) continue;
    const previous = state.get(e.equipmentId);
    if (!previous || Date.parse(e.at) > Date.parse(previous.at)) state.set(e.equipmentId, e);
  }
  return state;
}

export function describeManualBoatEvent(text: string): string {
  const e = parseManualBoatEvent(text);
  return e ? `${e.label}: ${e.value ? 'activo' : 'inactivo'}. Declaración manual del patrón, sin orden física. Embarcación: ${e.vesselId}. Hora: ${new Date(e.at).toLocaleString()}. Origen: Desktop manual. Resultado: declarado. Estado anterior: ${e.previous === null ? 'desconocido' : e.previous ? 'activo' : 'inactivo'}.` : text;
}
