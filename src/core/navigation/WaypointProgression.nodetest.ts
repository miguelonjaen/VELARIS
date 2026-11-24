import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NavigationEngine } from '../navigation/NavigationEngine';
import { NavigationAdapter } from '../adapters/NavigationAdapter';
import { GaulosCore } from '../GaulosCore';
import { SharedNavigationState, NAVIGATION_FIELDS, type NavigationFreshnessPolicy, type NavigationSource } from '../navigation/SharedNavigationState';
import { RouteTrial } from '../voyage/RouteTrial';

const T = 1_800_000_000_000;
const engine = new NavigationEngine();
const origin = { lat: 36, lng: -4.5 };
const target = { id: 'wp', position: { lat: 36.001, lng: -4.5 }, radiusNm: 0.005 };
const before = { lat: 36.0008, lng: -4.4998 };
const after = { lat: 36.0012, lng: -4.4998 };

test('forward pass outside radius but inside corridor; reverse, distant and degenerate passes rejected', () => {
  assert.ok(engine.calculateDistance(after, target.position) > target.radiusNm);
  assert.equal(engine.hasPassedWaypoint(before, after, origin, target), true);
  assert.equal(engine.hasPassedWaypoint(after, before, origin, target), false);
  assert.equal(engine.hasPassedWaypoint({...before,lng:-4.49}, {...after,lng:-4.49}, origin, target), false);
  assert.equal(engine.hasPassedWaypoint(before, after, target.position, target), false);
  assert.equal(engine.hasPassedWaypoint(after, {...after,lat:36.002}, origin, target), false);
});

test('spherical pass supports the date line', () => {
  const wp = {id:'date',position:{lat:10,lng:-179.999},radiusNm:0.005};
  assert.equal(engine.hasPassedWaypoint({lat:10,lng:179.9995},{lat:10,lng:-179.998}, {lat:10,lng:179.99}, wp),true);
});

test('four NMEA-steered trial waypoints advance once, update all metrics and finish once', () => {
  const trial = new RouteTrial();
  const points = [1,2,3,4].map(n => ({lat:36+0.00035+(n-1)*0.0005,lng:-4.4998}));
  trial.start(origin,points,100,T,0);
  // 100 kn crosses the small radius between one-second samples.
  const first = trial.tick(T+1000,100,0)!;
  assert.equal(first.waypointIndex,2);
  assert.equal(first.metrics.progression.activeWaypointIndex,2);
  assert.ok(Math.abs(first.metrics.distanceToWaypointNm! - engine.calculateDistance(first.position,points[1]))<1e-9);
  assert.equal(first.metrics.bearingToWaypoint,engine.calculateBearing(first.position,points[1]));
  assert.equal(first.metrics.xte?.signedDistanceNm,engine.calculateXTE(first.position,points[0],points[1]).signedDistanceNm);
  assert.equal(first.metrics.etaSeconds,engine.calculateETA(first.metrics.distanceToWaypointNm!,100));
  assert.equal(trial.tick(T+1000,100,0)!.waypointIndex,2);
  for(let i=2;i<10;i++) trial.tick(T+i*1000,100,0);
  assert.equal(trial.snapshot().status,'finished');
  assert.equal(trial.snapshot().waypointIndex,4);
  assert.equal(trial.drainEvents().filter(e=>e.title==='Llegada del ensayo').length,1);
});

const policy = Object.fromEntries(NAVIGATION_FIELDS.map(field=>[field,{
  BOAT:{maxAgeMs:5000,ageFrom:'receivedAt'},DROID:{maxAgeMs:5000,ageFrom:'receivedAt'},SIMULATOR:{maxAgeMs:5000,ageFrom:'receivedAt'}
}])) as unknown as NavigationFreshnessPolicy;
function setup() {
  let now = T;
  const shared = new SharedNavigationState(policy,()=>now);
  const core = new GaulosCore();
  const adapter = new NavigationAdapter({core,navigationState:shared,clock:()=>now});
  core.setRoute({id:'route',waypoints:[target,{id:'two',position:{lat:36.003,lng:-4.5},radiusNm:0.005}]});
  core.updateNavigation({status:'navigating'});
  const feed = (source:NavigationSource,position:typeof origin, advance=1000) => {
    now+=advance;
    shared.update({field:'position',source,sourceId:source,value:position,observedAt:now,receivedAt:now,observedAtFromSource:false});
    shared.update({field:'sog',source,sourceId:source,value:6,observedAt:now,receivedAt:now,observedAtFromSource:false});
    adapter.recalculate();
  };
  return {shared,core,adapter,feed,elapse:(ms:number)=>{now+=ms;adapter.recalculate();}};
}

test('arrival publishes the reached waypoint once; manual selection, stale and repeated fixes publish nothing',()=>{
  const {core,adapter,feed,elapse}=setup(); const reached:number[]=[];
  core.subscribe('WaypointReached',event=>reached.push(event.payload.waypointIndex));
  feed('DROID',origin);feed('DROID',before);elapse(6000);feed('DROID',after);
  assert.deepEqual(reached,[]);
  feed('DROID',before);feed('DROID',after);
  assert.deepEqual(reached,[0]);
  for(let i=0;i<5;i++)adapter.recalculate();
  assert.deepEqual(reached,[0]);
  feed('DROID',{lat:36.003,lng:-4.5});
  assert.deepEqual(reached,[0,1]);
  core.updateNavigation({activeWaypointIndex:0});
  assert.deepEqual(reached,[0,1]);
});
test('shared simulator advances with synchronized metrics; repeated recalculation cannot skip WP',()=>{
  const {core,adapter,feed}=setup();
  feed('SIMULATOR',origin);feed('SIMULATOR',before);feed('SIMULATOR',after);
  const nav=core.getState().navigation;
  assert.equal(nav.activeWaypointIndex,1);
  assert.equal(nav.distanceToWaypoint,engine.calculateDistance(after,{lat:36.003,lng:-4.5}));
  for(let i=0;i<10;i++) adapter.recalculate();
  assert.equal(core.getState().navigation.activeWaypointIndex,1);
  feed('SIMULATOR',{lat:36.003,lng:-4.5});
  assert.equal(core.getState().navigation.status,'arrived');
  assert.equal(core.getState().navigation.activeWaypointIndex,1);
});
test('BOAT > DROID > SIMULATOR, no geometric crossing across source switches',()=>{
  const {core,feed,elapse}=setup();
  feed('BOAT',origin);feed('DROID',after);feed('SIMULATOR',after);
  assert.equal(core.getState().navigation.activeWaypointIndex,0);
  elapse(4001); // BOAT expired, Droid expired too; simulator is still fresh.
  assert.equal(core.getState().navigation.activeWaypointIndex,0);
  feed('BOAT',target.position);
  assert.equal(core.getState().navigation.activeWaypointIndex,1);
});
test('invalid and stale fixes clear guidance, break crossing continuity, no false progression',()=>{
  const {core,feed,elapse}=setup();
  feed('BOAT',origin);feed('BOAT',before);feed('BOAT',{lat:NaN,lng:-4.5});
  assert.equal(core.getState().navigation.distanceToWaypoint,null);
  feed('BOAT',after);
  assert.equal(core.getState().navigation.activeWaypointIndex,0);
  feed('BOAT',before);elapse(6000);
  assert.equal(core.getState().navigation.distanceToWaypoint,null);
  feed('BOAT',after);
  assert.equal(core.getState().navigation.activeWaypointIndex,0);
});
test('trial stale, invalid and duplicate ticks do not advance',()=>{
  const trial=new RouteTrial();trial.start(origin,[target.position],100,T,0);
  assert.equal(trial.tick(T+1000,null,0)!.waypointIndex,1);
  assert.equal(trial.tick(T+2000,100,NaN)!.status,'waiting');
  assert.equal(trial.tick(T+2000,100,0)!.status,'waiting');
  assert.equal(trial.tick(NaN,100,0)!.waypointIndex,1);
});

test('future timestamp is invalid and falls back to the next source', () => {
  const nav = new SharedNavigationState(policy, () => T);
  for (const source of ['BOAT','DROID','SIMULATOR'] as const) {
    const time = source === 'BOAT' ? T + 1000 : T;
    nav.update({field:'position',source,sourceId:source,value:origin,
      observedAt:time,receivedAt:time,observedAtFromSource:false});
  }
  assert.equal(nav.resolve('position').source,'DROID');
  assert.equal(nav.resolve('position').sources.BOAT,'INVALID');
});
test('delayed source-time fixes stay stale under observation-age policy',()=>{
  const observedPolicy: NavigationFreshnessPolicy = {...policy,position:{
    BOAT:{maxAgeMs:5000,ageFrom:'observedAt'},DROID:{maxAgeMs:5000,ageFrom:'observedAt'},
    SIMULATOR:{maxAgeMs:5000,ageFrom:'receivedAt'}
  }};
  const nav=new SharedNavigationState(observedPolicy,()=>T);
  nav.update({field:'position',source:'BOAT',sourceId:'boat',value:target.position,
    observedAt:T-6000,receivedAt:T,observedAtFromSource:true});
  nav.update({field:'position',source:'DROID',sourceId:'phone',value:origin,
    observedAt:T,receivedAt:T,observedAtFromSource:true});
  assert.equal(nav.resolve('position').source,'DROID');
});
test('inactive route cannot advance; live DROID backup can advance by radius',()=>{
  const {core,feed}=setup();
  core.updateNavigation({status:'planned'});
  feed('DROID',target.position);
  assert.equal(core.getState().navigation.activeWaypointIndex,0);
  core.updateNavigation({status:'navigating'});
  feed('DROID',target.position);
  assert.equal(core.getState().navigation.activeWaypointIndex,1);
});
test('lateral crossing leaves trial on WP1 with its original DTW',()=>{
  const trial=new RouteTrial();
  const points=[{lat:36.001,lng:-4.49},{lat:36.002,lng:-4.49}];
  trial.start(origin,points,100,T,0);
  for(let i=1;i<10;i++) trial.tick(T+i*1000,100,0);
  const snapshot=trial.snapshot();
  assert.equal(snapshot.waypointIndex,1);
  assert.equal(snapshot.status,'running');
  assert.equal(snapshot.metrics.distanceToWaypointNm,engine.calculateDistance(snapshot.position,points[0]));
});

test('a SIM-scoped route never progresses on a real position', () => {
  const { core, feed, elapse } = setup();
  const route = core.getState().activeRoute!;
  core.setRoute({ ...route, positionSource: 'SIMULATOR' });
  feed('BOAT', target.position);
  assert.equal(core.getState().navigation.distanceToWaypoint, null);
  assert.equal(core.getState().navigation.activeWaypointIndex, 0);
  elapse(6000);
  feed('SIMULATOR', target.position);
  assert.equal(core.getState().navigation.activeWaypointIndex, 1);
});
