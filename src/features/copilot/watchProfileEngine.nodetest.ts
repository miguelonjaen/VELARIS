import test from 'node:test';
import assert from 'node:assert/strict';
import type { DimensionState, OperationalContext, PropulsionSystem, VesselSituation, VesselSituationSnapshot } from './vesselSituationEngine';
import { WatchProfileEngine, type WatchProfileInput } from './watchProfileEngine';

function dimension<T extends string>(value: T, confidence = 0.9): DimensionState<T> {
  return { value, confidence, evidence: [], observedAt: 1_000, ageMs: 0, reason: value, limitations: [], transitionedAt: 1_000, previous: null };
}
function situation(s: VesselSituation, p: PropulsionSystem, c: OperationalContext): VesselSituationSnapshot {
  return { vesselId: 'v1', evaluatedAt: 1_000, situation: dimension(s), propulsion: dimension(p), context: dimension(c) };
}
function input(snapshot: VesselSituationSnapshot, overrides: Partial<WatchProfileInput> = {}): WatchProfileInput {
  return { vesselId: 'v1', now: 1_000, situation: snapshot, simulated: false, night: false, restrictedVisibility: false,
    adverseWeather: false, degradedInstrumentation: false, ...overrides };
}

test('perfiles operativos se derivan de evidencia existente', () => {
  const cases = [
    [situation('BERTHED', 'NONE', 'NORMAL'), 'PORT'], [situation('STATIONARY', 'UNKNOWN', 'PREPARING_DEPARTURE'), 'PRE_DEPARTURE'],
    [situation('UNDERWAY', 'ENGINE', 'ACTIVE_VOYAGE'), 'ENGINE_NAVIGATION'], [situation('UNDERWAY', 'SAIL', 'ACTIVE_VOYAGE'), 'SAIL_NAVIGATION'],
    [situation('UNDERWAY', 'MOTOR_SAILING', 'ACTIVE_VOYAGE'), 'MOTOR_SAILING'], [situation('ANCHORED', 'NONE', 'NORMAL'), 'ANCHOR_WATCH'],
    [situation('MANEUVERING', 'ENGINE', 'APPROACHING_DESTINATION'), 'PORT_APPROACH'], [situation('UNKNOWN', 'UNKNOWN', 'EMERGENCY'), 'EMERGENCY'],
    [situation('STATIONARY', 'UNKNOWN', 'NORMAL'), 'UNKNOWN']
  ] as const;
  for (const [snapshot, expected] of cases) assert.equal(new WatchProfileEngine().evaluate(input(snapshot)).profile, expected);
});

test('modificadores son simultáneos y SIMULATION queda visible', () => {
  const result = new WatchProfileEngine().evaluate(input(situation('UNDERWAY', 'ENGINE', 'ACTIVE_VOYAGE'), {
    simulated: true, night: true, restrictedVisibility: true, adverseWeather: true, degradedInstrumentation: true
  }));
  assert.deepEqual(result.modifiers, ['NIGHT_WATCH', 'RESTRICTED_VISIBILITY', 'ADVERSE_WEATHER', 'DEGRADED_INSTRUMENTATION', 'SIMULATION']);
});

test('histéresis evita oscilación y emergencia/garreo son inmediatos', () => {
  const engine = new WatchProfileEngine(2, 3_000);
  assert.equal(engine.evaluate(input(situation('BERTHED', 'NONE', 'NORMAL'))).profile, 'PORT');
  assert.equal(engine.evaluate(input(situation('UNDERWAY', 'ENGINE', 'ACTIVE_VOYAGE'), { now: 2_000 })).profile, 'PORT');
  assert.equal(engine.evaluate(input(situation('UNDERWAY', 'ENGINE', 'ACTIVE_VOYAGE'), { now: 5_100 })).profile, 'ENGINE_NAVIGATION');
  assert.equal(engine.evaluate(input(situation('UNDERWAY', 'ENGINE', 'EMERGENCY'), { now: 5_200 })).profile, 'EMERGENCY');
  const anchor = situation('DRIFTING', 'UNKNOWN', 'NORMAL');
  assert.equal(new WatchProfileEngine().evaluate(input(anchor)).profile, 'ANCHOR_WATCH');
});

test('override manual se distingue del perfil automático y no oculta discrepancias', () => {
  const result = new WatchProfileEngine().evaluate(input(situation('UNDERWAY', 'ENGINE', 'ACTIVE_VOYAGE'), { manualOverride: 'SAIL_NAVIGATION' }));
  assert.equal(result.profile, 'SAIL_NAVIGATION');
  assert.equal(result.automaticProfile, 'ENGINE_NAVIGATION');
  assert.equal(result.source, 'DECLARED');
  assert.match(result.limitations.join(' '), /perfil automático/i);
});
