import { test } from 'node:test';
import assert from 'node:assert/strict';
import { engineVisualModel } from './engineVisualModel';
import type { EngineReadings } from '../../core/instruments/BoatInstrumentStore';
const base:EngineReadings={engine:1,rpm:null,temperatureC:null,oilPressureBar:null};
test('missing engine and temperature alone do not imply running',()=>{
 assert.equal(engineVisualModel(null).state,'Desconocido');
 assert.equal(engineVisualModel({...base,temperatureC:{value:82,ageMs:0}}).state,'Desconocido');
});
test('measured zero confirms stop; positive and negative RPM confirm running',()=>{
 assert.equal(engineVisualModel({...base,rpm:{value:0,ageMs:0}}).state,'Parado');
 for(const rpm of [1800,-1800]) assert.equal(engineVisualModel({...base,rpm:{value:rpm,ageMs:0}}).state,'En marcha');
});
test('RPM and XDR expire separately and never become a fabricated zero',()=>{
 const model=engineVisualModel({...base,rpm:{value:1800,ageMs:10001},temperatureC:{value:82,ageMs:15000},oilPressureBar:{value:3,ageMs:15001}});
 assert.equal(model.state,'Desconocido');assert.equal(model.rpm,null);assert.equal(model.temperature,82);assert.equal(model.oil,null);
});
