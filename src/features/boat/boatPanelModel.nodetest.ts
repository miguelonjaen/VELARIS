// Panel «Barco»: presentación honesta de datos presentes y ausentes (node:test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBoatPanelModel, NO_DATA, NO_SENSOR, NOT_SUPPORTED, UNKNOWN, type BoatPanelInput } from './boatPanelModel';
import { BoatInstrumentStore } from '../../core/instruments/BoatInstrumentStore';
import { NMEAParser } from '../../core/services/NMEAParser';
import {
  NAVIGATION_FIELDS,
  SharedNavigationState,
  type NavigationFreshnessPolicy
} from '../../core/navigation/SharedNavigationState';

const T0 = Date.UTC(2026, 9, 22, 10, 0, 0);
const policy = Object.fromEntries(NAVIGATION_FIELDS.map((field) => [field, {
  BOAT: { maxAgeMs: 5000, ageFrom: 'receivedAt' },
  DROID: { maxAgeMs: 5000, ageFrom: 'receivedAt' },
  SIMULATOR: { maxAgeMs: 5000, ageFrom: 'receivedAt' }
}])) as unknown as NavigationFreshnessPolicy;
const cs = (body: string) => { let c = 0; for (const ch of body) c ^= ch.charCodeAt(0); return `$${body}*${c.toString(16).toUpperCase().padStart(2, '0')}`; };

function input(nav: SharedNavigationState, store: BoatInstrumentStore, extra: Partial<BoatPanelInput> = {}): BoatPanelInput {
  return {
    now: T0,
    navigation: nav.snapshot(T0),
    instruments: store.snapshot(T0),
    voyage: { status: 'not_started', autoStarted: false, startedAt: null },
    alarms: [],
    ais: { enabled: true, targetCount: 0, dangerousCount: 0 },
    nmea: null,
    ...extra
  };
}
const rows = (model: ReturnType<typeof buildBoatPanelModel>) =>
  Object.fromEntries(model.flatMap(s => s.rows.map(r => [`${s.id}:${r.label}`, r])));

test('9/10 · sin datos: cada campo dice Sin sensor / Sin datos / Desconocido, nunca 0', () => {
  const model = buildBoatPanelModel(input(new SharedNavigationState(policy, () => T0), new BoatInstrumentStore(() => T0)));
  assert.deepEqual(model.map(s => s.id), ['navigation', 'engine', 'tanks', 'electrical', 'safety']);
  const r = rows(model);
  assert.equal(r['navigation:Posición'].value, NO_DATA);
  assert.equal(r['navigation:SOG'].value, NO_DATA);
  assert.equal(r['navigation:HDG'].value, NO_DATA);
  assert.equal(r['navigation:Profundidad'].value, NO_SENSOR);
  assert.equal(r['navigation:Viento real'].value, NO_SENSOR);
  assert.equal(r['navigation:Propulsión'].value, UNKNOWN);
  assert.equal(r['engine:Estado'].value, UNKNOWN);
  assert.equal(r['engine:RPM'].value, NO_SENSOR);
  assert.equal(r['engine:Horas'].value, NOT_SUPPORTED);
  assert.equal(r['tanks:Combustible'].value, NO_SENSOR);
  assert.equal(r['tanks:Aguas negras'].value, NO_SENSOR);
  assert.equal(r['electrical:Baterías'].value, NO_SENSOR);
  assert.equal(r['electrical:Estado de carga (SOC)'].value, NOT_SUPPORTED);
  for (const section of model) for (const row of section.rows) {
    assert.doesNotMatch(row.value, /^0([.,]0+)?\b/, `${section.id}:${row.label} no debe mostrar un cero inventado`);
  }
});

test('datos del simulador declarado como barco: valores con fuente y antigüedad', () => {
  const nav = new SharedNavigationState(policy, () => T0);
  const base = { source: 'BOAT' as const, sourceId: 'tcp', observedAt: T0 - 2000, receivedAt: T0 - 2000, observedAtFromSource: false };
  nav.update({ ...base, field: 'position', value: { lat: 36.595, lng: -4.51 } });
  nav.update({ ...base, field: 'sog', value: 6.2 });
  nav.update({ ...base, field: 'cog', value: 95 });
  nav.update({ ...base, field: 'headingTrue', value: 97 });
  const store = new BoatInstrumentStore(() => T0);
  const p = new NMEAParser();
  store.ingest(p.parse(cs('ERRPM,E,1,2500.0,,A')), T0 - 1000);
  store.ingest(p.parse(cs('ERXDR,C,82.0,C,ENGINE#0,T,2500.0,R,ENGINE#0')), T0 - 1000);
  const r = rows(buildBoatPanelModel(input(nav, store, {
    voyage: { status: 'active', autoStarted: true, startedAt: T0 - 60_000 },
    nmea: { connected: true, declaredAs: 'BOAT', lastLineAgeMs: 500 }
  })));
  assert.equal(r['navigation:Travesía'].value, 'Activa (automática)');
  assert.equal(r['navigation:Fuente de navegación'].value, 'Instrumentos del barco');
  assert.equal(r['navigation:SOG'].value, '6.2 kn');
  assert.equal(r['navigation:SOG'].age, 'hace 2 s');
  assert.equal(r['navigation:COG'].value, '095° T');
  assert.equal(r['navigation:HDG'].value, '097° verdadero');
  assert.equal(r['engine:Estado'].value, 'En marcha');
  assert.equal(r['engine:RPM'].value, '2500 rpm');
  assert.equal(r['engine:Temperatura'].value, '82 °C');
  assert.equal(r['engine:Presión de aceite'].value, NO_SENSOR);
  assert.equal(r['safety:Conexión NMEA'].value, 'Conectada · instrumentos del barco');
});

test('simulador visual: se identifica como tal, nunca como instrumentos del barco', () => {
  const nav = new SharedNavigationState(policy, () => T0);
  nav.update({ source: 'SIMULATOR', sourceId: 'tcp', observedAt: T0, receivedAt: T0, observedAtFromSource: false, field: 'position', value: { lat: 36.6, lng: -4.5 } });
  const r = rows(buildBoatPanelModel(input(nav, new BoatInstrumentStore(() => T0), { nmea: { connected: true, declaredAs: 'SIMULATOR', lastLineAgeMs: 0 } })));
  assert.equal(r['navigation:Fuente de navegación'].value, 'Simulador visual');
  assert.equal(r['navigation:Posición'].source, 'Simulador visual');
  assert.equal(r['safety:Conexión NMEA'].value, 'Conectada · simulador visual');
  assert.equal(r['safety:Instrumentos del barco'].value, NO_DATA);
});

test('motor parado solo con 0 rpm recibidas; travesía sin señal visible', () => {
  const store = new BoatInstrumentStore(() => T0);
  store.ingest(new NMEAParser().parse(cs('ERRPM,E,0,0,,A')), T0);
  const r = rows(buildBoatPanelModel(input(new SharedNavigationState(policy, () => T0), store, {
    voyage: { status: 'no_signal', autoStarted: true, startedAt: T0 - 1 }
  })));
  assert.equal(r['engine:Estado'].value, 'Parado');
  assert.equal(r['navigation:Travesía'].status, 'warning');
});


test('millas navegadas solo durante travesía activa, también sin señal', () => {
  const nav = new SharedNavigationState(policy, () => T0);
  const store = new BoatInstrumentStore(() => T0);
  for (const status of ['active', 'no_signal', 'finished', 'not_started'] as const) {
    const r = rows(buildBoatPanelModel(input(nav, store, {
      voyage: { status, autoStarted: true, startedAt: T0, distanceNm: 12.345 }
    })));
    if (status === 'active' || status === 'no_signal') assert.equal(r['navigation:Millas navegadas'].value, '12.35 NM');
    else assert.equal(r['navigation:Millas navegadas'], undefined);
  }
});


test('Barco presenta MWD verdadero y propulsión según RPM, con fallback manual explícito', () => {
  const nav = new SharedNavigationState(policy, () => T0);
  const store = new BoatInstrumentStore(() => T0);
  const parser = new NMEAParser();
  store.ingest(parser.parse(cs('WIMWD,270,T,268,M,14,N,7.2,M')), T0);
  store.ingest(parser.parse(cs('ERRPM,E,0,1800,,A')), T0);
  const read = () => rows(buildBoatPanelModel(input(nav, store)));
  assert.equal(read()['navigation:Viento real'].value, '14.0 kn · 270° T');
  assert.equal(read()['navigation:Propulsión'].value, 'Motor');
  store.ingest(parser.parse(cs('ERRPM,E,0,0,,A')), T0);
  assert.equal(read()['navigation:Propulsión'].value, 'Vela');
  const manual = rows(buildBoatPanelModel(input(nav, store, { propulsion: { mode: 'MOTOR', source: 'manual' } })));
  assert.equal(manual['navigation:Propulsión'].value, 'Motor');
  assert.match(manual['navigation:Propulsión'].source ?? '', /manual/);
});
