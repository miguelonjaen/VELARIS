import { emptyWatchThresholds, setWatchThreshold } from './watchThresholds';
import test from 'node:test';
import assert from 'node:assert/strict';
import type { BoatInstrumentSnapshot } from '../../core/instruments/BoatInstrumentStore';
import type { ResolvedNavigationState } from '../../core/navigation/SharedNavigationState';
import { VesselSituationService, type OperationalMemoryStorage } from './vesselSituationService';
import type { VesselSituationInput } from './vesselSituationEngine';

const emptyInstruments: BoatInstrumentSnapshot = { depth: null, windApparent: null, windTrue: null, windDirectionTrue: null, engines: [], alternatorVolts: null, batteries: [], tanks: [] };
const unknownNavigation = (valid: boolean, now: number): ResolvedNavigationState => {
  const entry = (field: string, value: unknown) => ({ field, status: value === null ? 'UNKNOWN' : 'VALID', value, source: value === null ? null : 'BOAT', sourceId: value === null ? null : 'test', observedAt: value === null ? null : now, receivedAt: value === null ? null : now, observedAtFromSource: value === null ? null : true, ageMs: value === null ? null : 0, sources: { BOAT: value === null ? 'NO_DATA' : 'VALID', DROID: 'NO_DATA', SIMULATOR: 'NO_DATA' } });
  return { position: entry('position', valid ? { lat: 36, lng: -3 } : null), sog: entry('sog', valid ? 2 : null), cog: entry('cog', valid ? 90 : null), headingTrue: entry('headingTrue', valid ? 90 : null), headingMagnetic: entry('headingMagnetic', null) } as ResolvedNavigationState;
};
const situation = (vesselId: string, now: number, valid: boolean): VesselSituationInput => ({
  vesselId, now, navigation: unknownNavigation(valid, now), instruments: emptyInstruments, manualPropulsion: null,
  voyage: { active: true, pending: false, arrived: false, destinationDistanceNm: null, routeConfigured: false },
  anchor: { active: false, positionConfirmed: false, distanceMeters: null, radiusMeters: null, trend: null }, berth: null, emergency: false
});

test('pérdida y recuperación GPS generan una activación y una resolución', () => {
  const service = new VesselSituationService();
  const lost = service.evaluate({ situation: situation('ship-1', 1_000, false), existingAlarms: [], aisRisks: [] });
  assert.equal(lost.notifications.filter(value => value.id === 'navigation:gps-unavailable').length, 1);
  const duplicate = service.evaluate({ situation: situation('ship-1', 2_000, false), existingAlarms: [], aisRisks: [] });
  assert.equal(duplicate.notifications.length, 0);
  const recovered = service.evaluate({ situation: situation('ship-1', 3_000, true), existingAlarms: [], aisRisks: [] });
  assert.equal(recovered.notifications[0]?.status, 'resolved');
});

test('deduplicación, reconocimiento y resolución conservan el ciclo de vida', () => {
  const service = new VesselSituationService();
  const alarm = { type: 'battery_low', severity: 'warning', message: 'Batería baja', timestamp: 1_000 };
  const first = service.evaluate({ situation: situation('ship-1', 1_000, true), existingAlarms: [alarm], aisRisks: [] });
  assert.equal(first.notifications.length, 1);
  assert.equal(service.acknowledge('ship-1', 'system:battery_low', 1_500), true);
  assert.equal(service.evaluate({ situation: situation('ship-1', 2_000, true), existingAlarms: [alarm], aisRisks: [] }).notifications.length, 0);
  const resolved = service.evaluate({ situation: situation('ship-1', 3_000, true), existingAlarms: [], aisRisks: [] });
  assert.equal(resolved.notifications[0]?.status, 'resolved');
});

test('cooldown evita repetir una condición no crítica que oscila', () => {
  const service = new VesselSituationService();
  const alarm = { type: 'battery_low', severity: 'warning', message: 'Batería baja', timestamp: 1_000 };
  service.evaluate({ situation: situation('ship-1', 1_000, true), existingAlarms: [alarm], aisRisks: [] });
  service.evaluate({ situation: situation('ship-1', 2_000, true), existingAlarms: [], aisRisks: [] });
  const repeated = service.evaluate({ situation: situation('ship-1', 3_000, true), existingAlarms: [alarm], aisRisks: [] });
  assert.equal(repeated.notifications.length, 0);
  assert.ok(repeated.alerts.some(value => value.id === 'system:battery_low' && value.status === 'active'));
});

test('memoria, logística y alertas quedan aisladas por UUID', () => {
  const service = new VesselSituationService();
  service.setLogistics('ship-a', [{ id: 'inventory-low:x', source: 'inventory', priority: 'warning', title: 'Reponer agua', detail: '0 disponibles', dueAt: null }], 500);
  const a = service.evaluate({ situation: situation('ship-a', 1_000, true), existingAlarms: [], aisRisks: [] });
  const b = service.evaluate({ situation: situation('ship-b', 1_000, true), existingAlarms: [], aisRisks: [] });
  assert.ok(a.alerts.some(value => value.id.includes('inventory-low')));
  assert.ok(!b.alerts.some(value => value.id.includes('inventory-low')));
});

test('Supabase u Ollama ausentes no afectan al motor determinista', () => {
  const service = new VesselSituationService();
  const result = service.evaluate({ situation: situation('ship-1', 1_000, true), existingAlarms: [], aisRisks: [] });
  assert.equal(result.vesselId, 'ship-1'); assert.equal(result.context.value, 'ACTIVE_VOYAGE');
});

test('almacenamiento local acotado no mezcla embarcaciones', () => {
  const data = new Map<string, ReturnType<OperationalMemoryStorage['load']>>();
  const storage: OperationalMemoryStorage = {
    load: vesselId => data.get(vesselId) ?? null,
    save: (vesselId, memory) => { data.set(vesselId, memory); }
  };
  const service = new VesselSituationService(storage);
  service.evaluate({ situation: situation('ship-a', 1_000, false), existingAlarms: [], aisRisks: [] });
  assert.ok(data.has('ship-a')); assert.ok(!data.has('ship-b'));
});


test('AIS: un solo aviso por objetivo', () => {
  const service = new VesselSituationService();
  const target = {
    id: '123456789', label: 'TEST AIS',
    riskLevel: 'WARNING', valid: true,
    cpaNm: 0.5, tcpaMinutes: 15
  };

  const result = service.evaluate({
    situation: situation('ship-1', 1000, true),
    existingAlarms: [{
      type: 'ais_collision', severity: 'warning',
      message: 'AIS aggregate', timestamp: 1000
    }],
    aisRisks: [target]
  });

  assert.equal(result.notifications.length, 1);
  assert.equal(result.notifications[0].id, 'ais:123456789');
});

test('AIS: escalada critica tras reconocimiento', () => {
  const service = new VesselSituationService();
  const target = {
    id: '123456789', label: 'TEST AIS',
    riskLevel: 'WARNING', valid: true,
    cpaNm: 0.5, tcpaMinutes: 15
  };

  service.evaluate({
    situation: situation('ship-1', 1000, true),
    existingAlarms: [], aisRisks: [target]
  });

  assert.equal(service.acknowledge('ship-1', 'ais:123456789', 1500), true);

  const result = service.evaluate({
    situation: situation('ship-1', 2000, true),
    existingAlarms: [],
    aisRisks: [{ ...target, riskLevel: 'CRITICAL', cpaNm: 0.1 }]
  });

  assert.equal(result.notifications.length, 1);
  assert.equal(result.notifications[0].priority, 'CRITICAL');
  assert.equal(result.notifications[0].status, 'active');
  assert.equal(result.notifications[0].acknowledgedAt, null);
});

test('AIS: perdida de datos no acredita recuperacion', () => {
  const service = new VesselSituationService();
  const target = {
    id: '123456789', label: 'TEST AIS',
    riskLevel: 'WARNING', valid: true,
    cpaNm: 0.5, tcpaMinutes: 15
  };

  service.evaluate({
    situation: situation('ship-1', 1000, true),
    existingAlarms: [], aisRisks: [target]
  });

  const lost = service.evaluate({
    situation: situation('ship-1', 2000, true),
    existingAlarms: [], aisRisks: [{ ...target, valid: false }]
  });

  assert.match(lost.notifications[0].message, /Riesgo no descartado/);

  const returned = service.evaluate({
    situation: situation('ship-1', 3000, true),
    existingAlarms: [], aisRisks: [target]
  });

  assert.equal(returned.notifications.length, 1);
  assert.equal(returned.notifications[0].status, 'active');
});

test('AIS: blancos invalidos no disparan alertas', () => {
  const service = new VesselSituationService();

  const result = service.evaluate({
    situation: situation('ship-1', 1000, true),
    existingAlarms: [],
    aisRisks: [{
      id: '123456789', label: 'TEST AIS',
      riskLevel: 'CRITICAL', valid: false,
      cpaNm: 0.1, tcpaMinutes: 5
    }]
  });

  assert.equal(result.notifications.length, 0);
});

test('umbrales por UUID generan avisos medidos y no se aplican a otro buque', () => {
  const service = new VesselSituationService();
  const measured: BoatInstrumentSnapshot = { ...emptyInstruments,
    depth: { value: { meters: 1.8, reference: 'transducer' }, ageMs: 100 },
    engines: [{ engine: 1, rpm: { value: 900, ageMs: 100 }, temperatureC: { value: 96, ageMs: 100 }, oilPressureBar: { value: 0.8, ageMs: 100 } }],
    batteries: [{ name: 'START', role: 'start', volts: { value: 11.8, ageMs: 100 }, amps: null }],
    tanks: [{ kind: 'fuel', name: 'FUEL', percent: { value: 9, ageMs: 100 } }] };
  let thresholds = emptyWatchThresholds('ship-1');
  thresholds = setWatchThreshold(thresholds, 'minimumDepthMeters', { value: 2, origin: 'user' });
  thresholds = setWatchThreshold(thresholds, 'engineTemperatureC', { value: 90, origin: 'manufacturer' });
  thresholds = setWatchThreshold(thresholds, 'oilPressureBar', { value: 1, origin: 'manufacturer' });
  thresholds = setWatchThreshold(thresholds, 'batteryStartVolts', { value: 12, origin: 'user' });
  thresholds = setWatchThreshold(thresholds, 'fuelPercent', { value: 10, origin: 'user' });
  const ownSituation = { ...situation('ship-1', 1_000, true), instruments: measured };
  const result = service.evaluate({ situation: ownSituation, existingAlarms: [], aisRisks: [], thresholds });
  assert.deepEqual(result.alerts.filter(value => value.status === 'active' && value.id.startsWith('threshold:')).map(value => value.id).sort(), [
    'threshold:battery:START', 'threshold:depth', 'threshold:engine-temp:1', 'threshold:oil-pressure:1', 'threshold:tank:fuel:FUEL'
  ]);
  assert.ok(result.alerts.filter(value => value.id.startsWith('threshold:')).every(value => value.evidence[0]?.kind === 'measured'));
  const other = service.evaluate({ situation: { ...ownSituation, vesselId: 'ship-2', now: 2_000 }, existingAlarms: [], aisRisks: [], thresholds });
  assert.equal(other.alerts.filter(value => value.status === 'active' && value.id.startsWith('threshold:')).length, 0);
});

test('lecturas simuladas conservan procedencia en avisos de umbral', () => {
  const service = new VesselSituationService();
  const thresholds = setWatchThreshold(emptyWatchThresholds('ship-1'), 'minimumDepthMeters', { value: 3, origin: 'user' });
  const simulated = { ...situation('ship-1', 1_000, true), instrumentSource: 'SIMULATOR' as const,
    instruments: { ...emptyInstruments, depth: { value: { meters: 2, reference: 'transducer' as const }, ageMs: 50 } } };
  const result = service.evaluate({ situation: simulated, existingAlarms: [], aisRisks: [], thresholds });
  assert.equal(result.alerts.find(value => value.id === 'threshold:depth')?.evidence[0]?.kind, 'simulated');
});
