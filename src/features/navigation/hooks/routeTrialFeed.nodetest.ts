import {test} from 'node:test';import assert from 'node:assert/strict';
import { SharedNavigationState, NAVIGATION_FIELDS, type NavigationFreshnessPolicy } from '../../../core/navigation/SharedNavigationState';
import {trialStartFeed,trialSog,trialHeading} from './routeTrialFeed';
const policy=Object.fromEntries(NAVIGATION_FIELDS.map(field=>[field,{BOAT:{maxAgeMs:5000,ageFrom:'receivedAt'},DROID:{maxAgeMs:5000,ageFrom:'receivedAt'},SIMULATOR:{maxAgeMs:5000,ageFrom:'receivedAt'}}])) as unknown as NavigationFreshnessPolicy;
function nav(source:'BOAT'|'SIMULATOR'|'DROID',sog=6){const state=new SharedNavigationState(policy,()=>10000);const base={source,sourceId:'fixture',observedAt:10000,receivedAt:10000,observedAtFromSource:false};state.update({...base,field:'position',value:{lat:36,lng:-4.5}});state.update({...base,field:'sog',value:sog});return state;}
test('start accepts explicitly identified simulator and declared BOAT NMEA',()=>{for(const source of ['BOAT','SIMULATOR'] as const){const feed=trialStartFeed(nav(source).snapshot());assert.equal(feed.ready,true);if(feed.ready)assert.equal(feed.source,source);}});
test('Droid, mixed sources and expired data cannot silently drive a trial',()=>{assert.equal(trialStartFeed(nav('DROID').snapshot()).ready,false);const state=nav('SIMULATOR');state.update({source:'BOAT',sourceId:'boat',observedAt:10000,receivedAt:10000,observedAtFromSource:false,field:'sog',value:8});assert.equal(trialStartFeed(state.snapshot()).ready,false);assert.equal(trialStartFeed(nav('BOAT').snapshot(16000)).ready,false);});
test('zero remains a real stop and an active trial never changes source automatically',()=>{assert.equal(trialSog(nav('SIMULATOR',0).snapshot(),'SIMULATOR'),0);assert.equal(trialSog(nav('BOAT').snapshot(),'SIMULATOR'),null);assert.equal(trialSog(nav('SIMULATOR').snapshot(16000),'SIMULATOR'),null);});


test('heading verdadero del mismo origen: acepta norte 0, rechaza magnético, caducado y otro emisor', () => {
 const state=nav('SIMULATOR');
 const base={source:'SIMULATOR' as const,sourceId:'fixture',observedAt:10000,receivedAt:10000,observedAtFromSource:false};
 assert.equal(trialHeading(state.snapshot(),'SIMULATOR'),null);
 state.update({...base,field:'headingMagnetic',value:90});
 assert.equal(trialHeading(state.snapshot(),'SIMULATOR'),null);
 state.update({...base,field:'headingTrue',value:0});
 assert.equal(trialHeading(state.snapshot(),'SIMULATOR'),0);
 assert.equal(trialHeading(state.snapshot(),'BOAT'),null);
 assert.equal(trialHeading(state.snapshot(16000),'SIMULATOR'),null);
 state.update({...base,sourceId:'another',receivedAt:10001,observedAt:10001,field:'headingTrue',value:180});
 assert.equal(trialHeading(state.snapshot(10001),'SIMULATOR'),null);
});
