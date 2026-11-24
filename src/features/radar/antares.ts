/** Verified against local ANTARES Rust tracker/track.rs and detector/detector.rs. */
export interface AntaresTrack {
  readonly source: 'RADAR_SIM';
  readonly id: number;
  readonly timestampMs: number;
  readonly rangeM: number;
  /** Clockwise from north of the ANTARES local XY coordinate system; not BOAT heading. */
  readonly bearingDeg: number;
  readonly latitude: number;
  readonly longitude: number;
  readonly speedMps: number;
}
export interface AntaresSnapshot {
  readonly source: 'RADAR_SIM';
  readonly state: 'disconnected' | 'connecting' | 'connected' | 'error';
  readonly tracks: readonly AntaresTrack[];
  readonly rejected: number;
  readonly error: string | null;
}
export interface AntaresApi {
  connect(): Promise<AntaresSnapshot>;
  disconnect(): Promise<void>;
  snapshot(): Promise<AntaresSnapshot>;
}
declare global { interface Window { radarAntares?: AntaresApi } }
export function antaresBearing(azimuthRad: number): number {
  return ((90 - azimuthRad * 180 / Math.PI) % 360 + 360) % 360;
}
export function parseAntaresTrack(line: string): AntaresTrack | null {
  if (line.length > 2048) return null;
  const f = line.trimEnd().split(',');
  if (f.length !== 25 || !['CA','CS','FA','FS','LA','LS'].includes(f[8]) || !['TARGET','ATON'].includes(f[9])) return null;
  const n = f.map((v, i) => [8,9,10].includes(i) ? 0 : /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(v) ? Number(v) : NaN);
  if (n.some(v => !Number.isFinite(v))) return null;
  if (![0,1,2,3,4,5,6,7,11,12,19,20,21,22].every(i => Number.isSafeInteger(n[i]) && n[i] >= 0) ||
    n[0] > 9999 || n[1] < 1970 || n[1] > 9999 || n[2] < 1 || n[2] > 12 || n[3] < 1 || n[3] > 31 ||
    n[4] > 23 || n[5] > 59 || n[6] > 59 || n[7] > 999 || n[11] > 63 || n[19] > 30 || n[20] > 15 ||
    n[13] < 0 || n[13] > 1e7 || Math.abs(n[14]) > 2 * Math.PI + 1e-5 || Math.abs(n[15]) > 90 || Math.abs(n[16]) > 180 ||
    n[17] < 0 || n[17] > 1000 || Math.abs(n[18]) > 2 * Math.PI + 1e-5 || n[23] < 0 || n[24] < 0) return null;
  const timestampMs = Date.UTC(n[1], n[2]-1, n[3], n[4], n[5], n[6], n[7]);
  const date = new Date(timestampMs);
  if (date.getUTCMonth() !== n[2]-1 || date.getUTCDate() !== n[3]) return null;
  return { source: 'RADAR_SIM', id: n[0], timestampMs, rangeM: n[13], bearingDeg: antaresBearing(n[14]), latitude: n[15], longitude: n[16], speedMps: n[17] };
}
/** UTF-8 CSV is line-delimited; names containing commas are not escaped upstream and are rejected. */
export class AntaresDecoder {
  private pending = '';
  private dropping = false;
  rejected = 0;
  feed(chunk: string): AntaresTrack[] {
    const tracks: AntaresTrack[] = [];
    if (chunk.length > 65536) { this.pending = ''; this.dropping = true; this.rejected++; return tracks; }
    for (const char of chunk) {
      if (char === '\n') {
        if (!this.dropping) {
          const track = parseAntaresTrack(this.pending);
          if (track) tracks.push(track); else this.rejected++;
        }
        this.pending = ''; this.dropping = false;
      } else if (!this.dropping) {
        this.pending += char;
        if (this.pending.length > 2048) { this.pending = ''; this.dropping = true; this.rejected++; }
      }
    }
    return tracks;
  }
}
export class AntaresTrackStore {
  private readonly entries = new Map<number, { track: AntaresTrack; receivedAt: number }>();
  ingest(track: AntaresTrack, now: number): boolean {
    if (!Number.isFinite(now) || now < 0 || track.source !== 'RADAR_SIM') return false;
    this.snapshot(now);
    const prior = this.entries.get(track.id);
    if (prior && (track.timestampMs <= prior.track.timestampMs || now < prior.receivedAt)) return false;
    if (!prior && this.entries.size >= 512) return false;
    this.entries.set(track.id, { track: { ...track }, receivedAt: now });
    return true;
  }
  snapshot(now: number): AntaresTrack[] {
    for (const [id, entry] of this.entries) if (now < entry.receivedAt || now - entry.receivedAt > 3000) this.entries.delete(id);
    return [...this.entries.values()].map(e => ({ ...e.track }));
  }
  clear(): void { this.entries.clear(); }
}
