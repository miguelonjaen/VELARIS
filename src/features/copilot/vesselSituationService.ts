import type { OfficerTask } from './officerBriefing';
import {
  VesselSituationEngine,
  type SituationEvidence,
  type VesselSituationInput,
  type VesselSituationSnapshot
} from './vesselSituationEngine';
import { WatchProfileEngine, type WatchProfileSnapshot } from './watchProfileEngine';

export type OfficerAlertPriority = 'INFO' | 'ADVISORY' | 'WARNING' | 'CRITICAL';
export type OfficerAlertStatus = 'active' | 'acknowledged' | 'resolved';
export type SurveillanceCapability = 'OPERATIVE' | 'LIMITED' | 'INSUFFICIENT';

export interface OfficerAlert {
  id: string;
  category: 'NAVIGATION' | 'ANCHOR' | 'PROPULSION' | 'ENERGY' | 'SAFETY' | 'LOGISTICS' | 'SYSTEM';
  priority: OfficerAlertPriority;
  vesselId: string;
  evidence: readonly SituationEvidence[];
  source: string;
  detectedAt: number;
  updatedAt: number;
  recommendation: string;
  message: string;
  status: OfficerAlertStatus;
  acknowledgedAt: number | null;
  resolvedAt: number | null;
}

export interface ExistingAlarmInput { type: string; severity: string; message: string; timestamp: number }
export interface AisRiskInput { id: string; label: string; riskLevel: string; valid: boolean; cpaNm: number | null; tcpaMinutes: number | null }

export interface VesselWatchInput {
  situation: VesselSituationInput;
  existingAlarms: readonly ExistingAlarmInput[];
  aisRisks: readonly AisRiskInput[];
  watch?: {
    simulated: boolean;
    night: boolean;
    restrictedVisibility: boolean;
    adverseWeather: boolean;
    degradedInstrumentation: boolean;
  };
}

export interface SituationMonitorSnapshot extends VesselSituationSnapshot {
  capability: SurveillanceCapability;
  activeAnomalies: number;
  alerts: readonly OfficerAlert[];
  notifications: readonly OfficerAlert[];
  logisticsEvaluatedAt: number | null;
  watchProfile: WatchProfileSnapshot;
}

export interface OperationalMemoryStorage {
  load(vesselId: string): StoredOperationalMemory | null;
  save(vesselId: string, memory: StoredOperationalMemory): void;
}

export interface StoredOperationalMemory {
  alerts: readonly OfficerAlert[];
  logistics: { tasks: readonly OfficerTask[]; evaluatedAt: number } | null;
  transitions: readonly { at: number; dimension: string; from: string | null; to: string }[];
  lastSituation: VesselSituationSnapshot | null;
}

interface VesselMemory {
  alerts: Map<string, OfficerAlert>;
  logistics: { tasks: readonly OfficerTask[]; evaluatedAt: number } | null;
  transitions: Array<{ at: number; dimension: string; from: string | null; to: string }>;
  lastSituation: VesselSituationSnapshot | null;
}

const MAX_ALERTS = 96;
const MAX_TRANSITIONS = 48;
const REACTIVATION_COOLDOWN_MS = 10 * 60_000;

const priorityFor = (severity: string): OfficerAlertPriority => severity === 'critical' ? 'CRITICAL' : severity === 'warning' ? 'WARNING' : 'ADVISORY';
const categoryForAlarm = (type: string): OfficerAlert['category'] => {
  if (type.includes('anchor')) return 'ANCHOR';
  if (type.includes('engine') || type.includes('oil')) return 'PROPULSION';
  if (type.includes('battery')) return 'ENERGY';
  if (type.includes('ais') || type === 'depth') return 'NAVIGATION';
  return 'SAFETY';
};

function evidence(id: string, now: number, source: string, detail: string): SituationEvidence {
  return { id, kind: 'inferred', source, observedAt: now, ageMs: 0, detail };
}

function desiredAlerts(input: VesselWatchInput, snapshot: VesselSituationSnapshot, logistics: VesselMemory['logistics']): OfficerAlert[] {
  const { vesselId, now, navigation, anchor, voyage } = input.situation;
  const alerts: OfficerAlert[] = [];
  const add = (alert: Omit<OfficerAlert, 'vesselId' | 'detectedAt' | 'updatedAt' | 'status' | 'acknowledgedAt' | 'resolvedAt'>): void => {
    alerts.push({ ...alert, vesselId, detectedAt: now, updatedAt: now, status: 'active', acknowledgedAt: null, resolvedAt: null });
  };

  if (navigation.position.status !== 'VALID' && (voyage.active || anchor.active)) add({
    id: 'navigation:gps-unavailable', category: 'NAVIGATION', priority: 'WARNING',
    evidence: [evidence('navigation:position', now, 'SharedNavigationState', 'No existe posición vigente seleccionable.')],
    source: 'SharedNavigationState',
    message: 'Se ha perdido la posición GPS vigente. La vigilancia de navegación está limitada.',
    recommendation: 'Compruebe receptor, enlace y fuente seleccionada; mantenga vigilancia por medios independientes.'
  });

  if (snapshot.situation.value === 'DRIFTING' && anchor.active) add({
    id: 'anchor:possible-drag', category: 'ANCHOR', priority: 'CRITICAL',
    evidence: snapshot.situation.evidence, source: 'vigilancia de fondeo existente',
    message: 'Se detecta desplazamiento fuera del criterio de fondeo configurado.',
    recommendation: 'Compruebe inmediatamente posición, borneo, fondo y posible garreo.'
  });

  for (const alarm of input.existingAlarms.filter(value => value.severity !== 'normal' && value.type !== 'ais_collision')) add({
    id: `system:${alarm.type}`, category: categoryForAlarm(alarm.type), priority: priorityFor(alarm.severity),
    evidence: [{ id: `alarm:${alarm.type}`, kind: 'measured', source: 'SmartShip Shield / motor de alarma existente', observedAt: alarm.timestamp, ageMs: Math.max(0, now - alarm.timestamp), detail: alarm.message }],
    source: 'alarma existente de GAULOS', message: alarm.message,
    recommendation: 'Atienda el procedimiento y la instrumentación asociados a esta alarma.'
  });

  for (const target of input.aisRisks.filter(value => value.valid && (value.riskLevel === 'CRITICAL' || value.riskLevel === 'WARNING'))) add({
    id: `ais:${target.id}`, category: 'NAVIGATION', priority: target.riskLevel === 'CRITICAL' ? 'CRITICAL' : 'WARNING',
    evidence: [evidence(`ais:${target.id}`, now, 'AisCollisionRisk', `${target.label}; CPA ${target.cpaNm?.toFixed(2) ?? '?'} NM; TCPA ${target.tcpaMinutes?.toFixed(1) ?? '?'} min.`)],
    source: 'AisCollisionRisk existente',
    message: `El objetivo AIS ${target.label} presenta riesgo ${target.riskLevel.toLowerCase()} según el motor existente.`,
    recommendation: 'Evalúe visualmente el encuentro y aplique COLREG; el Oficial no gobierna el buque.'
  });

  for (const task of logistics?.tasks ?? []) add({
    id: `logistics:${task.id}`, category: 'LOGISTICS', priority: task.priority === 'critical' ? 'CRITICAL' : task.priority === 'warning' ? 'WARNING' : 'ADVISORY',
    evidence: [evidence(`logistics:${task.id}`, logistics?.evaluatedAt ?? now, task.source, task.detail)],
    source: task.source === 'inventory' ? 'inventario del buque' : 'mantenimiento del buque',
    message: task.title,
    recommendation: task.detail
  });
  return alerts;
}

function capability(input: VesselWatchInput, snapshot: VesselSituationSnapshot, alerts: readonly OfficerAlert[]): SurveillanceCapability {
  const noNavigation = input.situation.navigation.position.status !== 'VALID' && input.situation.navigation.sog.status !== 'VALID';
  const noInstruments = input.situation.instruments.engines.length === 0 && input.situation.instruments.batteries.length === 0
    && input.situation.instruments.depth === null && input.situation.instruments.windApparent === null;
  if (noNavigation && noInstruments) return 'INSUFFICIENT';
  if (snapshot.situation.limitations.length || snapshot.propulsion.limitations.length || alerts.some(alert => alert.priority !== 'INFO')) return 'LIMITED';
  return 'OPERATIVE';
}

export class BrowserOperationalMemoryStorage implements OperationalMemoryStorage {
  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'>, private readonly prefix = 'gaulos:officer-memory:v2:') {}
  load(vesselId: string): StoredOperationalMemory | null {
    try {
      const parsed: unknown = JSON.parse(this.storage.getItem(this.prefix + vesselId) ?? 'null');
      const validAlert = (value: unknown): value is OfficerAlert => Boolean(value && typeof value === 'object'
        && 'id' in value && typeof (value as { id?: unknown }).id === 'string'
        && 'vesselId' in value && (value as { vesselId?: unknown }).vesselId === vesselId
        && 'status' in value && ['active', 'acknowledged', 'resolved'].includes(String((value as { status?: unknown }).status)));
      if (Array.isArray(parsed)) return { alerts: parsed.filter(validAlert).slice(-MAX_ALERTS), logistics: null, transitions: [], lastSituation: null };
      if (!parsed || typeof parsed !== 'object') return null;
      const value = parsed as Partial<StoredOperationalMemory>;
      return {
        alerts: Array.isArray(value.alerts) ? value.alerts.filter(validAlert).slice(-MAX_ALERTS) : [],
        logistics: value.logistics && Array.isArray(value.logistics.tasks) && Number.isFinite(value.logistics.evaluatedAt)
          ? { tasks: value.logistics.tasks.slice(0, 64), evaluatedAt: value.logistics.evaluatedAt } : null,
        transitions: Array.isArray(value.transitions) ? value.transitions.slice(-MAX_TRANSITIONS) : [],
        lastSituation: value.lastSituation?.vesselId === vesselId ? value.lastSituation : null
      };
    } catch { return null; }
  }
  save(vesselId: string, memory: StoredOperationalMemory): void {
    try { this.storage.setItem(this.prefix + vesselId, JSON.stringify({ ...memory, alerts: memory.alerts.slice(-MAX_ALERTS), transitions: memory.transitions.slice(-MAX_TRANSITIONS) })); } catch { /* memoria operativa continúa en RAM */ }
  }
}

export class VesselSituationService {
  private readonly engine: VesselSituationEngine;
  private readonly watchProfiles = new WatchProfileEngine();
  private readonly vessels = new Map<string, VesselMemory>();
  constructor(private readonly storage?: OperationalMemoryStorage, engine?: VesselSituationEngine) {
    this.engine = engine ?? new VesselSituationEngine();
  }

  private memory(vesselId: string): VesselMemory {
    const existing = this.vessels.get(vesselId); if (existing) return existing;
    const stored = this.storage?.load(vesselId);
    const alerts = new Map((stored?.alerts ?? []).map(alert => [alert.id, alert]));
    const created: VesselMemory = { alerts, logistics: stored?.logistics ?? null,
      transitions: [...(stored?.transitions ?? [])], lastSituation: stored?.lastSituation ?? null };
    this.vessels.set(vesselId, created); return created;
  }

  setLogistics(vesselId: string, tasks: readonly OfficerTask[], evaluatedAt: number): void {
    const memory = this.memory(vesselId);
    memory.logistics = { tasks: tasks.slice(0, 64), evaluatedAt };
    this.persist(vesselId, memory);
  }

  acknowledge(vesselId: string, alertId: string, now = Date.now()): boolean {
    const memory = this.memory(vesselId), alert = memory.alerts.get(alertId);
    if (!alert || alert.status === 'resolved') return false;
    memory.alerts.set(alertId, { ...alert, status: 'acknowledged', acknowledgedAt: now, updatedAt: now });
    this.persist(vesselId, memory); return true;
  }

  evaluate(input: VesselWatchInput): SituationMonitorSnapshot {
    const memory = this.memory(input.situation.vesselId);
    const situation = this.engine.evaluate(input.situation);
    const previous = memory.lastSituation;
    for (const dimension of ['situation', 'propulsion', 'context'] as const) {
      const before = previous?.[dimension].value ?? null, after = situation[dimension].value;
      if (before !== after) memory.transitions.push({ at: input.situation.now, dimension, from: before, to: after });
    }
    memory.transitions = memory.transitions.slice(-MAX_TRANSITIONS);
    memory.lastSituation = situation;

    const wanted = desiredAlerts(input, situation, memory.logistics);
    const wantedIds = new Set(wanted.map(alert => alert.id));
    const notifications: OfficerAlert[] = [];
    for (const desired of wanted) {
      const old = memory.alerts.get(desired.id);
      if (!old || old.status === 'resolved') {
        memory.alerts.set(desired.id, desired);
        if (!old || desired.id.startsWith('ais:') || desired.priority === 'CRITICAL' || old.resolvedAt === null
          || input.situation.now - old.resolvedAt >= REACTIVATION_COOLDOWN_MS) notifications.push(desired);
        continue;
      }
      // Changing measured text (CPA, voltage, etc.) updates evidence without creating
      // terminal spam. Only a priority transition re-notifies an active condition.
      const changed = old.priority !== desired.priority;
      const escalated = desired.priority === 'CRITICAL' &&
        old.priority !== 'CRITICAL';

      const next: OfficerAlert = {
        ...desired,
        detectedAt: old.detectedAt,
        status: escalated ? 'active' : old.status,
        acknowledgedAt: escalated ? null : old.acknowledgedAt
      };

      memory.alerts.set(desired.id, next);

      if (escalated || (changed && old.status !== 'acknowledged')) {
        notifications.push(next);
      }
    }
    for (const [id, old] of memory.alerts) {
      if (old.status === 'resolved' || wantedIds.has(id)) continue;
      const isAis = id.startsWith('ais:');
      const legacyAggregate = id === 'system:ais_collision';

      const target = isAis
        ? input.aisRisks.find(value => `ais:${value.id}` === id)
        : null;

      const unavailable = isAis && (!target || !target.valid);

      const resolved: OfficerAlert = {
        ...old,
        status: 'resolved',
        resolvedAt: input.situation.now,
        updatedAt: input.situation.now,
        message: legacyAggregate
          ? 'Aviso AIS agregado sustituido por vigilancia individual.'
          : unavailable
            ? `${old.message} Evaluacion interrumpida: datos AIS no disponibles. Riesgo no descartado.`
            : `${old.message} Condici\u00f3n recuperada.`,
        recommendation: unavailable
          ? 'Mantenga vigilancia independiente. No se ha confirmado la desaparicion del riesgo.'
          : 'Verifique la estabilidad de la recuperacion.'
      };

      memory.alerts.set(id, resolved);

      if (!legacyAggregate) notifications.push(resolved);
    }
    this.persist(input.situation.vesselId, memory);
    const alerts = [...memory.alerts.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_ALERTS);
    const active = alerts.filter(alert => alert.status !== 'resolved');
    const watchProfile = this.watchProfiles.evaluate({
      vesselId: input.situation.vesselId,
      now: input.situation.now,
      situation,
      simulated: input.watch?.simulated ?? false,
      night: input.watch?.night ?? false,
      restrictedVisibility: input.watch?.restrictedVisibility ?? false,
      adverseWeather: input.watch?.adverseWeather ?? false,
      degradedInstrumentation: input.watch?.degradedInstrumentation ?? capability(input, situation, active) !== 'OPERATIVE'
    });
    return { ...situation, capability: capability(input, situation, active), activeAnomalies: active.length,
      alerts, notifications, logisticsEvaluatedAt: memory.logistics?.evaluatedAt ?? null, watchProfile };
  }

  private persist(vesselId: string, memory: VesselMemory): void {
    if (memory.alerts.size > MAX_ALERTS) {
      const keep = [...memory.alerts.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_ALERTS);
      memory.alerts = new Map(keep.map(alert => [alert.id, alert]));
    }
    this.storage?.save(vesselId, {
      alerts: [...memory.alerts.values()], logistics: memory.logistics,
      transitions: memory.transitions, lastSituation: memory.lastSituation
    });
  }
}
