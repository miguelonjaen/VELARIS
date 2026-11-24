import { test } from 'node:test';
import assert from 'node:assert/strict';
import { repairDisplayText } from './textEncoding';

test('Spanish history, close icon, units and mixed valid text', () => {
  assert.equal(repairDisplayText('Traves\u00c3\u00ada'), 'Travesía');
  assert.equal(repairDisplayText('Navegaci\u00c3\u00b3n libre. Sesi\u00c3\u00b3n trip_123'), 'Navegación libre. Sesión trip_123');
  assert.equal(repairDisplayText('\u00e2\u0153\u2022'), '✕');
  assert.equal(repairDisplayText('90\u00c2\u00b0 · Duración'), '90° · Duración');
});
test('preserve valid Unicode, invalid sequences, identifiers and repeated rendering', () => {
  for (const text of ['Travesía · Navegación · Sesión · ñ · ✕ · ⚓ · 🛥️', 'MERYSEA trip_123 0.00 NM', 'Ã', 'Â', '\ufffd', '中文'])
    assert.equal(repairDisplayText(text), text);
  const value = 'Navegaci\u00c3\u0192\u00c2\u00b3n';
  assert.equal(repairDisplayText(value), 'Navegación');
  assert.equal(repairDisplayText(repairDisplayText(value)), 'Navegación');
});
