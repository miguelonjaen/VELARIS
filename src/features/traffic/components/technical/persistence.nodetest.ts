import test from 'node:test';
import assert from 'node:assert/strict';
import { createInventoryRepository, InventoryConflictError, parseSnapshot, saveWithRecovery, type InventoryTransport } from './persistence';
import { draftKey, DraftStorageUnavailableError, recoverDraft, type DraftStorage, type InventorySnapshot } from './drafts';
import { emptyInventory, newComponent, parseInventory, replaceComponent } from './model';

const storage = (): DraftStorage => {
  const entries = new Map<string, string>();
  return { getItem: key => entries.get(key) ?? null, setItem: (key, value) => { entries.set(key, value); }, removeItem: key => { entries.delete(key); } };
};
const copy = <T,>(value: T): T => structuredClone(value);

/** Contract double, not a PostgreSQL substitute: SQL/RLS are covered by the separate database suite. */
function remote(): InventoryTransport {
  const records = new Map<string, InventorySnapshot>();
  return {
    async load(id) { return copy(records.get(id) ?? { inventory: emptyInventory(), revision: 0 }); },
    async save(id, revision, inventory) {
      const previous = records.get(id) ?? { inventory: emptyInventory(), revision: 0 };
      if (previous.revision !== revision) throw new InventoryConflictError();
      const next = { inventory: copy(parseInventory(inventory)), revision: revision + 1 };
      records.set(id, next);
      return copy(next);
    }
  };
}

test('a second client reads the saved tanks, banks, batteries and unknown/zero readings', async () => {
  const transport = remote(); const desktop = createInventoryRepository(transport); const tablet = createInventoryRepository(transport);
  let inventory = replaceComponent(emptyInventory(), { ...newComponent('bank', 'service'), name: 'Servicio' });
  for (const id of ['b1', 'b2']) {
    const battery = newComponent('battery', id); if (battery.kind !== 'battery') throw new Error('fixture');
    inventory = replaceComponent(inventory, { ...battery, name: id, bankId: 'service', capacityAh: 100, nominalV: 12 });
  }
  const tank = newComponent('tank', 'fresh'); if (tank.kind !== 'tank') throw new Error('fixture');
  inventory = replaceComponent(inventory, { ...tank, name: 'Agua proa', capacityL: 200, level: { value: 0, origin: 'manual', at: '2026-11-06T08:00:00Z', sensor: null } });
  const saved = await desktop.save('boat-a', { inventory, revision: 0 });
  assert.equal(saved.revision, 1);
  assert.deepEqual(await tablet.load('boat-a'), saved);
  assert.equal((await tablet.load('boat-b')).inventory.components.length, 0);
});

test('two clients writing the same revision cannot overwrite each other silently', async () => {
  const transport = remote(); const desktop = createInventoryRepository(transport); const tablet = createInventoryRepository(transport);
  const first = await desktop.load('boat'); const second = await tablet.load('boat');
  first.inventory = replaceComponent(first.inventory, { ...newComponent('bank', 'a'), name: 'Servicio' });
  second.inventory = replaceComponent(second.inventory, { ...newComponent('tank', 'b'), name: 'Agua' });
  const results = await Promise.allSettled([desktop.save('boat', first), tablet.save('boat', second)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const rejected = results.find(r => r.status === 'rejected');
  assert.ok(rejected?.status === 'rejected' && rejected.reason instanceof InventoryConflictError);
  assert.equal((await tablet.load('boat')).revision, 1);
});

test('a disconnected save keeps a recoverable draft and is never reported as synchronized', async () => {
  const disk = storage(); const key = draftKey('user', 'boat');
  const pending = { inventory: replaceComponent(emptyInventory(), { ...newComponent('tank', 'water'), name: 'Agua' }), revision: 4 };
  await assert.rejects(saveWithRecovery(disk, key, pending, async () => { throw new Error('Network unavailable'); }), /Pendiente de guardar en Supabase/);
  const restored = recoverDraft(disk, key, { inventory: emptyInventory(), revision: 4 });
  assert.deepEqual(restored.snapshot, pending); assert.equal(restored.dirty, true);
});

test('local storage outage cannot prevent a successful Supabase save', async () => {
  const disk = storage(); disk.setItem = () => { throw new Error('quota'); };
  const snapshot = { inventory: emptyInventory(), revision: 1 };
  const receipt = await saveWithRecovery(disk, 'key', snapshot, async s => ({ ...s, revision: 2 }));
  assert.equal(receipt.snapshot.revision, 2); assert.match(receipt.recoveryWarning ?? '', /recuperación/);
});

test('recovery is removed only after remote acknowledgement; failed cleanup is visible', async () => {
  const disk = storage(); const snapshot = { inventory: emptyInventory(), revision: 0 };
  let acknowledged = false;
  const originalRemove = disk.removeItem;
  disk.removeItem = key => { assert.equal(acknowledged, true); originalRemove(key); };
  await saveWithRecovery(disk, 'key', snapshot, async s => { assert.ok(disk.getItem('key')); acknowledged = true; return { ...s, revision: 1 }; });
  assert.equal(disk.getItem('key'), null);
  disk.removeItem = () => { throw new Error('storage unavailable'); };
  const receipt = await saveWithRecovery(disk, 'key', snapshot, async s => ({ ...s, revision: 1 }));
  assert.match(receipt.recoveryWarning ?? '', /limpiar/); assert.ok(disk.getItem('key'));
});

test('server failures, missing revisions and incompatible responses cannot produce a saved receipt', async () => {
  for (const data of [null, { revision: -1, inventory: emptyInventory() }, { revision: 1, inventory: { version: 2, components: [] } }]) assert.throws(() => parseSnapshot(data));
  const repository = createInventoryRepository({ load: async () => null, save: async (_id, revision, inventory) => ({ revision, inventory }) });
  await assert.rejects(repository.load('boat'), /no compatible/);
  await assert.rejects(repository.save('boat', { revision: 0, inventory: emptyInventory() }), /revisión esperada/);
  await assert.rejects(repository.load(''), /Selecciona/);
});

test('an unreadable local store is distinguishable from a corrupt draft', () => {
  const disk = storage(); disk.getItem = () => { throw new Error('storage disabled'); };
  assert.throws(() => recoverDraft(disk, 'key', { inventory: emptyInventory(), revision: 0 }), DraftStorageUnavailableError);
  const corrupt = storage(); corrupt.setItem('key', '{');
  assert.throws(() => recoverDraft(corrupt, 'key', { inventory: emptyInventory(), revision: 0 }), SyntaxError);
});

test('future attributes are rejected explicitly instead of being silently dropped by normalization', () => {
  const tank = { ...newComponent('tank', 'water'), name: 'Agua' };
  assert.throws(() => parseInventory({ version: 1, components: [tank], future: true }));
  assert.throws(() => parseInventory({ version: 1, components: [{ ...tank, extraSensor: 'unsupported' }] }));
  if (tank.kind !== 'tank') throw new Error('fixture');
  assert.throws(() => replaceComponent(emptyInventory(), { ...tank, level: { value: 10, origin: 'measured', at: '2026-11-06T08:00:00Z', sensor: 'x'.repeat(241) } }));
  assert.equal(replaceComponent(emptyInventory(), { ...tank, level: { value: 10, origin: 'measured', at: '2026-11-06T08:00:00+00:00', sensor: 'test-sensor' } }).components.length, 1);
});
