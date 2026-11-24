import type { CopilotContext } from './context';

export type OfficerPriority = 'info' | 'warning' | 'critical';
export type OfficerTaskSource = 'inventory' | 'maintenance' | 'voyage';

export interface OfficerTask {
  id: string;
  source: OfficerTaskSource;
  priority: OfficerPriority;
  title: string;
  detail: string;
  dueAt: number | null;
}

export interface OfficerDataSet {
  rows: readonly unknown[] | null;
  error: string | null;
}

export interface OfficerBriefingInput {
  now: number;
  vessel: { id: string; name: string };
  context: CopilotContext;
  inventory: OfficerDataSet;
  maintenance: OfficerDataSet;
  voyage: { state: 'idle' | 'active' | 'pending'; startedAt: number | null };
  criticalAisTargets: number;
}

export interface OfficerBriefing {
  priority: OfficerPriority;
  headline: string;
  text: string;
  tasks: readonly OfficerTask[];
  limitations: readonly string[];
  evidence: {
    evaluatedAt: number;
    vesselId: string;
    position: { status: string; source: string | null; ageMs: number | null };
    inventoryAvailable: boolean;
    maintenanceAvailable: boolean;
  };
}

type UnknownRecord = Record<string, unknown>;

const record = (value: unknown): UnknownRecord | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : null;

const finite = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

const text = (value: unknown, fallback: string): string =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback;

const dateMs = (value: unknown): number | null => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const day = 24 * 60 * 60_000;

const OFFICER_BRIEFING_COMMANDS = new Set([
  'informe', 'informe oficial', 'estado', 'estado operativo', 'situacion'
]);

export function isOfficerBriefingCommand(value: string): boolean {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[¿?¡!.,;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (OFFICER_BRIEFING_COMMANDS.has(normalized)) return true;

  const request = normalized
    .replace(/^(?:por favor\s+)?(?:(?:dame|dime|muestrame|generame|genera|prepara|actualiza|quiero ver|quiero conocer|cual es)\s+)?(?:el\s+|un\s+|la\s+)?/, '')
    .replace(/\s+por favor$/, '')
    .replace(/\s+(?:del barco|del buque|de la embarcacion|de mi barco|de mi embarcacion)$/, '')
    .trim();

  return /^(?:informe(?: operativo| general| oficial| de situacion)?|estado(?: operativo| general| actual)?|situacion(?: operativa| actual)?)$/.test(request);
}

export function buildInventoryOfficerTasks(data: OfficerDataSet, now: number): OfficerTask[] {
  if (!data.rows) return [];
  const tasks: OfficerTask[] = [];
  for (const raw of data.rows) {
    const item = record(raw);
    if (!item) continue;
    const id = text(item.id, `inventory-${tasks.length}`);
    const name = text(item.nombre, 'Artículo sin nombre');
    const current = finite(item.cantidad_actual);
    const minimum = finite(item.cantidad_minima);
    if (current !== null && minimum !== null && current < minimum) {
      tasks.push({
        id: `inventory-low:${id}`,
        source: 'inventory',
        priority: current <= 0 ? 'critical' : 'warning',
        title: `Reponer ${name}`,
        detail: `${current} disponibles; mínimo configurado ${minimum}.`,
        dueAt: null
      });
    }
    const expiresAt = dateMs(item.fecha_caducidad);
    if (expiresAt !== null && expiresAt <= now + 30 * day) {
      const expired = expiresAt < now;
      tasks.push({
        id: `inventory-expiry:${id}`,
        source: 'inventory',
        priority: expired ? 'critical' : 'warning',
        title: `${expired ? 'Retirar/revisar' : 'Revisar caducidad de'} ${name}`,
        detail: `${expired ? 'Caducó' : 'Caduca'} el ${new Date(expiresAt).toLocaleDateString('es-ES')}.`,
        dueAt: expiresAt
      });
    }
  }
  return tasks;
}

export function buildMaintenanceOfficerTasks(data: OfficerDataSet, now: number): OfficerTask[] {
  if (!data.rows) return [];
  const tasks: OfficerTask[] = [];
  for (const raw of data.rows) {
    const item = record(raw);
    if (!item) continue;
    const id = text(item.id, `maintenance-${tasks.length}`);
    const title = text(item.tarea, 'Mantenimiento sin descripción');
    const status = text(item.estado, 'unknown').toLowerCase();
    const dueAt = dateMs(item.proxima_revision);
    const dueSoon = dueAt !== null && dueAt <= now + 30 * day;
    const flagged = status === 'warning' || status === 'danger';
    if (!dueSoon && !flagged) continue;
    const overdue = dueAt !== null && dueAt < now;
    tasks.push({
      id: `maintenance:${id}`,
      source: 'maintenance',
      priority: status === 'danger' || overdue ? 'critical' : 'warning',
      title,
      detail: dueAt === null
        ? `Estado registrado: ${status}.`
        : `${overdue ? 'Venció' : 'Próxima revisión'} el ${new Date(dueAt).toLocaleDateString('es-ES')}; estado ${status}.`,
      dueAt
    });
  }
  return tasks;
}

const priorityRank: Record<OfficerPriority, number> = { info: 0, warning: 1, critical: 2 };

export function buildOfficerBriefing(input: OfficerBriefingInput): OfficerBriefing {
  const limitations: string[] = [];
  const tasks = [
    ...buildInventoryOfficerTasks(input.inventory, input.now),
    ...buildMaintenanceOfficerTasks(input.maintenance, input.now)
  ];

  if (input.voyage.state === 'pending') {
    tasks.unshift({
      id: 'voyage:pending-recovery',
      source: 'voyage',
      priority: 'critical',
      title: 'Resolver travesía pendiente',
      detail: input.voyage.startedAt === null
        ? 'Existe una sesión local pendiente de recuperación.'
        : `Sesión iniciada el ${new Date(input.voyage.startedAt).toLocaleString('es-ES')}.`,
      dueAt: input.voyage.startedAt
    });
  }

  if (input.inventory.error) limitations.push(`Inventario no consultado: ${input.inventory.error}`);
  if (input.maintenance.error) limitations.push(`Mantenimiento no consultado: ${input.maintenance.error}`);

  const position = input.context.navigation.position;
  const positionValid = position.status === 'VALID';
  if (!positionValid) limitations.push('Posición vigente no disponible.');
  if (position.source === 'SIMULATOR') limitations.push('La posición seleccionada procede del simulador.');
  if (input.context.aisScope.streamHealth === 'unknown') limitations.push('La salud del enlace AIS no está acreditada.');

  const critical = tasks.filter(task => task.priority === 'critical').length + input.criticalAisTargets;
  const warnings = tasks.filter(task => task.priority === 'warning').length;
  const priority: OfficerPriority = critical > 0 ? 'critical' : warnings > 0 || limitations.length > 0 ? 'warning' : 'info';
  const headline = priority === 'critical'
    ? 'ATENCIÓN OPERATIVA'
    : priority === 'warning'
      ? 'CAPACIDAD LIMITADA'
      : 'SIN NOVEDADES DETECTADAS';

  const navLine = positionValid
    ? `Posición ${position.source}${position.ageMs === null ? '' : `, antigüedad ${(position.ageMs / 1000).toFixed(1)} s`}`
    : 'Posición no disponible';
  const weatherLine = input.context.weather.atmospheric.status === 'valid'
    ? `meteorología disponible (${input.context.weather.atmospheric.source})`
    : 'meteorología no disponible o caducada';
  const aisLine = `${input.context.ais.filter(target => target.status === 'valid').length} blancos AIS vigentes${input.criticalAisTargets > 0 ? `; ${input.criticalAisTargets} con alerta crítica del motor CPA` : ''}`;
  const taskLine = tasks.length === 0
    ? 'Sin tareas pendientes detectadas en las fuentes consultadas.'
    : `${tasks.length} tareas: ${tasks.slice(0, 3).map(task => task.title).join('; ')}${tasks.length > 3 ? `; y ${tasks.length - 3} más` : ''}.`;
  const limitLine = limitations.length ? `Límites: ${limitations.join(' ')}` : '';

  return {
    priority,
    headline,
    text: [
      `OFICIAL VIRTUAL · ${input.vessel.name} · ${headline}`,
      `${navLine}; ${weatherLine}; ${aisLine}.`,
      taskLine,
      limitLine
    ].filter(Boolean).join('\n'),
    tasks: tasks.sort((a, b) => priorityRank[b.priority] - priorityRank[a.priority] || (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity)),
    limitations,
    evidence: {
      evaluatedAt: input.now,
      vesselId: input.vessel.id,
      position: { status: position.status, source: position.source, ageMs: position.ageMs },
      inventoryAvailable: input.inventory.rows !== null,
      maintenanceAvailable: input.maintenance.rows !== null
    }
  };
}
