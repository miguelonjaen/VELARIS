import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMarineResponse, marineRequest, openMeteoMarine } from './openMeteoMarine';
import { levelExtrema, levelSeries, sampleMarine, type MarineFamily } from './marineField';
import type { WindRequest } from '../windflow/openMeteoWind';

const now = Date.UTC(2026, 9, 25);
const request: WindRequest = { key: 'marine-fixture', latitudes: [35.5, 36], longitudes: [-6.5, -6] };
interface FixturePoint {
  latitude: number; longitude: number;
  hourly_units: Record<string, string>;
  hourly: Record<string, (number | null)[]>;
}
function fixture(family: MarineFamily): FixturePoint[] {
  return request.latitudes.flatMap(latitude => request.longitudes.map((longitude): FixturePoint => ({ latitude, longitude,
    hourly_units: family === 'waves' ? { time: 'unixtime', wave_height: 'm', wave_direction: '°', wave_period: 's' } : { time: 'unixtime', ocean_current_velocity: 'm/s', ocean_current_direction: '°', sea_level_height_msl: 'm' },
    hourly: family === 'waves' ? { time: [0, 1, 2, 3, 4].map(h => now / 1000 + h * 3600), wave_height: [1, 2, 3, 2, 1], wave_direction: [0, 0, 0, 0, 0], wave_period: [8, 8, 8, 8, 8] } : { time: [0, 1, 2, 3, 4].map(h => now / 1000 + h * 3600), ocean_current_velocity: [1, 1, 1, 1, 1], ocean_current_direction: [0, 0, 0, 0, 0], sea_level_height_msl: [0, 1, 0, -1, 0] }
  })));
}

test('Waves FROM north travel south; Hs and period stay independent of motion', () => {
  const field = parseMarineResponse(fixture('waves'), request, 'waves', now).waves!;
  const sample = sampleMarine(field, field.frames[0], 35.75, -6.25)!;
  assert.equal(sample.north, -1);
  assert.equal(sample.value, 1);
  assert.equal(sample.period, 8);
});

test('Current TO north stays north; speed is converted to knots only for display', () => {
  const field = parseMarineResponse(fixture('ocean'), request, 'ocean', now).currents!;
  const sample = sampleMarine(field, field.frames[0], 35.75, -6.25)!;
  assert.equal(sample.north, 1);
  assert.equal(sample.east, 0);
  assert.ok(Math.abs(sample.value - 1.9438444924) < 1e-7);
});

test('Direction interpolation crosses north and cancels opposing currents in U/V', () => {
  const raw = fixture('ocean');
  raw.forEach((point, i) => { point.hourly.ocean_current_direction[0] = i % 2 ? 1 : 359; });
  let field = parseMarineResponse(raw, request, 'ocean', now).currents!;
  assert.ok(Math.abs(sampleMarine(field, field.frames[0], 35.75, -6.25)!.east) < 1e-7);
  raw.forEach((point, i) => { point.hourly.ocean_current_direction[0] = i % 2 ? 0 : 180; });
  field = parseMarineResponse(raw, request, 'ocean', now).currents!;
  assert.ok(sampleMarine(field, field.frames[0], 35.75, -6.25)!.value < 1e-6);
});

test('Opposing wave directions are ambiguous and not animated as a made-up heading', () => {
  const raw = fixture('waves');
  raw.forEach((point, i) => { point.hourly.wave_direction[0] = i % 2 ? 0 : 180; });
  const field = parseMarineResponse(raw, request, 'waves', now).waves!;
  assert.equal(sampleMarine(field, field.frames[0], 35.75, -6.25), null);
});

test('Null land cells remain holes; never extrapolate past model cell centres', () => {
  const field = parseMarineResponse(fixture('waves'), request, 'waves', now).waves!;
  assert.equal(sampleMarine(field, field.frames[0], 35.4, -6.25), null);
  field.frames[0].value[0] = NaN;
  assert.equal(sampleMarine(field, field.frames[0], 35.75, -6.25), null);
  const raw = fixture('waves'); raw.forEach(point => { point.hourly.wave_height.fill(null); });
  assert.equal(parseMarineResponse(raw, request, 'waves', now).waves!.frames.length, 0);
});

test('Negative and zero SSH are valid MSL values, independently of missing currents', () => {
  const raw = fixture('ocean'); raw.forEach(point => point.hourly.ocean_current_velocity.fill(null));
  const result = parseMarineResponse(raw, request, 'ocean', now);
  assert.equal(result.currents!.frames.length, 0);
  assert.equal(levelSeries(result.level!, 35.75, -6.25)[3].value, -1);
  assert.equal(levelSeries(result.level!, 35.75, -6.25)[0].value, 0);
});

test('Hourly SSH extrema need two valid adjacent hours; no bridge across missing data', () => {
  const field = parseMarineResponse(fixture('ocean'), request, 'ocean', now).level!;
  const series = levelSeries(field, 35.75, -6.25);
  assert.deepEqual(levelExtrema(series).map(value => [value.kind, value.time]), [['max', now + 3600000], ['min', now + 10800000]]);
  series[2].value = null;
  assert.equal(levelExtrema(series).length, 0);
  const gap = [{ time: now, value: 0 }, { time: now + 3600000, value: 1 }, { time: now + 10800000, value: 0 }];
  assert.equal(levelExtrema(gap).length, 0);
});

test('Reject malformed units, dimensions, repeated times, geometry and invalid periods', () => {
  const units = fixture('ocean'); units[0].hourly_units.ocean_current_velocity = 'km/h';
  assert.throws(() => parseMarineResponse(units, request, 'ocean', now), /Unidades/);
  assert.throws(() => parseMarineResponse([], request, 'waves', now), /incompleta/);
  const geometry = fixture('waves'); geometry[1].latitude += 0.1;
  assert.throws(() => parseMarineResponse(geometry, request, 'waves', now), /rectilínea/);
  const times = fixture('waves'); times[0].hourly.time[1] = times[0].hourly.time[0];
  assert.throws(() => parseMarineResponse(times, request, 'waves', now), /Tiempos/);
  const period = fixture('waves'); period.forEach(point => point.hourly.wave_period.fill(0));
  assert.equal(parseMarineResponse(period, request, 'waves', now).waves!.frames.length, 0);
});

test('Rounded flat maxima produce one extremum at a real sample, not duplicate high waters', () => {
  const series = [0, 1, 1, 1, 0, -1, -1, 0].map((value, hour) => ({ time: now + hour * 3600000, value }));
  const extrema = levelExtrema(series);
  assert.equal(extrema.length, 2);
  assert.equal(extrema[0].time, now + 2 * 3600000);
  assert.equal(extrema[1].kind, 'min');
  assert.ok(extrema.every(point => series.some(sample => sample.time === point.time)));
});

test('Forecast uses actual common timestamps, not fabricated time steps', () => {
  const raw = fixture('waves'); raw[0].hourly.time[4] = now / 1000 + 6 * 3600;
  const field = parseMarineResponse(raw, request, 'waves', now).waves!;
  assert.equal(field.frames.length, 4);
  assert.equal(field.frames[3].time, now + 10800000);
  assert.equal(parseMarineResponse(raw, request, 'waves', now + 86400000).waves!.frames.length, 0);
});

test('Marine sampling is bounded and rejects unsupported views', () => {
  const query = marineRequest({ south: 35.5, north: 35.6, west: -6.5, east: -6.4 });
  assert.equal(query.latitudes[1] - query.latitudes[0], 0.125);
  assert.ok(query.latitudes.length * query.longitudes.length <= 64);
  const wide = marineRequest({ south: 35, north: 36, west: -7, east: -5.7 });
  assert.ok(wide.latitudes.length * wide.longitudes.length <= 64);
  assert.ok(wide.longitudes[1] - wide.longitudes[0] <= 0.25);
  const largest = marineRequest({ south: 30, north: 46, west: -10, east: 6 });
  assert.ok(largest.latitudes.length * largest.longitudes.length <= 64);
  assert.throws(() => marineRequest({ south: 0, north: 40, west: -10, east: 10 }), /cobertura/);
});

test('Provider caches ocean/current levels together, uses nearest cells and honours aborts/errors', async () => {
  const saved = globalThis.fetch;
  let count = 0;
  const raw = fixture('ocean');
  const base = Math.floor(Date.now() / 3600000) * 3600;
  raw.forEach(point => { point.hourly.time = [0, 1, 2, 3, 4].map(h => base + h * 3600); });
  globalThis.fetch = async input => {
    count++;
    const url = new URL(String(input));
    assert.equal(url.searchParams.get('models'), 'meteofrance_currents');
    assert.equal(url.searchParams.get('cell_selection'), 'nearest');
    assert.equal(url.searchParams.get('wind_speed_unit'), 'ms');
    return new Response(JSON.stringify(raw));
  };
  try {
    const query = { ...request, key: 'marine-cache-test' };
    const first = await openMeteoMarine.load('ocean', query, new AbortController().signal);
    assert.ok(first.currents && first.level);
    assert.equal(await openMeteoMarine.load('ocean', query, new AbortController().signal), first);
    assert.equal(count, 1);
    const aborted = new AbortController(); aborted.abort();
    await assert.rejects(openMeteoMarine.load('ocean', query, aborted.signal), { name: 'AbortError' });
    globalThis.fetch = async () => new Response('', { status: 429 });
    await assert.rejects(openMeteoMarine.load('waves', { ...request, key: 'marine-quota' }, new AbortController().signal), /Cuota/);
    globalThis.fetch = async () => { throw new Error('network'); };
    await assert.rejects(openMeteoMarine.load('waves', { ...request, key: 'marine-network' }, new AbortController().signal), /Sin conexión/);
  } finally { globalThis.fetch = saved; }
});
