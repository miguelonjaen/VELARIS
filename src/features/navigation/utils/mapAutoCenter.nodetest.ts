// Validación del centrado automático de la carta (node:test, sin dependencias nuevas).
// Ejecutar con: node --import tsx --test src/features/navigation/utils/mapAutoCenter.nodetest.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getMapAutoCenterTarget } from './mapAutoCenter';

const POS = { lat: 36.5976, lng: -4.5118 };

test('no centra si no hay embarcación seleccionada', () => {
  assert.equal(getMapAutoCenterTarget({ selectedShipId: null, position: POS, lastCenteredShipId: null }), null);
});

test('no centra mientras la posición no está disponible', () => {
  assert.equal(getMapAutoCenterTarget({ selectedShipId: 'b1', position: null, lastCenteredShipId: null }), null);
});

test('centra cuando la posición llega después de seleccionar la embarcación', () => {
  // Primera evaluación: embarcación seleccionada, sin posición todavía.
  const first = getMapAutoCenterTarget({ selectedShipId: 'b1', position: null, lastCenteredShipId: null });
  assert.equal(first, null);
  // Segunda evaluación: llega la posición con la misma embarcación.
  const second = getMapAutoCenterTarget({ selectedShipId: 'b1', position: POS, lastCenteredShipId: null });
  assert.deepEqual(second, [POS.lat, POS.lng]);
});

test('centra una sola vez por embarcación', () => {
  assert.equal(getMapAutoCenterTarget({ selectedShipId: 'b1', position: POS, lastCenteredShipId: 'b1' }), null);
});

test('vuelve a centrar al cambiar de embarcación', () => {
  assert.deepEqual(getMapAutoCenterTarget({ selectedShipId: 'b2', position: POS, lastCenteredShipId: 'b1' }), [POS.lat, POS.lng]);
});

test('rechaza coordenadas no válidas', () => {
  assert.equal(getMapAutoCenterTarget({ selectedShipId: 'b1', position: { lat: Number.NaN, lng: 1 }, lastCenteredShipId: null }), null);
  assert.equal(getMapAutoCenterTarget({ selectedShipId: 'b1', position: { lat: 91, lng: 1 }, lastCenteredShipId: null }), null);
});
