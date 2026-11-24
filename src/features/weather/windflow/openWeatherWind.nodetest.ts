import {test} from 'node:test';import assert from 'node:assert/strict';
import {openWeatherWindRequest,parseOpenWeatherPoint,assembleOpenWeatherWind,createOpenWeatherWindProvider,OPENWEATHER_WIND_CALL_LIMIT} from './openWeatherWind';
import {sampleWind,type WindFrame} from './windField';
import type {WindRequest} from './openMeteoWind';
const now=Date.UTC(2026,10,2,12),request:WindRequest={latitudes:[36,36.25],longitudes:[-5,-4.75],key:'fixture'};
const raw=(direction=270,speed:number|null=10)=>({list:[{dt:now/1000,wind:{speed,deg:direction}},{dt:now/1000+10800,wind:{speed,deg:direction}}]});
const fakeKey='fixture-key-not-a-credential';
test('sampling is bounded to 9 query points, aligned and covering the viewport',()=>{
 for(const bounds of [{south:36.1,north:36.5,west:-4.8,east:-4.1},{south:70,north:80,west:170,east:180},{south:-10,north:6,west:-179,east:-163}]){
  const r=openWeatherWindRequest(bounds);assert.ok(r.latitudes.length*r.longitudes.length<=9);assert.ok(r.latitudes[0]<=bounds.south);assert.ok(r.latitudes.at(-1)!>=bounds.north);assert.ok(r.longitudes[0]<=bounds.west);assert.ok(r.longitudes.at(-1)!>=bounds.east);
 }
 assert.throws(()=>openWeatherWindRequest({south:30,north:50,west:0,east:1}));assert.throws(()=>openWeatherWindRequest({south:1,north:2,west:179,east:-179}));
});
test('actual common 3-hour times and FROM directions become the existing U/V contract',()=>{
 const points=Array.from({length:4},()=>parseOpenWeatherPoint(raw(),now));const field=assembleOpenWeatherWind(points,request,now);
 assert.deepEqual(field.frames.map(f=>f.time),[now,now+10800000]);assert.equal(field.source,'OpenWeather');
 const vector=sampleWind(field,field.frames[0],36.1,-4.9)!;assert.ok(Math.abs(vector.u-10)<1e-5);assert.ok(Math.abs(vector.v)<1e-5);
});
test('missing wind is a hole, calm is valid, and bearings across north interpolate as vectors',()=>{
 const points=[359,1,359,1].map(d=>parseOpenWeatherPoint(raw(d),now));const field=assembleOpenWeatherWind(points,request,now);const v=sampleWind(field,field.frames[0],36.125,-4.875)!;assert.ok(Math.abs(v.u)<1e-5);assert.ok(v.v<0);
 assert.throws(()=>assembleOpenWeatherWind(points.map(()=>parseOpenWeatherPoint(raw(10,null),now)),request,now));
 const calm=parseOpenWeatherPoint({list:[{dt:now/1000,wind:{speed:0}}]},now);assert.deepEqual(calm.samples.get(now),{u:0,v:0});
 assert.throws(()=>parseOpenWeatherPoint({list:[{dt:now/1000},{dt:now/1000}]},now));
});
test('provider validates access, shares point cache, and never transmits without a configured key',async()=>{
 let calls=0;const provider=createOpenWeatherWindProvider({getApiKey:()=>fakeKey,now:()=>now,fetcher:async()=>{calls++;return new Response(JSON.stringify(raw()),{status:200});}});
 const controller=new AbortController();await provider.load(request,controller.signal);assert.equal(calls,4);await provider.load({...request,key:'same-points'},controller.signal);assert.equal(calls,4);
 const empty=createOpenWeatherWindProvider({getApiKey:()=>'',fetcher:async()=>{throw new Error('must not send');}});await assert.rejects(empty.load(request,controller.signal),/falta la clave/);
});
test('401/403/429 stop at the first point and enforce cooldown without exposing keys',async()=>{
 for(const status of [401,403,429]){let calls=0;const p=createOpenWeatherWindProvider({getApiKey:()=>fakeKey,now:()=>now,fetcher:async()=>{calls++;return new Response('{}',{status});}});
 const signal=new AbortController().signal;await assert.rejects(p.load(request,signal),error=>error instanceof Error && error.message.includes(String(status)) && !error.message.includes(fakeKey));await assert.rejects(p.load(request,signal),/pausa/);assert.equal(calls,1);}
});
test('cancellation avoids requests and the local budget caps rapid map movement',async()=>{
 let calls=0;const p=createOpenWeatherWindProvider({getApiKey:()=>fakeKey,now:()=>now,fetcher:async()=>{calls++;return new Response(JSON.stringify(raw()));}});
 const controller=new AbortController();controller.abort();await assert.rejects(p.load(request,controller.signal));assert.equal(calls,0);
 for(let i=0;i<6;i++)await p.load({latitudes:[i,i+.25],longitudes:[1,1.25],key:String(i)},new AbortController().signal);
 assert.equal(calls,OPENWEATHER_WIND_CALL_LIMIT);await assert.rejects(p.load({latitudes:[10,10.25],longitudes:[1,1.25],key:'over'},new AbortController().signal),/límite local/);assert.equal(calls,OPENWEATHER_WIND_CALL_LIMIT);
});
test('network failure messages never include request URLs, provider errors or credentials',async()=>{
 const p=createOpenWeatherWindProvider({getApiKey:()=>fakeKey,fetcher:async()=>{throw new Error('https://example.invalid/?appid='+fakeKey);}});
 await assert.rejects(p.load(request,new AbortController().signal),error=>error instanceof Error && !error.message.includes(fakeKey) && !error.message.includes('http') && error.message.includes('sin conexión'));
});
