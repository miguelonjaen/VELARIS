import {
  buildInventoryOfficerTasks,
  buildMaintenanceOfficerTasks,
  type OfficerDataSet,
  type OfficerTask
} from './officerBriefing';

export type LogisticsTopic = 'inventory' | 'maintenance';

export interface LogisticsReadOnlyQuery {
  topics: readonly LogisticsTopic[];
  focus: 'summary' | 'attention' | 'expiry';
}

export interface LogisticsReadOnlyInput {
  now: number;
  vessel: { id: string; name: string };
  inventory: OfficerDataSet;
  maintenance: OfficerDataSet;
}

type UnknownRecord = Record<string, unknown>;

const normalize = (value: string): string => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .trim();

const INVENTORY = /\b(inventario|existencias|stock|caduc\w*|cantidad(?:es)? minima(?:s)?)\b/;
const MAINTENANCE = /\b(mantenimientos?|revisiones?|tareas? de mantenimiento)\b/;
const READ_CUE = /^(?:que|cual(?:es)?|cuanto(?:s|as)?|hay|tenemos|queda(?:n)?|como (?:esta|estan)|muestra|lista|dime|consulta|resume|informame|indica|estado)\b/;
const MUTATION_OR_OPERATION = /\b(?:anade|agrega|crea|modifica|actualiza|elimina|borra|marca|programa|agenda|registra|cambia|establece|repone|compra|solicita|activa|desactiva|inicia|finaliza|zarpa|arriba|navega|calcula|traza|ruta|derrota|rumbo|destino|waypoint|mob)\b/;
const NON_LOGISTICS_DOMAIN = /\b(?:sog|cog|gps|ais|cpa|tcpa|colreg|viento|meteorologia|oleaje|marea|sonda|profundidad|calado)\b/;

/**
 * Closed allow-list for read-only logistics. Any operational verb, navigation
 * subject or unclear statement stays on the normal interpreter path.
 */
export function classifyReadOnlyLogisticsQuery(order: string): LogisticsReadOnlyQuery | null {
  const value = normalize(order).replace(/^[\u00bf\u00a1]+|[?!.]+$/g, '').trim();
  if (!value || value.length > 180 || !READ_CUE.test(value)) return null;
  if (MUTATION_OR_OPERATION.test(value) || NON_LOGISTICS_DOMAIN.test(value)) return null;

  const topics: LogisticsTopic[] = [];
  if (INVENTORY.test(value)) topics.push('inventory');
  if (MAINTENANCE.test(value)) topics.push('maintenance');
  if (topics.length === 0) return null;

  const focus = /\bcaduc\w*|\bvence\w*|\bvencid\w*/.test(value)
    ? 'expiry'
    : /\bpendiente\w*|\batencion\b|\balerta\w*|\bbajo\w*|\bminim\w*|\breponer\b/.test(value)
      ? 'attention'
      : 'summary';
  return { topics, focus };
}

const record = (value: unknown): UnknownRecord | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : null;

const text = (value: unknown, fallback: string): string =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback;

const finite = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

const date = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleDateString('es-ES') : null;
};

const limited = (lines: readonly string[], maximum = 20): string[] => {
  if (lines.length <= maximum) return [...lines];
  return [...lines.slice(0, maximum), `… y ${lines.length - maximum} registros más.`];
};

function inventorySummary(data: OfficerDataSet): string[] {
  if (data.error || data.rows === null) {
    return ['INVENTARIO · Error de consulta. No se puede determinar el estado registrado.'];
  }
  if (data.rows.length === 0) return ['INVENTARIO · No hay registros para la embarcación seleccionada.'];
  const lines = data.rows.flatMap((raw): string[] => {
    const item = record(raw);
    if (!item) return [];
    const current = finite(item.cantidad_actual);
    const minimum = finite(item.cantidad_minima);
    const unit = text(item.unidad, 'uds.');
    const expiry = date(item.fecha_caducidad);
    return [`• ${text(item.nombre, 'Artículo sin nombre')}: ${current === null ? 'cantidad no registrada' : `${current} ${unit}`}${minimum === null ? '' : `; mínimo ${minimum} ${unit}`}${expiry ? `; caduca ${expiry}` : ''}.`];
  });
  return lines.length === 0
    ? ['INVENTARIO · Hay registros, pero su formato no es interpretable.']
    : ['INVENTARIO', ...limited(lines)];
}

function maintenanceSummary(data: OfficerDataSet): string[] {
  if (data.error || data.rows === null) {
    return ['MANTENIMIENTO · Error de consulta. No se puede determinar el estado registrado.'];
  }
  if (data.rows.length === 0) return ['MANTENIMIENTO · No hay registros para la embarcación seleccionada.'];
  const lines = data.rows.flatMap((raw): string[] => {
    const item = record(raw);
    if (!item) return [];
    const status = text(item.estado, 'sin estado').toLowerCase();
    const next = date(item.proxima_revision);
    return [`• ${text(item.tarea, 'Tarea sin descripción')}: estado ${status}${next ? `; próxima revisión ${next}` : '; sin próxima revisión registrada'}.`];
  });
  return lines.length === 0
    ? ['MANTENIMIENTO · Hay registros, pero su formato no es interpretable.']
    : ['MANTENIMIENTO', ...limited(lines)];
}

function taskLines(title: string, data: OfficerDataSet, tasks: readonly OfficerTask[]): string[] {
  if (data.error || data.rows === null) return [`${title} · Error de consulta. No se puede determinar si hay elementos que requieren atención.`];
  if (data.rows.length === 0) return [`${title} · No hay registros para la embarcación seleccionada.`];
  if (tasks.length === 0) return [`${title} · No se detectan elementos que requieran atención con los criterios registrados.`];
  return [title, ...limited(tasks.map(task => `• ${task.title}: ${task.detail}`))];
}

export function buildLogisticsReadOnlyAnswer(query: LogisticsReadOnlyQuery, input: LogisticsReadOnlyInput): string {
  const sections: string[] = [`OFICIAL IA · ${input.vessel.name} · CONSULTA DE SOLO LECTURA`];
  for (const topic of query.topics) {
    if (topic === 'inventory') {
      const tasks = buildInventoryOfficerTasks(input.inventory, input.now)
        .filter(task => query.focus !== 'expiry' || task.id.startsWith('inventory-expiry:'));
      sections.push(...(query.focus === 'summary'
        ? inventorySummary(input.inventory)
        : taskLines(query.focus === 'expiry' ? 'CADUCIDADES DE INVENTARIO' : 'INVENTARIO · ATENCIÓN', input.inventory, tasks)));
    } else {
      const tasks = buildMaintenanceOfficerTasks(input.maintenance, input.now);
      sections.push(...(query.focus === 'summary'
        ? maintenanceSummary(input.maintenance)
        : taskLines('MANTENIMIENTO · ATENCIÓN', input.maintenance, tasks)));
    }
  }
  sections.push('Fuente: registros del buque seleccionado. No se ha modificado ningún dato.');
  return sections.join('\n');
}
