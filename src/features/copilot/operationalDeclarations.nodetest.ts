import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveOperationalDeclarations } from './operationalDeclarations';

test('declaraciones vigentes se aíslan por el mapa del buque seleccionado', () => {
  const now = Date.parse('2026-11-24T12:00:00Z');
  const values = new Map([['operation:berth', { value: true, at: '2026-11-24T11:00:00Z' }]]);
  assert.equal(resolveOperationalDeclarations(values, now, 0.05).berth, true);
  assert.equal(resolveOperationalDeclarations(new Map(), now, 0.05).berth, false);
});

test('movimiento incompatible y caducidad invalidan declaraciones sin ocultar la causa', () => {
  const now = Date.parse('2026-11-24T12:00:00Z');
  const moving = resolveOperationalDeclarations(new Map([['operation:anchor', { value: true, at: '2026-11-24T11:59:00Z' }]]), now, 2);
  assert.equal(moving.anchor, false); assert.match(moving.limitations.join(' '), /contradice/);
  const expired = resolveOperationalDeclarations(new Map([['operation:predeparture', { value: true, at: '2026-11-23T00:00:00Z' }]]), now, 0);
  assert.equal(expired.preDeparture, false); assert.match(expired.limitations.join(' '), /no es vigente/);
});
