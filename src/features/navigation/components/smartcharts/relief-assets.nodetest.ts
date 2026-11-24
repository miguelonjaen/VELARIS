import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {decodeReliefAsset,reliefPackKey} from './relief-assets';
const read=(name:string):unknown=>JSON.parse(readFileSync(new URL(name,import.meta.url),'utf8'));
test('ownership determinista entre zooms: sin cambiar de bloque ni confundir XYZ/TMS',()=>{
  assert.equal(reliefPackKey(61,49,7),'7-61-49');
  assert.equal(reliefPackKey(244,196,9),'7-61-49');
  assert.equal(reliefPackKey(245,197,9),'7-61-49');
  assert.equal(reliefPackKey(30,24,6),'overview');
});
test('decoder acotado verifica firma, datum, seguridad y longitud',async()=>{
  const bytes=Buffer.alloc(18);for(let i=0;i<9;i++)bytes.writeInt16LE(-100,i*2);
  const hash=createHash('sha256').update(bytes).digest('hex');
  const asset={width:3,height:3,west:0,north:3,stepX:1,stepY:1,encoding:'gzip-int16-le',data:gzipSync(bytes).toString('base64'),sha256:hash,navigationUse:false,verticalDatum:'LAT'};
  assert.equal((await decodeReliefAsset(asset,hash)).values[4],-100);
  await assert.rejects(()=>decodeReliefAsset({...asset,navigationUse:true},hash));
  await assert.rejects(()=>decodeReliefAsset({...asset,verticalDatum:'MSL'},hash));
  await assert.rejects(()=>decodeReliefAsset({...asset,width:2},hash));
  await assert.rejects(()=>decodeReliefAsset({...asset,sha256:'0'.repeat(64)},'0'.repeat(64)));
});
test('todos los bloques reales se decodifican y coinciden con su manifiesto; cobertura occidental y oriental',()=>{
  const catalog=read('./relief/tiles/relief-catalog.json') as {overview:{resource:string;rawSha256:string};packs:{resource:string;rawSha256:string;sha256:string;key:string}[]};
  assert.ok(catalog.packs.length>50);
  for(const entry of catalog.packs){
    const file=readFileSync(new URL('./relief/tiles/'+entry.resource,import.meta.url));
    assert.equal(createHash('sha256').update(file).digest('hex'),entry.sha256);
    assert.ok(file.length<2_000_000);
    const asset=JSON.parse(file.toString('utf8'));
    const raw=gunzipSync(Buffer.from(asset.data,'base64'));
    assert.equal(raw.length,1026*1026*2);
    assert.equal(createHash('sha256').update(raw).digest('hex'),entry.rawSha256);
    assert.equal(asset.verticalDatum,'LAT');assert.equal(asset.navigationUse,false);
  }
  for(const [lon,lat] of [[-3.5,36.7],[4,40],[8.8,43.6],[15,43],[25,37],[33,34],[35,33],[18,33],[29,31.5],[28,40.7]]){
    const x=Math.floor((lon+180)/360*128), y=Math.floor((1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*128);
    assert.ok(catalog.packs.some(p=>p.key===`7-${x}-${y}`),`Missing ${lon},${lat}`);
  }
});
