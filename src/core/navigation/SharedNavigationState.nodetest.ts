// Estado de navegación compartido: selección de fuente por campo (node:test, sin dependencias nuevas).
// Ejecutar con: node --import tsx --test src/core/navigation/SharedNavigationState.nodetest.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NAVIGATION_FIELDS,
  SharedNavigationState,
  type NavigationFreshnessPolicy,
  type NavigationReadingInput,
  type NavigationSource
} from './SharedNavigationState';
import { boatReadingsFromTelemetry, droidReadingsFromLinkPosition } from './SharedNavigationFeeds';
import { NMEAParser } from '../services/NMEAParser';

// Umbrales solo para las pruebas: el módulo exige que los aporte quien lo usa.
const MAX_AGE = 10_000;
const policy = Object.fromEntries(NAVIGATION_FIELDS.map((field) => [field, {
  BOAT: { maxAgeMs: MAX_AGE, ageFrom: 'observedAt' },
  DROID: { maxAgeMs: MAX_AGE, ageFrom: 'observedAt' }
}])) as unknown as NavigationFreshnessPolicy;

const T0 = Date.UTC(2026, 9, 20, 9, 0, 0);
const BOAT_POS = { lat: 36.7215, lng: -3.5235 };
const DROID_POS = { lat: 36.7300, lng: -3.5100 };

function reading<F extends NavigationReadingInput['field']>(
  field: F,
  source: NavigationSource,
  value: NavigationReadingInput<F>['value'],
  observedAt: number,
  receivedAt = observedAt
): NavigationReadingInput<F> {
  return { field, source, sourceId: source === 'BOAT' ? 'nmea' : 'phone-1', value, observedAt, receivedAt, observedAtFromSource: true };
}

function newState(now = T0) {
  let clock = now;
  const state = new SharedNavigationState(policy, () => clock);
  return { state, setNow: (value: number) => { clock = value; } };
}

test('prioridad de los instrumentos del barco cuando su dato es válido y reciente', () => {
  const { state } = newState(T0 + 1000);
  state.update(reading('sog', 'DROID', 6.1, T0 + 500));
  state.update(reading('sog', 'BOAT', 5.8, T0));
  const resolved = state.resolve('sog');
  assert.equal(resolved.status, 'VALID');
  assert.equal(resolved.source, 'BOAT');
  assert.equal(resolved.value, 5.8);
  assert.deepEqual(resolved.sources, { BOAT: 'VALID', DROID: 'VALID', SIMULATOR: 'NO_DATA' });
});

test('prioridad del GPS del barco frente al GPS del teléfono', () => {
  const { state } = newState(T0 + 1000);
  state.update(reading('position', 'DROID', DROID_POS, T0 + 900));
  state.update(reading('position', 'BOAT', BOAT_POS, T0 + 100));
  const resolved = state.resolve('position');
  assert.equal(resolved.source, 'BOAT');
  assert.deepEqual(resolved.value, BOAT_POS);
});

test('respaldo de Droid cuando el barco no tiene dato', () => {
  const { state } = newState(T0 + 1000);
  state.update(reading('position', 'DROID', DROID_POS, T0));
  const resolved = state.resolve('position');
  assert.equal(resolved.source, 'DROID');
  assert.deepEqual(resolved.value, DROID_POS);
  assert.equal(resolved.sources.BOAT, 'NO_DATA');
});

test('respaldo de Droid cuando el dato del barco es inválido', () => {
  const { state } = newState(T0 + 2000);
  state.update(reading('position', 'BOAT', BOAT_POS, T0));
  // El barco envía después una posición inválida (0,0): invalida su lectura anterior.
  assert.deepEqual(state.update(reading('position', 'BOAT', { lat: 0, lng: 0 }, T0 + 1000)), { accepted: true, valid: false });
  state.update(reading('position', 'DROID', DROID_POS, T0 + 1500));
  const resolved = state.resolve('position');
  assert.equal(resolved.source, 'DROID');
  assert.equal(resolved.sources.BOAT, 'INVALID');
});

test('respaldo de Droid cuando el dato del barco ha caducado', () => {
  const { state, setNow } = newState(T0);
  state.update(reading('cog', 'BOAT', 120, T0));
  state.update(reading('cog', 'DROID', 125, T0 + 8000));
  setNow(T0 + MAX_AGE + 1);
  const resolved = state.resolve('cog');
  assert.equal(resolved.source, 'DROID');
  assert.equal(resolved.value, 125);
  assert.equal(resolved.sources.BOAT, 'STALE');
});

test('el barco recupera la prioridad automáticamente al volver a ser válido', () => {
  const { state, setNow } = newState(T0);
  state.update(reading('sog', 'BOAT', 5, T0));
  state.update(reading('sog', 'DROID', 5.4, T0 + 12_000));
  setNow(T0 + 12_500);
  assert.equal(state.resolve('sog').source, 'DROID');
  state.update(reading('sog', 'BOAT', 5.2, T0 + 13_000));
  setNow(T0 + 13_200);
  const resolved = state.resolve('sog');
  assert.equal(resolved.source, 'BOAT');
  assert.equal(resolved.value, 5.2);
});

test('el respaldo es independiente por campo', () => {
  const { state } = newState(T0 + 1000);
  // El barco aporta rumbo verdadero y SOG, pero no posición.
  state.update(reading('headingTrue', 'BOAT', 270, T0));
  state.update(reading('sog', 'BOAT', 6, T0));
  state.update(reading('position', 'DROID', DROID_POS, T0));
  state.update(reading('sog', 'DROID', 6.3, T0));
  const snapshot = state.snapshot();
  assert.equal(snapshot.headingTrue.source, 'BOAT');
  assert.equal(snapshot.sog.source, 'BOAT');
  assert.equal(snapshot.position.source, 'DROID');
  assert.equal(snapshot.cog.status, 'UNKNOWN');
  assert.equal(snapshot.headingMagnetic.status, 'UNKNOWN');
});

test('sin datos válidos el resultado es UNKNOWN y sin valor', () => {
  const { state, setNow } = newState(T0);
  const empty = state.resolve('position');
  assert.equal(empty.status, 'UNKNOWN');
  assert.equal(empty.value, null);
  assert.equal(empty.source, null);
  assert.deepEqual(empty.sources, { BOAT: 'NO_DATA', DROID: 'NO_DATA', SIMULATOR: 'NO_DATA' });

  state.update(reading('sog', 'BOAT', -1, T0));
  state.update(reading('sog', 'DROID', 4, T0));
  setNow(T0 + MAX_AGE + 1);
  const none = state.resolve('sog');
  assert.equal(none.status, 'UNKNOWN');
  assert.equal(none.value, null);
  assert.deepEqual(none.sources, { BOAT: 'INVALID', DROID: 'STALE', SIMULATOR: 'NO_DATA' });
});

test('se rechazan las actualizaciones antiguas o retrasadas', () => {
  const { state } = newState(T0 + 5000);
  assert.deepEqual(state.update(reading('position', 'BOAT', BOAT_POS, T0 + 2000)), { accepted: true, valid: true });
  // Llega después, pero se observó antes: no sustituye al dato más reciente.
  const late = state.update(reading('position', 'BOAT', DROID_POS, T0 + 1000, T0 + 4000));
  assert.deepEqual(late, { accepted: false, reason: 'OUT_OF_ORDER' });
  assert.deepEqual(state.update(reading('position', 'BOAT', DROID_POS, T0 + 2000)), { accepted: false, reason: 'DUPLICATE' });
  assert.deepEqual(state.update(reading('position', 'BOAT', BOAT_POS, Number.NaN)), { accepted: false, reason: 'INVALID_TIMESTAMP' });
  assert.deepEqual(state.resolve('position').value, BOAT_POS);
  assert.equal(state.resolve('position').observedAt, T0 + 2000);
});

test('no se comparan relojes distintos: hora de origen frente a hora de recepción', () => {
  const { state } = newState(T0 + 5000);
  // RMC con hora GPS atrasada respecto al reloj del PC, seguida de GGA sin fecha (hora de recepción).
  state.update({ ...reading('position', 'BOAT', BOAT_POS, T0 - 30_000, T0 + 1000), observedAtFromSource: true });
  const gga = state.update({ ...reading('position', 'BOAT', DROID_POS, T0 + 2000, T0 + 2000), observedAtFromSource: false });
  assert.deepEqual(gga, { accepted: true, valid: true });
  // Y un mensaje con hora de origen recibido antes que el último no lo sustituye.
  const late = state.update({ ...reading('position', 'BOAT', BOAT_POS, T0 - 20_000, T0 + 1500), observedAtFromSource: true });
  assert.deepEqual(late, { accepted: false, reason: 'OUT_OF_ORDER' });
});

test('se conservan procedencia, observación y recepción', () => {
  const { state } = newState(T0 + 3000);
  state.update({ field: 'headingMagnetic', source: 'BOAT', sourceId: 'nmea', value: 88, observedAt: T0 + 1000, receivedAt: T0 + 1200, observedAtFromSource: false });
  const resolved = state.resolve('headingMagnetic');
  assert.equal(resolved.sourceId, 'nmea');
  assert.equal(resolved.observedAt, T0 + 1000);
  assert.equal(resolved.receivedAt, T0 + 1200);
  assert.equal(resolved.observedAtFromSource, false);
  assert.equal(resolved.ageMs, 2000);
});

test('la antigüedad puede medirse desde la recepción si la política lo indica', () => {
  const byReception = Object.fromEntries(NAVIGATION_FIELDS.map((field) => [field, {
    BOAT: { maxAgeMs: MAX_AGE, ageFrom: 'observedAt' },
    DROID: { maxAgeMs: MAX_AGE, ageFrom: 'receivedAt' }
  }])) as unknown as NavigationFreshnessPolicy;
  const state = new SharedNavigationState(byReception, () => T0 + 20_000);
  // Reloj del teléfono atrasado: observación antigua, recepción reciente.
  state.update(reading('position', 'DROID', DROID_POS, T0, T0 + 19_000));
  assert.equal(state.resolve('position').source, 'DROID');
});

test('la política de caducidad es obligatoria', () => {
  assert.throws(() => new SharedNavigationState({} as NavigationFreshnessPolicy));
});

test('NMEA: GGA aporta posición pero no SOG ni COG; VTG aporta SOG y COG pero no posición', () => {
  const parser = new NMEAParser();
  const received = T0;
  const gga = parser.parse('$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*47');
  const vtg = parser.parse('$GPVTG,054.7,T,034.4,M,005.5,N,010.2,K*48');
  assert.deepEqual(boatReadingsFromTelemetry(gga, received).map((r) => r.field), ['position']);
  assert.deepEqual(boatReadingsFromTelemetry(vtg, received).map((r) => r.field), ['sog', 'cog']);
});

test('NMEA: RMC aporta posición, SOG y COG con la hora de la medida', () => {
  const parser = new NMEAParser();
  const rmc = parser.parse('$GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W*6A');
  const readings = boatReadingsFromTelemetry(rmc, T0);
  assert.deepEqual(readings.map((r) => r.field), ['position', 'sog', 'cog']);
  assert.equal(readings[0].observedAt, Date.UTC(1994, 2, 23, 12, 35, 19));
  assert.equal(readings[0].observedAtFromSource, true);
  assert.equal(readings[0].receivedAt, T0);
});

test('NMEA: rumbo verdadero y magnético van a campos distintos', () => {
  const parser = new NMEAParser();
  const message = parser.parse('$HEHDT,274.07,T*19');
  assert.equal(message.type, 'HEADING');
  const hdt = boatReadingsFromTelemetry(message, T0);
  assert.equal(hdt.length, 1);
  assert.equal(hdt[0].field, 'headingTrue');
  assert.equal(hdt[0].value, 274.07);
  assert.equal(hdt[0].observedAtFromSource, false);
});

test('Link: la posición de Droid entra como respaldo con su hora GPS y la de recepción', () => {
  const readings = droidReadingsFromLinkPosition({
    deviceId: 'phone-1',
    fix: { t: T0, lat: DROID_POS.lat, lon: DROID_POS.lng, sog: null, cog: 90 },
    rx: T0 + 300
  });
  assert.deepEqual(readings.map((r) => r.field), ['position', 'cog']);
  assert.deepEqual(readings[0].value, DROID_POS);
  assert.equal(readings[0].source, 'DROID');
  assert.equal(readings[0].observedAt, T0);
  assert.equal(readings[0].receivedAt, T0 + 300);
});

test('Link HDG references are kept separate and obey BOAT > DROID > SIMULATOR', () => {
  const policy = Object.fromEntries(NAVIGATION_FIELDS.map(field => [field, Object.fromEntries(
    ['BOAT', 'DROID', 'SIMULATOR'].map(source => [source, { maxAgeMs: MAX_AGE, ageFrom: 'observedAt' }])
  )])) as unknown as NavigationFreshnessPolicy;
  let now = T0 + 100;
  const state = new SharedNavigationState(policy, () => now);
  state.update(reading('headingMagnetic', 'SIMULATOR', 100, T0));
  const fromPhone = droidReadingsFromLinkPosition({ deviceId: 'phone-123', rx: now,
    fix: { t: now, lat: 36.7, lon: -3.5, sog: 5, cog: 90, hdg: 88, hdgRef: 'magnetic' } });
  fromPhone.forEach(r => state.update(r));
  assert.equal(state.resolve('headingMagnetic').source, 'DROID');
  assert.equal(state.resolve('headingTrue').status, 'UNKNOWN');
  state.update(reading('headingMagnetic', 'BOAT', 87, T0));
  assert.equal(state.resolve('headingMagnetic').source, 'BOAT');
  now = T0 + MAX_AGE + 50;
  assert.equal(state.resolve('headingMagnetic').source, 'DROID');
  now = T0 + MAX_AGE + 101;
  assert.equal(state.resolve('headingMagnetic').status, 'UNKNOWN');
  const legacy = droidReadingsFromLinkPosition({ deviceId: 'phone-123', rx: now,
    fix: { t: now, lat: 36.7, lon: -3.5, sog: 5, cog: 90, hdg: 88 } });
  assert.equal(legacy.some(r => r.field.startsWith('heading')), false);
});
