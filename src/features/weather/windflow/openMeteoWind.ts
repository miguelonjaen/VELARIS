import { fromMeteorological, type WindBounds, type WindField, type WindFrame } from './windField';

export interface WindRequest { latitudes: number[]; longitudes: number[]; key: string }
export interface WindForecastProvider {
  load(request: WindRequest, signal: AbortSignal): Promise<WindField>;
}
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Respuesta meteorológica inválida');
  return value as Record<string, unknown>;
};

/** Bounded multi-location sampling, not a fabricated field from the ship's instrument. */
export function windRequest(bounds: WindBounds): WindRequest {
  const { south, north, west, east } = bounds;
  if (![south, north, west, east].every(Number.isFinite) || south < -80 || north > 80 || south >= north || west < -180 || east > 180 || west >= east || east - west > 16 || north - south > 16) {
    throw new Error('Sin cobertura: acerque el mapa (máximo 16°; sin cruce de antimeridiano ni polos)');
  }
  let step = 0.25;
  while (Math.ceil((north - south) / step) > 4 || Math.ceil((east - west) / step) > 4) step *= 2;
  const axis = (min: number, max: number, limit: number): number[] => {
    const start = Math.max(-limit, Math.floor(min / step) * step - step);
    const end = Math.min(limit, Math.ceil(max / step) * step + step);
    return Array.from({ length: Math.round((end - start) / step) + 1 }, (_, i) => start + i * step);
  };
  const latitudes = axis(south, north, 85);
  const longitudes = axis(west, east, 180);
  return { latitudes, longitudes, key: `${latitudes.join(',')}/${longitudes.join(',')}` };
}

export function parseWindResponse(raw: unknown, request: WindRequest, fetchedAt: number): WindField {
  if (request.latitudes.length < 2 || request.longitudes.length < 2 || !Array.isArray(raw) || raw.length !== request.latitudes.length * request.longitudes.length) throw new Error('Rejilla meteorológica incompleta');
  const points = raw.map(value => {
    const point = record(value);
    const hourly = record(point.hourly);
    const units = record(point.hourly_units);
    if (!finite(point.latitude) || !finite(point.longitude) || units.wind_speed_10m !== 'm/s' || units.wind_direction_10m !== '°' || units.time !== 'unixtime' || !Array.isArray(hourly.time) || !Array.isArray(hourly.wind_speed_10m) || !Array.isArray(hourly.wind_direction_10m)) throw new Error('Coordenadas, series o unidades de viento inválidas');
    const time: unknown[] = hourly.time;
    const speed: unknown[] = hourly.wind_speed_10m;
    const direction: unknown[] = hourly.wind_direction_10m;
    if (time.length !== speed.length || time.length !== direction.length || time.some((t, i) => !finite(t) || (i > 0 && Number(t) <= Number(time[i - 1])))) throw new Error('Eje temporal inválido');
    return { lat: point.latitude, lon: point.longitude, time, speed, direction };
  });
  const width = request.longitudes.length;
  const latitudes = request.latitudes.map((_, row) => points[row * width].lat);
  const longitudes = request.longitudes.map((_, col) => points[col].lon);
  if ([latitudes, longitudes].some(axis => axis.some((n, i) => i > 0 && n <= axis[i - 1])) || points.some((p, i) => Math.abs(p.lat - latitudes[Math.floor(i / width)]) > 1e-5 || Math.abs(p.lon - longitudes[i % width]) > 1e-5)) throw new Error('La fuente no devolvió una rejilla rectilínea válida');
  const frames: WindFrame[] = [];
  // Intersect actual times. No invented steps or app-side temporal interpolation.
  const timeIndices = points.map(p => new Map(p.time.map((t, i) => [Number(t), i])));
  for (const rawTime of points[0].time) {
    const time = Number(rawTime);
    if (time < Math.floor(fetchedAt / 3600000) * 3600 || timeIndices.some(index => !index.has(time))) continue;
    const u = new Float32Array(points.length).fill(NaN);
    const v = new Float32Array(points.length).fill(NaN);
    points.forEach((point, i) => {
      const index = timeIndices[i].get(time)!;
      const speed = point.speed[index];
      const direction = point.direction[index];
      if (!finite(speed) || speed < 0 || !finite(direction) || direction < 0 || direction > 360) return;
      const vector = fromMeteorological(speed, direction);
      u[i] = vector.u; v[i] = vector.v;
    });
    // A usable forecast step requires at least one complete spatial cell.
    const usable = latitudes.slice(0, -1).some((_, row) => longitudes.slice(0, -1).some((__, col) => [row * width + col, row * width + col + 1, (row + 1) * width + col, (row + 1) * width + col + 1].every(i => Number.isFinite(u[i]) && Number.isFinite(v[i]))));
    if (usable) frames.push({ time: time * 1000, u, v });
  }
  if (!frames.length) throw new Error('Sin pasos de pronóstico con celdas válidas');
  return { latitudes, longitudes, frames, fetchedAt, model: 'NOAA GFS Global · 10 m', source: 'Open-Meteo' };
}

const cache = new Map<string, WindField>();
export const openMeteoWind: WindForecastProvider = {
  async load(request, signal) {
    signal.throwIfAborted();
    const cached = cache.get(request.key);
    if (cached && Date.now() - cached.fetchedAt < 30 * 60 * 1000) return cached;
    const latitude: number[] = [];
    const longitude: number[] = [];
    for (const lat of request.latitudes) for (const lon of request.longitudes) { latitude.push(lat); longitude.push(lon); }
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.search = new URLSearchParams({ latitude: latitude.join(','), longitude: longitude.join(','), hourly: 'wind_speed_10m,wind_direction_10m', models: 'gfs_global', wind_speed_unit: 'ms', timeformat: 'unixtime', timezone: 'GMT', forecast_days: '3', cell_selection: 'nearest', elevation: latitude.map(() => 'nan').join(',') }).toString();
    let response: Response;
    try {
      response = await fetch(url, { signal });
    } catch (error: unknown) {
      if (signal.aborted) throw error;
      throw new Error('Sin conexión con Open-Meteo; compruebe la red y reintente');
    }
    if (!response.ok) throw new Error(response.status === 429 ? 'Cuota de Open-Meteo agotada; reintente más tarde' : `Fuente meteorológica no disponible (HTTP ${response.status})`);
    let payload: unknown;
    try { payload = await response.json() as unknown; }
    catch { throw new Error('Respuesta JSON meteorológica inválida'); }
    const field = parseWindResponse(payload, request, Date.now());
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (cache.size >= 6) cache.delete(cache.keys().next().value!);
    cache.set(request.key, field);
    return field;
  }
};
