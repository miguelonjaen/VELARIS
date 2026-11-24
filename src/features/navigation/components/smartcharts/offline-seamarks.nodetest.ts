import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { OfflineSeamarkRepository, parseOfflineSeamarkCatalog, parseOfflineSeamarkPack, tileKey } from './offline-seamarks-model';

const read = (name: string): Buffer => readFileSync(new URL(`./seamarks-offline/${name}`, import.meta.url));
const raw = JSON.parse(read('catalog.json').toString()) as Record<string, unknown>;
const catalog = parseOfflineSeamarkCatalog(raw);
const hash = (buffer: Buffer): string => createHash('sha256').update(buffer).digest('hex');

test('all rendering inputs retain real source IDs, coordinates and tags without duplicated objects', () => {
  const inputs = JSON.parse(read('objects.json').toString()) as { id: string | number; geometrySha256: string; tagSha256: string }[];
  const originals = new Map<string | number, { geometry: unknown; properties: { tags: Record<string, string> } }>();
  if (raw.sourceFormat === 'osm-xml') {
    const bytes=read('source-primitives.json');
    assert.equal(hash(bytes),raw.sourcePrimitivesSha256);
    const source=JSON.parse(bytes.toString()) as {id:string;geometry:unknown;properties:{tags:Record<string,string>}}[];
    assert.equal(new Set(source.map(p=>p.id)).size,source.length);
    for(const p of source) originals.set(p.id,p);
    const missingType=inputs.filter(input=>!originals.get(input.id)?.properties.tags['seamark:type']);
    assert.equal(missingType.length,raw.objectsWithoutType);
  } else {
  const directory = new URL('./nautical/', import.meta.url);
  for (const name of readdirSync(directory).filter(name => /^spain-.*\.json$/.test(name))) {
    const collection = JSON.parse(readFileSync(new URL(name, directory), 'utf8')) as { features: { id: string | number; geometry: unknown; properties: { tags: Record<string, string> } }[] };
    for (const feature of collection.features) originals.set(feature.id, feature);
  }
  }
  assert.equal(inputs.length, catalog.inputObjects);
  assert.equal(new Set(inputs.map(input => input.id)).size, inputs.length);
  for (const input of inputs) {
    const original = originals.get(input.id);
    assert.ok(original, `Object ${input.id} is not in the real source`);
    assert.equal(hash(Buffer.from(JSON.stringify(original.geometry))), input.geometrySha256);
    assert.equal(hash(Buffer.from(JSON.stringify(original.properties.tags))), input.tagSha256);
  }
});

test('every packaged tile is a bounded 256px RGBA PNG with verified SHA-256 and XYZ ownership', () => {
  let count = 0;
  for (const [resource, info] of Object.entries(catalog.packs)) {
    const buffer = read(`packs/${resource}`);
    assert.equal(buffer.length, info.bytes);
    assert.equal(hash(buffer), info.sha256);
    const pack = parseOfflineSeamarkPack(JSON.parse(buffer.toString()) as unknown, resource, catalog);
    for (const png of Object.values(pack)) {
      const image = Buffer.from(png, 'base64');
      assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
      assert.equal(image.readUInt32BE(16), 256); assert.equal(image.readUInt32BE(20), 256);
      assert.equal(image[24], 8); assert.equal(image[25], 6); // RGBA8, not an opaque base map.
      count++;
    }
  }
  assert.equal(count, Object.keys(catalog.tiles).length);
  assert.equal(count, raw.tileCount);
  assert.equal(hash(read('objects.json')), raw.objectIndexSha256);
});

function alphaStatistics(png: Buffer): { blank: number; painted: number } {
  const idat: Buffer[] = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset), type = png.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') idat.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const data = inflateSync(Buffer.concat(idat));
  assert.equal(data.length, 256 * (1 + 256 * 4));
  const stride = 256 * 4, pixels = Buffer.alloc(256 * stride);
  let blank = 0, painted = 0;
  for (let y = 0; y < 256; y++) {
    const mode = data[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const index = y * stride + x, a = x >= 4 ? pixels[index - 4] : 0, b = y ? pixels[index - stride] : 0, c = y && x >= 4 ? pixels[index - stride - 4] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const prediction = mode === 0 ? 0 : mode === 1 ? a : mode === 2 ? b : mode === 3 ? Math.floor((a + b) / 2) : mode === 4 ? pa <= pb && pa <= pc ? a : pb <= pc ? b : c : NaN;
      assert.ok(Number.isFinite(prediction));
      pixels[index] = (data[y * (stride + 1) + 1 + x] + prediction) & 255;
      if (x % 4 === 3) { if (pixels[index] === 0) blank++; else painted++; }
    }
  }
  return { blank, painted };
}

test('real symbols around mainland ports and all main Balearic islands have transparent backgrounds', () => {
  const samples = [[36.72, -3.52], [41.34, 2.16], [42.26, 3.18], [39.56, 2.63], [38.90, 1.44], [38.733, 1.417], [39.89, 4.27], [35.288, -2.934], [35.9396, -3.0352]];
  for (const [lat, lon] of samples) {
    const z = 16, x = Math.floor((lon + 180) / 360 * 2 ** z), y = Math.floor((1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * 2 ** z);
    const keys: string[] = [];
    for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
      const key = tileKey(z, x + dx, y + dy)!; if (catalog.tiles[key]) keys.push(key);
    }
    assert.ok(keys.length, `No packaged signals near ${lat},${lon}`);
    const key = keys[0], resource = catalog.tiles[key];
    const pack = JSON.parse(read(`packs/${resource}`).toString()) as Record<string, string>;
    const alpha = alphaStatistics(Buffer.from(pack[key], 'base64'));
    assert.ok(alpha.blank > 256 * 256 * 0.25, `Background covers relief near ${lat},${lon}`);
    assert.ok(alpha.painted > 0);
  }
});

test('catalog rejects unsafe paths, wrong tile scheme and claims of official navigation data', () => {
  for (const change of [{ scheme: 'tms' }, { transparent: false }, { officialEnc: true }, { navigationUse: true }, { bounds: [4, 40, -5, 35] }, { tiles: { '16/1/1': '../other.json' } }, { tiles: { '16/65536/1': 'seamarks-pack-0.json' } }]) {
    assert.throws(() => parseOfflineSeamarkCatalog({ ...raw, ...change }));
  }
});

test('missing tiles stay transparent without requesting a resource; XYZ Y is not flipped', async () => {
  const [key, resource] = Object.entries(catalog.tiles)[0];
  let calls = 0;
  const repository = new OfflineSeamarkRepository(catalog, async name => { calls++; assert.equal(name, resource); return JSON.parse(read(`packs/${name}`).toString()) as unknown; });
  assert.equal(await repository.getTile(16, 0, 0), null); assert.equal(calls, 0);
  const [z, x, y] = key.split('/').map(Number);
  const urls = await Promise.all([repository.getTile(z, x, y), repository.getTile(z, x, y)]);
  assert.equal(calls, 1); assert.equal(urls[0], urls[1]); assert.match(urls[0]!, /^data:image\/png;base64,/);
  assert.equal(await repository.getTile(z, -1, y), null);
});

test('failed or incomplete local packs can be retried and never trigger online fallback in the repository', async () => {
  const [key, resource] = Object.entries(catalog.tiles)[0], [z, x, y] = key.split('/').map(Number);
  let calls = 0;
  const repository = new OfflineSeamarkRepository(catalog, async () => {
    if (++calls === 1) throw new Error('missing local file');
    return JSON.parse(read(`packs/${resource}`).toString()) as unknown;
  });
  await assert.rejects(repository.getTile(z, x, y));
  assert.match((await repository.getTile(z, x, y))!, /^data:image\/png/);
  assert.equal(calls, 2);
  const incomplete = new OfflineSeamarkRepository(catalog, async () => ({}));
  await assert.rejects(incomplete.getTile(z, x, y), /ausente/);
});

test('pack cache evicts old resources at its memory bound', async () => {
  const first = Object.entries(catalog.tiles)[0], second = Object.entries(catalog.tiles).find(([, resource]) => resource !== first[1])!;
  let calls = 0;
  const repository = new OfflineSeamarkRepository(catalog, async resource => { calls++; return JSON.parse(read(`packs/${resource}`).toString()) as unknown; }, 1);
  const load = (key: string): Promise<string | null> => { const [z, x, y] = key.split('/').map(Number); return repository.getTile(z, x, y); };
  await load(first[0]); await load(second[0]); await load(first[0]);
  assert.equal(calls, 3);
});
