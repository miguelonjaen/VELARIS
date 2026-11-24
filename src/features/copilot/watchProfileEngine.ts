import type { VesselSituationSnapshot } from './vesselSituationEngine';

export type WatchProfile = 'PORT' | 'PRE_DEPARTURE' | 'ENGINE_NAVIGATION' | 'SAIL_NAVIGATION' | 'MOTOR_SAILING' | 'ANCHOR_WATCH' | 'PORT_APPROACH' | 'EMERGENCY' | 'UNKNOWN';
export type WatchModifier = 'NIGHT_WATCH' | 'RESTRICTED_VISIBILITY' | 'ADVERSE_WEATHER' | 'DEGRADED_INSTRUMENTATION' | 'SIMULATION';

export interface WatchProfileInput {
  vesselId: string;
  now: number;
  situation: VesselSituationSnapshot;
  simulated: boolean;
  night: boolean;
  restrictedVisibility: boolean;
  adverseWeather: boolean;
  degradedInstrumentation: boolean;
  manualOverride?: WatchProfile | null;
}

export interface WatchProfileSnapshot {
  profile: WatchProfile;
  automaticProfile: WatchProfile;
  source: 'AUTOMATIC' | 'DECLARED';
  modifiers: readonly WatchModifier[];
  confidence: number;
  activatedAt: number;
  reason: string;
  priorities: readonly string[];
  availableSubsystems: readonly string[];
  degradedSubsystems: readonly string[];
  limitations: readonly string[];
  previous: { profile: WatchProfile; activatedAt: number } | null;
}

interface Runtime { state: WatchProfileSnapshot | null; pending: { profile: WatchProfile; since: number; count: number } | null }

const PROFILE_PRIORITIES: Record<WatchProfile, readonly string[]> = {
  PORT: ['Integridad del buque', 'energía y documentación'],
  PRE_DEPARTURE: ['Lista de comprobación', 'propulsión, gobierno y derrota'],
  ENGINE_NAVIGATION: ['Navegación', 'propulsión y tráfico'],
  SAIL_NAVIGATION: ['Navegación a vela', 'viento y tráfico'],
  MOTOR_SAILING: ['Navegación', 'motor, aparejo y tráfico'],
  ANCHOR_WATCH: ['Posición de fondeo', 'borneo, profundidad y meteorología'],
  PORT_APPROACH: ['Tráfico y derrota', 'sonda, velocidad y maniobra'],
  EMERGENCY: ['Seguridad de la vida', 'control de daños y comunicaciones'],
  UNKNOWN: ['Obtener datos fiables', 'mantener vigilancia por medios independientes']
};

function automaticProfile(value: VesselSituationSnapshot): WatchProfile {
  if (value.context.value === 'EMERGENCY') return 'EMERGENCY';
  if (value.context.value === 'APPROACHING_DESTINATION' || value.context.value === 'ARRIVAL') return 'PORT_APPROACH';
  if (
    value.context.value === 'PREPARING_DEPARTURE' &&
    value.situation.value !== 'UNDERWAY' &&
    value.situation.value !== 'MANEUVERING'
  ) return 'PRE_DEPARTURE';
  if (value.situation.value === 'ANCHORED' || value.situation.value === 'DRIFTING') return 'ANCHOR_WATCH';
  if (value.situation.value === 'BERTHED') return 'PORT';
  if (value.propulsion.value === 'ENGINE') return 'ENGINE_NAVIGATION';
  if (value.propulsion.value === 'SAIL') return 'SAIL_NAVIGATION';
  if (value.propulsion.value === 'MOTOR_SAILING') return 'MOTOR_SAILING';
  return 'UNKNOWN';
}

function reason(profile: WatchProfile): string {
  return ({
    PORT: 'Atraque confirmado con movimiento compatible.', PRE_DEPARTURE: 'Preparación de salida registrada.',
    ENGINE_NAVIGATION: 'Navegación con propulsión a motor.', SAIL_NAVIGATION: 'Navegación con propulsión a vela declarada.',
    MOTOR_SAILING: 'RPM vigentes y navegación a vela declarada.', ANCHOR_WATCH: 'Fondeo confirmado o posible garreo.',
    PORT_APPROACH: 'Aproximación o llegada registrada.', EMERGENCY: 'Existe una emergencia activa.',
    UNKNOWN: 'Evidencia insuficiente para asignar una guardia operativa.'
  } satisfies Record<WatchProfile, string>)[profile];
}

export class WatchProfileEngine {
  private readonly vessels = new Map<string, Runtime>();
  constructor(private readonly confirmations = 2, private readonly confirmationMs = 3_000) {}

  evaluate(input: WatchProfileInput): WatchProfileSnapshot {
    const runtime = this.vessels.get(input.vesselId) ?? { state: null, pending: null };
    this.vessels.set(input.vesselId, runtime);
    const automatic = automaticProfile(input.situation);
    const requested = input.manualOverride ?? automatic;
    const source = input.manualOverride ? 'DECLARED' as const : 'AUTOMATIC' as const;
    const urgent = automatic === 'EMERGENCY' || automatic === 'ANCHOR_WATCH' && input.situation.situation.value === 'DRIFTING';
    let profile = runtime.state?.profile ?? requested;
    let activatedAt = runtime.state?.activatedAt ?? input.now;
    let previous = runtime.state?.previous ?? null;
    if (!runtime.state || urgent || source === 'DECLARED') {
      if (runtime.state && runtime.state.profile !== requested) previous = { profile: runtime.state.profile, activatedAt: runtime.state.activatedAt };
      profile = requested; activatedAt = runtime.state?.profile === requested ? runtime.state.activatedAt : input.now; runtime.pending = null;
    } else if (runtime.state.profile === requested) runtime.pending = null;
    else {
      if (runtime.pending?.profile !== requested) runtime.pending = { profile: requested, since: input.now, count: 1 };
      else runtime.pending.count += 1;
      if (runtime.pending.count >= this.confirmations && input.now - runtime.pending.since >= this.confirmationMs) {
        previous = { profile: runtime.state.profile, activatedAt: runtime.state.activatedAt };
        profile = requested; activatedAt = input.now; runtime.pending = null;
      }
    }
    const modifiers: WatchModifier[] = [];
    if (input.night) modifiers.push('NIGHT_WATCH');
    if (input.restrictedVisibility) modifiers.push('RESTRICTED_VISIBILITY');
    if (input.adverseWeather) modifiers.push('ADVERSE_WEATHER');
    if (input.degradedInstrumentation) modifiers.push('DEGRADED_INSTRUMENTATION');
    if (input.simulated) modifiers.push('SIMULATION');
    const limitations = [...input.situation.situation.limitations, ...input.situation.propulsion.limitations, ...input.situation.context.limitations];
    if (input.manualOverride && input.manualOverride !== automatic) limitations.push(`Perfil declarado ${input.manualOverride}; perfil automático observado ${automatic}.`);
    if (runtime.pending) limitations.push(`Transición automática a ${runtime.pending.profile} pendiente de confirmación.`);
    const available = ['SharedNavigationState', ...(input.situation.propulsion.value !== 'UNKNOWN' ? ['instrumentación de propulsión'] : [])];
    const degraded = input.degradedInstrumentation ? ['instrumentación parcial o caducada'] : [];
    const confidence = Math.min(input.situation.situation.confidence, input.situation.propulsion.confidence, input.situation.context.confidence);
    const snapshot: WatchProfileSnapshot = { profile, automaticProfile: automatic, source, modifiers, confidence, activatedAt,
      reason: source === 'DECLARED' ? `Perfil declarado por el operador. ${reason(automatic)}` : reason(profile), priorities: PROFILE_PRIORITIES[profile],
      availableSubsystems: available, degradedSubsystems: degraded, limitations, previous };
    runtime.state = snapshot;
    return snapshot;
  }

  clear(vesselId: string): void { this.vessels.delete(vesselId); }
}
