// Lecturas de instrumentos del barco: RPM/XDR del NMEA y caducidad (node:test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NMEAParser } from '../services/NMEAParser';
import { BoatInstrumentStore, INSTRUMENT_MAX_AGE_MS } from './BoatInstrumentStore';

const withChecksum = (body: string) => {
  let cs = 0;
  for (const ch of body) cs ^= ch.charCodeAt(0);
  return `$${body}*${cs.toString(16).toUpperCase().padStart(2, '0')}`;
};
const parser = new NMEAParser();
const T0 = Date.UTC(2026, 9, 22, 10, 0, 0);

test('RPM: sentencias del NMEA Simulator X se interpretan; estado V se rechaza', () => {
  const ok = parser.parse(withChecksum('ERRPM,E,2,2500.0,,A'));
  assert.equal(ok.type, 'ENGINE_RPM');
  assert.ok(ok.type === 'ENGINE_RPM' && ok.rpm === 2500 && ok.engine === 2 && ok.source === 'engine');
  assert.equal(parser.parse(withChecksum('ERRPM,E,1,2500.0,,V')).type, 'NMEA_INVALID');
  assert.equal(parser.parse(withChecksum('ERRPM,E,1,,,A')).type, 'NMEA_INVALID');
});

test('XDR: temperatura y RPM de motor en una misma sentencia', () => {
  const msg = parser.parse(withChecksum('ERXDR,C,82.0,C,ENGINE#0,T,2500.0,R,ENGINE#0'));
  assert.equal(msg.type, 'TRANSDUCER');
  const store = new BoatInstrumentStore(() => T0);
  assert.equal(store.ingest(msg, T0), true);
  const snap = store.snapshot(T0 + 1000);
  assert.equal(snap.engines.length, 1);
  assert.equal(snap.engines[0].temperatureC?.value, 82);
  assert.equal(snap.engines[0].rpm?.value, 2500);
  assert.equal(snap.engines[0].oilPressureBar, null, 'sin sensor de aceite no hay lectura');
});

test('XDR: baterías, alternador, aceite y depósitos con unidades y rangos', () => {
  const store = new BoatInstrumentStore(() => T0);
  store.ingest(parser.parse(withChecksum('IIXDR,U,12.45,V,BAT_START,U,12.10,V,BAT_HOUSE,I,-8.5,A,BAT_HOUSE,U,14.1,V,ALT')), T0);
  store.ingest(parser.parse(withChecksum('IIXDR,P,3.2,B,ENGINE#0_OIL,V,40,P,FUEL,V,70,P,FRESHWATER')), T0);
  store.ingest(parser.parse(withChecksum('IIXDR,V,140,P,FUEL2')), T0); // fuera de rango → rechazado
  const s = store.snapshot(T0);
  assert.equal(s.alternatorVolts?.value, 14.1);
  assert.deepEqual(s.batteries.map(b => [b.role, b.volts?.value ?? null]), [['service', 12.1], ['start', 12.45]]);
  assert.equal(s.batteries.find(b => b.role === 'service')?.amps?.value, -8.5);
  assert.equal(s.engines[0].oilPressureBar?.value, 3.2);
  assert.deepEqual(s.tanks.map(t => [t.kind, t.percent.value]), [['freshWater', 70], ['fuel', 40]]);
});

test('caducidad: una lectura antigua desaparece (no se mantiene como dato vigente)', () => {
  const store = new BoatInstrumentStore(() => T0);
  store.ingest(parser.parse(withChecksum('ERRPM,E,1,1800,,A')), T0);
  store.ingest({ type: 'DEPTH', depth: 12.3, reference: 'transducer' } as any, T0);
  assert.equal(store.snapshot(T0 + INSTRUMENT_MAX_AGE_MS.rpm).engines[0].rpm?.value, 1800);
  assert.equal(store.snapshot(T0 + INSTRUMENT_MAX_AGE_MS.rpm + 1).engines.length, 0);
  assert.equal(store.snapshot(T0 + INSTRUMENT_MAX_AGE_MS.depth + 1).depth, null);
});

test('sin datos: snapshot vacío, sin ceros por defecto', () => {
  const s = new BoatInstrumentStore(() => T0).snapshot(T0);
  assert.deepEqual(s, { speedThroughWater: null, depth: null, windApparent: null, windTrue: null, windDirectionTrue: null, engines: [], alternatorVolts: null, batteries: [], tanks: [] });
});


test('propulsión automática: cualquier motor girando, todos parados, caducidad y giro inverso', () => {
  const store = new BoatInstrumentStore(() => T0);
  assert.equal(store.engineRunning(T0), null);
  const rpm = (engine: number, value: number, at = T0) =>
    store.ingest({ type: 'ENGINE_RPM', source: 'engine', engine, rpm: value }, at);
  rpm(1, 0); rpm(2, 1800);
  assert.equal(store.engineRunning(T0), true);
  rpm(2, 0);
  assert.equal(store.engineRunning(T0), false);
  rpm(2, -800);
  assert.equal(store.engineRunning(T0), true, 'RPM negativas también significan giro');
  const later = T0 + INSTRUMENT_MAX_AGE_MS.rpm + 1;
  rpm(1, 0, later);
  assert.equal(store.engineRunning(later), null, 'un motor sin RPM frescas no se da por parado');
  rpm(2, 0, later);
  assert.equal(store.engineRunning(later), false);
});


test('Simulator X: RPM 1 y XDR ENGINE#0 corresponden a un único motor', () => {
  for (const reverse of [false, true]) {
    const store = new BoatInstrumentStore(() => T0);
    const lines = ['ERRPM,E,1,1800.0,,A', 'ERXDR,C,82.0,C,ENGINE#0,T,1800.0,R,ENGINE#0'];
    for (const line of reverse ? lines.reverse() : lines) store.ingest(parser.parse(withChecksum(line)), T0);
    const engines = store.snapshot(T0).engines;
    assert.equal(engines.length, 1);
    assert.equal(engines[0].engine, 1);
    assert.equal(engines[0].rpm?.value, 1800);
    assert.equal(engines[0].temperatureC?.value, 82);
    store.ingest(parser.parse(withChecksum('ERRPM,E,1,0,,A')), T0 + 1000);
    store.ingest(parser.parse(withChecksum('ERXDR,T,0,R,ENGINE#0')), T0 + 1000);
    assert.equal(store.engineRunning(T0 + 1000), false);
  }
});

test('dos motores reales no se fusionan aunque tengan las mismas RPM', () => {
  const store = new BoatInstrumentStore(() => T0);
  for (const line of [
    'ERRPM,E,1,1800,,A', 'ERRPM,E,2,1800,,A',
    'ERXDR,C,82,C,ENGINE#0,T,1800,R,ENGINE#0',
    'ERXDR,C,74,C,ENGINE#1,T,1800,R,ENGINE#1'
  ]) store.ingest(parser.parse(withChecksum(line)), T0);
  const engines = store.snapshot(T0).engines;
  assert.equal(engines.length, 2);
  assert.deepEqual(engines.map(e => [e.engine, e.rpm?.value, e.temperatureC?.value]), [[1, 1800, 82], [2, 1800, 74]]);
});

test('sonda NMEA: lectura vigente, renovación y caducidad', () => {
  const store = new BoatInstrumentStore(() => T0);

  // Primera lectura: 8,4 metros bajo el transductor.
  const first = parser.parse(
    withChecksum('SDDBT,27.6,f,8.4,M,4.6,F')
  );

  assert.equal(first.type, 'DEPTH');
  assert.equal(store.ingest(first, T0), true);

  const initial = store.snapshot(T0);
  assert.equal(initial.depth?.value.meters, 8.4);
  assert.equal(initial.depth?.value.reference, 'transducer');
  assert.equal(initial.depth?.ageMs, 0);

  // A los siete segundos sigue vigente.
  const afterSevenSeconds = store.snapshot(T0 + 7000);
  assert.equal(afterSevenSeconds.depth?.value.meters, 8.4);
  assert.equal(afterSevenSeconds.depth?.ageMs, 7000);

  // Llega una nueva medición a los siete segundos.
  const second = parser.parse(
    withChecksum('SDDBT,29.5,f,9.0,M,4.9,F')
  );

  assert.equal(second.type, 'DEPTH');
  assert.equal(store.ingest(second, T0 + 7000), true);

  const renewed = store.snapshot(T0 + 7000);
  assert.equal(renewed.depth?.value.meters, 9.0);
  assert.equal(renewed.depth?.ageMs, 0);

  // Ocho segundos después de la renovación sigue vigente.
  assert.equal(
    store.snapshot(T0 + 15000).depth?.value.meters,
    9.0
  );

  // Un milisegundo después del límite deja de estar vigente.
  assert.equal(
    store.snapshot(T0 + 15001).depth,
    null
  );
});

test('GAULOS XDR v1: solar sides and relay feedback expire independently, invalid readings do not refresh', () => {
    const store = new BoatInstrumentStore(() => T0);
    const ingest = (body: string, at = T0) => store.ingest(parser.parse(withChecksum(body)), at);
    assert.equal(ingest('IIXDR,U,38,V,SOLAR0_PV,I,4.2,A,SOLAR0_PV'), true);
    assert.equal(ingest('IIXDR,U,13.4,V,SOLAR0_OUT,I,11.3,A,SOLAR0_OUT'), true);
    assert.equal(ingest('IIXDR,S,1,,LIGHT_NAV_RELAY,S,0,,LIGHT_ANCHOR_RELAY'), true);
    const first = store.snapshot(T0);
    assert.equal(first.solar?.pvVolts?.value, 38);
    assert.equal(first.solar?.outputAmps?.value, 11.3);
    assert.deepEqual(first.lights?.map(light => light.relay?.value), [1, 0]);
    for (const body of [
        'IIXDR,U,251,V,SOLAR0_PV', 'IIXDR,U,101,V,SOLAR0_OUT',
        'IIXDR,I,-1,A,SOLAR0_OUT', 'IIXDR,I,201,A,SOLAR0_OUT',
        'IIXDR,S,2,,LIGHT_NAV_RELAY', 'IIXDR,S,-1,,LIGHT_NAV_RELAY',
        'IIXDR,S,0.5,,LIGHT_NAV_RELAY', 'IIXDR,S,0,V,LIGHT_NAV_RELAY',
        'IIXDR,U,20,A,SOLAR0_PV', 'IIXDR,S,1,,LIGHT_NAV_RELAY_EXTRA',
        'IIXDR,U,20,V,solar0_pv', 'IIXDR,S,1bad,,LIGHT_NAV_RELAY'
    ]) assert.equal(ingest(body, T0 + 14000), false, body);
    assert.equal(store.snapshot(T0 + 15000).lights?.[0].relay?.value, 1);
    const expired = store.snapshot(T0 + 15001);
    assert.equal(expired.lights?.[0].relay, null);
    assert.equal(expired.solar?.pvVolts, null);
    ingest('IIXDR,I,0,A,SOLAR0_OUT,S,0,,LIGHT_NAV_RELAY', T0 + 16000);
    const renewed = store.snapshot(T0 + 16000);
    assert.equal(renewed.solar?.outputAmps?.value, 0);
    assert.equal(renewed.solar?.outputVolts, null);
    assert.equal(renewed.lights?.[0].relay?.value, 0);
    store.clearElectricalFeedback();
    assert.equal(store.snapshot().solar, undefined);
    assert.equal(store.snapshot().lights, undefined);
    ingest('IIXDR,S,1,,LIGHT_CABIN_RELAY');
    store.clear();
    assert.equal(store.snapshot().lights, undefined);
});

test('XDR rejects partial and empty numeric fields without turning them into relay states', () => {
    for (const raw of ['1oops', '', 'NaN', 'Infinity', '0x1']) {
        assert.equal(parser.parse(withChecksum(`IIXDR,S,${raw},,LIGHT_NAV_RELAY`)).type, 'NMEA_INVALID');
    }
});
