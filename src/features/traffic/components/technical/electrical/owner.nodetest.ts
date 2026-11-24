import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyInventory } from '../model';
import { addElectricalEquipment, configureBank, initializeElectrical } from './actions';
import { connectOwnerEquipment, ownerConnections, ownerDiagram } from './ownerModel';

const create=()=>{
  let inventory=initializeElectrical(emptyInventory());
  for(const id of ['solar','shore','controller','charger','bank-service','lighting','battery'])inventory=addElectricalEquipment(inventory,id,{x:0,y:0},id);
  return inventory;
};
test('owner can register equipment without nominal data or fabricated cables',()=>{
  const inventory=create();assert.equal(ownerDiagram(inventory).devices.length,7);assert.equal(ownerDiagram(inventory).links.length,0);
  assert.ok(inventory.electrical!.devices.every(d=>d.nominalV===null));
});
test('guided connection creates full pole sets only after selection and deduplicates',()=>{
  const inventory=create(),choice=ownerConnections(inventory,'solar','controller')[0];assert.ok(choice);
  const connected=connectOwnerEquipment(inventory,'solar','controller',choice.id);
  assert.equal(connected.electrical!.wires.length,2);assert.equal(ownerDiagram(connected).links.length,1);
  assert.equal(connectOwnerEquipment(connected,'solar','controller',choice.id).electrical!.wires.length,2);
  assert.equal(inventory.electrical!.wires.length,0);
  const ac=ownerConnections(inventory,'shore','charger')[0];assert.equal(connectOwnerEquipment(inventory,'shore','charger',ac.id).electrical!.wires.length,3);
});
test('owner connections cannot send solar or shore directly into a battery bank',()=>{
  const inventory=create();assert.deepEqual(ownerConnections(inventory,'solar','bank-service'),[]);assert.deepEqual(ownerConnections(inventory,'shore','bank-service'),[]);
  assert.deepEqual(ownerConnections(inventory,'battery','bank-service'),[]);
  assert.throws(()=>connectOwnerEquipment(inventory,'solar','bank-service','invalid'));
});
test('summary folds internal bank cables, never creates connections and preserves exact wires',()=>{
  let inventory=create();inventory=configureBank(inventory,'bank-service',[['battery']]);
  const summary=ownerDiagram(inventory);assert.equal(summary.devices.length,6);assert.equal(summary.links.length,0);
  const option=ownerConnections(inventory,'controller','bank-service')[0];inventory=connectOwnerEquipment(inventory,'controller','bank-service',option.id);
  assert.equal(ownerDiagram(inventory).links.length,1);assert.equal(ownerDiagram(inventory).links[0].wires.length,2);
});
test('known incompatible ratings block a guided connection atomically',()=>{
  let inventory=create();inventory={...inventory,electrical:{...inventory.electrical!,devices:inventory.electrical!.devices.map(d=>({...d,terminals:d.terminals.map(t=>({...t,nominalV:t.domain==='DC'?(d.componentId==='controller'?24:d.componentId==='lighting'?12:t.nominalV):t.nominalV}))}))}};
  const choice=ownerConnections(inventory,'controller','lighting')[0];assert.ok(choice);
  assert.throws(()=>connectOwnerEquipment(inventory,'controller','lighting',choice.id),/incompatibles/);assert.equal(inventory.electrical!.wires.length,0);
});
