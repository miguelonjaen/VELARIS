'use strict';

/**
 * Datos del barco para BOAT_DATA (link/boatData.js). Los mensajes tienen la misma forma que los
 * que produce NMEAParser (src/core/services/NMEAParser.ts) y la procedencia que añade NMEAService.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const protocol = require('../protocol');
const { BoatDataFeed } = require('../boatData');

const SERIAL = { transport: 'serial', source: 'BOAT', sourceId: 'nmea' };
const TCP_BOAT = { transport: 'tcp', source: 'BOAT', sourceId: 'tcp:127.0.0.1:10110' };
const TCP_SIM = { transport: 'tcp', source: 'SIMULATOR', sourceId: 'tcp:127.0.0.1:10110' };

const RMC = { type: 'GPS', lat: 36.614, lng: -3.385, sog: 6.3, cog: 291.5, timestamp: '2026-10-22T08:00:00.000Z', fields: { position: true, sog: true, cog: true } };
const GGA = { type: 'GPS', lat: 36.62, lng: -3.39, sog: 0, cog: 0, timestamp: '080001', fields: { position: true, sog: false, cog: false } };
const VTG = { type: 'GPS', lat: 0, lng: 0, sog: 7.1, cog: 300, fields: { position: false, sog: true, cog: true } };
const HDT = { type: 'HEADING', heading: 289, headingType: 'true', sentence: 'HDT' };
const HDM = { type: 'HEADING', heading: 290.5, headingType: 'magnetic', sentence: 'HDM' };
const HDG = { type: 'HEADING', heading: 288, headingType: 'magnetic', sentence: 'HDG' };
const DPT = { type: 'DEPTH', depth: 12.6, reference: 'transducer' };

function feedAt(start = 1000) {
  let now = start;
  const feed = new BoatDataFeed({ now: () => now });
  return { feed, advance: (ms) => { now += ms; } };
}

test('instrumentos por puerto serie: todos los campos, con su antigüedad y un payload válido', () => {
  const { feed, advance } = feedAt();
  for (const message of [RMC, HDT, HDM, DPT]) assert.equal(feed.ingest(message, SERIAL), true);
  advance(420);
  const payload = feed.payload();
  assert.deepEqual(payload, {
    position: { lat: 36.614, lon: -3.385, ageMs: 420 },
    sog: { v: 6.3, ageMs: 420 },
    cog: { v: 291.5, ageMs: 420 },
    hdgTrue: { v: 289, ageMs: 420 },
    hdgMag: { v: 290.5, ageMs: 420 },
    depth: { v: 12.6, ref: 'transducer', ageMs: 420 },
    origin: { transport: 'serial', declared: false }
  });
  assert.equal(protocol.validateBoatData(payload).ok, true);
});

test('simulador declarado «Instrumentos del barco» por TCP: se envía, marcado como declarado', () => {
  const { feed } = feedAt();
  feed.ingest(RMC, TCP_BOAT);
  const payload = feed.payload();
  assert.deepEqual(payload.origin, { transport: 'tcp', declared: true });
  assert.ok(payload.position);
});

test('simulador «solo visual», Droid u origen desconocido: nunca entran', () => {
  const { feed } = feedAt();
  assert.equal(feed.ingest(RMC, TCP_SIM), false);
  assert.equal(feed.ingest(RMC, { transport: 'link', source: 'DROID', sourceId: 'phone-1' }), false);
  assert.equal(feed.ingest(RMC, undefined), false);
  assert.equal(feed.ingest(RMC, { transport: 'udp', source: 'BOAT', sourceId: 'x' }), false);
  assert.equal(feed.payload(), null);
});

test('solo los campos presentes: GGA no aporta SOG/COG y VTG no aporta posición; nada se inventa', () => {
  const { feed } = feedAt();
  feed.ingest(GGA, SERIAL);
  assert.deepEqual(Object.keys(feed.payload()).sort(), ['origin', 'position']);
  feed.ingest(VTG, SERIAL);
  const payload = feed.payload();
  assert.deepEqual(payload.position, { lat: 36.62, lon: -3.39, ageMs: 0 }, 'VTG no pone la posición en 0,0');
  assert.equal(payload.sog.v, 7.1);
  assert.equal(payload.cog.v, 300);
  assert.equal(payload.hdgTrue, undefined);
  assert.equal(payload.depth, undefined);
});

test('HDG (desvío sin aplicar) no se envía como magnético; profundidad sin referencia tampoco', () => {
  const { feed } = feedAt();
  feed.ingest(HDG, SERIAL);
  feed.ingest({ type: 'DEPTH', depth: 9 }, SERIAL);
  assert.equal(feed.payload(), null);
});

test('una lectura más reciente inválida retira el valor anterior de ese campo', () => {
  const { feed } = feedAt();
  feed.ingest(RMC, SERIAL);
  feed.ingest({ ...RMC, lat: 0, lng: 0 }, SERIAL);
  const payload = feed.payload();
  assert.equal(payload.position, undefined);
  assert.equal(payload.sog.v, 6.3);
});

test('caducidad por campo: un dato de más de 10 s deja de enviarse', () => {
  const { feed, advance } = feedAt();
  feed.ingest(RMC, SERIAL);
  advance(6000);
  feed.ingest(HDT, SERIAL);
  advance(4001);
  const payload = feed.payload();
  assert.equal(payload.position, undefined, 'posición caducada');
  assert.equal(payload.hdgTrue.ageMs, 4001);
  advance(6000);
  assert.equal(feed.payload(), null);
});

test('cambiar de conexión o desconectar olvida los datos anteriores', () => {
  const { feed } = feedAt();
  feed.ingest(RMC, SERIAL);
  feed.ingest(HDT, TCP_BOAT);
  const payload = feed.payload();
  assert.equal(payload.position, undefined, 'la posición del puerto serie no se mezcla con el TCP');
  assert.equal(payload.origin.transport, 'tcp');
  feed.clear();
  assert.equal(feed.payload(), null);
});

test('contrato: campos desconocidos se ignoran; el resultado es exactamente el contrato', () => {
  const result = protocol.validateBoatData({
    sog: { v: 5, ageMs: 10, extra: 1 }, wind: { v: 3, ageMs: 1 }, origin: { transport: 'serial', declared: false, x: 1 }
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { sog: { v: 5, ageMs: 10 }, origin: { transport: 'serial', declared: false } });
  assert.equal(protocol.CAPABILITIES.includes('boat.v1'), true);
});
