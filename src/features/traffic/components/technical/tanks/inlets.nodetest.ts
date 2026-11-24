import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyInventory, parseInventory } from '../model';
import { addTank, connectTankConsumer, saveTank, savePipe, removeTank } from './tankModel';
test('explicit inlet preserves all legacy data and stores equipment-to-tank direction',()=>{
 const original=addTank(emptyInventory(),'blackwater','tank'),before=JSON.stringify(original);let seq=0;
 const next=connectTankConsumer(original,{sourceId:'tank',consumerId:null,name:'Inodoro',connectionName:'Entrada',direction:'inlet'},()=>`id-${++seq}`);
 const pipe=next.installation!.links[0];assert.equal(pipe.to,'tank');assert.equal(pipe.from,next.installation!.nodes[0].id);assert.deepEqual(parseInventory(next),next);assert.equal(JSON.stringify(original),before);assert.deepEqual(next.components,original.components);
 assert.equal(savePipe(next,{...pipe,name:'Entrada sanitaria'}).installation!.links[0].to,'tank');assert.equal(removeTank(next,'tank').installation!.links.length,0);
});
test('inlet consumers cannot mix fresh water and sewage, including tank fluid edits',()=>{
 let i=addTank(addTank(emptyInventory(),'blackwater','black'),'freshwater','water');let seq=0;
 i=connectTankConsumer(i,{sourceId:'black',consumerId:null,name:'Inodoro',connectionName:'Entrada',direction:'inlet'},()=>`id-${++seq}`);
 const id=i.installation!.nodes[0].id;assert.throws(()=>connectTankConsumer(i,{sourceId:'water',consumerId:id,name:'',connectionName:'Salida'}),/otro fluido/);
});
