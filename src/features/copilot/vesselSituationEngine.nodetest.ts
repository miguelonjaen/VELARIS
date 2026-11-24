import test from 'node:test';
import assert from 'node:assert/strict';
import type { BoatInstrumentSnapshot } from '../../core/instruments/BoatInstrumentStore';
import type { NavigationFieldName, ResolvedNavigationState } from '../../core/navigation/SharedNavigationState';
import { VesselSituationEngine, type VesselSituationInput } from './vesselSituationEngine';

const instruments = (rpm: number | null = null): BoatInstrumentSnapshot => ({
  depth: null, windApparent: null, windTrue: null, windDirectionTrue: null,
  engines: rpm === null ? [] : [{ engine: 0, rpm: { value: rpm, ageMs: 100 }, temperatureC: null, oilPressureBar: null }],
  alternatorVolts: null, batteries: [], tanks: []
});

function navigation(now: number, sog: number | null, source: 'BOAT' | 'SIMULATOR' = 'BOAT'): ResolvedNavigationState {
  const field = <F extends NavigationFieldName>(name: F, value: unknown) => ({
    field: name, status: value === null ? 'UNKNOWN' as const : 'VALID' as const, value,
    source: value === null ? null : source, sourceId: value === null ? null : 'test',
    observedAt: value === null ? null : now - 100, receivedAt: value === null ? null : now - 100,
    observedAtFromSource: value === null ? null : true, ageMs: value === null ? null : 100,
    sources: { BOAT: value === null ? 'NO_DATA' as const : 'VALID' as const, DROID: 'NO_DATA' as const, SIMULATOR: 'NO_DATA' as const }
  });
  return {
    position: field('position', sog === null ? null : { lat: 36.72, lng: -3.53 }),
    sog: field('sog', sog), cog: field('cog', sog === null ? null : 90),
    headingTrue: field('headingTrue', sog === null ? null : 88), headingMagnetic: field('headingMagnetic', null)
  } as ResolvedNavigationState;
}

function input(now: number, sog: number | null, overrides: Partial<VesselSituationInput> = {}): VesselSituationInput {
  return {
    vesselId: 'ship-1', now, navigation: navigation(now, sog), instruments: instruments(), manualPropulsion: null,
    voyage: { active: false, pending: false, arrived: false, destinationDistanceNm: null, routeConfigured: false },
    anchor: { active: false, positionConfirmed: false, distanceMeters: null, radiusMeters: null, trend: null },
    berth: null, emergency: false, ...overrides
  };
}

const stable = (engine: VesselSituationEngine, first: VesselSituationInput, second: VesselSituationInput) => {
  engine.evaluate(first);
  engine.evaluate(second);
  return engine.evaluate({ ...second, now: second.now + 1, navigation: navigation(second.now + 1, second.navigation.sog.value as number | null, second.navigation.position.source === 'SIMULATOR' ? 'SIMULATOR' : 'BOAT') });
};

test('arranque sin sensores permanece UNKNOWN y sin propulsión inventada', () => {
  const result = new VesselSituationEngine().evaluate(input(1_000, null));
  assert.equal(result.situation.value, 'UNKNOWN'); assert.equal(result.propulsion.value, 'UNKNOWN');
});

test('barco estacionario no se convierte en atracado ni fondeado', () => {
  const engine = new VesselSituationEngine({ confirmationMs: 0 });
  const result = stable(engine, input(1_000, null), input(2_000, 0.05));
  assert.equal(result.situation.value, 'STATIONARY');
});

test('atraque y fondeo requieren evidencia explícita suficiente', () => {
  const engine = new VesselSituationEngine({ confirmationMs: 0 });
  const berth = { confirmed: true, source: 'operador', observedAt: 1_000 };
  assert.equal(stable(engine, input(1_000, null), input(2_000, 0, { berth })).situation.value, 'BERTHED');
  const anchorEngine = new VesselSituationEngine({ confirmationMs: 0 });
  const anchor = { active: true, positionConfirmed: true, distanceMeters: 12, radiusMeters: 40, trend: 'stable' as const };
  assert.equal(stable(anchorEngine, input(1_000, null), input(2_000, 0.1, { anchor })).situation.value, 'ANCHORED');
});

test('posible garreo es inmediato y no espera la histéresis ordinaria', () => {
  const anchor = { active: true, positionConfirmed: true, distanceMeters: 55, radiusMeters: 40, trend: 'drifting' as const };
  assert.equal(new VesselSituationEngine().evaluate(input(1_000, 0.3, { anchor })).situation.value, 'DRIFTING');
});

test('navegación a motor, vela y motor-vela conservan procedencia', () => {
  const engine = new VesselSituationEngine({ confirmationMs: 0 });
  assert.equal(stable(engine, input(1_000, null), input(2_000, 5, { instruments: instruments(1200), manualPropulsion: true })).propulsion.value, 'ENGINE');
  const sail = new VesselSituationEngine({ confirmationMs: 0 });
  assert.equal(stable(sail, input(1_000, null), input(2_000, 4, { instruments: instruments(0), manualPropulsion: false })).propulsion.value, 'SAIL');
  const motorSail = new VesselSituationEngine({ confirmationMs: 0 });
  assert.equal(stable(motorSail, input(1_000, null), input(2_000, 4, { instruments: instruments(900), manualPropulsion: false })).propulsion.value, 'MOTOR_SAILING');
});

test('telemetría contradictoria produce propulsión UNKNOWN con limitación', () => {
  const result = new VesselSituationEngine().evaluate(input(1_000, 0, { instruments: instruments(0), manualPropulsion: true }));
  assert.equal(result.propulsion.value, 'UNKNOWN'); assert.match(result.propulsion.limitations.join(' '), /Conflicto/);
});

test('travesía lenta con derrota activa se clasifica como maniobra portuaria', () => {
  const engine = new VesselSituationEngine({ confirmationMs: 0 });
  const voyage = { active: true, pending: false, arrived: false, destinationDistanceNm: 0.2, routeConfigured: true };
  const result = stable(engine, input(1_000, null), input(2_000, 1.2, { voyage }));
  assert.equal(result.situation.value, 'MANEUVERING'); assert.equal(result.context.value, 'APPROACHING_DESTINATION');
});

test('datos simulados se identifican y nunca se presentan como reales', () => {
  const value = input(1_000, 3); value.navigation = navigation(1_000, 3, 'SIMULATOR');
  const result = new VesselSituationEngine().evaluate(value);
  assert.ok(result.situation.evidence.some(item => item.kind === 'simulated'));
  assert.match(result.situation.limitations.join(' '), /simulador/);
});

test('histéresis evita oscilación por una única muestra de velocidad', () => {
  const engine = new VesselSituationEngine({ confirmations: 2, confirmationMs: 2_000 });
  engine.evaluate(input(1_000, 0));
  assert.equal(engine.evaluate(input(2_000, 4)).situation.value, 'STATIONARY');
  assert.equal(engine.evaluate(input(3_000, 0.1)).situation.value, 'STATIONARY');
});

test('datos caducados equivalen a ausencia de evidencia vigente', () => {
  const value = input(1_000, null);
  const stale = { ...value.navigation.sog, status: 'UNKNOWN' as const, value: null, source: null, sourceId: null, observedAt: null, receivedAt: null, observedAtFromSource: null, ageMs: null,
    sources: { ...value.navigation.sog.sources, BOAT: 'STALE' as const } };
  value.navigation = { ...value.navigation, sog: stale };
  assert.equal(new VesselSituationEngine().evaluate(value).situation.value, 'UNKNOWN');
});

test('la evaluación es consultiva y no muta navegación ni travesía activa', () => {
  const value = input(1_000, 4, { voyage: { active: true, pending: false, arrived: false, destinationDistanceNm: 2, routeConfigured: true } });
  const before = JSON.stringify(value);
  new VesselSituationEngine().evaluate(value);
  assert.equal(JSON.stringify(value), before);
});
