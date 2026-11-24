import type { BoatInstrumentSnapshot } from '../../core/instruments/BoatInstrumentStore';
import type { ResolvedNavigationState } from '../../core/navigation/SharedNavigationState';

export type VesselSituation = 'UNKNOWN' | 'BERTHED' | 'ANCHORED' | 'UNDERWAY' | 'STATIONARY' | 'DRIFTING' | 'MANEUVERING';
export type PropulsionSystem = 'UNKNOWN' | 'NONE' | 'ENGINE' | 'SAIL' | 'MOTOR_SAILING';
export type OperationalContext = 'NORMAL' | 'PREPARING_DEPARTURE' | 'ACTIVE_VOYAGE' | 'APPROACHING_DESTINATION' | 'ARRIVAL' | 'EMERGENCY';
export type EvidenceKind = 'measured' | 'declared' | 'configured' | 'inferred' | 'simulated';

export interface SituationEvidence {
  id: string;
  kind: EvidenceKind;
  source: string;
  observedAt: number;
  ageMs: number;
  detail: string;
}

export interface DimensionState<T extends string> {
  value: T;
  confidence: number;
  evidence: readonly SituationEvidence[];
  observedAt: number;
  ageMs: number;
  reason: string;
  limitations: readonly string[];
  transitionedAt: number;
  previous: { value: T; transitionedAt: number } | null;
}

export interface VesselSituationInput {
  vesselId: string;
  now: number;
  navigation: ResolvedNavigationState;
  instruments: BoatInstrumentSnapshot;
  instrumentSource?: 'BOAT' | 'SIMULATOR' | 'MIXED';
  manualPropulsion: boolean | null;
  propulsionNoneDeclared?: boolean;
  voyage: { active: boolean; pending: boolean; arrived: boolean; destinationDistanceNm: number | null; routeConfigured: boolean };
  anchor: { active: boolean; positionConfirmed: boolean; distanceMeters: number | null; radiusMeters: number | null; trend: 'stable' | 'drifting' | 'swinging' | null };
  berth: { confirmed: boolean; source: string; observedAt: number } | null;
  emergency: boolean;
}

export interface VesselSituationSnapshot {
  vesselId: string;
  evaluatedAt: number;
  situation: DimensionState<VesselSituation>;
  propulsion: DimensionState<PropulsionSystem>;
  context: DimensionState<OperationalContext>;
}

export interface SituationEngineOptions {
  confirmations: number;
  confirmationMs: number;
  underwaySogKn: number;
  stationarySogKn: number;
  maneuveringMaxSogKn: number;
  approachDistanceNm: number;
}

const DEFAULTS: SituationEngineOptions = {
  confirmations: 2,
  confirmationMs: 3_000,
  underwaySogKn: 0.8,
  stationarySogKn: 0.2,
  maneuveringMaxSogKn: 3,
  approachDistanceNm: 0.5
};

interface Candidate<T extends string> {
  value: T;
  confidence: number;
  evidence: SituationEvidence[];
  reason: string;
  limitations: string[];
  urgent?: boolean;
}

interface Pending<T extends string> { value: T; since: number; count: number }
interface DimensionRuntime<T extends string> { state: DimensionState<T> | null; pending: Pending<T> | null }
interface VesselRuntime {
  situation: DimensionRuntime<VesselSituation>;
  propulsion: DimensionRuntime<PropulsionSystem>;
  context: DimensionRuntime<OperationalContext>;
}

const clamp = (value: number): number => Math.max(0, Math.min(1, value));
const age = (value: number | null): number => value === null || !Number.isFinite(value) ? 0 : Math.max(0, value);

function navEvidence(input: VesselSituationInput, field: keyof ResolvedNavigationState, detail: string): SituationEvidence | null {
  const reading = input.navigation[field];
  if (reading.status !== 'VALID' || reading.observedAt === null || reading.source === null) return null;
  return {
    id: `navigation:${field}`,
    kind: reading.source === 'SIMULATOR' ? 'simulated' : 'measured',
    source: `${reading.source}:${reading.sourceId ?? 'unknown'}`,
    observedAt: reading.observedAt,
    ageMs: age(reading.ageMs),
    detail
  };
}

function configured(id: string, now: number, source: string, detail: string, kind: EvidenceKind = 'configured'): SituationEvidence {
  return { id, kind, source, observedAt: now, ageMs: 0, detail };
}

function classifySituation(input: VesselSituationInput, options: SituationEngineOptions): Candidate<VesselSituation> {
  const position = input.navigation.position;
  const sog = input.navigation.sog;
  const evidence: SituationEvidence[] = [];
  const limitations: string[] = [];
  if (position.status !== 'VALID') limitations.push('Posición vigente no disponible.');
  if (sog.status !== 'VALID' || sog.value === null) limitations.push('SOG vigente no disponible.');
  if (position.source === 'SIMULATOR') limitations.push('La posición procede del simulador NMEA.');
  const sogValue = sog.status === 'VALID' ? sog.value : null;

  if (input.anchor.active && input.anchor.positionConfirmed) {
    evidence.push(configured('anchor:watch', input.now, 'vigilancia de fondeo', 'Punto de fondeo confirmado por el operador.'));
    if (input.anchor.trend === 'drifting' || (input.anchor.distanceMeters !== null && input.anchor.radiusMeters !== null && input.anchor.distanceMeters > input.anchor.radiusMeters)) {
      evidence.push(configured('anchor:drift', input.now, 'motor de fondeo existente', `Desplazamiento ${input.anchor.distanceMeters?.toFixed(0) ?? '?'} m; radio ${input.anchor.radiusMeters?.toFixed(0) ?? '?'} m.`, 'inferred'));
      return { value: 'DRIFTING', confidence: 0.94, evidence, limitations, reason: 'La vigilancia de fondeo existente detecta desplazamiento fuera de criterio.', urgent: true };
    }
    if (position.status === 'VALID' && sogValue !== null && sogValue <= 0.5) {
      const fix = navEvidence(input, 'position', 'Posición válida para vigilancia de fondeo.'); if (fix) evidence.push(fix);
      const speed = navEvidence(input, 'sog', `SOG ${sogValue.toFixed(2)} kn.`); if (speed) evidence.push(speed);
      return { value: 'ANCHORED', confidence: 0.86, evidence, limitations, reason: 'Fondeo declarado, posición vigente y movimiento compatible dentro del radio configurado.' };
    }
    limitations.push('Fondeo activado sin posición/SOG suficientes para confirmar estabilidad.');
  }

  if (input.berth?.confirmed) {
    evidence.push({ id: 'berth:confirmed', kind: 'declared', source: input.berth.source, observedAt: input.berth.observedAt, ageMs: age(input.now - input.berth.observedAt), detail: 'Atraque confirmado por una fuente explícita.' });
    if (position.status === 'VALID' && sogValue !== null && sogValue <= options.stationarySogKn) {
      const speed = navEvidence(input, 'sog', `SOG ${sogValue.toFixed(2)} kn.`); if (speed) evidence.push(speed);
      return { value: 'BERTHED', confidence: 0.9, evidence, limitations, reason: 'Atraque confirmado y movimiento compatible.' };
    }
    limitations.push('La evidencia cinemática no confirma el atraque declarado.');
  }

  if (sogValue !== null) {
    const speed = navEvidence(input, 'sog', `SOG ${sogValue.toFixed(2)} kn.`); if (speed) evidence.push(speed);
    if (input.voyage.active && input.voyage.routeConfigured && sogValue > options.stationarySogKn && sogValue <= options.maneuveringMaxSogKn) {
      evidence.push(configured('voyage:active', input.now, 'TripLogger/GaulosCore', 'Travesía y derrota activas.'));
      return { value: 'MANEUVERING', confidence: 0.78, evidence, limitations, reason: 'Movimiento moderado durante una travesía con derrota activa.' };
    }
    if (sogValue >= options.underwaySogKn) {
      return { value: 'UNDERWAY', confidence: position.status === 'VALID' ? 0.88 : 0.68, evidence, limitations, reason: 'SOG vigente por encima del umbral de navegación.' };
    }
    if (position.status === 'VALID' && sogValue <= options.stationarySogKn) {
      return { value: 'STATIONARY', confidence: 0.72, evidence, limitations, reason: 'Posición y SOG vigentes indican movimiento mínimo; no implica atraque ni fondeo.' };
    }
  }
  return { value: 'UNKNOWN', confidence: 0.2, evidence, limitations, reason: 'No existe evidencia vigente suficiente para clasificar la situación.' };
}

function classifyPropulsion(input: VesselSituationInput): Candidate<PropulsionSystem> {
  const measured = input.instruments.engines.length ? input.instruments.engines.some(engine => engine.rpm && Math.abs(engine.rpm.value) > 0)
    : null;
  const allStopped = input.instruments.engines.length > 0 && input.instruments.engines.every(engine => engine.rpm?.value === 0);
  const evidence: SituationEvidence[] = [];
  const limitations: string[] = [];
  for (const engine of input.instruments.engines.filter(value => value.rpm)) {
    const simulated = input.instrumentSource === 'SIMULATOR' || input.instrumentSource === 'MIXED';
    evidence.push(configured(`engine:${engine.engine}:rpm`, input.now - (engine.rpm?.ageMs ?? 0), simulated ? 'SIMULATOR:BoatInstrumentStore' : 'BOAT:BoatInstrumentStore', `Motor ${engine.engine}: ${engine.rpm?.value.toFixed(0)} RPM.`, simulated ? 'simulated' : 'measured'));
  }
  if (input.instrumentSource === 'SIMULATOR' || input.instrumentSource === 'MIXED') limitations.push('La clasificación utiliza instrumentación procedente del simulador NMEA.');
  if (input.manualPropulsion !== null) evidence.push(configured('propulsion:manual', input.now, 'declaración manual del barco', input.manualPropulsion ? 'Propulsión a motor declarada.' : 'Propulsión a vela declarada.', 'declared'));
  if (input.propulsionNoneDeclared) return { value: 'NONE', confidence: 0.7, evidence: [...evidence, configured('propulsion:none', input.now, 'declaración manual', 'Sin propulsión declarada.', 'declared')], limitations, reason: 'Ausencia de propulsión declarada explícitamente.' };
  if (measured) {
    if (input.manualPropulsion === false) return { value: 'MOTOR_SAILING', confidence: 0.82, evidence, limitations, reason: 'RPM medidas con propulsión a vela declarada.' };
    return { value: 'ENGINE', confidence: 0.96, evidence, limitations, reason: 'RPM vigentes confirman motor en marcha.' };
  }
  if (allStopped && input.manualPropulsion === false) return { value: 'SAIL', confidence: 0.72, evidence, limitations, reason: 'RPM vigentes a cero y vela declarada; no acredita velas izadas físicamente.' };
  if (allStopped && input.manualPropulsion === true) {
    limitations.push('Conflicto: motor declarado, pero RPM vigentes a cero.');
    return { value: 'UNKNOWN', confidence: 0.25, evidence, limitations, reason: 'Telemetría y declaración de propulsión son contradictorias.' };
  }
  if (input.manualPropulsion === true) return { value: 'ENGINE', confidence: 0.55, evidence, limitations: ['Sin RPM vigentes que confirmen el estado físico del motor.'], reason: 'Propulsión a motor declarada manualmente.' };
  if (input.manualPropulsion === false) return { value: 'SAIL', confidence: 0.5, evidence, limitations: ['Declaración manual; no existen sensores de configuración vélica.'], reason: 'Propulsión a vela declarada manualmente.' };
  return { value: 'UNKNOWN', confidence: 0.15, evidence, limitations: ['Sin RPM vigentes ni declaración de propulsión.'], reason: 'No existe evidencia suficiente para clasificar la propulsión.' };
}

function classifyContext(input: VesselSituationInput): Candidate<OperationalContext> {
  const evidence: SituationEvidence[] = [];
  const limitations: string[] = [];
  if (input.emergency) return { value: 'EMERGENCY', confidence: 1, evidence: [configured('emergency', input.now, 'estado de emergencia existente', 'Emergencia activa.')], limitations, reason: 'Un sistema existente mantiene una emergencia activa.', urgent: true };
  if (input.voyage.arrived) return { value: 'ARRIVAL', confidence: 0.95, evidence: [configured('voyage:arrival', input.now, 'GaulosCore/TripLogger', 'Llegada registrada.')], limitations, reason: 'El motor de navegación existente registra llegada.' };
  if (input.voyage.active) {
    evidence.push(configured('voyage:active', input.now, 'TripLogger', 'Travesía activa.'));
    if (input.voyage.destinationDistanceNm !== null && input.voyage.destinationDistanceNm <= DEFAULTS.approachDistanceNm) {
      evidence.push(configured('route:approach', input.now, 'GaulosCore', `Destino a ${input.voyage.destinationDistanceNm.toFixed(2)} NM.`));
      return { value: 'APPROACHING_DESTINATION', confidence: 0.9, evidence, limitations, reason: 'Travesía activa dentro del umbral de aproximación.' };
    }
    return { value: 'ACTIVE_VOYAGE', confidence: 0.95, evidence, limitations, reason: 'TripLogger mantiene una travesía activa.' };
  }
  if (input.voyage.pending) return { value: 'PREPARING_DEPARTURE', confidence: 0.6, evidence: [configured('voyage:pending', input.now, 'TripLogger', 'Existe una travesía pendiente de recuperación.')], limitations: ['La sesión pendiente no acredita que el barco esté listo para zarpar.'], reason: 'Existe preparación o recuperación operativa pendiente.' };
  if (input.voyage.routeConfigured) return { value: 'PREPARING_DEPARTURE', confidence: 0.55, evidence: [configured('route:configured', input.now, 'GaulosCore', 'Existe una derrota configurada.')], limitations: ['Una derrota configurada no acredita preparación física para zarpar.'], reason: 'Hay planificación activa sin travesía iniciada.' };
  return { value: 'NORMAL', confidence: 0.65, evidence, limitations, reason: 'No hay travesía, llegada ni emergencia registradas.' };
}

function transition<T extends string>(runtime: DimensionRuntime<T>, candidate: Candidate<T>, now: number, options: SituationEngineOptions): DimensionState<T> {
  const current = runtime.state;
  const commit = (): DimensionState<T> => {
    const next: DimensionState<T> = {
      value: candidate.value,
      confidence: clamp(candidate.confidence), evidence: candidate.evidence,
      observedAt: candidate.evidence.length ? Math.max(...candidate.evidence.map(value => value.observedAt)) : now,
      ageMs: candidate.evidence.length ? Math.max(...candidate.evidence.map(value => value.ageMs)) : 0,
      reason: candidate.reason, limitations: candidate.limitations, transitionedAt: now,
      previous: current ? { value: current.value, transitionedAt: current.transitionedAt } : null
    };
    runtime.state = next; runtime.pending = null; return next;
  };
  if (!current || candidate.urgent) return commit();
  if (current.value === candidate.value) {
    runtime.pending = null;
    runtime.state = { ...current, confidence: clamp(candidate.confidence), evidence: candidate.evidence,
      observedAt: candidate.evidence.length ? Math.max(...candidate.evidence.map(value => value.observedAt)) : now,
      ageMs: candidate.evidence.length ? Math.max(...candidate.evidence.map(value => value.ageMs)) : 0,
      reason: candidate.reason, limitations: candidate.limitations };
    return runtime.state;
  }
  if (runtime.pending?.value !== candidate.value) runtime.pending = { value: candidate.value, since: now, count: 1 };
  else runtime.pending.count += 1;
  if (runtime.pending.count >= options.confirmations && now - runtime.pending.since >= options.confirmationMs) return commit();
  return { ...current, limitations: [...candidate.limitations, `Transición a ${candidate.value} pendiente de confirmación.`] };
}

export class VesselSituationEngine {
  private readonly vessels = new Map<string, VesselRuntime>();
  private readonly options: SituationEngineOptions;
  constructor(options: Partial<SituationEngineOptions> = {}) { this.options = { ...DEFAULTS, ...options }; }

  evaluate(input: VesselSituationInput): VesselSituationSnapshot {
    const runtime = this.vessels.get(input.vesselId) ?? {
      situation: { state: null, pending: null }, propulsion: { state: null, pending: null }, context: { state: null, pending: null }
    };
    this.vessels.set(input.vesselId, runtime);
    return {
      vesselId: input.vesselId, evaluatedAt: input.now,
      situation: transition(runtime.situation, classifySituation(input, this.options), input.now, this.options),
      propulsion: transition(runtime.propulsion, classifyPropulsion(input), input.now, this.options),
      context: transition(runtime.context, classifyContext(input), input.now, this.options)
    };
  }

  clear(vesselId: string): void { this.vessels.delete(vesselId); }
}
