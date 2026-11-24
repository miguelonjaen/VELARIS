import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TripLogger, type TripSession } from '../../lib/tripLogger';
import { emptyMissionPlan, loadMissionPlans, saveMissionPlan } from './missionPlan';
import { appendVoyageTrack } from './voyageTrack';
import { SharedNavigationState, NAVIGATION_FIELDS, type NavigationFreshnessPolicy } from '../navigation/SharedNavigationState';
import { VoyageMonitor } from './VoyageMonitor';
import { BoatInstrumentStore } from '../instruments/BoatInstrumentStore';
import { buildBoatPanelModel } from '../../features/boat/boatPanelModel';
import { voyageGuidance } from './voyageGuidance';

function fix(at: number, lat = 36, source: 'BOAT' | 'DROID' | 'SIMULATOR' = 'BOAT') {
  const policy = Object.fromEntries(NAVIGATION_FIELDS.map(field => [field, { BOAT: {maxAgeMs:5000,ageFrom:'receivedAt'}, DROID: {maxAgeMs:5000,ageFrom:'receivedAt'}, SIMULATOR: {maxAgeMs:5000,ageFrom:'receivedAt'} }])) as unknown as NavigationFreshnessPolicy;
  const nav = new SharedNavigationState(policy, () => at);
  nav.ingest([{field:'position',source,sourceId:'test',value:{lat,lng:-4},receivedAt:at,observedAt:at,observedAtFromSource:false}]);
  return nav.snapshot(at);
}
test('planes versionados e inmutables por barco; datos corruptos no se sobrescriben', () => {
  const map = new Map<string,string>(); const storage={getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>{map.set(k,v);}};
  const plan=emptyMissionPlan(); const first=saveMissionPlan(storage,'s',plan);
  const second=saveMissionPlan(storage,'s',{...first,name:'Alternativa'});
  assert.equal(first.version,1); assert.equal(second.version,2);
  assert.equal(loadMissionPlans(storage,'s')[0].name,'Nueva misión');
  assert.deepEqual(loadMissionPlans(storage,'other'),[]);
  map.set('VELARIS_missions:s','{"bad":true}');
  assert.throws(()=>saveMissionPlan(storage,'s',plan),/dañados/);
  assert.equal(map.get('VELARIS_missions:s'),'{"bad":true}');
});
test('track: cortes, fuentes, duplicados y simulación no crean puentes ni puntos reales', () => {
  let track=appendVoyageTrack({segments:[],cursor:null},fix(1000).position);
  track=appendVoyageTrack(track,fix(2000,36.01).position);
  assert.equal(track.segments[0].length,2);
  track=appendVoyageTrack(track,fix(2000,36.01).position);
  assert.equal(track.segments[0].length,2);
  track=appendVoyageTrack(track,fix(40000,36.02).position);
  assert.equal(track.segments.length,2);
  track=appendVoyageTrack(track,fix(41000,36.03,'DROID').position);
  assert.equal(track.segments.length,3);
  track=appendVoyageTrack(track,fix(42000,36.04,'SIMULATOR').position);
  assert.equal(track.segments.length,3); assert.equal(track.cursor,null);
});
test('DTW y ETA requieren navegación vigente; no se estima velocidad ni rumbo ausente',()=>{
  const plan={...emptyMissionPlan(),waypoints:[{id:'w',name:'Norte',lat:36.1,lng:-4}]};
  const g=voyageGuidance(plan,0,fix(1000));
  assert.ok(g && g.dtw>5.9 && g.dtw<6.1);assert.equal(g.etaSeconds,null);assert.equal(g.bearing,0);
  assert.equal(voyageGuidance(plan,0,fix(1000,36,'SIMULATOR')),null);
});

/** Transaction-aware fake. Stores only on commit; can abort a write and survive a new logger. */
function fakeDb() {
  const sessions=new Map<string,TripSession>(); let abortNext=false;
  const db={transaction:()=>{
    let pending:TripSession|null=null;
    const tx={error:new Error('disk full'),oncomplete:null as (()=>void)|null,onerror:null as (()=>void)|null,onabort:null as (()=>void)|null,
      objectStore:()=>({
        put:(s:TripSession)=>{pending=structuredClone(s);queueMicrotask(()=>{if(abortNext){abortNext=false;tx.onabort?.();}else{if(pending)sessions.set(pending.id,pending);tx.oncomplete?.();}});},
        getAll:()=>{const req={result:[...sessions.values()].map(v=>structuredClone(v)),onsuccess:null as (()=>void)|null};queueMicrotask(()=>req.onsuccess?.());return req;},
        get:(id:string)=>{const req={result:structuredClone(sessions.get(id)),onsuccess:null as (()=>void)|null};queueMicrotask(()=>req.onsuccess?.());return req;}
      })};return tx;
  }};
  const indexedDb={open:()=>{const req={result:db,onsuccess:null as (()=>void)|null};queueMicrotask(()=>req.onsuccess?.());return req;}};
  return {sessions,indexedDb,abort:()=>{abortNext=true;}};
}
test('sesión durable: inicio duplicado, cierre abortado, reinicio, historial y copia tardía',async()=>{
  const originalWindow=Object.getOwnPropertyDescriptor(globalThis,'window');const originalDb=Object.getOwnPropertyDescriptor(globalThis,'indexedDB');
  const db=fakeDb();Object.defineProperty(globalThis,'window',{configurable:true,value:{indexedDB:db.indexedDb}});Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:db.indexedDb});
  const logger=new TripLogger();
  try {
    const crew = [{ id: 'w1', nombre: 'Primera oficial', rango: 'Oficial' }];
    const [first,duplicate]=await Promise.all([logger.startSession('s', undefined, { crew, officer: crew[0].nombre, officerId: crew[0].id }),logger.startSession('s')]);assert.equal(first.id,duplicate.id);assert.equal(db.sessions.size,1);
    await logger.checkpoint(fix(1000).position,0);
    await logger.checkpoint(fix(2000,36.01).position,0.6);
    const event=await logger.addJournalEntry('Salida','Inicio',{barco_id:'s',created_at:'2026-10-27T12:00:00.001Z',titulo:'Salida'});assert.ok(event);
    db.abort();await assert.rejects(logger.endSession(),/disk full/);assert.equal(logger.getCurrentSession()?.isActive,true);
    const recovered=new TripLogger();const restored=await recovered.restoreSession('s');assert.equal(restored?.id,first.id); assert.deepEqual(restored?.crew, crew); assert.equal(restored?.officerId, crew[0].id); assert.equal(restored?.officer, crew[0].nombre);assert.equal(restored?.distanceNm,0.6);assert.ok(restored?.track?.cursor);
    assert.equal(recovered.getCurrentSession(),null,'recovery never silently records');
    await recovered.checkpoint(fix(8000,40).position,100);
    assert.equal((await recovered.getSession(first.id))?.distanceNm,0.6);
    await recovered.resolvePendingSession('s',true);
    assert.equal(recovered.getCurrentSession()?.track?.cursor,null);
    await recovered.checkpoint(fix(9000,42).position,99);
    assert.equal(recovered.getCurrentSession()?.distanceNm,0.6,'pre-resume cached telemetry is rejected');
    assert.equal(TripLogger.calculateMetrics({...restored!,entries:[
      {timestamp:1,lat:36,lng:-4,cog:null,sog:null,windDir:null,windSpeed:null,depth:null},
      {timestamp:2,lat:42,lng:-4,cog:null,sog:null,windDir:null,windSpeed:null,depth:null}
    ]})?.totalDistance,0.6,'metrics use canonical distance rather than bridging recovery gaps');
    await assert.rejects(recovered.startSession('other'),/Finalice/);
    await recovered.checkpoint(fix(recovered.getTelemetryNotBefore()+1,36.1).position,0.6);assert.equal(recovered.getCurrentSession()?.track?.segments.length,2);
    const closed=await recovered.endSession();assert.equal(closed?.isActive,false);
    await recovered.markCloudSaved(event.id,first.id);assert.equal((await recovered.getSession(first.id))?.isActive,false,'late cloud receipt must not reopen voyage');
    const fresh=new TripLogger();const history=await fresh.restoreSession('s');assert.equal(history?.isActive,false);assert.equal(fresh.getCurrentSession(),null);
    const next=await fresh.startSession('s');assert.notEqual(next.id,first.id);
    let sends=0;await fresh.syncJournal('s',async()=>{sends++;});assert.equal(sends,0,'confirmed event not resent');
    const pending=await fresh.addJournalEntry('Evento','Local',{barco_id:'s'});assert.ok(pending);
    await assert.rejects(fresh.syncJournal('s',async()=>{throw new Error('offline');}),/offline/);
    assert.equal((await fresh.getSession(next.id))?.journal?.[0].cloudSaved,false);
    await fresh.syncJournal('s',async()=>{sends++;});assert.equal(sends,1);
    await fresh.endSession();
  } finally {
    logger.stopAutoLogging();
    if(originalWindow)Object.defineProperty(globalThis,'window',originalWindow);else Reflect.deleteProperty(globalThis,'window');
    if(originalDb)Object.defineProperty(globalThis,'indexedDB',originalDb);else Reflect.deleteProperty(globalThis,'indexedDB');
  }
});


test('pérdida prolongada no cierra una travesía con la política operativa de Desktop',()=>{
 const m=new VoyageMonitor({autoStart:false,autoEndAfterSignalLossMs:Infinity});
 const sample=(now:number,active:boolean,position:{lat:number;lng:number}|null)=>({now,voyageActive:active,boatPosition:position,boatSog:position?4:null,boatCog:position?0:null,positionSource:position?'BOAT' as const:null});
 m.tick(sample(1000,false,{lat:36,lng:-4}));assert.ok(!m.tick(sample(32000,false,{lat:36,lng:-4})).some(e=>e.type==='VOYAGE_START'));
 m.tick(sample(33000,true,{lat:36,lng:-4}));m.tick(sample(64000,true,null));
 assert.ok(!m.tick(sample(8*3600000,true,null)).some(e=>e.type==='VOYAGE_AUTO_END'));
});

test('energía: potencia solo con V/A de la misma batería y próximos en el tiempo; sin SOC inventado',()=>{
 const ins=new BoatInstrumentStore(()=>10000);
 ins.ingest({type:'TRANSDUCER',readings:[{kind:'U',unit:'V',name:'BAT_SERVICE',value:12.5},{kind:'I',unit:'A',name:'BAT_SERVICE',value:-4}]},10000);
 const model=(now:number)=>buildBoatPanelModel({now,navigation:fix(now),instruments:ins.snapshot(now),voyage:{status:'not_started',autoStarted:false,startedAt:null},alarms:[],ais:{enabled:false,targetCount:0,dangerousCount:0}}).find(s=>s.id==='electrical')!;
 assert.ok(model(10000).rows.some(r=>r.label.endsWith('potencia neta')&&r.value==='-50 W'));
 assert.equal(model(10000).rows.find(r=>r.label==='Estado de carga (SOC)')?.value,'No soportado');
 ins.ingest({type:'TRANSDUCER',readings:[{kind:'U',unit:'V',name:'BAT_SERVICE',value:12.6}]},14000);
 assert.ok(model(14000).rows.some(r=>r.label.endsWith('potencia neta')&&r.value==='Requiere V/A simultáneos'));
 assert.ok(!model(30001).rows.some(r=>r.value.endsWith(' W')));
});

test('automatic waypoint and final arrival survive restart without ending the voyage', async () => {
  const originalWindow=Object.getOwnPropertyDescriptor(globalThis,'window');
  const originalDb=Object.getOwnPropertyDescriptor(globalThis,'indexedDB');
  const db=fakeDb();
  Object.defineProperty(globalThis,'window',{configurable:true,value:{indexedDB:db.indexedDb}});
  Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:db.indexedDb});
  const logger=new TripLogger();
  try {
    const plan={...emptyMissionPlan(),waypoints:[
      {id:'one',name:'WP1',lat:36,lng:-4},{id:'two',name:'WP2',lat:36.01,lng:-4}
    ]};
    const session=await logger.startSession('s','test',{plan,mode:'Ruta'});
    await logger.synchronizeWaypoint(1);
    assert.equal(db.sessions.get(session.id)?.waypointIndex,1);
    await logger.synchronizeWaypoint(2,true);
    assert.equal(logger.getCurrentSession()?.routeArrivedAt,undefined,'out-of-range cannot complete');
    db.abort();
    await assert.rejects(logger.synchronizeWaypoint(1,true),/disk full/);
    assert.ok(logger.getPersistenceError());
    await logger.synchronizeWaypoint(1,true);
    assert.equal(logger.getPersistenceError(),null);
    const arrivedAt=logger.getCurrentSession()?.routeArrivedAt;
    assert.ok(arrivedAt);
    await logger.synchronizeWaypoint(1,true);
    assert.equal(logger.getCurrentSession()?.routeArrivedAt,arrivedAt,'arrival is idempotent');
    const recovered=new TripLogger();
    const restored=await recovered.restoreSession('s');
    assert.equal(restored?.waypointIndex,1);
    assert.equal(restored?.routeArrivedAt,arrivedAt);
    assert.equal(restored?.isActive,true,'route completion does not end voyage');
  } finally {
    logger.stopAutoLogging();
    if(originalWindow)Object.defineProperty(globalThis,'window',originalWindow);else Reflect.deleteProperty(globalThis,'window');
    if(originalDb)Object.defineProperty(globalThis,'indexedDB',originalDb);else Reflect.deleteProperty(globalThis,'indexedDB');
  }
});

test('recuperación pendiente: no graba, prioriza sesión abierta antigua, cierre durable sin reanudar', async () => {
  const originalWindow=Object.getOwnPropertyDescriptor(globalThis,'window');
  const originalDb=Object.getOwnPropertyDescriptor(globalThis,'indexedDB');
  const db=fakeDb();
  Object.defineProperty(globalThis,'window',{configurable:true,value:{indexedDB:db.indexedDb}});
  Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:db.indexedDb});
  try {
    const original=new TripLogger();
    const voyage=await original.startSession('MERYSEA','Libre',{mode:'Libre'});
    await original.addJournalEntry('Guardia','Dato conservado',{barco_id:'MERYSEA'});
    await original.checkpoint(fix(1000).position,1601);
    db.sessions.set('newer',{id:'newer',shipId:'MERYSEA',startTime:voyage.startTime+1,isActive:false,entries:[]});
    const logger=new TripLogger();
    assert.equal((await logger.restoreSession('MERYSEA'))?.id,voyage.id);
    assert.equal(logger.getCurrentSession(),null);
    await logger.addEntry({lat:40,lng:-4,cog:null,sog:null,windDir:null,windSpeed:null,depth:null});
    assert.equal(await logger.addJournalEntry('No','No se añade'),null);
    assert.equal((await logger.getSession(voyage.id))?.entries.length,0);
    await assert.rejects(logger.startSession('MERYSEA'),/pendiente/);
    await assert.rejects(logger.restoreSession('SailandSea'),/pendiente/);
    await assert.rejects(logger.resolvePendingSession('SailandSea',false),/barco/);
    db.abort(); await assert.rejects(logger.resolvePendingSession('MERYSEA',false),/disk full/);
    assert.equal(logger.getPendingSession()?.isActive,true);
    assert.equal((await logger.getSession(voyage.id))?.isActive,true);
    const closed=await logger.resolvePendingSession('MERYSEA',false);
    assert.equal(closed.isActive,false);assert.equal(closed.distanceNm,1601);
    assert.equal(closed.journal?.length,1);assert.equal(closed.track?.segments.length,1);
    assert.equal(logger.getCurrentSession(),null);assert.equal(logger.getPendingSession(),null);
    assert.equal(await logger.restoreSession('SailandSea'),null);
    const next=await logger.startSession('SailandSea');
    assert.equal(next.distanceNm,0);assert.deepEqual(next.entries,[]);assert.deepEqual(next.journal,[]);
    await assert.rejects(logger.addJournalEntry('Otro','No mezclar',{barco_id:'MERYSEA'}),/otra/);
  } finally {
    if(originalWindow)Object.defineProperty(globalThis,'window',originalWindow);else Reflect.deleteProperty(globalThis,'window');
    if(originalDb)Object.defineProperty(globalThis,'indexedDB',originalDb);else Reflect.deleteProperty(globalThis,'indexedDB');
  }
});

test('escritorio: NMEA sostenido y reconexión nunca solicitan inicio formal', () => {
  const monitor=new VoyageMonitor({autoStart:false});
  for(let now=0;now<180000;now+=1000) {
    const connected=now<60000||now>90000;
    assert.ok(!monitor.tick({now,voyageActive:false,boatPosition:connected?{lat:36,lng:-4}:null,
      boatSog:connected?6:null,boatCog:connected?90:null,positionSource:connected?'BOAT':null})
      .some(event=>event.type==='VOYAGE_START'));
  }
});

test('REC: pausa durable sin millas, reanudación en tramo nuevo y bitácora atómica', async () => {
  const oldWindow=Object.getOwnPropertyDescriptor(globalThis,'window'),oldDb=Object.getOwnPropertyDescriptor(globalThis,'indexedDB');
  const db=fakeDb();
  Object.defineProperty(globalThis,'window',{configurable:true,value:{indexedDB:db.indexedDb}});
  Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:db.indexedDb});
  try {
    const logger=new TripLogger(), session=await logger.startSession('boat');
    await logger.checkpoint(fix(1000).position,1);
    db.abort();await assert.rejects(logger.setRecordingPaused(true,{barco_id:'boat'}),/disk full/);
    assert.equal(logger.isRecording(),true);assert.equal(session.pausedAt,undefined);assert.equal(session.journal?.length,0);
    await assert.rejects(logger.setRecordingPaused(true,{barco_id:'other'}),/otra/);
    await logger.setRecordingPaused(true,{barco_id:'boat',latitud:null,longitud:null});
    assert.equal(logger.isRecording(),false);assert.equal(session.isActive,true);
    assert.ok(session.pausedAt);assert.equal(session.journal?.length,1);assert.equal(session.journal?.[0].payload?.titulo,'Pausa de grabación');
    await logger.setRecordingPaused(true);assert.equal(session.journal?.length,1,'idempotent pause');
    await logger.checkpoint(fix(2000,42).position,99);
    await logger.addEntry({lat:42,lng:-4,cog:null,sog:null,windDir:null,windSpeed:null,depth:null});
    assert.equal(session.distanceNm,1);assert.equal(session.entries.length,0);
    await assert.rejects(logger.startSession('other'),/Finalice/);
    const restarted=new TripLogger();await restarted.restoreSession('boat');
    assert.equal(restarted.getCurrentSession(),null);assert.ok(restarted.getPendingSession()?.pausedAt);
    db.abort();await assert.rejects(logger.setRecordingPaused(false),/disk full/);
    assert.equal(logger.isRecording(),false);assert.ok(session.pausedAt);
    await logger.setRecordingPaused(false,{barco_id:'boat'});
    assert.equal(logger.isRecording(),true);assert.equal(session.pausedAt,undefined);assert.equal(session.journal?.length,2);
    assert.equal(session.journal?.[1].payload?.titulo,'Reanudación de grabación');
    await logger.checkpoint(fix(3000,42).position,99);assert.equal(session.distanceNm,1,'reject cached pre-resume fix');
    await logger.checkpoint(fix(logger.getTelemetryNotBefore()+1,40).position,1);
    assert.equal(session.track?.segments.length,2);assert.equal(session.track?.segments[1].length,1);
    await logger.setRecordingPaused(true);const closed=await logger.endSession();
    assert.equal(closed?.isActive,false);assert.equal(closed?.distanceNm,1);assert.equal(closed?.journal?.length,3);
  } finally {
    if(oldWindow)Object.defineProperty(globalThis,'window',oldWindow);else Reflect.deleteProperty(globalThis,'window');
    if(oldDb)Object.defineProperty(globalThis,'indexedDB',oldDb);else Reflect.deleteProperty(globalThis,'indexedDB');
  }
});
