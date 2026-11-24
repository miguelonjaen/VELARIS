export interface ReliefGrid {
  width: number; height: number; west: number; north: number; stepX: number; stepY: number;
  values: Int16Array;
}
export interface ReliefSettings { azimuth: number; altitude: number; strength: number; palette: 'ocean' | 'terrain' }
export const DEFAULT_RELIEF: ReliefSettings = { azimuth: 315, altitude: 45, strength: 0.75, palette: 'ocean' };
export const NO_DATA = -32768;
const R = 6378137;
const RAD = Math.PI / 180;
const palettes = {
  ocean: [[0,210,242,238],[50,125,209,212],[200,58,161,187],[500,37,115,160],[1000,29,77,128],[2000,24,48,89],[5000,12,24,53]],
  terrain: [[0,223,239,198],[50,157,217,190],[200,77,182,184],[500,54,140,176],[1000,66,104,157],[2000,75,71,128],[5000,39,34,76]],
} as const;
export function depthColor(depth: number, palette: ReliefSettings['palette']): [number, number, number] {
  const stops = palettes[palette];
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1], b = stops[i];
    if (depth <= b[0]) {
      const t = Math.max(0, Math.min(1, (depth - a[0]) / (b[0] - a[0])));
      return [1,2,3].map(c => a[c] + t * (b[c] - a[c])) as [number, number, number];
    }
  }
  const last = stops[stops.length - 1]; return [last[1], last[2], last[3]];
}
// ENU normal (-dz/dEast, -dz/dNorth, 1); azimuth measured clockwise from north.
// Relative to a flat surface: changing the light does not recolor flat seabed.
export function illumination(eastSlope: number, northSlope: number, settings: ReliefSettings): number {
  const az = settings.azimuth * RAD, alt = settings.altitude * RAD;
  const dot = (-eastSlope * Math.sin(az) * Math.cos(alt) - northSlope * Math.cos(az) * Math.cos(alt) + Math.sin(alt)) / Math.hypot(eastSlope, northSlope, 1);
  return Math.max(0.25, Math.min(1.5, 1 + settings.strength * (dot - Math.sin(alt)) * 1.6));
}
export function validateGrid(grid: ReliefGrid): void {
  if (!Number.isInteger(grid.width) || !Number.isInteger(grid.height) || grid.width < 3 || grid.height < 3 || grid.width * grid.height > 3_000_000 || grid.values.length !== grid.width * grid.height || ![grid.west,grid.north,grid.stepX,grid.stepY].every(Number.isFinite) || grid.stepX <= 0 || grid.stepY <= 0) throw new Error('Rejilla de relieve no valida');
}
export function renderReliefTile(grid: ReliefGrid, settings: ReliefSettings, x: number, y: number, z: number, size = 256): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(size * size * 4);
  const world = size * 2 ** z, circumference = 2 * Math.PI * R;
  for (let py = 0; py < size; py++) {
    const mercY = (0.5 - (y * size + py + 0.5) / world) * circumference;
    const row = Math.floor((grid.north - mercY) / grid.stepY);
    if (row < 1 || row >= grid.height - 1) continue;
    // Web Mercator scale factor: projected metres * cos(latitude) = ground metres.
    const groundScale = 1 / Math.cosh(mercY / R);
    for (let px = 0; px < size; px++) {
      const mercX = ((x * size + px + 0.5) / world - 0.5) * circumference;
      const col = Math.floor((mercX - grid.west) / grid.stepX);
      if (col < 1 || col >= grid.width - 1) continue;
      const index = row * grid.width + col, elevation = grid.values[index];
      if (elevation === NO_DATA || elevation >= 0) continue;
      const neighbor = (i: number): number => grid.values[i] === NO_DATA || grid.values[i] >= 0 ? elevation : grid.values[i];
      const eastSlope = (neighbor(index + 1) - neighbor(index - 1)) / (2 * grid.stepX * groundScale);
      const northSlope = (neighbor(index - grid.width) - neighbor(index + grid.width)) / (2 * grid.stepY * groundScale);
      const light = illumination(eastSlope, northSlope, settings);
      const color = depthColor(-elevation, settings.palette), offset = (py * size + px) * 4;
      rgba[offset] = color[0] * light; rgba[offset + 1] = color[1] * light; rgba[offset + 2] = color[2] * light; rgba[offset + 3] = 255;
    }
  }
  return rgba;
}
