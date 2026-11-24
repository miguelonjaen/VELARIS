// Posición y rumbo de la carta desde el estado de navegación compartido (node:test).
// Ejecutar con: node --import tsx --test src/features/navigation/utils/chartNavigation.nodetest.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NAVIGATION_FIELDS,
  SharedNavigationState,
  type NavigationFreshnessPolicy,
  type NavigationReadingInput
} from '../../../core/navigation/SharedNavigationState';
import { droidReadingsFromLinkPosition } from '../../../core/navigation/SharedNavigationFeeds';
import { ElectronTelemetryAdapter, type ElectronTelemetryApi } from '../../../platform/telemetry/ElectronTelemetryAdapter';
import { CoreState } from '../../../core/CoreState';
import { TelemetryService } from '../../../core/services/TelemetryService';
import { selectChartNavigation, sharedChartFieldsKey } from './chartNavigation';
import { getMapAutoCenterTarget } from './mapAutoCenter';

const MAX_AGE = 10_000;
const freshness = { maxAgeMs: MAX_AGE, ageFrom: 'receivedAt' as const };
const policy = Object.fromEntries(NAVIGATION_FIELDS.map((field) => [field, {
  BOAT: freshness, DROID: freshness, SIMULATOR: freshness
}])) as unknown as NavigationFreshnessPolicy;

const T0 = Date.UTC(2026, 9, 20, 10, 0, 0);
const BENALMADENA = { lat: 36.5976, lng: -4.5118 }; // posición guardada / por defecto
const MOTRIL = { lat: 36.7213, lng: -3.5179 };
const FALLBACK_COG = 123;

function setup() {
  let now = T0;
  const state = new SharedNavigationState(policy, () => now);
  const chart = (fallback = BENALMADENA) => selectChartNavigation(
    { position: state.resolve('position'), headingTrue: state.resolve('headingTrue') },
    { position: fallback, heading: FALLBACK_COG }
  );
  return { state, chart, at: (t: number) => { now = t; } };
}

const reading = (
  field: NavigationReadingInput['field'], source: NavigationReadingInput['source'], value: any, t = T0
): NavigationReadingInput => ({
  field, source, sourceId: source === 'SIMULATOR' ? 'tcp:127.0.0.1:10110' : source === 'DROID' ? 'phone-1' : 'nmea',
  value, observedAt: t, receivedAt: t, observedAtFromSource: false
});

test('sin BOAT ni DROID válidos, la carta dibuja la posición SIMULATOR (no la guardada) y la marca como SIM', () => {
  const { state, chart } = setup();
  state.update(reading('position', 'SIMULATOR', MOTRIL));
  const view = chart();
  assert.deepEqual(view.position, MOTRIL);
  assert.equal(view.positionSource, 'SIMULATOR');
  assert.equal(view.simulated, true);
});

test('BOAT tiene prioridad sobre DROID y SIMULATOR, y no se marca como SIM', () => {
  const { state, chart } = setup();
  state.update(reading('position', 'SIMULATOR', MOTRIL));
  state.update(reading('position', 'DROID', BENALMADENA));
  state.update(reading('position', 'BOAT', { lat: 36.70, lng: -3.60 }));
  const view = chart({ lat: 0.5, lng: 0.5 });
  assert.deepEqual(view.position, { lat: 36.70, lng: -3.60 });
  assert.equal(view.positionSource, 'BOAT');
  assert.equal(view.simulated, false);
});

test('DROID tiene prioridad sobre SIMULATOR, y no se marca como SIM', () => {
  const { state, chart } = setup();
  state.update(reading('position', 'SIMULATOR', MOTRIL));
  state.update(reading('position', 'DROID', { lat: 36.60, lng: -4.50 }));
  const view = chart();
  assert.equal(view.positionSource, 'DROID');
  assert.deepEqual(view.position, { lat: 36.60, lng: -4.50 });
  assert.equal(view.simulated, false);
});

test('cuando DROID caduca, la carta pasa a SIMULATOR sin cambiar la prioridad', () => {
  const { state, chart, at } = setup();
  state.update(reading('position', 'DROID', { lat: 36.60, lng: -4.50 }, T0));
  state.update(reading('position', 'SIMULATOR', MOTRIL, T0 + 9_000));
  at(T0 + MAX_AGE + 1);
  assert.equal(chart().positionSource, 'SIMULATOR');
});

test('sin posición válida en el estado compartido se conserva el fallback del núcleo', () => {
  const { state, chart, at } = setup();
  assert.deepEqual(chart().position, BENALMADENA);
  assert.equal(chart().positionSource, null);
  assert.equal(chart().simulated, false);

  state.update(reading('position', 'SIMULATOR', MOTRIL, T0));
  at(T0 + MAX_AGE + 1); // caducado
  assert.deepEqual(chart().position, BENALMADENA);
  assert.equal(chart().simulated, false, 'un dato caducado no deja la marca SIM');
});

test('rumbo del marcador: proa verdadera si es válida; nunca el COG ni el magnético del estado compartido', () => {
  const { state, chart } = setup();
  state.update(reading('cog', 'SIMULATOR', 200));
  state.update(reading('headingMagnetic', 'SIMULATOR', 40));
  assert.equal(chart().heading, FALLBACK_COG, 'sin proa verdadera se conserva el comportamiento anterior');
  assert.equal(chart().headingSource, null);
  state.update(reading('headingTrue', 'SIMULATOR', 47));
  assert.equal(chart().heading, 47);
  assert.equal(chart().headingSource, 'SIMULATOR');
});

test('la clave de render cambia solo con lo visible', () => {
  const { state } = setup();
  const key = () => sharedChartFieldsKey({ position: state.resolve('position'), headingTrue: state.resolve('headingTrue') });
  const first = key();
  state.update(reading('sog', 'SIMULATOR', 5));
  assert.equal(key(), first, 'SOG no afecta a la carta');
  state.update(reading('position', 'SIMULATOR', MOTRIL));
  assert.notEqual(key(), first);
});

test('autocentrado: se recentra cuando cambia la procedencia de la posición mostrada', () => {
  // Primer centrado: posición guardada del barco (fallback, sin fuente).
  assert.deepEqual(getMapAutoCenterTarget({
    selectedShipId: 'b1', position: BENALMADENA, lastCenteredShipId: null, positionSource: null, lastCenteredSource: null
  }), [BENALMADENA.lat, BENALMADENA.lng]);
  // Llega SIMULATOR: misma embarcación, nueva procedencia → centra en Motril.
  assert.deepEqual(getMapAutoCenterTarget({
    selectedShipId: 'b1', position: MOTRIL, lastCenteredShipId: 'b1', positionSource: 'SIMULATOR', lastCenteredSource: null
  }), [MOTRIL.lat, MOTRIL.lng]);
  // Misma procedencia: no vuelve a forzar el centrado (el usuario puede desplazar la carta).
  assert.equal(getMapAutoCenterTarget({
    selectedShipId: 'b1', position: MOTRIL, lastCenteredShipId: 'b1', positionSource: 'SIMULATOR', lastCenteredSource: 'SIMULATOR'
  }), null);
  // Compatibilidad: sin procedencia, igual que antes.
  assert.equal(getMapAutoCenterTarget({ selectedShipId: 'b1', position: MOTRIL, lastCenteredShipId: 'b1' }), null);
});

test('Droid: un fix con src "simulation" no entra como DROID real; "phone_gps" sí', () => {
  const base = { deviceId: 'phone-1', rx: T0 };
  const simulated = droidReadingsFromLinkPosition({ ...base, fix: { t: T0, lat: 36.6, lon: -4.5, sog: 3, cog: 90, src: 'simulation' } });
  assert.deepEqual(simulated, []);
  const real = droidReadingsFromLinkPosition({ ...base, fix: { t: T0, lat: 36.6, lon: -4.5, sog: 3, cog: 90, src: 'phone_gps' } });
  assert.deepEqual(real.map((r) => [r.field, r.source]), [['position', 'DROID'], ['sog', 'DROID'], ['cog', 'DROID']]);
  const legacy = droidReadingsFromLinkPosition({ ...base, fix: { t: T0, lat: 36.6, lon: -4.5, sog: null, cog: null } });
  assert.equal(legacy.length, 1, 'sin src (emisores antiguos) se mantiene el comportamiento anterior');
});

test('los datos SIMULATOR no modifican app.state ni llegan a TelemetryService (alarmas, fondeo, AIS)', () => {
  const coreState = new CoreState();
  coreState.updatePosition(BENALMADENA.lat, BENALMADENA.lng, 0, 0, 'system');
  const telemetry = new TelemetryService(coreState);
  let processed = 0;
  const originalProcess = telemetry.process.bind(telemetry);
  telemetry.process = (data: unknown) => { processed += 1; originalProcess(data); };

  let now = T0;
  const navigationState = new SharedNavigationState(policy, () => ++now);
  const handlers = new Map<string, (data: unknown) => void>();
  const ipc: ElectronTelemetryApi = {
    on: (name, handler) => { handlers.set(name, handler); },
    removeListener: (name) => { handlers.delete(name); }
  };
  const adapter = new ElectronTelemetryAdapter(telemetry, navigationState, () => ++now);
  adapter.start(ipc);

  handlers.get('simulator-telemetry')?.({
    sourceId: 'tcp:127.0.0.1:10110',
    message: { type: 'GPS', lat: MOTRIL.lat, lng: MOTRIL.lng, sog: 6, cog: 47, fields: { position: true, sog: true, cog: true } }
  });
  handlers.get('simulator-telemetry')?.({ sourceId: 'tcp:127.0.0.1:10110', message: { type: 'HEADING', heading: 47, headingType: 'true' } });

  assert.equal(processed, 0);
  assert.deepEqual(coreState.shipPosition, BENALMADENA);
  assert.equal(coreState.sog, 0);
  assert.equal(coreState.cog, 0);

  const view = selectChartNavigation(
    { position: navigationState.resolve('position'), headingTrue: navigationState.resolve('headingTrue') },
    { position: coreState.shipPosition, heading: coreState.cog }
  );
  assert.deepEqual(view.position, MOTRIL, 'la carta dibuja el simulador…');
  assert.equal(view.simulated, true);
  assert.deepEqual(coreState.shipPosition, BENALMADENA, '…sin escribir en el estado operativo');
  adapter.stop();
});
