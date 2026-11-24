import test from 'node:test';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { DEFAULT_RELIEF, NO_DATA, depthColor, illumination, renderReliefTile, validateGrid, type ReliefGrid } from './relief-model';

test('luz ENU: pendiente este se oscurece con luz este y aclara con luz oeste', () => {
  assert.ok(illumination(0.4, 0, { ...DEFAULT_RELIEF, azimuth: 90 }) < 1);
  assert.ok(illumination(0.4, 0, { ...DEFAULT_RELIEF, azimuth: 270 }) > 1);
  assert.ok(illumination(0, 0.4, { ...DEFAULT_RELIEF, azimuth: 0 }) < 1);
  assert.equal(illumination(0, 0, DEFAULT_RELIEF), 1);
  assert.equal(illumination(1, 1, { ...DEFAULT_RELIEF, strength: 0 }), 1);
});
test('paleta interpolada continua, extremos acotados', () => {
  assert.deepEqual(depthColor(0, 'ocean'), [210,242,238]);
  assert.deepEqual(depthColor(5000, 'ocean'), depthColor(9000, 'ocean'));
  assert.deepEqual(depthColor(25, 'ocean'), [167.5,225.5,225]);
});
test('NoData y tierra transparentes, fondo plano coloreado sin sombras artificiales', () => {
  const world = 2 * Math.PI * 6378137, step = world / 8;
  const values = new Int16Array(100).fill(-100);
  const grid: ReliefGrid = { width:10, height:10, west:-world/2-step, north:world/2+step, stepX:step, stepY:step, values };
  validateGrid(grid);
  values[11] = NO_DATA; values[12] = 10;
  const pixels = renderReliefTile(grid,DEFAULT_RELIEF,0,0,0,8);
  assert.equal(pixels[3],0); assert.equal(pixels[7],0);
  assert.equal(pixels[11],255);
  const original = renderReliefTile(grid, { ...DEFAULT_RELIEF, strength:0 },0,0,0,8);
  assert.deepEqual(pixels,original);
  assert.throws(() => validateGrid({ ...grid, width:1 }));
});
test('activo real: tamaño, orientación y render de Alborán con dos luces', () => {
  const asset = JSON.parse(readFileSync(new URL('./relief/alboran-relief.json', import.meta.url),'utf8'));
  const buffer = gunzipSync(Buffer.from(asset.data,'base64'));
  assert.equal(buffer.length,2048*1280*2);
  const values = new Int16Array(asset.width*asset.height);
  for (let i=0;i<values.length;i++) values[i]=buffer.readInt16LE(i*2);
  const grid: ReliefGrid = { ...asset, values }; validateGrid(grid);
  const first = renderReliefTile(grid,DEFAULT_RELIEF,125,100,8);
  const second = renderReliefTile(grid,{ ...DEFAULT_RELIEF, azimuth:135 },125,100,8);
  let visible=0,different=0;
  for (let i=0;i<first.length;i+=4) { if(first[i+3]) visible++; if(first[i]!==second[i]) different++; }
  assert.ok(visible>10000, `visible=${visible}`);
  assert.ok(different>1000, `different=${different}`);
});
