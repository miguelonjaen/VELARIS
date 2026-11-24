import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyInventory, newComponent, parseInventory, quickVesselPayload, removeComponent, replaceComponent, tankTotals } from './model';
test('quick registration does not invent position, dimensions or levels; identifier is optional', () => {
  const payload = quickVesselPayload({ nombre: ' Test ', marca: 'Marca', modelo: 'Modelo', matricula: ' ', tipo_barco: 'Velero' }, 'user');
  assert.equal(payload.nombre, 'Test');
  for (const field of ['lat', 'lng', 'eslora', 'manga', 'calado', 'fuel_level', 'water_level', 'matricula', 'horas_motor', 'potencia_cv'] as const) assert.equal(payload[field], null);
  assert.throws(() => quickVesselPayload({ nombre: ' ', marca: 'M', modelo: 'M', matricula: '', tipo_barco: 'Velero' }, 'user'));
});
test('new components have unknown readings rather than simulated defaults', () => {
  const tank = newComponent('tank', 'tank'); const battery = newComponent('battery', 'battery');
  assert.equal(tank.kind === 'tank' && tank.level.value, null);
  assert.equal(battery.kind === 'battery' && battery.voltage.value, null);
  assert.equal(battery.kind === 'battery' && battery.bankId, null);
});
test('same master model supplies dynamic tank totals and preserves unknown capacity', () => {
  const a = { ...newComponent('tank', 'a'), name: 'Agua proa' };
  const b = { ...newComponent('tank', 'b'), name: 'Agua popa' };
  assert.equal(a.kind, 'tank'); assert.equal(b.kind, 'tank');
  if (a.kind !== 'tank' || b.kind !== 'tank') return;
  const inventory = replaceComponent(replaceComponent(emptyInventory(), { ...a, capacityL: 120 }), b);
  assert.deepEqual(tankTotals(inventory, 'freshwater'), { count: 2, knownL: 120, unknown: 1 });
  assert.equal(parseInventory(JSON.parse(JSON.stringify(inventory))).components.length, 2);
});
test('zero is a known manual reading and measured readings require source and timestamp', () => {
  const tank = newComponent('tank', 'a'); if (tank.kind !== 'tank') return;
  const manual = { ...tank, name: 'Agua', level: { value: 0, origin: 'manual' as const, at: '2026-11-05T10:00:00Z', sensor: null } };
  assert.equal(replaceComponent(emptyInventory(), manual).components.length, 1);
  assert.throws(() => replaceComponent(emptyInventory(), { ...manual, level: { ...manual.level, origin: 'measured' } }));
  assert.equal(replaceComponent(emptyInventory(), { ...manual, level: { ...manual.level, origin: 'measured', sensor: 'recorded-source' } }).components.length, 1);
});
test('relationships cannot reference a different vessel or remove a bank with assigned batteries', () => {
  const bank = { ...newComponent('bank', 'bank'), name: 'Servicio' };
  const battery = newComponent('battery', 'battery'); if (battery.kind !== 'battery') return;
  const assigned = { ...battery, name: 'Servicio 1', bankId: 'bank' };
  assert.throws(() => replaceComponent(emptyInventory(), assigned));
  const inventory = replaceComponent(replaceComponent(emptyInventory(), bank), assigned);
  assert.throws(() => removeComponent(inventory, 'bank'));
  const detached = replaceComponent(inventory, { ...assigned, bankId: null });
  assert.equal(removeComponent(detached, 'bank').components.length, 1);
  assert.equal(inventory.components.length, 2);
});
test('reject unsupported versions, duplicate IDs, missing fields, invalid bounds and corrupt input', () => {
  assert.throws(() => parseInventory({ version: 2, components: [] }));
  assert.throws(() => parseInventory(null));
  const tank = newComponent('tank', 'a'); if (tank.kind !== 'tank') return;
  const named = { ...tank, name: 'Combustible' };
  assert.throws(() => parseInventory({ version: 1, components: [named, named] }));
  assert.throws(() => replaceComponent(emptyInventory(), { ...named, capacityL: -1 }));
  assert.throws(() => replaceComponent(emptyInventory(), { ...named, capacityL: NaN }));
  assert.throws(() => replaceComponent(emptyInventory(), { ...named, level: { value: 101, origin: 'manual', at: new Date().toISOString(), sensor: null } }));
  assert.throws(() => parseInventory({ version: 1, components: [{ kind: 'tank', id: 'a', name: 'Partial' }] }));
});
