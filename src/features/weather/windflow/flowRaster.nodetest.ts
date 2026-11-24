import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rasterizeFlow } from './flowRaster';

test('raster preserves color, transparency, grid coordinates and valid coverage', async () => {
  const calls: number[][] = [];
  const raster = await rasterizeFlow(3, 2, (x, y) => {
    calls.push([x, y]);
    return x === 1 ? null : [x * 20, y * 30, 120];
  }, () => true);
  assert.ok(raster);
  assert.equal(raster.valid, 4);
  assert.deepEqual(calls, [[0,0],[1,0],[2,0],[0,1],[1,1],[2,1]]);
  assert.deepEqual([...raster.pixels], [0,0,120,255,0,0,0,0,40,0,120,255,0,30,120,255,0,0,0,0,40,30,120,255]);
});

test('large viewports yield repeatedly without losing raster cells', async () => {
  let clock = 0, yields = 0, samples = 0;
  const raster = await rasterizeFlow(128, 128, () => { samples++; return [2,4,8]; }, () => true,
    async () => { yields++; }, () => clock += 5);
  assert.ok(raster);
  assert.ok(yields > 1);
  assert.equal(samples, 128 * 128);
  assert.equal(raster.valid, samples);
  assert.deepEqual([...raster.pixels.slice(-4)], [2,4,8,255]);
});

test('a new zoom or unmount cancels obsolete work before it can publish', async () => {
  let current = true, samples = 0, clock = 0;
  const raster = await rasterizeFlow(128, 128, () => { samples++; return [1,2,3]; }, () => current,
    async () => { current = false; }, () => clock += 5);
  assert.equal(raster, null);
  assert.equal(samples, 0);
});

test('cancelled initial view never samples; zero coverage stays transparent', async () => {
  const cancelled = await rasterizeFlow(8, 8, () => { throw new Error('obsolete sample'); }, () => false);
  assert.equal(cancelled, null);
  const empty = await rasterizeFlow(8, 8, () => null, () => true);
  assert.ok(empty);
  assert.equal(empty.valid, 0);
  assert.ok(empty.pixels.every(value => value === 0));
});
