import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSailingTacticsModel, relativeBearing, type SailingTacticsInput } from './sailingTacticsModel';
import { SharedNavigationState, NAVIGATION_FIELDS, type NavigationFreshnessPolicy } from '../../../core/navigation/SharedNavigationState';
import { BoatInstrumentStore } from '../../../core/instruments/BoatInstrumentStore';
import { parseBoatPolar } from '../../../core/navigation/BoatPolar';
const T0=100000;
const policy=Object.fromEntries(NAVIGATION_FIELDS.map(field=>[field,{BOAT:{maxAgeMs:5000,ageFrom:'receivedAt'},DROID:{maxAgeMs:5000,ageFrom:'receivedAt'},SIMULATOR:{maxAgeMs:5000,ageFrom:'receivedAt'}}])) as unknown as NavigationFreshnessPolicy;
function fixture(source:'BOAT'|'SIMULATOR'='BOAT') {
 const nav=new SharedNavigationState(policy,()=>T0);
 const base={source,sourceId:'test',receivedAt:T0,observedAt:T0,observedAtFromSource:false};
 nav.update({...base,field:'position',value:{lat:36,lng:-4}});
 nav.update({...base,field:'sog',value:6});nav.update({...base,field:'cog',value:90});nav.update({...base,field:'headingTrue',value:359});
 const instruments=new BoatInstrumentStore(()=>T0);
 const input:SailingTacticsInput={boat:{now:T0,navigation:nav.snapshot(T0),instruments:instruments.snapshot(T0),voyage:{status:'not_started',autoStarted:false,startedAt:null},alarms:[],ais:{enabled:false,targetCount:0,dangerousCount:0}},polar:null,waypoint:{position:{lat:36,lng:-3.9},name:'WP1'}};
 return {nav,base,input};
}
test('SOG is never displayed as STW or polar performance',()=>{
 const {input}=fixture();const model=buildSailingTacticsModel(input);
 assert.equal(model.sog,6);assert.equal(model.stw,null);assert.equal(model.performancePercent,null);
 assert.ok(model.distance!==null && model.distance>4 && model.distance<5);assert.ok(model.bearing!==null && model.bearing>89 && model.bearing<91);assert.ok(model.seconds!==null);
});
test('missing position/waypoint and stale navigation suppress geometry and TTW',()=>{
 const {input,nav}=fixture();const empty=buildSailingTacticsModel({...input,waypoint:null});assert.equal(empty.bearing,null);assert.equal(empty.seconds,null);
 const stale=buildSailingTacticsModel({...input,boat:{...input.boat,now:T0+6000,navigation:nav.snapshot(T0+6000)}});
 assert.equal(stale.sog,null);assert.equal(stale.distance,null);assert.equal(stale.seconds,null);
});
test('moving away does not produce a misleading arrival time',()=>{
 const {input,nav,base}=fixture();nav.update({...base,receivedAt:T0+1,observedAt:T0+1,field:'cog',value:270});
 const model=buildSailingTacticsModel({...input,boat:{...input.boat,navigation:nav.snapshot(T0+1)}});
 assert.ok(model.vmg!==null && model.vmg<0);assert.equal(model.seconds,null);
});
test('magnetic heading never orients a true waypoint marker',()=>{
 const nav=new SharedNavigationState(policy,()=>T0);nav.update({source:'BOAT',sourceId:'test',receivedAt:T0,observedAt:T0,observedAtFromSource:false,field:'headingMagnetic',value:117});
 const {input}=fixture();const model=buildSailingTacticsModel({...input,boat:{...input.boat,navigation:nav.snapshot(T0)}});
 assert.equal(model.reference,'M');assert.equal(model.heading,117);assert.equal(model.waypointRelative,null);assert.equal(model.portRelative,null);
});
test('angle crossing north stays continuous and sources remain identified',()=>{
 assert.equal(relativeBearing(1,359),2);assert.equal(relativeBearing(359,1),-2);
 assert.equal(buildSailingTacticsModel(fixture('SIMULATOR').input).simulated,true);
});
test('laylines require measured wind, valid polar and waypoint; target speed is not performance',()=>{
 const {input}=fixture();const polar=parseBoatPolar('TWA/TWS;6;10\n0;0;0\n30;2;4\n45;4;6\n90;5;7\n150;4;6\n180;2;3');
 const noWind=buildSailingTacticsModel({...input,polar});assert.equal(noWind.portRelative,null);
 const model=buildSailingTacticsModel({...input,polar,boat:{...input.boat,instruments:{...input.boat.instruments,windTrue:{value:{angleDeg:45,speedKn:8},ageMs:0}}}});
 assert.equal(model.targetSpeed,5);assert.notEqual(model.portRelative,null);assert.equal(model.performancePercent,null);
});
