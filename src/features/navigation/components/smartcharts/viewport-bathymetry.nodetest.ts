import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { selectViewportBathymetry } from './viewport-bathymetry';
import { parseBathymetryAtlas,loadBathymetrySector,type BathymetrySector } from './bathymetry-atlas-contract';
const read=(name:string):unknown=>JSON.parse(readFileSync(new URL(name,import.meta.url),'utf8'));
const sectors=parseBathymetryAtlas(read('./bathymetry/catalog.json')).sectors;
test('zoom de cuenca usa resumen; Motril ampliado abandona resumen y carga detalle',()=>{
  assert.equal(selectViewportBathymetry(sectors,[-7,30,36,46],5)[0].id,'overview');
  const detail=selectViewportBathymetry(sectors,[-3.6,36.6,-3.3,36.8],12);
  assert.ok(detail.length>0);assert.ok(detail.every(s=>!s.simplified));
  assert.ok(detail.some(s=>s.bbox[0]<=-3.5 && s.bbox[2]>=-3.5));
});
test('detalle automático también cubre Chipre y no depende de seleccionar el sector a mano',()=>{
  const detail=selectViewportBathymetry(sectors,[32.5,34.5,33,35],10);
  assert.ok(detail.length>0);assert.ok(detail.every(s=>!s.simplified));
});
test('niveles intermedios reales completos; el contrato normal los rechaza',async()=>{
  const catalog=read('./relief/fine-catalog.json') as BathymetrySector & { levelsM:number[] };
  const load=(name:string):Promise<unknown>=>Promise.resolve(read('./bathymetry/'+name));
  const fine=await loadBathymetrySector(catalog,load,catalog.levelsM);
  assert.equal(fine.features.length,1204);
  assert.ok(fine.features.some(f=>f.properties.depth_m===10));
  assert.ok(fine.features.some(f=>f.properties.depth_m===1500));
  await assert.rejects(()=>loadBathymetrySector(catalog,load));
});
