import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AutomaticJournal } from './AutomaticJournal';
import { SharedNavigationState, NAVIGATION_FIELDS, type NavigationFreshnessPolicy, type NavigationSource } from '../navigation/SharedNavigationState';
import { TripLogger } from '../../lib/tripLogger';
import type { LogEntry } from '../../shared/types';

const policy = Object.fromEntries(NAVIGATION_FIELDS.map(f => [f, Object.fromEntries(['BOAT','DROID','SIMULATOR'].map(s => [s, {maxAgeMs:5000,ageFrom:'observedAt'}]))])) as unknown as NavigationFreshnessPolicy;
function fixture() {
    const nav = new SharedNavigationState(policy), journal = new AutomaticJournal('ship', 'captain');
    const fix = (at: number, cog = 0, source: NavigationSource = 'DROID', sog = 5, heading = 0) => {
        for (const [field,value] of [['position',{lat:36 + at / 1e9,lng:-4}],['sog',sog],['cog',cog],['headingTrue',heading]] as const)
            nav.update({field,value,source,sourceId:source,receivedAt:at,observedAt:at,observedAtFromSource:true});
        return nav.snapshot(at);
    };
    return { nav, journal, fix };
}

test('Droid sin track ni travesía: asiento a los 5 minutos con hora, posición, SOG, COG, distancia y procedencia', () => {
    const {journal,fix}=fixture();
    assert.equal(journal.tick(fix(0),0).length,0);
    assert.equal(journal.tick(fix(299000),299000).length,0);
    const entries=journal.tick(fix(300000),300000);
    assert.equal(entries.length,1); const e=entries[0];
    assert.match(e.titulo!,/periódica/); assert.equal(e.velocidad_gps,5); assert.equal(e.rumbo,0);
    assert.equal(e.created_at,new Date(300000).toISOString()); assert.match(e.descripcion,/DROID:DROID/);
    assert.equal(typeof e.distancia_total,'number');
    assert.equal(journal.tick(fix(301000),301000).length,0);
});

test('COG >=30° sostenido 30s, diferencia circular y HDG independiente', () => {
    const {journal,fix}=fixture(); let entries: LogEntry[]=[];
    journal.tick(fix(0,350),0);
    for(let t=1000;t<=30000;t+=1000) entries.push(...journal.tick(fix(t,20),t));
    assert.equal(entries.length,0);
    entries.push(...journal.tick(fix(31000,20),31000));
    assert.equal(entries.length,1); assert.match(entries[0].titulo!,/COG/);
    assert.match(entries[0].descripcion,/Δ 30.0°/);
    for(let t=32000;t<=70000;t+=1000) entries.push(...journal.tick(fix(t,20),t));
    assert.equal(entries.length,1);
});

test('ruido alternante, picos, COG parado y snapshots repetidos no sostienen un giro', () => {
    for (const mode of ['alternate','spike','stopped','frozen'] as const) {
        const {journal,fix,nav}=fixture(); journal.tick(fix(0),0);
        const entries: LogEntry[]=[];
        for(let t=1000;t<=40000;t+=1000) {
            const state=mode==='frozen' ? nav.snapshot(t) : fix(t, mode==='alternate' ? (t%2000 ? 40 : 320) : mode==='spike' ? (t===1000 ? 40 : 0) : 40,'DROID',mode==='stopped'?0:5);
            entries.push(...journal.tick(state,t));
        }
        assert.equal(entries.filter(e=>e.titulo?.includes('Cambio de rumbo')).length,0,mode);
    }
});

test('HDG verdadero se registra sin fingir un cambio de COG', () => {
    const {journal,fix}=fixture(); journal.tick(fix(0),0); let entries:LogEntry[]=[];
    for(let t=1000;t<=31000;t+=1000) entries.push(...journal.tick(fix(t,0,'DROID',0,40),t));
    assert.equal(entries.length,1); assert.match(entries[0].titulo!,/HDG verdadero/); assert.equal(entries[0].rumbo,0);
});

test('GPS caducado: una pérdida sin coordenadas; recuperación y prioridad BOAT>DROID>SIMULATOR', () => {
    const {journal,fix,nav}=fixture(); journal.tick(fix(0,0,'SIMULATOR'),0);
    let entries=journal.tick(fix(1000),1000); assert.match(entries[0].descripcion,/SIMULATOR:SIMULATOR → DROID:DROID/);
    entries=journal.tick(fix(2000,0,'BOAT'),2000); assert.match(entries[0].descripcion,/DROID:DROID → BOAT:BOAT/);
    entries=journal.tick(nav.snapshot(8000),8000);
    const lost=entries.find(e=>e.titulo==='Pérdida de GPS'); assert.ok(lost); assert.equal(lost.latitud,undefined);
    assert.equal(journal.tick(nav.snapshot(300000),300000).length,0);
    entries=journal.tick(fix(301000),301000); assert.ok(entries.some(e=>e.titulo==='GPS recuperado'));
});

test('cambio de emisor y hueco de muestras reinician la confirmación de rumbo', () => {
    const {journal,fix}=fixture(); journal.tick(fix(0),0);
    for(let t=1000;t<=20000;t+=1000) journal.tick(fix(t,40),t);
    const events=journal.tick(fix(21000,40,'BOAT'),21000);
    for(let t=22000;t<=45000;t+=1000) events.push(...journal.tick(fix(t,80,'BOAT'),t));
    assert.equal(events.filter(e=>e.titulo?.includes('Cambio de rumbo')).length,0);
    assert.equal(journal.tick(fix(60000,100,'BOAT'),60000).filter(e=>e.titulo?.includes('Cambio de rumbo')).length,0);
});

test('simulador identificado; nunca suma distancia real ni completa SOG/COG ausentes', () => {
    const {journal,fix,nav}=fixture(); journal.tick(fix(0,0,'SIMULATOR'),0);
    const e=journal.tick(fix(300000,0,'SIMULATOR'),300000)[0];
    assert.match(e.titulo!,/SIMULACIÓN/); assert.equal(e.distancia_total,0);
    const empty=journal.entry(nav.snapshot(400000),400000,'Alarma','Sin GPS','Seguridad');
    assert.equal(empty.latitud,undefined); assert.equal(empty.velocidad_gps,undefined); assert.equal(empty.rumbo,undefined);
});

test('diario independiente: commit, reinicio, reintento idempotente, fallo de disco y sincronización concurrente no pierden histórico', async () => {
    const oldWindow=Object.getOwnPropertyDescriptor(globalThis,'window'), oldDb=Object.getOwnPropertyDescriptor(globalThis,'indexedDB');
    const rows=new Map<string,unknown>(); let abort=false;
    const db={transaction:()=>{
        const tx={error:new Error('disk full'),oncomplete:null as (()=>void)|null,onabort:null as (()=>void)|null,
            objectStore:()=>({
                put:(row:{id:string})=>{const copy=structuredClone(row);queueMicrotask(()=>{if(abort){abort=false;tx.onabort?.();}else{rows.set(row.id,copy);tx.oncomplete?.();}});},
                get:(id:string)=>{const r={result:structuredClone(rows.get(id)),onsuccess:null as (()=>void)|null};queueMicrotask(()=>r.onsuccess?.());return r;},
                getAll:()=>{const r={result:structuredClone([...rows.values()]),onsuccess:null as (()=>void)|null};queueMicrotask(()=>r.onsuccess?.());return r;}
            })};return tx;
    }};
    const indexedDB={open:()=>{const r={result:db,onsuccess:null as (()=>void)|null};queueMicrotask(()=>r.onsuccess?.());return r;}};
    Object.defineProperty(globalThis,'window',{configurable:true,value:{indexedDB}});
    Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:indexedDB});
    try {
        const {journal,fix}=fixture(), logger=new TripLogger();
        const voyage=await logger.startSession('ship'); await logger.endSession();
        const first=journal.entry(fix(1000),1000,'Situación','Evento');
        await Promise.all([logger.appendAutomaticEntry(first),logger.appendAutomaticEntry(first)]);
        assert.equal((await logger.getSessionsForShip('ship',true)).find(s=>s.id.startsWith('automatic:'))?.journal?.length,1);
        assert.equal((await logger.restoreSession('ship'))?.id,voyage.id);
        const restarted=new TripLogger(); let sends=0;
        await assert.rejects(restarted.syncJournal('ship',async()=>{throw new Error('offline');}),/offline/);
        const second=journal.entry(fix(2000),2000,'Alarma','Segundo');
        await restarted.syncJournal('ship',async()=>{sends++;await restarted.appendAutomaticEntry(second);});
        let daily=(await restarted.getSessionsForShip('ship',true)).find(s=>s.id.startsWith('automatic:'))!;
        assert.equal(daily.journal?.length,2); assert.equal(daily.journal?.[0].cloudSaved,true); assert.equal(daily.journal?.[1].cloudSaved,false);
        await restarted.syncJournal('ship',async()=>{sends++;}); assert.equal(sends,2);
        const third=journal.entry(fix(3000),3000,'Alarma','Tercero'); abort=true;
        await assert.rejects(restarted.appendAutomaticEntry(third),/disk full/);
        await restarted.appendAutomaticEntry(third);
        daily=(await restarted.getSessionsForShip('ship',true)).find(s=>s.id.startsWith('automatic:'))!;
        assert.equal(daily.journal?.length,3); assert.equal((await restarted.getSession(voyage.id))?.isActive,false);
    } finally {
        if(oldWindow)Object.defineProperty(globalThis,'window',oldWindow);else Reflect.deleteProperty(globalThis,'window');
        if(oldDb)Object.defineProperty(globalThis,'indexedDB',oldDb);else Reflect.deleteProperty(globalThis,'indexedDB');
    }
});
