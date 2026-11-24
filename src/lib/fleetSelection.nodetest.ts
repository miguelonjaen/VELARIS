import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveFleetSelection } from './fleetSelection';
import { FleetLoadGate } from './fleetLoading';

const ships = [{ id: 'old', is_active: true }, { id: 'new', is_active: false }];
test('reproduces the previous refresh rollback and keeps explicit vessel against stale flags/profile', () => {
  const previous = ships.find(ship => ship.is_active) || ships.find(ship => ship.id === 'new');
  assert.equal(previous?.id, 'old');
  assert.equal(resolveFleetSelection(ships, 'new', 'old'), 'new');
});
test('restart restores the persisted per-user profile before legacy shared flags', () => {
  assert.equal(resolveFleetSelection(ships, null, 'new'), 'new');
  assert.equal(resolveFleetSelection(ships, 'new', null), 'new');
  assert.equal(resolveFleetSelection([...ships].reverse(), 'new', 'old'), 'new');
});
test('empty fleet and inaccessible/deleted IDs never select a foreign vessel', () => {
  assert.equal(resolveFleetSelection([], 'old', 'new'), null);
  assert.equal(resolveFleetSelection(ships, 'foreign', 'new'), 'new');
  assert.equal(resolveFleetSelection(ships, null, null), 'old');
});
test('selection invalidates pending profile and fleet responses even if cancellation is ignored', async () => {
  const profile = new FleetLoadGate(), fleet = new FleetLoadGate();
  const p = profile.begin(), f = fleet.begin();
  let selected = 'old';
  const stale = Promise.resolve().then(() => { if (p.current() || f.current()) selected = 'old'; });
  profile.cancel(); fleet.cancel(); selected = 'new';
  await stale;
  assert.equal(selected, 'new');
});
test('late maintenance from the former vessel cannot populate the new empty history', async () => {
  const gate = new FleetLoadGate();
  const old = gate.begin();
  let history: string[] = ['old-service'];
  const response = Promise.resolve(['old-service']).then(rows => { if (old.current()) history = rows; });
  gate.cancel(); history = [];
  const next = gate.begin();
  await response;
  assert.deepEqual(history, []);
  assert.equal(next.current(), true);
});
