import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQueryTopics, registerChartQuery, queryTacticalChart } from './tacticalQueries';
import { createInstrumentGeometry } from '../navigation/components/SailHUD/utils/InstrumentGeometry';
import { createInstrumentLaylinesSVG } from '../navigation/components/SailHUD/utils/createInstrumentLaylinesSVG';
test('query plan rejects arbitrary tools and invalid input', () => {
 assert.deepEqual(parseQueryTopics(['chart', 'ais', 'ais']), ['chart', 'ais']);
 for (const value of [null, {}, ['activate_mob'], ['chart', 1]]) assert.throws(() => parseQueryTopics(value));
});
test('chart query unavailable after unmount and query errors propagate', async () => {
 const unregister = registerChartQuery(async () => { throw new Error('missing coverage'); });
 await assert.rejects(queryTacticalChart(), /missing coverage/);
 unregister();
 await assert.rejects(queryTacticalChart(), /Carta no visible/);
});
test('bearing references start at center and end on rose for all rotations and sizes', () => {
 for (const size of [160, 320, 640]) for (const heading of [0, 37, 180, 359]) for (const wind of [0, 90, 270, 359]) {
  const g = createInstrumentGeometry(size);
  const svg = createInstrumentLaylinesSVG(g, heading, wind, 45);
  const lines = [...svg.matchAll(/<line\s+x1="([^"]+)"\s+y1="([^"]+)"\s+x2="([^"]+)"\s+y2="([^"]+)"/g)];
  assert.equal(lines.length, 2);
  for (const line of lines) {
   assert.equal(Number(line[1]), g.center); assert.equal(Number(line[2]), g.center);
   assert.ok(Math.abs(Math.hypot(Number(line[3])-g.center, Number(line[4])-g.center)-g.compassOuterRadius) < 1e-9);
  }
 }
 assert.equal(createInstrumentLaylinesSVG(createInstrumentGeometry(320), NaN, 20, 45), '');
});
