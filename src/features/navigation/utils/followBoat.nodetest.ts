// «Seguir barco»: estados del botón y decisión de recentrar (node:test).
// Ejecutar con: node --import tsx --test src/features/navigation/utils/followBoat.nodetest.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FOLLOW_RECENTER_THRESHOLD_PX,
  INITIAL_FOLLOW_STATE,
  followReducer,
  followStatus,
  isValidFollowPosition,
  shouldRecenter
} from './followBoat';

const BOAT = { lat: 36.614, lng: -3.385 };

test('activar, desactivar y reactivar con el botón', () => {
  const on = followReducer(INITIAL_FOLLOW_STATE, 'toggle');
  assert.deepEqual(on, { following: true, suspendedByUser: false });
  const off = followReducer(on, 'toggle');
  assert.deepEqual(off, { following: false, suspendedByUser: false });
  assert.deepEqual(followReducer(off, 'toggle'), on);
});

test('el paneo manual suspende el seguimiento y lo indica; el botón lo reactiva', () => {
  const on = followReducer(INITIAL_FOLLOW_STATE, 'toggle');
  const panned = followReducer(on, 'userPan');
  assert.deepEqual(panned, { following: false, suspendedByUser: true });
  assert.equal(followStatus(panned, true).note, 'Suspendido');
  assert.equal(shouldRecenter(panned.following, BOAT, 500), false, 'no lucha contra el usuario');
  const resumed = followReducer(panned, 'toggle');
  assert.deepEqual(resumed, { following: true, suspendedByUser: false });
  assert.equal(shouldRecenter(resumed.following, BOAT, 500), true);
  // Sin seguimiento, arrastrar la carta no cambia nada.
  assert.equal(followReducer(INITIAL_FOLLOW_STATE, 'userPan'), INITIAL_FOLLOW_STATE);
});

test('al activarlo centra en la posición válida y actual', () => {
  assert.equal(shouldRecenter(true, BOAT, 240), true);
  assert.equal(followStatus({ following: true, suspendedByUser: false }, true).active, true);
});

test('sin posición válida no se mueve la carta (nada inventado ni caducado)', () => {
  for (const position of [null, undefined, { lat: 0, lng: 0 }, { lat: 91, lng: 0 }, { lat: Number.NaN, lng: 3 }]) {
    assert.equal(shouldRecenter(true, position as never, 300), false);
  }
  assert.equal(isValidFollowPosition(BOAT), true);
  const waiting = followStatus({ following: true, suspendedByUser: false }, false);
  assert.equal(waiting.note, 'Sin posición');
  assert.match(waiting.title, /esperando una posición válida y actual/);
});

test('posición quieta o casi en el centro: no hay movimientos constantes', () => {
  assert.equal(shouldRecenter(true, BOAT, 0), false);
  assert.equal(shouldRecenter(true, BOAT, FOLLOW_RECENTER_THRESHOLD_PX - 0.5), false);
  assert.equal(shouldRecenter(true, BOAT, FOLLOW_RECENTER_THRESHOLD_PX), true);
  assert.equal(shouldRecenter(true, BOAT, null), false);
  assert.equal(shouldRecenter(false, BOAT, 1000), false, 'desactivado nunca mueve la carta');
});
