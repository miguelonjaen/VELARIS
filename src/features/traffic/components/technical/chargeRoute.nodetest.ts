import test from 'node:test';
import assert from 'node:assert/strict';
import { addChargeRoute, type ChargeRouteRequest } from './chargeRoute';
import { chargePaths, compatibleEndpoints } from './electricalTopology';
import { parseInventory, unknownReading, type Bank, type TechnicalInventory } from './model';
import { createInventoryRepository } from './persistence';

const service: Bank = {id:'service',kind:'bank',name:'Servicios',location:'',manufacturer:'',model:'',purpose:'service',topology:'parallel'};
const starter: Bank = {...service,id:'starter',name:'Arranque',purpose:'starter'};
const base = (): TechnicalInventory => ({version:1,components:[service,starter,{id:'battery',kind:'battery',name:'Batería',location:'',manufacturer:'',model:'',bankId:'service',chemistry:'AGM',nominalV:12,capacityAh:100,voltage:unknownReading(),soc:unknownReading()}]});
let serial=0;
const id=()=>`new-${++serial}`;
const solar = (): Extract<ChargeRouteRequest, {kind: 'solar' | 'shore' | 'alternator'}> => ({kind:'solar',source:{existingId:null,name:'Paneles'},converter:{existingId:null,name:'MPPT'},distributor:{existingId:null,name:'Repartidor'},bankIds:['service','starter']});

test('solar saves regulator, distributor and two independent bank outputs atomically',()=>{
  const original=base(), next=addChargeRoute(original,solar(),id);
  assert.equal(original.installation,undefined);
  assert.equal(next.installation?.nodes.length,3);
  assert.equal(next.installation?.links.length,4);
  const paths=chargePaths(next.installation!,next.components);
  assert.equal(paths.length,2);
  assert.deepEqual(paths.map(p=>p.via.map(n=>n.kind)),[['controller','distributor'],['controller','distributor']]);
  assert.equal(paths[0].links[0].id,paths[1].links[0].id);
  assert.deepEqual(next.components,original.components);
  assert.equal(next.installation?.bindings,undefined);
  assert.equal(unknownReading().value,null);
});

test('shore AC needs AC/DC charger and never connects straight to bank or DC distributor',()=>{
  const request: ChargeRouteRequest={kind:'shore',source:{existingId:null,name:'Puerto'},converter:{existingId:null,name:'Cargador'},distributor:null,bankIds:['service','starter']};
  const next=addChargeRoute(base(),request,id);
  assert.equal(next.installation?.nodes[0].kind,'shore');
  assert.equal(next.installation?.nodes[1].kind,'charger');
  assert.equal(chargePaths(next.installation!,next.components).length,2);
  assert.throws(()=>addChargeRoute(base(),{...request,converter:null},id),/AC\/DC/);
  assert.equal(compatibleEndpoints('shore','bank','cable'),false);
  assert.equal(compatibleEndpoints('shore','distributor','cable'),false);
  assert.equal(compatibleEndpoints('solar','charger','cable'),false);
});

test('reuse registered source/converter/distributor without duplicate nodes or links',()=>{
  const next=addChargeRoute(base(),solar(),id);
  const [source,converter,distributor]=next.installation!.nodes;
  const reused=addChargeRoute(next,{kind:'solar',source:{existingId:source.id,name:''},converter:{existingId:converter.id,name:''},distributor:{existingId:distributor.id,name:''},bankIds:['service','starter','service']},id);
  assert.deepEqual(reused,next);
});

test('an existing unconnected solar source can be linked through a new regulator',()=>{
  const inventory={...base(),installation:{nodes:[{id:'existing',kind:'solar' as const,name:'Solar existente',location:'',manufacturer:'',model:''}],links:[]}};
  const next=addChargeRoute(inventory,{kind:'solar',source:{existingId:'existing',name:''},converter:{existingId:null,name:'Regulador'},distributor:null,bankIds:['service']},id);
  assert.equal(next.installation?.nodes.filter(n=>n.kind==='solar').length,1);
  assert.equal(chargePaths(next.installation!,next.components,'service').length,1);
});

test('add distributor to alternator and two banks; do not silently remove existing direct cables',()=>{
  const initial=addChargeRoute(base(),{kind:'alternator',source:{existingId:null,name:'Alternador'},converter:null,distributor:null,bankIds:['service']},id);
  const next=addChargeRoute(initial,{kind:'distributor',inputId:initial.installation!.nodes[0].id,distributor:{existingId:null,name:'Repartidor'},bankIds:['service','starter']},id);
  assert.equal(next.installation?.links.length,4);
  assert.equal(chargePaths(next.installation!,next.components,'starter').length,1);
  assert.equal(chargePaths(next.installation!,next.components,'service').length,2);
  assert.ok(next.installation!.links.some(l=>l.id===initial.installation!.links[0].id));
});

test('reject foreign banks, invalid roles, missing converters, empty destinations and loop/cross-bank cables',()=>{
  const request=solar();
  assert.throws(()=>addChargeRoute(base(),{...request,bankIds:[]},id));
  assert.throws(()=>addChargeRoute(base(),{...request,bankIds:['foreign']},id));
  assert.throws(()=>addChargeRoute(base(),{...request,source:{existingId:'foreign',name:''}},id));
  const next=addChargeRoute(base(),request,id);
  for(const [from,to] of [['service','starter'],['starter','service'],[next.installation!.nodes[2].id,next.installation!.nodes[1].id]]) {
    assert.throws(()=>parseInventory({...next,installation:{...next.installation!,links:[...next.installation!.links,{id:id(),from,to,medium:'cable',name:'Incompatible'}]}}));
  }
});

test('new charge equipment and routes survive canonical revisioned persistence',async()=>{
  const expected=addChargeRoute(base(),solar(),id);
  const repository=createInventoryRepository({load:async()=>({revision:0,inventory:base()}),save:async(_vessel,revision,inventory)=>({revision:revision+1,inventory:JSON.parse(JSON.stringify(inventory))})});
  const actual=await repository.save('vessel',{revision:3,inventory:expected});
  assert.equal(actual.revision,4);
  assert.deepEqual(actual.inventory,expected);
});
