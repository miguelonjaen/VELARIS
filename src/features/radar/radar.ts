/** Radar-local contract. No NMEA, AIS, navigation, IPC or operational alarm imports. */
export type RadarSource = 'RADAR_SIM' | 'RADAR_REAL';
export interface RadarSpoke {
  readonly source: RadarSource;
  readonly sequence: number;
  /** Monotonic acquisition time, milliseconds in the adapter session. */
  readonly timeMs: number;
  /** Clockwise from bow. True heading must be supplied separately for north-up. */
  readonly bearingDeg: number;
  readonly rangeM: number;
  readonly samples: Uint8Array;
}
/** Implementations own decoding; this contract never sends transmit/control commands. */
export interface RadarInputAdapter {
  readonly source: RadarSource;
  advance(timeMs: number, rangeM: number): readonly RadarSpoke[];
  reset(): void;
}
export const normalize = (degrees: number): number => ((degrees % 360) + 360) % 360;
export function polarPoint(bearing: number, distance: number): { x: number; y: number } {
  const angle = bearing * Math.PI / 180;
  return { x: Math.sin(angle) * distance, y: -Math.cos(angle) * distance };
}
export function displayBearing(relative: number, orientation: 'head-up' | 'north-up', heading: number | null): number | null {
  if (!Number.isFinite(relative)) return null;
  if (orientation === 'head-up') return normalize(relative);
  return heading !== null && Number.isFinite(heading) && heading >= 0 && heading < 360 ? normalize(relative + heading) : null;
}
/** Instance-local bus: source immutable, out-of-order/malformed packets rejected. */
export class RadarChannel {
  private last: RadarSpoke | null = null;
  constructor(readonly source: RadarSource) {}
  accept(spoke: RadarSpoke): boolean {
    if (spoke.source !== this.source || !Number.isSafeInteger(spoke.sequence) || spoke.sequence < 0 ||
      !Number.isFinite(spoke.timeMs) || spoke.timeMs < 0 || !Number.isFinite(spoke.rangeM) || spoke.rangeM <= 0 ||
      !Number.isFinite(spoke.bearingDeg) || spoke.bearingDeg < 0 || spoke.bearingDeg >= 360 ||
      !(spoke.samples instanceof Uint8Array) || !spoke.samples.length || spoke.samples.length > 4096 ||
      (this.last && (spoke.sequence <= this.last.sequence || spoke.timeMs < this.last.timeMs))) return false;
    this.last = { ...spoke, samples: spoke.samples.slice() };
    return true;
  }
  snapshot(now: number): RadarSpoke | null {
    return this.last && Number.isFinite(now) && now >= this.last.timeMs && now - this.last.timeMs <= 3000
      ? { ...this.last, samples: this.last.samples.slice() } : null;
  }
  reset(): void { this.last = null; }
}
export interface SyntheticTarget { readonly eastM: number; readonly northM: number; readonly eastMps: number; readonly northMps: number; readonly kind: 'ship-ais' | 'ship' | 'buoy' }
// AIS is scenario truth only: never an MMSI or a message on the application AIS bus.
export const SYNTHETIC_TARGETS: readonly SyntheticTarget[] = [
  { eastM: 850, northM: 900, eastMps: -2, northMps: 0.4, kind: 'ship-ais' },
  { eastM: -600, northM: 500, eastMps: 1.2, northMps: -0.5, kind: 'ship' },
  { eastM: 200, northM: -450, eastMps: 0, northMps: 0, kind: 'buoy' },
];
/** Stateless per-cell noise: independent of scheduling/chunk sizes. */
function noise(seed: number, spoke: number, bin: number): number {
  let n = (seed ^ Math.imul(spoke + 1, 374761393) ^ Math.imul(bin + 1, 668265263)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n ^ (n >>> 16)) >>> 0;
}
export class SyntheticRadar implements RadarInputAdapter {
  readonly source = 'RADAR_SIM' as const;
  private next = 0;
  private lastTime = -1;
  constructor(private readonly seed = 20261101) {}
  reset(): void { this.next = 0; this.lastTime = -1; }
  advance(timeMs: number, rangeM: number): readonly RadarSpoke[] {
    if (!Number.isFinite(timeMs) || timeMs < this.lastTime || timeMs < 0 || !Number.isFinite(rangeM) || rangeM <= 0 || rangeM > 100000) throw new Error('Invalid radar clock/range');
    const end = Math.floor(timeMs * 360 / 2500);
    if (!Number.isSafeInteger(end)) throw new Error('Radar clock exceeds session limits');
    this.lastTime = timeMs;
    // 24 rpm, 360 spokes/revolution. Bound recovery after suspension to one turn.
    this.next = Math.max(this.next, end - 359);
    const result: RadarSpoke[] = [];
    for (; this.next <= end; this.next++) {
      const acquisition = this.next * 2500 / 360;
      const bearing = this.next % 360;
      const samples = new Uint8Array(256);
      const ray = polarPoint(bearing, 1);
      for (let bin = 0; bin < samples.length; bin++) {
        const distance = (bin + 0.5) * rangeM / samples.length;
        const east = ray.x * distance, north = -ray.y * distance;
        let echo = noise(this.seed, this.next, bin) % 19;
        // Fictional curved coast, intentionally not geographic Motril data.
        if (Math.abs(north - (1700 + 160 * Math.sin(east / 450))) < 45 && Math.abs(east) < 2200) echo = 180;
        for (const target of SYNTHETIC_TARGETS) {
          const t = acquisition / 1000;
          const d = Math.hypot(east - target.eastM - target.eastMps * t, north - target.northM - target.northMps * t);
          if (d < (target.kind === 'buoy' ? 23 : 55)) echo = 245;
        }
        samples[bin] = echo;
      }
      result.push({ source: this.source, sequence: this.next, timeMs: acquisition, bearingDeg: bearing, rangeM, samples });
    }
    return result;
  }
}
