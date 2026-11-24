import test from 'node:test';
import assert from 'node:assert/strict';
import { draftKey, persistDraft, recoverDraft, type DraftStorage } from './drafts';
import { emptyInventory, newComponent, replaceComponent } from './model';
const storage = (): DraftStorage => {
  const items = new Map<string, string>();
  return { getItem: k => items.get(k) ?? null, setItem: (k, v) => { items.set(k, v); }, removeItem: k => { items.delete(k); } };
};
test('local draft survives reopening and is isolated by vessel and user', () => {
  const disk = storage(); const key = draftKey('captain', 'boat-a');
  const snapshot = { inventory: replaceComponent(emptyInventory(), { ...newComponent('bank', 'id'), name: 'Servicio' }), revision: 3 };
  persistDraft(disk, key, snapshot);
  assert.deepEqual(recoverDraft(disk, key, { inventory: emptyInventory(), revision: 3 }), { snapshot, dirty: true, conflict: false });
  assert.equal(recoverDraft(disk, draftKey('captain', 'boat-b'), snapshot).dirty, false);
  assert.equal(recoverDraft(disk, draftKey('other', 'boat-a'), snapshot).dirty, false);
});
test('a newer remote revision preserves the draft and reports a conflict', () => {
  const disk = storage(); const snapshot = { inventory: emptyInventory(), revision: 1 }; persistDraft(disk, 'key', snapshot);
  const recovered = recoverDraft(disk, 'key', { inventory: replaceComponent(emptyInventory(), { ...newComponent('tank', 'remote'), name: 'Agua' }), revision: 2 });
  assert.equal(recovered.conflict, true); assert.equal(recovered.snapshot.revision, 1); assert.ok(disk.getItem('key'));
});
test('corrupt or future-format local data is not silently erased', () => {
  const disk = storage(); const raw = '{"inventory":{"version":9,"components":[]},"revision":1}'; disk.setItem('key', raw);
  assert.throws(() => recoverDraft(disk, 'key', { inventory: emptyInventory(), revision: 1 }));
  assert.equal(disk.getItem('key'), raw);
});
test('storage failures propagate instead of reporting a saved draft', () => {
  const disk = storage(); disk.setItem = () => { throw new Error('quota'); };
  assert.throws(() => persistDraft(disk, 'key', { inventory: emptyInventory(), revision: 0 }), /No se pudo guardar/);
});
