import {test} from 'node:test';import assert from 'node:assert/strict';
import {NMEAParser} from '../../core/services/NMEAParser';import {BoatInstrumentStore} from '../../core/instruments/BoatInstrumentStore';
import {SharedNavigationState,NAVIGATION_FIELDS,type NavigationFreshnessPolicy} from '../../core/navigation/SharedNavigationState';
import {boatReadingsFromTelemetry} from '../../core/navigation/SharedNavigationFeeds';
import {resolveWind} from '../../core/instruments/resolveWind';import {loadNmeaGatewayConfig,saveNmeaGatewayConfig,NMEA_GATEWAY_STORAGE_KEY} from './nmeaGatewayConfig';
const checksum=(body:string)=>{let n=0;for(const c of body)n^=c.charCodeAt(0);return '$'+body+'*'+n.toString(16).padStart(2,'0');};
test('VHW water speed stays separate from SOG, supports km/h, rejects missing data and expires',()=>{
 const parser=new NMEAParser(),store=new BoatInstrumentStore(()=>1000);
 const message=parser.parse(checksum('VWVHW,126.6,T,122.0,M,6.5,N,12.1,K'));assert.deepEqual(message,{type:'WATER_SPEED',knots:6.5});store.ingest(message,1000);assert.equal(store.snapshot(1000).speedThroughWater?.value,6.5);assert.equal(store.snapshot(9001).speedThroughWater,null);
 const km=parser.parse(checksum('VWVHW,,,,,,,18.52,K'));assert.equal(km.type,'WATER_SPEED');if(km.type==='WATER_SPEED')assert.ok(Math.abs(km.knots-10)<1e-8);
 assert.equal(parser.parse(checksum('VWVHW,,,,,,,,')).type,'NMEA_INVALID');store.clear();assert.equal(store.snapshot().speedThroughWater,null);
});
test('legacy visual connection migrates to instruments; a new explicit visual choice is preserved',()=>{
 const entries=new Map<string,string>();const storage={getItem:(key:string)=>entries.get(key)??null,setItem:(key:string,value:string)=>{entries.set(key,value);}};
 storage.setItem(NMEA_GATEWAY_STORAGE_KEY,JSON.stringify({host:'127.0.0.1',port:'10110',tcpSource:'SIMULATOR'}));assert.equal(loadNmeaGatewayConfig(storage).tcpSource,'BOAT');
 saveNmeaGatewayConfig(storage,{...loadNmeaGatewayConfig(storage),tcpSource:'SIMULATOR'});assert.equal(loadNmeaGatewayConfig(storage).tcpSource,'SIMULATOR');
});
test('captured Simulator X sentences populate full instrument store without substituting forecasts',()=>{
 const now=10000,policy=Object.fromEntries(NAVIGATION_FIELDS.map(f=>[f,{BOAT:{maxAgeMs:10000,ageFrom:'receivedAt'},DROID:{maxAgeMs:10000,ageFrom:'receivedAt'}}])) as unknown as NavigationFreshnessPolicy;
 const nav=new SharedNavigationState(policy,()=>now),store=new BoatInstrumentStore(()=>now),parser=new NMEAParser();
 for(const body of ['GPRMC,085130.01,A,3607.5675,N,00305.2789,W,6.5,126.6,021126,4.6,E,A','HEHDT,126.6,T','WIMWV,97.6,R,7.3,N,A','WIMWD,262.5,T,257.9,M,10.5,N,5.4,M','SDDPT,13.4,0.5,','ERRPM,E,1,2600.0,,A','ERXDR,C,83.0,C,ENGINE#0,T,2600.0,R,ENGINE#0']){const m=parser.parse(checksum(body));nav.ingest(boatReadingsFromTelemetry(m,now));store.ingest(m,now);}
 const state=nav.snapshot(),snapshot=store.snapshot();assert.equal(state.position.source,'BOAT');assert.ok(Math.abs(state.position.value!.lat-36.126125)<1e-6);assert.equal(state.sog.value,6.5);assert.equal(snapshot.engines[0].rpm?.value,2600);assert.equal(snapshot.engines[0].temperatureC?.value,83);
 const wind=resolveWind(snapshot,state,{tws:30,twd:20,timestamp:now},now);assert.equal(wind.source,'BOAT');assert.equal(wind.tws,10.5);assert.equal(wind.twd,262.5);assert.equal(wind.aws,7.3);assert.equal(wind.awa,97.6);assert.equal(snapshot.depth?.value.meters,13.9);
});
