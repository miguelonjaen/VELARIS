import test from 'node:test';
import assert from 'node:assert/strict';
import { BoatInstrumentStore } from '../../../../core/instruments/BoatInstrumentStore';
import { parseInventory, removeComponent, type SensorBinding, type TechnicalInventory } from './model';
import { compatibleTarget, connectionFingerprint, resolveBinding, sensorOptions, type InstrumentFeed } from './sensorBindings';
import { createInventoryRepository, saveWithRecovery } from './persistence';

const time=Date.UTC(2026,10,6,12);
const status={state:'CONNECTED' as const,source:'BOAT' as const,transport:'tcp' as const,host:'bridge.local',port:10110,portPath:null,error:null,lastLineAt:time};
const connection=connectionFingerprint(status)!;
const confirmation={vesselId:'vessel-a',connection,at:time-1000};
const base={location:'',manufacturer:'',model:''};
function inventory():TechnicalInventory {
  return {version:1,components:[{...base,id:'b',kind:'bank',name:'Service',purpose:'service',topology:'unknown'}],installation:{nodes:[{...base,id:'s',kind:'solar',name:'Solar'}],links:[{id:'l',from:'s',to:'b',medium:'cable',name:'Solar branch'}]}};
}
const binding:SensorBinding={targetId:'l',metric:'current',channel:'solar-current',sensor:'SOLAR0_OUT',connection};
function feed(value=8):InstrumentFeed {
  const store=new BoatInstrumentStore(()=>time);
  store.ingest({type:'TRANSDUCER',readings:[{kind:'I',unit:'A',name:'SOLAR0_OUT',value}]},time);
  return {vesselId:'vessel-a',connection:status,capturedAt:time,instruments:store.snapshot(time)};
}
test('source current requires an explicit confirmed connection; zero stays measured',()=>{
  assert.equal(resolveBinding(binding,feed(),confirmation,'vessel-a',time)?.reading.value,8);
  assert.equal(resolveBinding(binding,feed(0),confirmation,'vessel-a',time)?.reading.value,0);
  assert.equal(resolveBinding(binding,feed(),null,'vessel-a',time),null);
});
test('wrong vessel, endpoint, disconnected stream, old frame or unconfirmed observation never resolves',()=>{
  const f=feed();
  for(const altered of [{...f,vesselId:'vessel-b'},{...f,connection:{...status,host:'different.local'}},{...f,connection:{...status,state:'DISCONNECTED' as const}},{...f,connection:{...status,source:'SIMULATOR' as const}},{...f,capturedAt:time-3000}]) assert.equal(resolveBinding(binding,altered,confirmation,'vessel-a',time),null);
  assert.equal(resolveBinding(binding,f,confirmation,'vessel-b',time),null);
  assert.equal(resolveBinding(binding,f,{...confirmation,at:time+1},'vessel-a',time),null);
  assert.equal(resolveBinding(binding,f,{...confirmation,at:time},'vessel-a',time+16000),null);
  assert.equal(resolveBinding(binding,{...f,instruments:{...f.instruments,solar:{pvVolts:null,pvAmps:null,outputVolts:null,outputAmps:{value:8,ageMs:2000}}}},confirmation,'vessel-a',time),null);
});
test('RPM-derived alternator current is excluded even with fresh positive RPM',()=>{
  const s=feed().instruments;
  assert.equal(sensorOptions({...s,alternatorCurrentSource:'simulated-from-rpm',alternatorAmps:{value:40,ageMs:0}}).some(o=>o.channel==='alternator-current'),false);
  assert.equal(sensorOptions({...s,alternatorCurrentSource:'measured',alternatorAmps:{value:40,ageMs:0}}).some(o=>o.channel==='alternator-current'),true);
  assert.equal(sensorOptions({...s,alternatorCurrentSource:'measured',alternatorAmps:{value:40,ageMs:15001}}).some(o=>o.channel==='alternator-current'),false);
});
test('bindings are persistent, unique and removed before retiring their target',()=>{
  const i=inventory();i.installation!.bindings=[binding];
  assert.deepEqual(parseInventory(JSON.parse(JSON.stringify(i))).installation?.bindings,[binding]);
  assert.throws(()=>parseInventory({...i,installation:{...i.installation,links:[]}}));
  assert.throws(()=>removeComponent(i,'b'));
  assert.throws(()=>parseInventory({...i,installation:{...i.installation,bindings:[binding,binding]}}));
  for(const change of [{channel:'battery-current',sensor:'BAT_HOUSE'},{sensor:'unknown'},{metric:'level'},{targetId:'other-vessel'},{connection:''}]) assert.throws(()=>parseInventory({...i,installation:{...i.installation,bindings:[{...binding,...change}]}}));
});
test('net battery current and shared source current cannot animate a branch',()=>{
  const i=inventory();
  assert.equal(compatibleTarget(i,'l','battery-current'),false);
  assert.equal(compatibleTarget(i,'b','battery-current'),true);
  assert.equal(compatibleTarget(i,'l','solar-current'),true);
  i.components.push({...base,id:'b2',kind:'bank',name:'Starter',purpose:'starter',topology:'unknown'});
  i.installation!.links.push({id:'l2',from:'s',to:'b2',medium:'cable',name:'Second branch'});
  assert.equal(compatibleTarget(i,'l','solar-current'),false);
  i.installation!.bindings=[binding];assert.throws(()=>parseInventory(i));
});
test('link identities cannot collide with a component or installation node',()=>{
  for(const id of ['b','s']) {const i=inventory();i.installation!.links[0].id=id;assert.throws(()=>parseInventory(i));}
});
test('an acknowledgement losing bindings retains recovery instead of claiming success',async()=>{
  const i=inventory();i.installation!.bindings=[binding];
  const repo=createInventoryRepository({load:async()=>null,save:async(_id,revision,inventory)=>({revision:revision+1,inventory:{...inventory,installation:undefined}})});
  const entries=new Map<string,string>();
  await assert.rejects(()=>saveWithRecovery({getItem:k=>entries.get(k)??null,setItem:(k,v)=>{entries.set(k,v);},removeItem:k=>{entries.delete(k);}},'draft',{revision:0,inventory:i},s=>repo.save('vessel-a',s)),/instalación completa/);
  assert.ok(entries.has('draft'));
});
test('JSONB key ordering does not invalidate a complete acknowledgement',async()=>{
  const i=inventory();i.installation!.bindings=[binding];
  function reorder(value:unknown):unknown {if(Array.isArray(value))return value.map(reorder);if(value && typeof value==='object')return Object.fromEntries(Object.entries(value).reverse().map(([k,v])=>[k,reorder(v)]));return value;}
  const repo=createInventoryRepository({load:async()=>null,save:async(_id,revision,inventory)=>({revision:revision+1,inventory:reorder(inventory)})});
  assert.equal((await repo.save('vessel-a',{revision:0,inventory:i})).revision,1);
});
