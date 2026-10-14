'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const protocol = require('../protocol');

const FIXTURES = path.resolve(__dirname, '..', '..', '..', 'VELARIS-Link', 'fixtures');
const readFixture = (name) => JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf8'));

test('los mensajes válidos comunes se aceptan y conservan todos sus campos', () => {
  const { messages } = readFixture('messages.json');
  assert.ok(messages.length >= 20);
  const typesSeen = new Set();
  for (const { name, message } of messages) {
    const result = protocol.validateMessage(message);
    assert.equal(result.ok, true, `${name}: ${result.ok ? '' : result.code + ' ' + result.detail}`);
    assert.deepEqual(JSON.parse(JSON.stringify(result.value)), message, `${name} cambia al validar`);
    typesSeen.add(message.type);
  }
  for (const type of Object.values(protocol.TYPES)) {
    assert.ok(typesSeen.has(type), `falta ejemplo JSON para ${type}`);
  }
});

test('los mensajes inválidos comunes se rechazan con el código esperado', () => {
  const { messages } = readFixture('invalid.json');
  for (const { name, message, reason } of messages) {
    const result = protocol.validateMessage(message);
    assert.equal(result.ok, false, `${name} debería rechazarse`);
    assert.equal(result.code, reason, `${name}: ${result.detail}`);
  }
});

test('el reto-respuesta coincide con el vector común', () => {
  const v = readFixture('auth-vector.json');
  const proof = protocol.computeProof(v.token, v.nonce, v.desktopId, v.deviceId);
  assert.equal(proof, v.proof);
  assert.equal(protocol.proofsEqual(proof, v.proof), true);
  assert.equal(protocol.proofsEqual(proof, '0'.repeat(64)), false);
  assert.equal(protocol.proofsEqual(proof, 'abc'), false);
});

test('una posición sin coordenadas nunca se convierte en 0,0', () => {
  assert.equal(protocol.validateFix({ t: 1792000000000, src: 'phone_gps' }).ok, false);
  assert.equal(protocol.validateFix({ t: 1792000000000, lat: 0, lon: 0, src: 'phone_gps' }).ok, false);
  assert.equal(protocol.validateFix({ t: 1792000000000, lat: NaN, lon: 2, src: 'phone_gps' }).ok, false);
  assert.equal(protocol.validateFix({ t: 1792000000000, lat: '36', lon: '2', src: 'phone_gps' }).ok, false);
  const ok = protocol.validateFix({ t: 1792000000000, lat: 36.7, lon: -3.5, src: 'phone_gps' });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.value, { t: 1792000000000, lat: 36.7, lon: -3.5, acc: null, sog: null, cog: null, hdg: null, src: 'phone_gps' });
});

test('un lote de puntos demasiado grande se rechaza', () => {
  const points = Array.from({ length: protocol.MAX_POINTS_PER_BATCH + 1 }, (_, i) => ({
    seq: i + 1, t: 1792000000000 + i * 1000, lat: 36.7, lon: -3.5, acc: 3, sog: 1, cog: 10, hdg: null, src: 'phone_gps'
  }));
  const message = protocol.createMessage('TRACK_POINTS', 'a9e2d001-0000-4000-8000-000000000002', { points },
    { sid: '5b1f6c2e-3d4a-4b5c-8d6e-7f8091a2b3c4', ack: true, now: 1792000000000 });
  const result = protocol.validateMessage(message);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'BAD_POINT');
});
