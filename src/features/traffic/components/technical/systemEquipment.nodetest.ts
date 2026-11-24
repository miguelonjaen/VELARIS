import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyInventory,parseInventory} from './model';
import {createSystemEquipment,putSystemEquipment,putSystemLink,systemLayout,systemRelationshipPath,SYSTEM_SECTIONS} from './systemEquipment';
import {addElectricalEquipment} from './electrical/actions';
import {addTank} from './tanks/tankModel';
import {ElectricalSession} from './electrical/session';
import {createInventoryRepository} from './persistence';

test('four systems preserve electrical/tank inventory; no automatic equipment, links or operational status',()=>{
 let i=addTank(addElectricalEquipment(emptyInventory(),'bank-service',{x:0,y:0},'bank'),'freshwater','tank');const original=structuredClone(i);
 assert.equal(i.systems,undefined);for(const [section,id] of [['propulsion','engine'],['electronics','gps'],['rigging','mast'],['safety','liferaft']] as const)i=putSystemEquipment(i,createSystemEquipment(section,id,section));
 assert.deepEqual(i.components,original.components);assert.deepEqual(i.electrical,original.electrical);assert.deepEqual(i.installation,original.installation);assert.equal(i.systems!.links.length,0);assert.ok(i.systems!.equipment.every(e=>e.condition==='unknown'&&e.nextService===''&&e.lastService===''));assert.deepEqual(parseInventory(JSON.parse(JSON.stringify(i))),i);
});

test('subsequent electrical and tank edits retain the entire new systems extension',()=>{
 const initial=putSystemEquipment(emptyInventory(),{...createSystemEquipment('safety','liferaft','raft'),notes:'Documento conservado',lastService:'2026-11-17'});
 const next=addTank(addElectricalEquipment(initial,'shore',{x:0,y:0},'shore'),'freshwater','water');
 assert.deepEqual(next.systems,initial.systems);assert.equal(next.systems!.equipment[0].id,'raft');
});
test('reject catalog/section mismatch, invalid dates and unknown fields instead of silently dropping them',()=>{
 const equipment=createSystemEquipment('safety','liferaft','raft');
 assert.throws(()=>createSystemEquipment('safety','engine'));
 for(const item of [{...equipment,nextService:'2026-02-30'},{...equipment,condition:['unknown']},{...equipment,section:'propulsion'},{...equipment,extra:1}])assert.throws(()=>parseInventory({...emptyInventory(),systems:{version:1,equipment:[item],links:[]}}));
});
test('relationships are explicit and cannot reference another system or an unknown vessel target',()=>{
 let i=putSystemEquipment(putSystemEquipment(putSystemEquipment(emptyInventory(),createSystemEquipment('propulsion','engine','engine')),createSystemEquipment('propulsion','propeller','propeller')),createSystemEquipment('safety','epirb','epirb'));
 const original=structuredClone(i);i=putSystemLink(i,{id:'drive',from:'engine',to:'propeller',label:'Relación mecánica verificada'});assert.equal(original.systems!.links.length,0);
 for(const to of ['foreign','epirb','engine'])assert.throws(()=>putSystemLink(i,{id:'bad',from:'engine',to,label:'Bad link'}));
 assert.throws(()=>putSystemLink(i,{id:'duplicate',from:'engine',to:'propeller',label:'Duplicate'}));
});
test('equipment and relation identities cannot collide with pre-existing inventory records',()=>{
 const i=addTank(emptyInventory(),'freshwater','existing');assert.throws(()=>putSystemEquipment(i,createSystemEquipment('propulsion','engine','existing')));
});
test('archive and undo retain identity, notes, declared dates and exact relationships',()=>{
 let i=putSystemEquipment(putSystemEquipment(emptyInventory(),{...createSystemEquipment('rigging','mast','mast'),notes:'Inspección pendiente',nextService:'2027-01-10'}),createSystemEquipment('rigging','standing','rigging'));
 i=putSystemLink(i,{id:'stay',from:'mast',to:'rigging',label:'Jarcia declarada'});const memory=new Map<string,string>();
 const session=new ElectricalSession({inventory:i,revision:0},{getItem:k=>memory.get(k)??null,setItem:(k,v)=>{memory.set(k,v)},removeItem:k=>{memory.delete(k)}},'test',async s=>({...s,revision:s.revision+1}),false,false,10000);
 session.change(putSystemEquipment(i,{...i.systems!.equipment[0],archived:true}));assert.equal(session.getState().snapshot.inventory.systems!.equipment[0].notes,'Inspección pendiente');assert.deepEqual(session.getState().snapshot.inventory.systems!.links,i.systems!.links);session.undo();assert.deepEqual(session.getState().snapshot.inventory,i);session.dispose();
});
test('lossy server echo of the new systems is rejected, preserving recovery semantics',async()=>{
 const i=putSystemEquipment(emptyInventory(),createSystemEquipment('electronics','gps','gps'));
 const repo=createInventoryRepository({load:async()=>({inventory:emptyInventory(),revision:0}),save:async()=>({inventory:emptyInventory(),revision:1})});await repo.load('vessel');await assert.rejects(repo.save('vessel',{inventory:i,revision:0}),/inventario completo/);
});
test('map layout is presentation only, deterministic and separates catalog columns in all four systems',()=>{
 for(const section of SYSTEM_SECTIONS){const catalog=section==='propulsion'?'engine':section==='electronics'?'gps':section==='rigging'?'mast':'liferaft';const item=createSystemEquipment(section,catalog,section),before=JSON.stringify(item);assert.deepEqual(systemLayout([item]),systemLayout([item]));assert.equal(JSON.stringify(item),before);assert.equal(systemLayout([item]).positions.size,1);}
});

test('nonadjacent relationships use clear lanes and reverse connections leave the correct edge',()=>{
 assert.match(systemRelationshipPath({x:35,y:65},{x:835,y:65}),/V53/);
 assert.match(systemRelationshipPath({x:835,y:65},{x:35,y:65}),/^M835 140/);
 assert.match(systemRelationshipPath({x:435,y:65},{x:435,y:475}),/L790 550/);
});
