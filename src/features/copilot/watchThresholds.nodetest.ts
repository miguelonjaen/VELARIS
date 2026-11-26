import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserWatchThresholdStorage, emptyWatchThresholds, setWatchThreshold } from './watchThresholds';

test('umbrales empiezan sin valores universales y distinguen origen', () => {
  const empty = emptyWatchThresholds('v1'); assert.equal(empty.minimumDepthMeters, null);
  const configured = setWatchThreshold(empty, 'minimumDepthMeters', { value: 2.5, origin: 'user' });
  assert.deepEqual(configured.minimumDepthMeters, { value: 2.5, origin: 'user' });
  assert.throws(() => setWatchThreshold(empty, 'fuelPercent', { value: 101, origin: 'manufacturer' }));
});
test('persistencia queda aislada por UUID y datos corruptos fallan cerrados', () => {
  const values = new Map<string, string>(); const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const repository = new BrowserWatchThresholdStorage(storage);
  repository.save(setWatchThreshold(emptyWatchThresholds('a'), 'aisCpaNm', { value: 0.5, origin: 'manufacturer' }));
  assert.equal(repository.load('a').aisCpaNm?.value, 0.5); assert.equal(repository.load('b').aisCpaNm, null);
});
test('meteorología no se clasifica sin umbral explícito y valida sus rangos', () => {
  const empty = emptyWatchThresholds('v1');
  assert.equal(empty.restrictedVisibilityMeters, null); assert.equal(empty.adverseWindKn, null);
  assert.equal(setWatchThreshold(empty, 'adverseWindKn', { value: 30, origin: 'user' }).adverseWindKn?.value, 30);
  assert.throws(() => setWatchThreshold(empty, 'restrictedVisibilityMeters', { value: 10, origin: 'user' }));
});
