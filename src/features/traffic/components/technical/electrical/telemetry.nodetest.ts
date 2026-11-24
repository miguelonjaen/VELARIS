import test from 'node:test';
import assert from 'node:assert/strict';
import { BoatInstrumentStore } from '../../../../../core/instruments/BoatInstrumentStore';
import { emptyInventory, parseInventory } from '../model';
import { compatibleTarget, connectionFingerprint, type InstrumentFeed } from '../sensorBindings';
import { addElectricalEquipment, initializeElectrical } from './actions';
import { electricalTelemetry } from './telemetry';
const time=Date.UTC(2026,10,11,8);
const status={state:'CONNECTED' as const,source:'BOAT' as const,transport:'tcp' as const,host:'fixture.local',port:10110,portPath:null,error:null,lastLineAt:time};
const connection=connectionFingerprint(status)!;
const confirmed={vesselId:'vessel',connection,at:time-5000};
function fixture(){let i=addElectricalEquipment(initializeElectrical(emptyInventory()),'controller',{x:0,y:0},'mppt');i=addElectricalEquipment(i,'bank-service',{x:0,y:0},'bank');return i;}
function feed():InstrumentFeed{const store=new BoatInstrumentStore(()=>time);store.ingest({type:'TRANSDUCER',readings:[{kind:'I',unit:'A',name:'SOLAR0_OUT',value:10},{kind:'U',unit:'V',name:'SOLAR0_OUT',value:14.2}]},time);return {vesselId:'vessel',connection:status,capturedAt:time,instruments:store.snapshot(time)};}
test('explicit controller binding exposes common real output and calculated power, never branch percentages',()=>{
  const i=fixture();i.installation!.bindings=[{targetId:'mppt',metric:'current',channel:'solar-current',sensor:'SOLAR0_OUT',connection}];parseInventory(i);
  const result=electricalTelemetry(i,feed(),confirmed,'vessel',time).get('mppt')!;
  assert.ok(result.some(label=>label.includes('10 A')));assert.ok(result.some(label=>label.includes('14,2 V')));assert.ok(result.some(label=>label.includes('142 W')&&label.includes('calculado')));
  assert.equal(electricalTelemetry(i,feed(),null,'vessel',time).size,0);
  assert.equal(electricalTelemetry(i,feed(),confirmed,'other-vessel',time).size,0);
});
test('a solar panel cannot receive the regulator output sensor; bank monitor V/SOC is explicitly selectable',()=>{
  let i=fixture();i=addElectricalEquipment(i,'solar',{x:0,y:0},'pv');
  assert.equal(compatibleTarget(i,'pv','solar-current'),false);assert.equal(compatibleTarget(i,'mppt','solar-current'),true);
  assert.equal(compatibleTarget(i,'bank','battery-voltage'),true);assert.equal(compatibleTarget(i,'bank','battery-soc'),true);
});
test('stale or unsynchronised voltage never produces a live calculated power',()=>{
  const i=fixture();i.installation!.bindings=[{targetId:'mppt',metric:'current',channel:'solar-current',sensor:'SOLAR0_OUT',connection}];const f=feed();
  const shifted={...f,instruments:{...f.instruments,solar:{...f.instruments.solar!,outputVolts:{value:14.2,ageMs:3000}}}};
  assert.ok(!electricalTelemetry(i,shifted,confirmed,'vessel',time).get('mppt')!.some(label=>label.includes(' W')));
  assert.equal(electricalTelemetry(i,f,confirmed,'vessel',time+16000).size,0);
});
test('a voltage-only real output remains visible without inventing current or power',()=>{
  const i=fixture();i.installation!.bindings=[{targetId:'mppt',metric:'voltage',channel:'solar-voltage',sensor:'SOLAR0_OUT',connection}];parseInventory(i);
  const labels=electricalTelemetry(i,feed(),confirmed,'vessel',time).get('mppt')!;assert.ok(labels.some(label=>label.includes('14,2 V')));assert.ok(!labels.some(label=>label.includes(' A')||label.includes(' W')));
});
