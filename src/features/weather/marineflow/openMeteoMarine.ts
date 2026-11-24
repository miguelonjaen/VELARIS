import { windRequest, type WindRequest } from '../windflow/openMeteoWind';
import { fromMeteorological, type WindBounds } from '../windflow/windField';
import type { MarineFamily, MarineField, MarineFrame, MarineMode } from './marineField';

export type MarineForecast = Partial<Record<MarineMode, MarineField>>;
export interface MarineForecastProvider {
  load(family: MarineFamily, request: WindRequest, signal: AbortSignal): Promise<MarineForecast>;
}
const VARIABLES: Record<MarineFamily, string[]> = {
  waves: ['wave_height', 'wave_direction', 'wave_period'],
  ocean: ['ocean_current_velocity', 'ocean_current_direction', 'sea_level_height_msl']
};
const MODELS: Record<MarineFamily, string> = { waves: 'meteofrance_wave', ocean: 'meteofrance_currents' };
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Respuesta marina inválida');
  return value as Record<string, unknown>;
}
export function marineRequest(bounds: WindBounds): WindRequest {
  // Reuse the common geographic limits, then spend the bounded sampling budget per axis.
  windRequest(bounds);
  let latStep = 0.125;
  let lonStep = 0.125;
  const axis = (min: number, max: number, step: number, limit: number): number[] => {
    const start = Math.max(-limit, Math.floor(min / step) * step - step);
    const end = Math.min(limit, Math.ceil(max / step) * step + step);
    return Array.from({ length: Math.round((end - start) / step) + 1 }, (_, i) => start + i * step);
  };
  let latitudes = axis(bounds.south, bounds.north, latStep, 85);
  let longitudes = axis(bounds.west, bounds.east, lonStep, 180);
  while (latitudes.length * longitudes.length > 64) {
    if (latitudes.length >= longitudes.length) latStep *= 2; else lonStep *= 2;
    latitudes = axis(bounds.south, bounds.north, latStep, 85);
    longitudes = axis(bounds.west, bounds.east, lonStep, 180);
  }
  return { latitudes, longitudes, key: `${latitudes.join(',')}/${longitudes.join(',')}` };
}

export function parseMarineResponse(raw: unknown, request: WindRequest, family: MarineFamily, fetchedAt: number): MarineForecast {
  const width = request.longitudes.length;
  if (width < 2 || request.latitudes.length < 2 || !Array.isArray(raw) || raw.length !== width * request.latitudes.length) throw new Error('Rejilla marina incompleta');
  const variables = VARIABLES[family];
  const expectedUnits = family === 'waves' ? ['m', '°', 's'] : ['m/s', '°', 'm'];
  const points = raw.map(rawPoint => {
    const point = object(rawPoint);
    const hourly = object(point.hourly);
    const units = object(point.hourly_units);
    if (!finite(point.latitude) || !finite(point.longitude) || Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180 || !Array.isArray(hourly.time) || units.time !== 'unixtime') throw new Error('Eje geográfico o temporal marino inválido');
    const times: unknown[] = hourly.time;
    if (times.some((time, i) => !finite(time) || (i > 0 && Number(time) <= Number(times[i - 1])))) throw new Error('Tiempos marinos no válidos');
    const series = variables.map((variable, i) => {
      const values = hourly[variable];
      if (units[variable] !== expectedUnits[i] || !Array.isArray(values) || values.length !== times.length) throw new Error('Unidades o series marinas incorrectas');
      return values as unknown[];
    });
    return { lat: point.latitude, lon: point.longitude, times, series, index: new Map(times.map((time, i) => [Number(time), i])) };
  });
  const latitudes = request.latitudes.map((_, row) => points[row * width].lat);
  const longitudes = request.longitudes.map((_, col) => points[col].lon);
  if ([latitudes, longitudes].some(axis => axis.some((value, i) => i > 0 && value <= axis[i - 1])) || points.some((point, i) => Math.abs(point.lat - latitudes[Math.floor(i / width)]) > 1e-5 || Math.abs(point.lon - longitudes[i % width]) > 1e-5)) throw new Error('Las celdas marinas no forman una rejilla rectilínea');
  const modes: MarineMode[] = family === 'waves' ? ['waves'] : ['currents', 'level'];
  const forecast: MarineForecast = {};
  for (const mode of modes) {
    const frames: MarineFrame[] = [];
    for (const rawTime of points[0].times) {
      const time = Number(rawTime);
      if (time < Math.floor(fetchedAt / 3600000) * 3600 || points.some(point => !point.index.has(time))) continue;
      const frame: MarineFrame = { time: time * 1000, value: new Float32Array(points.length).fill(NaN), east: new Float32Array(points.length).fill(NaN), north: new Float32Array(points.length).fill(NaN), ...(mode === 'waves' ? { period: new Float32Array(points.length).fill(NaN) } : {}) };
      points.forEach((point, i) => {
        const index = point.index.get(time)!;
        const a = point.series[0][index]; const b = point.series[1][index]; const c = point.series[2][index];
        if (mode === 'level') {
          if (finite(c)) { frame.value[i] = c; frame.east[i] = 0; frame.north[i] = 0; }
          return;
        }
        if (!finite(a) || a < 0 || !finite(b) || b < 0 || b > 360 || (mode === 'waves' && (!finite(c) || c <= 0))) return;
        const direction = mode === 'waves' ? fromMeteorological(1, b) : { u: a * Math.sin(b * Math.PI / 180), v: a * Math.cos(b * Math.PI / 180) };
        frame.value[i] = a;
        frame.east[i] = direction.u; frame.north[i] = direction.v;
        if (frame.period && finite(c)) frame.period[i] = c;
      });
      const usable = latitudes.slice(0, -1).some((_, row) => longitudes.slice(0, -1).some((__, col) => [row * width + col, row * width + col + 1, (row + 1) * width + col, (row + 1) * width + col + 1].every(i => Number.isFinite(frame.value[i]))));
      if (usable) frames.push(frame);
    }
    forecast[mode] = { mode, latitudes, longitudes, frames, fetchedAt, source: 'Open-Meteo / Copernicus Marine / Météo-France', model: family === 'waves' ? 'MFWAM · oleaje · 0,08° nativo' : 'SMOC · corrientes y nivel · 0,08° nativo' };
  }
  return forecast;
}

const cache = new Map<string, MarineForecast>();
export const openMeteoMarine: MarineForecastProvider = {
  async load(family, request, signal) {
    signal.throwIfAborted();
    const key = `${family}/${request.key}`;
    const cached = cache.get(key);
    const field = cached?.waves ?? cached?.currents;
    if (cached && field && Date.now() - field.fetchedAt < 30 * 60000) return cached;
    const latitudes: number[] = []; const longitudes: number[] = [];
    for (const lat of request.latitudes) for (const lon of request.longitudes) { latitudes.push(lat); longitudes.push(lon); }
    const url = new URL('https://marine-api.open-meteo.com/v1/marine');
    url.search = new URLSearchParams({ latitude: latitudes.join(','), longitude: longitudes.join(','), hourly: VARIABLES[family].join(','), models: MODELS[family], wind_speed_unit: 'ms', length_unit: 'metric', timeformat: 'unixtime', timezone: 'GMT', forecast_days: '3', cell_selection: 'nearest' }).toString();
    let response: Response;
    try { response = await fetch(url, { signal }); }
    catch (error: unknown) { if (signal.aborted) throw error; throw new Error('Sin conexión con el proveedor marino'); }
    if (!response.ok) throw new Error(response.status === 429 ? 'Cuota marina agotada; reintente más tarde' : `Servicio marino no disponible (HTTP ${response.status})`);
    let raw: unknown;
    try { raw = await response.json() as unknown; } catch { throw new Error('JSON marino inválido'); }
    const forecast = parseMarineResponse(raw, request, family, Date.now());
    signal.throwIfAborted();
    if (cache.size >= 6) cache.delete(cache.keys().next().value!);
    cache.set(key, forecast);
    return forecast;
  }
};
