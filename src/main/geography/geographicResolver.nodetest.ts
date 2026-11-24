import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {GeographicResolver,NominatimProvider,parseNominatim,type GeographicProvider} from './geographicResolver';
import type {GeographicReference} from '../../shared/geographicReference';
// Synthetic provider payloads test contract behaviour; real-network evidence is separate.
const row = (name: string,type = 'city',id = 1) => ({osm_type:'node',osm_id:id,lat:'36.7',lon:'-3.5',name,display_name:`${name}, España`,class:'place',type});
const references = (name: string,type?: string) => parseNominatim([row(name,type)]);
async function resolver(search: GeographicProvider['search']) {
  const dir = await mkdtemp(join(tmpdir(),'gaulos-geography-'));
  const file = join(dir,'cache.json');
  return {service:new GeographicResolver({search},file),file};
}
for (const [name,type,kind] of [['Málaga','city','LOCALITY'],['Cartagena','harbour','PORT'],['Ibiza','island','ISLAND'],['Alborán','islet','ISLAND'],['Melilla','city','LOCALITY'],['Cabo de Gata','cape','CAPE']] as const) {
  test(`open-world ${name}: classifies ${kind}, preserves OSM identity, never a nautical entrance`,async()=>{
    const {service} = await resolver(async()=>references(name,type));
    const result = await service.resolve(name);
    assert.equal(result.status,'RESOLVED');
    assert.equal(result.candidates[0].kind,kind);
    assert.equal(result.candidates[0].datum,'WGS84');
    assert.equal(result.candidates[0].navigationUse,false);
    assert.match(result.candidates[0].source,/openstreetmap.org\/node\/1/);
  });
}
test('qualified port name matches its provider alias without mistaking the locality',async()=>{
  const {service}=await resolver(async()=>parseNominatim([{...row('Puerto de Málaga','industrial'),category:'landuse',extratags:{industrial:'port'}}]));
  assert.equal((await service.resolve('Puerto de Málaga, España','PORT')).status,'RESOLVED');
});
test('Cartagena ambiguous between countries never takes the first result',async()=>{
  const a=references('Cartagena')[0], b={...a,providerId:'osm:node/2',source:'https://www.openstreetmap.org/node/2',name:'Cartagena, Colombia'};
  const {service}=await resolver(async()=>[a,b]);
  const result=await service.resolve('Cartagena');
  assert.equal(result.status,'AMBIGUOUS');assert.equal(result.candidates.length,2);
});
test('island vs locality and port vs locality remain distinct',async()=>{
  const {service}=await resolver(async()=>[...references('Ibiza','island'),...parseNominatim([row('Ibiza','city',2)])]);
  assert.equal((await service.resolve('Ibiza','ISLAND')).status,'RESOLVED');
  assert.equal((await service.resolve('Ibiza','PORT')).status,'AMBIGUOUS');
  assert.equal((await service.resolve('Ibiza','PORT_ENTRANCE')).status,'AMBIGUOUS');
});
test('diacritics and spacing hit durable cache; reload works offline without provider calls',async()=>{
  let calls=0;const {service,file}=await resolver(async()=>{calls++;return references('Málaga');});
  await service.resolve('Málaga');await service.resolve(' malaga ');
  assert.equal(calls,1);assert.ok((await readFile(file,'utf8')).includes('WGS84'));
  const offline=new GeographicResolver({search:async()=>{throw new Error('must not fetch');}},file);
  assert.equal((await offline.resolve('Málaga','PLACE',true)).status,'RESOLVED');
  assert.equal((await offline.resolve('unknown','PLACE',true)).status,'NOT_FOUND');
});
test('concurrent identical lookup is coalesced',async()=>{
  let calls=0;const {service}=await resolver(async()=>{calls++;return references('Melilla');});
  await Promise.all([service.resolve('Melilla'),service.resolve('Melilla')]);assert.equal(calls,1);
});
test('ancient cache retains original dates on network failure',async()=>{
  const {service,file}=await resolver(async()=>references('Melilla'));await service.resolve('Melilla');
  const old=new GeographicResolver({search:async()=>{throw new Error('offline');}},file,()=>Date.now()+31*86400000);
  const result=await old.resolve('Melilla');assert.equal(result.cache,'STALE');assert.equal(result.status,'RESOLVED');
  assert.equal(result.candidates[0].verifiedOn,(await service.resolve('Melilla')).candidates[0].verifiedOn);
});
test('misspelling never silently becomes a different toponym',async()=>{
  const {service}=await resolver(async()=>references('Málaga'));
  const result=await service.resolve('Malga');assert.equal(result.status,'AMBIGUOUS');assert.match(result.message,/grafía/);
});
test('unavailable provider, empty search and corrupt cache never supply invented coordinates',async()=>{
  const {service,file}=await resolver(async()=>{throw new Error('timeout');});
  assert.equal((await service.resolve('unknown')).status,'UNAVAILABLE');
  await writeFile(file,'{bad cache','utf8');
  const empty=new GeographicResolver({search:async()=>[]},file);
  assert.equal((await empty.resolve('unknown')).status,'NOT_FOUND');
});
test('malformed provider coordinates, IDs and entrance claims are rejected',()=>{
  assert.equal(parseNominatim([{...row('X'),lat:'NaN'},{...row('X'),lon:'181'},{...row('X'),osm_id:-1},{...row('X'),lat:''}]).length,0);
  const entrance=parseNominatim([{...row('X','harbour_entrance'),extratags:{'seamark:type':'harbour_entrance'}}])[0];
  assert.notEqual(entrance.kind,'PORT_ENTRANCE');assert.equal(entrance.navigationUse,false);
});
test('provider uses documented query, identity, timeout and cooldown without retry loops',async()=>{
  let calls=0;
  const fake: typeof fetch=async(input,init)=>{
    calls++;const url=new URL(String(input));assert.equal(url.searchParams.get('q'),'Málaga');assert.equal(url.searchParams.get('format'),'jsonv2');
    assert.match(String((init?.headers as Record<string,string>)['User-Agent']),/GAULOS/);
    return new Response('',{status:429});
  };
  const provider=new NominatimProvider('https://nominatim.openstreetmap.org/search',fake);
  await assert.rejects(provider.search('Málaga'),/429/);await assert.rejects(provider.search('Málaga'),/COOLDOWN/);assert.equal(calls,1);
});

test('full candidate identity resolves the pending ambiguity without first-result selection',async()=>{
  const a=references('Melilla')[0];
  const b={...a,name:'Melilla, 52001, España',providerId:'osm:node/2',source:'https://www.openstreetmap.org/node/2'};
  const {service}=await resolver(async()=>[b,a]);
  const result=await service.resolve('Melilla, España');
  assert.equal(result.status,'RESOLVED');assert.equal(result.candidates[0].providerId,a.providerId);
});
test('country qualifier cannot be discarded just because the alias matches',async()=>{
  const {service}=await resolver(async()=>references('Cartagena'));
  assert.equal((await service.resolve('Cartagena, Colombia')).status,'AMBIGUOUS');
});
test('qualified region selects the matching candidate, preserving its object type',async()=>{
  const a=references('Cartagena')[0];
  const b={...a,name:'Cartagena, Colombia',providerId:'osm:node/2',source:'https://www.openstreetmap.org/node/2'};
  const {service}=await resolver(async()=>[b,a]);
  const result=await service.resolve('Cartagena, España');
  assert.equal(result.status,'RESOLVED');assert.equal(result.candidates[0].kind,'LOCALITY');
  assert.equal((await service.resolve('Cartagena, España','PORT')).status,'AMBIGUOUS');
});

test('full displayed identity is reusable offline without another provider search',async()=>{
 const source=references('Melilla')[0];let calls=0;
 const {service}=await resolver(async()=>{calls++;return [source];});
 await service.resolve('Melilla');
 const selected=await service.resolve(source.name,'PLACE',true);
 assert.equal(selected.status,'RESOLVED');assert.equal(calls,1);
 assert.deepEqual(selected.candidates[0],source);
});
test('two cached objects with identical full names remain ambiguous',async()=>{
 const source=references('Melilla')[0];
 const {service}=await resolver(async()=>[source,{...source,providerId:'osm:node/999',source:'https://www.openstreetmap.org/node/999'}]);
 await service.resolve('Melilla');
 const selected=await service.resolve(source.name,'PLACE',true);
 assert.equal(selected.status,'AMBIGUOUS');assert.equal(selected.candidates.length,2);
});
