/** Platform-independent forecast contract. Components are east/north in m/s (TO). */
export interface WindVector { u: number; v: number }
export interface WindFrame { time: number; u: Float32Array; v: Float32Array }
export interface WindField {
  latitudes: number[];
  longitudes: number[];
  frames: WindFrame[];
  fetchedAt: number;
  model: string;
  source: string;
}
export interface WindBounds { south: number; north: number; west: number; east: number }
export const KNOTS_PER_MS = 1.9438444924406;

export function fromMeteorological(speed: number, fromDegrees: number): WindVector {
  const angle = fromDegrees * Math.PI / 180;
  return { u: -speed * Math.sin(angle), v: -speed * Math.cos(angle) };
}

function bracket(axis: number[], value: number): number {
  if (!Number.isFinite(value) || axis.length < 2 || value < axis[0] || value > axis[axis.length - 1]) return -1;
  let low = 0;
  let high = axis.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (axis[mid] <= value) low = mid; else high = mid;
  }
  return low;
}

/** Bilinear U/V on actual returned cell centres; never extrapolate or bridge null corners. */
export function sampleWind(field: WindField, frame: WindFrame, lat: number, lon: number): WindVector | null {
  const row = bracket(field.latitudes, lat);
  const col = bracket(field.longitudes, lon);
  if (row < 0 || col < 0) return null;
  const width = field.longitudes.length;
  const sw = row * width + col;
  const se = sw + 1;
  const nw = sw + width;
  const ne = nw + 1;
  if (!Number.isFinite(frame.u[sw]) || !Number.isFinite(frame.v[sw]) ||
      !Number.isFinite(frame.u[se]) || !Number.isFinite(frame.v[se]) ||
      !Number.isFinite(frame.u[nw]) || !Number.isFinite(frame.v[nw]) ||
      !Number.isFinite(frame.u[ne]) || !Number.isFinite(frame.v[ne])) return null;
  const x = (lon - field.longitudes[col]) / (field.longitudes[col + 1] - field.longitudes[col]);
  const y = (lat - field.latitudes[row]) / (field.latitudes[row + 1] - field.latitudes[row]);
  const a = (1 - x) * (1 - y);
  const b = x * (1 - y);
  const c = (1 - x) * y;
  const d = x * y;
  return {
    u: frame.u[sw] * a + frame.u[se] * b + frame.u[nw] * c + frame.u[ne] * d,
    v: frame.v[sw] * a + frame.v[se] * b + frame.v[nw] * c + frame.v[ne] * d
  };
}

/** Visual palette shared by raster and legend; knots, clamped above 50. */
export function windColor(knots: number): [number, number, number] {
  const stops = [[30, 100, 210], [25, 185, 210], [40, 190, 125], [230, 200, 50], [240, 115, 40], [205, 55, 100]];
  const position = Math.max(0, Math.min(5, knots / 10));
  const index = Math.min(4, Math.floor(position));
  const fraction = position - index;
  return stops[index].map((value, channel) => Math.round(value + (stops[index + 1][channel] - value) * fraction)) as [number, number, number];
}


/** Mantiene la hora elegida; al abrir, selecciona el paso más próximo a la hora actual. */
export function selectWindFrameIndex(frames: readonly { time: number }[], selected: number | null, now: number): number {
    if (!frames.length) return 0;
    const exact = selected === null ? -1 : frames.findIndex(frame => frame.time === selected);
    if (exact >= 0) return exact;
    return frames.reduce((best, frame, index) => Math.abs(frame.time - now) < Math.abs(frames[best].time - now) ? index : best, 0);
}
