import type { ShipData } from '../../../shared/types';
export type DueStatus = 'overdue' | 'soon' | 'scheduled' | 'missing';
export function calendarDay(value: string | undefined): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const stamp = Date.UTC(year, month - 1, day);
  const date = new Date(stamp);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? stamp : null;
}
export function dueStatus(value: string | undefined, today: string): DueStatus {
  const day = calendarDay(value), now = calendarDay(today);
  if (day === null || now === null) return 'missing';
  const days = (day - now) / 86400000;
  return days < 0 ? 'overdue' : days <= 30 ? 'soon' : 'scheduled';
}
export const DOCUMENTS = [
  { id: 'docs_certificado_navegabilidad', label: 'Navegabilidad', description: 'Certificado de navegabilidad' },
  { id: 'docs_permiso_navegacion', label: 'Permiso de navegación', description: 'Permiso de navegación / Rol' },
  { id: 'docs_seguro_vigente', label: 'Seguro', description: 'Póliza y recibo', due: 'fecha_seguro' },
  { id: 'docs_itb_vigente', label: 'Inspección técnica', description: 'Documentación ITB', due: 'fecha_itb' },
  { id: 'docs_dni_tripulacion', label: 'Tripulación', description: 'DNI / Pasaporte' },
  { id: 'docs_titulacion_patron', label: 'Titulación del patrón', description: 'Acreditación náutica' },
  { id: 'docs_leb_mmsi', label: 'Radio · MMSI', description: 'Licencia de estación de barco' },
] as const;
export const REVIEWS = [
  { field: 'ultimo_mantenimiento_motor', label: 'Motor', detail: 'Último mantenimiento registrado' },
  { field: 'ultima_revision_balsa', label: 'Balsa salvavidas', detail: 'Última revisión registrada' },
  { field: 'ultima_revision_extintores', label: 'Extintores', detail: 'Última revisión registrada' },
] as const satisfies readonly { field: keyof ShipData; label: string; detail: string }[];
