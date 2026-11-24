import test from 'node:test';
import assert from 'node:assert/strict';
import { connectConsumer, type ConsumerConnectionRequest } from './consumerConnection';
import { unknownReading, type TechnicalInventory } from './model';
import { createInventoryRepository } from './persistence';

const inventory = (): TechnicalInventory => ({version:1,components:[{id:'tank',kind:'tank',name:'Agua',fluid:'freshwater',capacityL:120,level:unknownReading(),location:'',manufacturer:'',model:''},{id:'bank',kind:'bank',name:'Servicios',purpose:'service',topology:'unknown',location:'',manufacturer:'',model:''}]});
let serial = 0;
const id = () => `test-${++serial}`;
const request = (): ConsumerConnectionRequest => ({sourceId:'tank',medium:'pipe',consumerId:null,name:'Bomba',connectionName:''});

test('consumer and pipe are one atomic document, preserving unknown level and all equipment',()=>{
  const before=inventory(); const next=connectConsumer(before,request(),id);
  assert.equal(before.installation,undefined);
  assert.deepEqual(next.components,before.components);
  assert.equal(next.installation?.nodes[0].name,'Bomba');
  assert.deepEqual(next.installation?.links[0],{id:next.installation!.links[0].id,from:'tank',to:next.installation!.nodes[0].id,medium:'pipe',name:'Agua → Bomba'});
});

test('reuse a pump for fluid and electricity, with one master consumer and no inferred measurements',()=>{
  const fluid=connectConsumer(inventory(),request(),id);
  const next=connectConsumer(fluid,{...request(),medium:'cable',sourceId:'bank',consumerId:fluid.installation!.nodes[0].id,connectionName:'Circuito bomba'},id);
  assert.equal(next.installation?.nodes.length,1);
  assert.equal(next.installation?.links.length,2);
  assert.equal(next.installation?.bindings,undefined);
  assert.equal(next.installation?.links[1].name,'Circuito bomba');
});

test('reject wrong medium, foreign source or consumer, empty names, and duplicate route without mutation',()=>{
  const before=inventory();
  for(const change of [{sourceId:'foreign'},{medium:'cable' as const},{consumerId:'foreign'},{name:' '}]) assert.throws(()=>connectConsumer(before,{...request(),...change},id));
  assert.equal(before.installation,undefined);
  const next=connectConsumer(before,request(),id);
  assert.throws(()=>connectConsumer(next,{...request(),consumerId:next.installation!.nodes[0].id},id),/ya tiene/);
});

test('linked consumers survive canonical revisioned persistence',async()=>{
  const next=connectConsumer(inventory(),request(),id);
  const repository=createInventoryRepository({load:async()=>({revision:0,inventory:inventory()}),save:async(_ship,revision,value)=>({revision:revision+1,inventory:JSON.parse(JSON.stringify(value))})});
  const saved=await repository.save('vessel',{revision:2,inventory:next});
  assert.equal(saved.revision,3); assert.deepEqual(saved.inventory,next);
});
