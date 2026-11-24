import { KNOTS_PER_MS, windColor } from '../windflow/windField';

export type MarineMode = 'waves' | 'currents' | 'level';
export type MarineFamily = 'waves' | 'ocean';
export interface MarineFrame {
  time: number;
  value: Float32Array;
  east: Float32Array;
  north: Float32Array;
  period?: Float32Array;
}
export interface MarineField {
  mode: MarineMode;
  latitudes: number[];
  longitudes: number[];
  frames: MarineFrame[];
  fetchedAt: number;
  source: string;
  model: string;
}
export interface MarineSample { east: number; north: number; value: number; period?: number }
export interface LevelPoint { time: number; value: number | null }
export interface LevelExtremum { time: number; value: number; kind: 'max' | 'min' }

function bracket(axis: number[], position: number): number {
  if (!Number.isFinite(position) || position < axis[0] || position > axis[axis.length - 1] || axis.length < 2) return -1;
  let low = 0;
  let high = axis.length - 1;
  while (high - low > 1) { const middle = (low + high) >> 1; if (axis[middle] <= position) low = middle; else high = middle; }
  return low;
}

/** Four-corner interpolation on actual model cell centres; land/nulls remain holes. */
export function sampleMarine(field: MarineField, frame: MarineFrame, lat: number, lon: number): MarineSample | null {
  const row = bracket(field.latitudes, lat);
  const col = bracket(field.longitudes, lon);
  if (row < 0 || col < 0) return null;
  const width = field.longitudes.length;
  const indices = [row * width + col, row * width + col + 1, (row + 1) * width + col, (row + 1) * width + col + 1];
  if (indices.some(i => !Number.isFinite(frame.value[i]) || !Number.isFinite(frame.east[i]) || !Number.isFinite(frame.north[i]) || (frame.period !== undefined && !Number.isFinite(frame.period[i])))) return null;
  const x = (lon - field.longitudes[col]) / (field.longitudes[col + 1] - field.longitudes[col]);
  const y = (lat - field.latitudes[row]) / (field.latitudes[row + 1] - field.latitudes[row]);
  const weights = [(1 - x) * (1 - y), x * (1 - y), (1 - x) * y, x * y];
  const blend = (values: Float32Array): number => indices.reduce((sum, index, i) => sum + values[index] * weights[i], 0);
  let east = blend(frame.east);
  let north = blend(frame.north);
  const magnitude = Math.hypot(east, north);
  if (field.mode === 'waves') {
    // Opposing mean directions are ambiguous, not a zero-period or synthetic wave.
    if (magnitude < 0.05) return null;
    east /= magnitude; north /= magnitude;
  }
  return { east, north, value: field.mode === 'currents' ? magnitude * KNOTS_PER_MS : blend(frame.value), period: frame.period ? blend(frame.period) : undefined };
}

export function levelSeries(field: MarineField, lat: number, lon: number): LevelPoint[] {
  return field.mode === 'level' ? field.frames.map(frame => ({ time: frame.time, value: sampleMarine(field, frame, lat, lon)?.value ?? null })) : [];
}

/** Extrema of hourly modeled total SSH, not official tidal high/low waters. */
export function levelExtrema(series: LevelPoint[]): LevelExtremum[] {
  const result: LevelExtremum[] = [];
  for (let i = 1; i < series.length - 1; i++) {
    const before = series[i - 1]; const point = series[i];
    if (before.value === null || point.value === null || point.time - before.time !== 3600000) continue;
    let end = i;
    // Source rounding may produce a flat peak; choose an actual middle sample, not a fabricated minute.
    while (end + 1 < series.length && series[end + 1].value === point.value && series[end + 1].time - series[end].time === 3600000) end++;
    const after = series[end + 1];
    if (!after || after.value === null || after.time - series[end].time !== 3600000) { i = end; continue; }
    const middle = series[Math.floor((i + end) / 2)];
    if (point.value > before.value && point.value > after.value) result.push({ time: middle.time, value: point.value, kind: 'max' });
    if (point.value < before.value && point.value < after.value) result.push({ time: middle.time, value: point.value, kind: 'min' });
    i = end;
  }
  return result;
}

export function marineColor(mode: MarineMode, value: number): [number, number, number] {
  if (mode === 'waves') return windColor(value / 6 * 50);
  if (mode === 'currents') return windColor(value / 3 * 50);
  const t = Math.min(1, Math.abs(value) / 2);
  const neutral = [190, 205, 220];
  const end = value < 0 ? [30, 65, 190] : [230, 70, 65];
  return neutral.map((v, i) => Math.round(v + (end[i] - v) * t)) as [number, number, number];
}

export const MARINE_LABELS: Record<MarineMode, string> = {
  waves: 'Oleaje · altura significativa Hs', currents: 'Corriente superficial total', level: 'Nivel del mar · incluye marea'
};
