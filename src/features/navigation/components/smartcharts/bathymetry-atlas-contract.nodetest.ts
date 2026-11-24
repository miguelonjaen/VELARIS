import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { loadBathymetrySector, parseBathymetryAtlas, parseRegionalBathymetry } from './bathymetry-atlas-contract.ts';

const read = (filename: string): unknown => JSON.parse(readFileSync(new URL(`./bathymetry/${filename}`, import.meta.url), 'utf8')) as unknown;
const catalog = (): unknown => read('catalog.json');
test('full basin catalogue retains western sectors and adds Adriatic, Aegean, Levant and North Africa', () => {
  const atlas = parseBathymetryAtlas(catalog());
  assert.ok(atlas.sectors.length >= 53);
  const ids = new Set(atlas.sectors.map(s => s.id));
  for (const id of ['mediterranean-east', 'costa-brava', 'tunisia-djerba', 'adriatic-north', 'aegean-south', 'cyprus', 'levant', 'egypt', 'libya-east']) assert.ok([...ids].some(value => value === id || value.startsWith(`${id}-`)));
  assert.deepEqual(atlas.sectors[0]?.bbox, [-7.43, 30, 36.5, 46]);
  for (const [x, y] of [[7.25, 41], [14, 41.2], [29.9, 40.75], [36.15, 36.85]]) {
    assert.ok(atlas.sectors.some(s => !s.simplified && x! >= s.bbox[0] && x! <= s.bbox[2] && y! >= s.bbox[1] && y! <= s.bbox[3]));
  }
});
test('every real sector assembles bounded valid contour parts', async () => {
  let vertices = 0;
  for (const sector of parseBathymetryAtlas(catalog()).sectors) {
    const data = await loadBathymetrySector(sector, async filename => read(filename));
    assert.equal(data.smartcharts.id, sector.id);
    assert.equal(data.smartcharts.navigationUse, false);
    assert.ok(sector.resources.every(name => readFileSync(new URL(`./bathymetry/${name}`, import.meta.url)).length < 1_500_000));
    vertices += data.features.reduce((sum, f) => sum + f.geometry.coordinates.length, 0);
  }
  assert.ok(vertices > 10000);
});
test('reject path traversal, swapped sector, wrong datum, unsafe flags and positive elevation', () => {
  const atlas = parseBathymetryAtlas(catalog());
  const first = atlas.sectors[0]; assert.ok(first);
  assert.throws(() => parseBathymetryAtlas({ ...(catalog() as object), sectors: [{ ...first, resources: ['../secrets.json'] }, ...atlas.sectors.slice(1)] }));
  const part = parseRegionalBathymetry(read(first.resources[0]!), first);
  for (const patch of [{ verticalDatum: 'MSL' }, { navigationUse: true }, { sourceTiles: ['C4'] }, { release: '2022' }, { cellSizeDegrees: 0.01 }]) {
    assert.throws(() => parseRegionalBathymetry({ ...part, smartcharts: { ...part.smartcharts, ...patch } }, first));
  }
  assert.throws(() => parseRegionalBathymetry(part, { ...first, id: 'cyprus' }));
  const feature = part.features[0]; assert.ok(feature);
  assert.throws(() => parseRegionalBathymetry({ ...part, features: [{ ...feature, properties: { ...feature.properties, elevation_m: feature.properties.depth_m } }] }, first));
});
