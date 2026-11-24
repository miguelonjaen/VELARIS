import test from 'node:test';
import assert from 'node:assert/strict';
import { BoatInstrumentStore } from '../../../../../core/instruments/BoatInstrumentStore';
import { emptyInventory } from '../model';
import { connectionFingerprint, type InstrumentFeed } from '../sensorBindings';
import { addElectricalEquipment, initializeElectrical } from './actions';
import { ownerConnections, connectOwnerEquipment, ownerDiagram } from './ownerModel';
import { effectiveActivity, manualActivityKey, measuredConnectionActivity, parseManualActivity } from './connectionActivity';
import { saveEquipmentValues } from './EquipmentValues';

const time=Date.UTC(2026,10,13,12);
const status={state:'CONNECTED' as const,source:'BOAT' as const,transport:'tcp' as const,host:'fixture.local',port:10110,portPath:null,error:null,lastLineAt:time};
const connection=connectionFingerprint(status)!;
const confirmation={vesselId:'vessel',connection,at:time-5000};
function fixture(){
  let i=initializeElectrical(emptyInventory());for(const id of ['alternator','bank-service','lighting'])i=addElectricalEquipment(i,id,{x:0,y:0},id);
  i=connectOwnerEquipment(i,'alternator','bank-service',ownerConnections(i,'alternator','bank-service')[0].id);
  i={...i,installation:{...i.installation!,links:[{id:'legacy',from:'alternator',to:'bank-service',medium:'cable',name:'Carga'}],bindings:[{targetId:'legacy',metric:'current',channel:'alternator-current',sensor:'alternator-common',connection}]}};
  return i;
}
function feed(value:number):InstrumentFeed{const store=new BoatInstrumentStore(()=>time);store.ingest({type:'TRANSDUCER',readings:[{kind:'I',unit:'A',name:'ALTERNATOR',value}]},time);return {vesselId:'vessel',connection:status,capturedAt:time,instruments:{...store.snapshot(time),alternatorAmps:{value,ageMs:0},alternatorCurrentSource:'measured'}};}
test('activity requires exact explicit branch binding and a fresh vessel-confirmed measurement',()=>{
  const i=fixture(),link=ownerDiagram(i).links[0];
  assert.equal(measuredConnectionActivity(i,link,feed(5),confirmation,'vessel',time).state,'active');
  assert.equal(measuredConnectionActivity(i,link,feed(0),confirmation,'vessel',time).state,'inactive');
  assert.equal(measuredConnectionActivity(i,link,feed(5),null,'vessel',time).state,'unknown');
  assert.equal(measuredConnectionActivity(i,link,feed(5),confirmation,'other',time).state,'unknown');
  assert.equal(measuredConnectionActivity(i,link,feed(5),confirmation,'vessel',time+16000).state,'unknown');
});
test('common source readings and additional branches never fabricate branch activity',()=>{
  let i=fixture();const link=ownerDiagram(i).links[0];
  i={...i,installation:{...i.installation!,bindings:i.installation!.bindings!.map(b=>({...b,targetId:'alternator'}))}};
  assert.equal(measuredConnectionActivity(i,link,feed(5),confirmation,'vessel',time).state,'unknown');
  i=fixture();i=connectOwnerEquipment(i,'alternator','lighting',ownerConnections(i,'alternator','lighting')[0].id);
  assert.equal(measuredConnectionActivity(i,link,feed(5),confirmation,'vessel',time).state,'unknown');
});
test('manual activity is explicitly labelled, cannot override measurements, and keys exact conductors',()=>{
  const unknown={state:'unknown' as const,origin:'unknown' as const,label:'Sin medir'};
  assert.deepEqual(effectiveActivity(unknown,'active'),{state:'active',origin:'manual',label:'Activa · indicación manual'});
  const measured={state:'inactive' as const,origin:'measured' as const,label:'0 A'};assert.equal(effectiveActivity(measured,'active'),measured);
  const link=ownerDiagram(fixture()).links[0];assert.equal(manualActivityKey(link),manualActivityKey({...link,wires:[...link.wires].reverse()}));
  assert.notEqual(manualActivityKey(link),manualActivityKey({...link,wires:link.wires.map(w=>({...w,id:w.id+'new'}))}));
  assert.deepEqual(parseManualActivity('{bad'),{});assert.deepEqual(parseManualActivity('{"a":"active","b":["active"],"c":"unknown","d":"inactive"}'),{a:'active',d:'inactive'});
});
test('click-to-edit values persist nominal data only and do not invent readings or change wires',()=>{
  const i=fixture(),next=saveEquipmentValues(i,'alternator',{name:'Mi alternador',nominalV:12,capacityAh:null,ratedA:80,ratedW:null});
  assert.equal(next.installation!.nodes.find(n=>n.id==='alternator')!.name,'Mi alternador');
  assert.equal(next.electrical!.devices.find(d=>d.componentId==='alternator')!.nominalV,12);
  assert.deepEqual(next.electrical!.wires,i.electrical!.wires);
  assert.throws(()=>saveEquipmentValues(i,'alternator',{name:'',nominalV:-1,capacityAh:null,ratedA:null,ratedW:null}));
});
