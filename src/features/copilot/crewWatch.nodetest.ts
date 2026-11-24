import test from 'node:test';
import assert from 'node:assert/strict';
import { confirmWatchRelief, createCrewWatchState, crewWatchNotice, nextWatchkeeper, reliefDueAt } from './crewWatch';

const crew = [{ id: 'a', nombre: 'Ana', rango: 'Patrón' }, { id: 'b', nombre: 'Bruno', rango: 'Marinero' }];
test('relevos requieren confirmación y conservan historial', () => {
  const initial = createCrewWatchState('v1', crew, 60);
  assert.equal(initial.currentWatchkeeperId, null);
  const first = confirmWatchRelief(initial, 'a', 1_000, crew);
  assert.equal(nextWatchkeeper(first), 'b');
  const second = confirmWatchRelief(first, 'b', 61_000, crew);
  assert.equal(second.history.length, 1); assert.equal(second.history[0]?.relievedBy, 'b');
});
test('aviso de relevo no confirma automáticamente', () => {
  const active = confirmWatchRelief(createCrewWatchState('v1', crew, 60), 'a', 1_000, crew);
  assert.equal(reliefDueAt(active), 3_601_000);
  assert.equal(crewWatchNotice(active, 3_000_000, 15), 'DUE_SOON');
  assert.equal(crewWatchNotice(active, 3_700_000, 15), 'OVERDUE');
  assert.equal(active.currentWatchkeeperId, 'a');
});
