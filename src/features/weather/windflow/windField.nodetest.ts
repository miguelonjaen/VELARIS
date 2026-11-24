import { selectWindFrameIndex } from './windField';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromMeteorological, KNOTS_PER_MS, sampleWind, type WindField } from './windField';
import { openMeteoWind, parseWindResponse, windRequest, type WindRequest } from './openMeteoWind';

const request: WindRequest = { latitudes: [36, 36.5], longitudes: [-5, -4.5], key: 'test' };
const now = Date.UTC(2026, 9, 24);
function fixture(): Array<Record<string, unknown>> {
  return request.latitudes.flatMap(latitude => request.longitudes.map(longitude => ({ latitude, longitude, hourly_units: { time: 'unixtime', wind_speed_10m: 'm/s', wind_direction_10m: '°' }, hourly: { time: [now / 1000, now / 1000 + 3600], wind_speed_10m: [10, 20], wind_direction_10m: [270, 0] } })));
}
const hourly = (point: Record<string, unknown>) => point.hourly as { time: number[]; wind_speed_10m: (number | null)[]; wind_direction_10m: (number | null)[] };

test('Meteorological FROM becomes east/north TO, preserving calm and knots', () => {
  assert.ok(Math.abs(fromMeteorological(10, 270).u - 10) < 1e-9);
  assert.equal(fromMeteorological(10, 0).v, -10);
  assert.ok(Math.abs(fromMeteorological(10, 90).u + 10) < 1e-9);
  const calm = fromMeteorological(0, 25);
  assert.equal(Math.hypot(calm.u, calm.v), 0);
  assert.ok(Math.abs(10 * KNOTS_PER_MS - 19.4384449) < 1e-6);
});

test('Interpolation blends U/V across north, not bearings across 180 degrees', () => {
  const raw = fixture();
  raw.forEach((point, index) => { hourly(point).wind_direction_10m[0] = index % 2 ? 1 : 359; });
  const field = parseWindResponse(raw, request, now);
  const vector = sampleWind(field, field.frames[0], 36.25, -4.75)!;
  assert.ok(Math.abs(vector.u) < 1e-6);
  assert.ok(vector.v < -9.99);
  assert.equal(sampleWind(field, field.frames[0], 36.25, -5.01), null);
  assert.equal(sampleWind(field, field.frames[0], NaN, -4.75), null);
  assert.ok(sampleWind(field, field.frames[0], 36.5, -4.5));
});

test('Null corners remain missing; no interpolation over holes', () => {
  const field = parseWindResponse(fixture(), request, now);
  field.frames[0].u[0] = NaN;
  assert.equal(sampleWind(field, field.frames[0], 36.25, -4.75), null);
});

test('Reject all-null steps, wrong units and non-rectilinear geometry', () => {
  const missing = fixture();
  missing.forEach(point => { hourly(point).wind_speed_10m = [null, null]; });
  assert.throws(() => parseWindResponse(missing, request, now), /Sin pasos/);
  const units = fixture(); units[0].hourly_units = { time: 'unixtime', wind_speed_10m: 'kn', wind_direction_10m: '°' };
  assert.throws(() => parseWindResponse(units, request, now), /unidades/);
  const geometry = fixture(); geometry[1].latitude = 36.1;
  assert.throws(() => parseWindResponse(geometry, request, now), /rectilínea/);
});

test('Only common returned times are selectable, no synthetic temporal steps', () => {
  const raw = fixture();
  hourly(raw[0]).time[1] += 3600;
  const field = parseWindResponse(raw, request, now);
  assert.deepEqual(field.frames.map(frame => frame.time), [now]);
  assert.throws(() => parseWindResponse(raw, request, now + 86400000), /Sin pasos/);
});

test('Duplicate timestamps and collapsed cell centres are rejected', () => {
  const raw = fixture(); hourly(raw[0]).time[1] = hourly(raw[0]).time[0];
  assert.throws(() => parseWindResponse(raw, request, now), /temporal/);
  const collapsed = fixture(); collapsed.forEach(point => { point.longitude = -5; });
  assert.throws(() => parseWindResponse(collapsed, request, now), /rectilínea/);
});

test('Requests are padded, bounded and reject unsupported views explicitly', () => {
  const grid = windRequest({ south: 36.1, north: 36.3, west: -5, east: -4.8 });
  assert.ok(grid.latitudes[0] < 36.1 && grid.latitudes[grid.latitudes.length - 1] > 36.3);
  const wide = windRequest({ south: 30, north: 46, west: -10, east: 6 });
  assert.ok(wide.latitudes.length * wide.longitudes.length <= 64);
  assert.throws(() => windRequest({ south: 30, north: 46, west: 170, east: 190 }), /cobertura/);
  assert.throws(() => windRequest({ south: 30, north: 60, west: -10, east: 10 }), /cobertura/);
});

test('Bilinear values and exact boundaries reproduce known analytic field', () => {
  const field: WindField = { latitudes: [0, 1], longitudes: [0, 1], fetchedAt: now, source: 'fixture', model: 'test', frames: [{ time: now, u: new Float32Array([0, 2, 4, 6]), v: new Float32Array([2, 4, 6, 8]) }] };
  assert.deepEqual(sampleWind(field, field.frames[0], 0.25, 0.5), { u: 2, v: 4 });
  assert.deepEqual(sampleWind(field, field.frames[0], 1, 1), { u: 6, v: 8 });
});

test('Provider requests each cell, disables downscaling, caches and honours aborts', async () => {
  const savedFetch = globalThis.fetch;
  let calls = 0;
  const current = Math.floor(Date.now() / 3600000) * 3600;
  const data = fixture();
  data.forEach(point => { hourly(point).time = [current, current + 3600]; });
  globalThis.fetch = async input => {
    calls++;
    const url = new URL(String(input));
    assert.equal(url.searchParams.get('models'), 'gfs_global');
    assert.equal(url.searchParams.get('cell_selection'), 'nearest');
    assert.equal(url.searchParams.get('latitude')?.split(',').length, 4);
    assert.equal(url.searchParams.get('elevation'), 'nan,nan,nan,nan');
    return new Response(JSON.stringify(data), { status: 200 });
  };
  try {
    const query = { ...request, key: 'cache-test' };
    const first = await openMeteoWind.load(query, new AbortController().signal);
    assert.equal(await openMeteoWind.load(query, new AbortController().signal), first);
    assert.equal(calls, 1);
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(openMeteoWind.load({ ...request, key: 'abort-test' }, controller.signal), { name: 'AbortError' });
  } finally { globalThis.fetch = savedFetch; }
});

test('Quota and malformed provider responses become explicit errors', async () => {
  const savedFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('', { status: 429 });
    await assert.rejects(openMeteoWind.load({ ...request, key: 'quota-test' }, new AbortController().signal), /Cuota/);
    globalThis.fetch = async () => new Response('{}', { status: 200 });
    await assert.rejects(openMeteoWind.load({ ...request, key: 'invalid-test' }, new AbortController().signal), /incompleta/);
  } finally { globalThis.fetch = savedFetch; }
});


test('WindFlow abre la hora más próxima al presente y conserva selección explícita', () => {
  const hour = 3600000;
  const frames = Array.from({ length: 24 }, (_, index) => ({ time: index * hour }));
  assert.equal(selectWindFrameIndex(frames, null, 18 * hour + 4 * 60000), 18);
  assert.equal(selectWindFrameIndex(frames, 3 * hour, 18 * hour), 3);
  assert.equal(selectWindFrameIndex(frames, -hour, 18 * hour), 18);
  assert.equal(selectWindFrameIndex([], null, 18 * hour), 0);
});
