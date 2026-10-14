'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { LinkStore } = require('../linkStore');

const DEVICE = 'a9e2d001-0000-4000-8000-000000000002';
const OTHER = 'b9e2d001-0000-4000-8000-000000000003';
const TRACK = '5b1f6c2e-3d4a-4b5c-8d6e-7f8091a2b3c4';

const fakeBox = {
  isAvailable: () => true,
  encrypt: (s) => Buffer.from(`enc:${s}`).toString('base64'),
  decrypt: (s) => Buffer.from(s, 'base64').toString().replace(/^enc:/, '')
};

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'velaris-link-store-'));
const point = (seq) => ({ seq, t: 1792000000000 + seq * 1000, lat: 36.72 + seq * 1e-5, lon: -3.52, acc: 4, sog: 2.5, cog: 180, hdg: null, src: 'phone_gps' });
const meta = (rev, state, extra = {}) => ({
  rev, name: 'Paseo', state, startedAt: 1792000000000, endedAt: state === 'FINISHED' ? 1792003600000 : null,
  lastSeq: 0, source: 'phone_gps', deviceName: 'Pixel 7', distanceNm: 0, durationMs: 0, ...extra
});

test('identidad estable y servidor desactivado por defecto', () => {
  const dir = tempDir();
  const a = new LinkStore({ dir, secretBox: fakeBox }).init();
  const b = new LinkStore({ dir, secretBox: fakeBox }).init();
  assert.equal(a.identity.desktopId, b.identity.desktopId);
  assert.equal(b.settings.enabled, false);
  a.setEnabled(true);
  assert.equal(new LinkStore({ dir, secretBox: fakeBox }).init().settings.enabled, true);
});

test('el token se guarda cifrado y no se expone al listar', () => {
  const dir = tempDir();
  const store = new LinkStore({ dir, secretBox: fakeBox }).init();
  store.addDevice({ deviceId: DEVICE, name: 'Pixel 7', platform: 'android' }, 'secreto-123');
  const raw = fs.readFileSync(path.join(dir, 'devices.json'), 'utf8');
  assert.ok(!raw.includes('secreto-123'));
  assert.equal(store.getDeviceToken(DEVICE), 'secreto-123');
  assert.ok(!JSON.stringify(store.listDevices()).includes('tokenEnc'));
  assert.equal(store.revokeDevice(DEVICE), true);
  assert.equal(store.getDeviceToken(DEVICE), null);
});

test('sin cifrado seguro no se vincula', () => {
  const store = new LinkStore({ dir: tempDir(), secretBox: { ...fakeBox, isAvailable: () => false } }).init();
  assert.throws(() => store.addDevice({ deviceId: DEVICE, name: 'x', platform: 'android' }, 't'), /cifrado seguro/);
});

test('puntos duplicados y desordenados: sin duplicar y con secuencia contigua correcta', () => {
  const store = new LinkStore({ dir: tempDir(), secretBox: fakeBox }).init();
  let r = store.appendPoints(DEVICE, TRACK, [point(1), point(2), point(3)]);
  assert.equal(r.added.length, 3);
  assert.equal(r.contiguousSeq, 3);
  r = store.appendPoints(DEVICE, TRACK, [point(2), point(3), point(4)]);
  assert.equal(r.added.length, 1);
  assert.equal(r.contiguousSeq, 4);
  r = store.appendPoints(DEVICE, TRACK, [point(7), point(6)]);
  assert.equal(r.contiguousSeq, 4);
  assert.equal(r.maxSeq, 7);
  r = store.appendPoints(DEVICE, TRACK, [point(5), point(5)]);
  assert.equal(r.added.length, 1);
  assert.equal(r.contiguousSeq, 7);
  assert.deepEqual(store.getTrackPoints(TRACK).map((p) => p.seq), [1, 2, 3, 4, 5, 6, 7]);
});

test('los puntos se conservan íntegros tras reiniciar y toleran una línea truncada', () => {
  const dir = tempDir();
  const store = new LinkStore({ dir, secretBox: fakeBox, now: () => 1792000999000 }).init();
  store.upsertTrackMeta(DEVICE, TRACK, meta(1, 'RECORDING'));
  store.appendPoints(DEVICE, TRACK, [point(1), point(2)]);
  // Simula un corte de corriente a mitad de escritura.
  fs.appendFileSync(path.join(dir, 'tracks', TRACK, 'points.jsonl'), '{"seq":3,"t":17920');
  const reopened = new LinkStore({ dir, secretBox: fakeBox }).init();
  assert.equal(reopened.getTrackSyncState(TRACK).seq, 2);
  const original = point(1);
  const stored = reopened.getTrackPoints(TRACK)[0];
  assert.deepEqual({ ...stored, rx: undefined }, { ...original, rx: undefined });
  assert.equal(stored.rx, 1792000999000, 'se conserva la hora de recepción, distinta de la hora GPS');
  // El reenvío del punto 3 queda en una línea nueva y válida.
  reopened.appendPoints(DEVICE, TRACK, [point(3)]);
  const again = new LinkStore({ dir, secretBox: fakeBox }).init();
  assert.equal(again.getTrackSyncState(TRACK).seq, 3);
});

test('metadatos por revisión: idempotentes y nunca retroceden', () => {
  const store = new LinkStore({ dir: tempDir(), secretBox: fakeBox }).init();
  assert.equal(store.upsertTrackMeta(DEVICE, TRACK, meta(1, 'RECORDING')).changed, true);
  assert.equal(store.upsertTrackMeta(DEVICE, TRACK, meta(1, 'RECORDING')).changed, false);
  assert.equal(store.upsertTrackMeta(DEVICE, TRACK, meta(3, 'FINISHED', { lastSeq: 2 })).changed, true);
  const late = store.upsertTrackMeta(DEVICE, TRACK, meta(2, 'PAUSED'));
  assert.equal(late.changed, false);
  assert.equal(late.metaRev, 3);
  assert.equal(store.getTrackSummary(TRACK).state, 'FINISHED');
  assert.equal(store.getTrackSummary(TRACK).complete, false, 'faltan puntos');
  store.appendPoints(DEVICE, TRACK, [point(1), point(2)]);
  assert.equal(store.getTrackSummary(TRACK).complete, true);
});

test('un dispositivo no puede escribir en el track de otro', () => {
  const store = new LinkStore({ dir: tempDir(), secretBox: fakeBox }).init();
  store.upsertTrackMeta(DEVICE, TRACK, meta(1, 'RECORDING'));
  assert.throws(() => store.appendPoints(OTHER, TRACK, [point(1)]), /otro dispositivo/);
  assert.throws(() => store.upsertTrackMeta(OTHER, TRACK, meta(2, 'PAUSED')), /otro dispositivo/);
});

test('trackId con ruta se rechaza', () => {
  const store = new LinkStore({ dir: tempDir(), secretBox: fakeBox }).init();
  assert.throws(() => store.appendPoints(DEVICE, '../../evil', [point(1)]), /trackId inválido/);
});

test('eventos de bitácora deduplicados por eventId y persistentes', () => {
  const dir = tempDir();
  const store = new LinkStore({ dir, secretBox: fakeBox }).init();
  const event = {
    eventId: 'e7c1b2a3-4d5e-4f60-8a1b-2c3d4e5f6a01', trackId: TRACK, kind: 'TRACK_STARTED', auto: true,
    at: 1792000000000, lat: 36.72, lon: -3.52, title: 'Inicio de track', text: 'x', data: {}
  };
  assert.equal(store.addEvent(DEVICE, 'Pixel 7', event).added, true);
  assert.equal(store.addEvent(DEVICE, 'Pixel 7', event).added, false);
  const reopened = new LinkStore({ dir, secretBox: fakeBox }).init();
  assert.equal(reopened.listEvents().length, 1);
  assert.deepEqual(reopened.getTrackSyncState(TRACK).events, [event.eventId]);
});
