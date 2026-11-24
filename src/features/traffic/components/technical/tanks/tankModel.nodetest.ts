import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyInventory, unknownReading, type TechnicalInventory } from '../model';
import { addElectricalEquipment, initializeElectrical } from '../electrical/actions';
import { ElectricalSession } from '../electrical/session';
import { canonicalJson } from '../canonicalJson';
import { connectionFingerprint, type InstrumentFeed } from '../sensorBindings';
import { BoatInstrumentStore } from '../../../../../core/instruments/BoatInstrumentStore';
import { addTank, connectTankConsumer, fluidSummary, removePipe, removeTank, saveFluidConsumer, savePipe, saveTank, tankList, tankObservation } from './tankModel';

const now=Date.UTC(2026,10,16,12),at=new Date(now).toISOString();
function fixture(){let i=addElectricalEquipment(initializeElectrical(emptyInventory()),'pump',{x:83,y:11},'pump');i=addTank(i,'freshwater','water');i=addTank(i,'diesel','fuel');return i;}
const tank=(i:TechnicalInventory,id='water')=>tankList(i).find(t=>t.id===id)!;
test('add dynamic fluid tanks without inventing capacity, level, plumbing or changing electricity',()=>{
  const base=fixture(),graph=structuredClone(base.electrical);let i=base;
  for(let n=0;n<12;n++)i=addTank(i,'freshwater',`extra-${n}`);
  assert.equal(tankList(i).length,14);assert.equal(new Set(tankList(i).map(t=>t.name)).size,14);
  assert.ok(tankList(i).every(t=>t.capacityL===null&&t.level.value===null));assert.deepEqual(i.electrical,graph);assert.equal(i.installation!.links.length,0);
});
test('zero manual is known empty; unknown has no reading; capacity edits preserve the original reading timestamp',()=>{
  let i=fixture();i=saveTank(i,{...tank(i),capacityL:200},{mode:'percent',value:0},at);
  assert.deepEqual(tank(i).level,{value:0,origin:'manual',at,sensor:null});
  const o=tankObservation(i,tank(i),null,null,'boat',now);assert.equal(o.estimatedL,0);
  i=saveTank(i,{...tank(i),name:'Agua proa',capacityL:250},{mode:'keep'},new Date(now+100000).toISOString());assert.equal(tank(i).level.at,at);
  i=saveTank(i,tank(i),{mode:'unknown'},at);assert.deepEqual(tank(i).level,unknownReading());
});
test('litres require capacity, reject overflow and invalid levels, and preserve manual provenance',()=>{
  const i=fixture();assert.throws(()=>saveTank(i,tank(i),{mode:'litres',value:30},at),/capacidad/);
  const saved=saveTank(i,{...tank(i),capacityL:200},{mode:'litres',value:50},at);assert.equal(tank(saved).level.value,25);assert.equal(tank(saved).level.origin,'manual');
  for(const value of [-1,101,Infinity,NaN])assert.throws(()=>saveTank(i,tank(i),{mode:'percent',value},at));
  assert.throws(()=>saveTank(i,{...tank(i),capacityL:20},{mode:'litres',value:21},at));
});
test('reuse an electrical consumer as one master equipment; fluid edits never alter its electrical graph',()=>{
  const initial=fixture();let i=connectTankConsumer(initial,{sourceId:'water',consumerId:'pump',name:'',connectionName:'Agua a bomba'},()=> 'pipe');
  assert.equal(i.installation!.nodes.length,initial.installation!.nodes.length);assert.deepEqual(i.electrical,initial.electrical);
  i=saveFluidConsumer(i,'pump','Bomba presión');assert.equal(i.installation!.nodes.find(n=>n.id==='pump')!.name,'Bomba presión');assert.equal(i.electrical!.devices[0].componentId,'pump');
  assert.throws(()=>connectTankConsumer(i,{sourceId:'water',consumerId:'pump',name:'',connectionName:''}));
  assert.throws(()=>connectTankConsumer(i,{sourceId:'fuel',consumerId:'pump',name:'',connectionName:''}),/otro fluido/);
});
test('new consumer and pipe are atomic; invalid source, empty name and foreign equipment are rejected',()=>{
  const i=fixture();let n=0;const next=connectTankConsumer(i,{sourceId:'water',consumerId:null,name:'Ducha',connectionName:''},()=>`id-${++n}`);
  assert.equal(next.installation!.nodes.length,i.installation!.nodes.length+1);assert.equal(next.installation!.links.length,1);assert.equal(i.installation!.links.length,0);
  for(const request of [{sourceId:'foreign',consumerId:null,name:'X',connectionName:''},{sourceId:'water',consumerId:null,name:' ',connectionName:''},{sourceId:'water',consumerId:'foreign',name:'',connectionName:''}])assert.throws(()=>connectTankConsumer(i,request));
});
test('removing plumbing or a tank keeps shared consumers, electrical bindings and electrical model',()=>{
  let i=fixture();i=addElectricalEquipment(i,'alternator',{x:120,y:42},'alt');i=connectTankConsumer(i,{sourceId:'water',consumerId:'pump',name:'',connectionName:''},()=> 'pipe');
  i={...i,installation:{...i.installation!,bindings:[{targetId:'water',metric:'level',channel:'tank-level',sensor:'WATER0',connection:'fixture'},{targetId:'alt',metric:'current',channel:'alternator-current',sensor:'alternator-common',connection:'fixture'}]}};
  const disconnected=removePipe(i,'pipe');assert.equal(disconnected.installation!.nodes.length,i.installation!.nodes.length);assert.equal(disconnected.installation!.links.length,0);
  const removed=removeTank(i,'water');assert.equal(removed.installation!.links.length,0);assert.equal(removed.installation!.bindings!.length,1);assert.equal(removed.installation!.bindings![0].targetId,'alt');assert.deepEqual(removed.electrical,i.electrical);assert.equal(removed.installation!.nodes[0].id,'pump');assert.throws(()=>removeTank(i,'pump'));
});
test('pipe editing validates endpoints without touching the cable namespace',()=>{
  let i=fixture();i=connectTankConsumer(i,{sourceId:'water',consumerId:'pump',name:'',connectionName:''},()=> 'pipe');
  const next=savePipe(i,{...i.installation!.links[0],name:'Salida presurizada'});assert.equal(next.installation!.links[0].name,'Salida presurizada');assert.deepEqual(next.electrical,i.electrical);
  assert.throws(()=>savePipe(i,{...i.installation!.links[0],medium:'cable'}));assert.throws(()=>savePipe(i,{...i.installation!.links[0],to:'foreign'}));
});
test('summaries stay within one fluid and mark unknown volume instead of treating it as zero',()=>{
  let i=fixture();i=addTank(i,'freshwater','water2');i=saveTank(i,{...tank(i),capacityL:200},{mode:'percent',value:50},at);i=saveTank(i,{...tank(i,'fuel'),capacityL:100},{mode:'percent',value:100},at);
  const observations=new Map(tankList(i).map(t=>[t.id,tankObservation(i,t,null,null,'boat',now)]));const summary=fluidSummary(tankList(i),observations,'freshwater');
  assert.equal(summary.capacityL,200);assert.equal(summary.estimatedL,100);assert.equal(summary.unknownCapacity,1);assert.equal(summary.unknownVolume,1);
  assert.equal(fluidSummary(tankList(i),observations,'diesel').estimatedL,100);
});
test('live level requires confirmed fresh vessel data, stays transient, and does not turn into a flow',()=>{
  let i=fixture();i=saveTank(i,{...tank(i),capacityL:200},{mode:'percent',value:20},at);
  const status={state:'CONNECTED' as const,source:'BOAT' as const,transport:'tcp' as const,host:'fixture.local',port:10110,portPath:null,error:null,lastLineAt:now},connection=connectionFingerprint(status)!;
  i={...i,installation:{...i.installation!,bindings:[{targetId:'water',metric:'level',channel:'tank-level',sensor:'WATER0',connection}]}};
  const store=new BoatInstrumentStore(()=>now);
  const feed:InstrumentFeed={vesselId:'boat',connection:status,capturedAt:now,instruments:{...store.snapshot(now),tanks:[{kind:'freshWater',name:'WATER0',percent:{value:75,ageMs:0}}]}},confirmation={vesselId:'boat',connection,at:now-1000};
  const live=tankObservation(i,tank(i),feed,confirmation,'boat',now);assert.equal(live.reading.value,75);assert.equal(live.estimatedL,150);assert.equal(live.live,true);assert.equal(tank(i).level.value,20);
  assert.equal(tankObservation(i,tank(i),feed,null,'boat',now).reading.value,20);assert.equal(tankObservation(i,tank(i),feed,confirmation,'other',now).live,false);assert.equal(tankObservation(i,tank(i),feed,confirmation,'boat',now+16000).live,false);
  const saved=saveTank(i,{...tank(i),name:'Agua popa'},{mode:'keep'});assert.equal(tank(saved).level.value,20);assert.equal(saved.installation!.links.length,0);
});
test('tank changes use the shared session recovery and save without losing electrical data',async()=>{
  const storage=new Map<string,string>(),disk={getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>{storage.set(key,value);},removeItem:(key:string)=>{storage.delete(key);}};
  const initial=fixture();let online=false;
  const session=new ElectricalSession({inventory:initial,revision:4},disk,'boat',async snapshot=>{if(!online)throw new Error('offline');return {...snapshot,revision:snapshot.revision+1};},false,false,60000);
  const next=addTank(initial,'blackwater','waste');session.change(next);await session.flush();assert.ok(storage.has('boat'));assert.equal(session.getState().dirty,true);assert.deepEqual(session.getState().snapshot.inventory.electrical,initial.electrical);
  online=true;await session.flush();assert.equal(session.getState().dirty,false);assert.equal(session.getState().snapshot.revision,5);assert.equal(storage.has('boat'),false);session.dispose();
});


test('changing a shared tank to another fluid cannot silently mix circuits',()=>{
  let i=fixture();i=addTank(i,'freshwater','water2');i=connectTankConsumer(i,{sourceId:'water',consumerId:'pump',name:'',connectionName:''},()=> 'first');i=connectTankConsumer(i,{sourceId:'water2',consumerId:'pump',name:'',connectionName:''},()=> 'second');
  assert.throws(()=>saveTank(i,{...tank(i),fluid:'diesel'},{mode:'keep'}),/otro fluido/);
  assert.throws(()=>savePipe(i,{...i.installation!.links[0],from:'fuel'}),/otro fluido/);
  assert.equal(tank(i).fluid,'freshwater');
});

test('removing pipes/tanks omits absent optional fields so a JSON acknowledgement clears recovery',async()=>{
  let i=fixture();i=connectTankConsumer(i,{sourceId:'water',consumerId:'pump',name:'',connectionName:''},()=> 'pipe');
  const disconnected=removePipe(i,'pipe'),removed=removeTank(i,'water');
  for(const next of [disconnected,removed,removeTank(addTank(emptyInventory(),'freshwater','only'),'only')])assert.equal(canonicalJson(next),canonicalJson(JSON.parse(JSON.stringify(next))));
  const storage=new Map<string,string>(),disk={getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>{storage.set(key,value);},removeItem:(key:string)=>{storage.delete(key);}};
  const session=new ElectricalSession({inventory:i,revision:0},disk,'boat',async snapshot=>({inventory:JSON.parse(JSON.stringify(snapshot.inventory)),revision:snapshot.revision+1}),false,false,60000);
  session.change(disconnected);await session.flush();assert.equal(session.getState().dirty,false);assert.equal(storage.has('boat'),false);session.dispose();
});
