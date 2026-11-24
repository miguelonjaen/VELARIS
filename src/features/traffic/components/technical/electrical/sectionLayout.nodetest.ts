import test from 'node:test';
import assert from 'node:assert/strict';
import { electricalCatalog, deviceDefaults } from './catalog';
import { electricalSection, sectionLayout } from './sectionLayout';

test('AC/DC sections follow typed terminals, preserve unknowns and put converters on the boundary',()=>{
  assert.equal(electricalSection(deviceDefaults('p','shore')),'AC');
  assert.equal(electricalSection(deviceDefaults('pv','solar')),'DC');
  assert.equal(electricalSection(deviceDefaults('b','bank-service')),'DC');
  assert.equal(electricalSection(deviceDefaults('c','charger')),'bridge');
  assert.equal(electricalSection(deviceDefaults('i','inverter-charger')),'bridge');
  assert.equal(electricalSection(deviceDefaults('f','fuse')),'unknown');
  const custom={...deviceDefaults('x','lighting'),catalogId:'custom-source',terminals:deviceDefaults('a','ac-socket').terminals};
  assert.equal(electricalSection(custom),'AC');
});
test('section arrangement is deterministic and preserves all equipment data without assigning a false DC type',()=>{
  const devices=electricalCatalog.map(item=>deviceDefaults(item.id,item.id));
  const before=JSON.stringify(devices),layout=sectionLayout(devices);
  assert.equal(JSON.stringify(devices),before);
  assert.deepEqual(sectionLayout(devices),layout);
  assert.equal(layout.positions.size,devices.length);
  for(const device of layout.ac)assert.ok(layout.positions.get(device.componentId)!.y<layout.divider);
  for(const device of layout.dc)assert.ok(layout.positions.get(device.componentId)!.y>layout.divider);
  assert.equal(layout.positions.get('fuse')!.section,'unknown');
});
