import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { parseBathymetry } from './bathymetry-contract.ts';

const fixture = (): unknown => JSON.parse(readFileSync(new URL('./motril-isobaths.json', import.meta.url), 'utf8')) as unknown;
test('real F4 crop retains levels, negative elevations and experimental flags', () => {
  const chart = parseBathymetry(fixture());
  assert.equal(chart.features.length, 11);
  assert.deepEqual([...new Set(chart.features.map(f => f.properties.depth_m))].sort((a, b) => a - b), [20, 50, 100, 200, 500]);
  assert.equal(chart.smartcharts.navigationUse, false);
  assert.equal(chart.smartcharts.verticalDatum, 'LAT');
});
test('reject unknown datum, unsafe flags, sign inversion, NoData and off-crop geometry', () => {
  const input = parseBathymetry(fixture());
  for (const patch of [{ verticalDatum: 'MSL' }, { navigationUse: true }, { unit: 'ft' }, { source: 'unknown' }]) {
    assert.throws(() => parseBathymetry({ ...input, smartcharts: { ...input.smartcharts, ...patch } }));
  }
  const first = input.features[0];
  assert.ok(first);
  for (const properties of [{ ...first.properties, elevation_m: first.properties.depth_m }, { ...first.properties, depth_m: 99, elevation_m: -99 }]) {
    assert.throws(() => parseBathymetry({ ...input, features: [{ ...first, properties }] }));
  }
  assert.throws(() => parseBathymetry({ ...input, features: [{ ...first, geometry: { type: 'LineString', coordinates: [[-3.5, 36.7], [-3.5, 36.9]] } }] }));
});
