import type { FeatureCollection, LineString } from 'geojson';
import type { ContourProperties } from './bathymetry-contract';

export type BathymetryBounds = [number, number, number, number];
export interface BathymetrySector {
  id: string;
  label: string;
  bbox: BathymetryBounds;
  resources: string[];
  simplified: boolean;
}
export interface BathymetryAtlas { schemaVersion: 2; sectors: BathymetrySector[] }
export type RegionalBathymetryChart = FeatureCollection<LineString, ContourProperties> & {
  bbox: BathymetryBounds;
  smartcharts: { id: string; simplified: boolean; verticalDatum: 'LAT'; navigationUse: false };
};
const levels = [20, 50, 100, 200, 500, 1000, 2000, 3000, 4000, 5000];
const tiles = new Set(['E4', 'E5', 'E6', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'G5', 'G6', 'G7', 'G8']);
const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
function bounds(v: unknown): v is BathymetryBounds {
  return Array.isArray(v) && v.length === 4 && v.every(finite) && v[0] >= -7.43 && v[2] <= 36.5 && v[1] >= 30 && v[3] <= 46 && v[0] < v[2] && v[1] < v[3];
}
function metadata(v: unknown, allowedLevels: readonly number[] = levels): v is Record<string, unknown> {
  return record(v) && v.experimental === true && v.navigationUse === false && v.officialEnc === false && v.crs === 'EPSG:4326' &&
    v.unit === 'm' && v.verticalDatum === 'LAT' && v.license === 'CC-BY-4.0' && v.release === '2024' && JSON.stringify(v.levelsM) === JSON.stringify(allowedLevels);
}

export function parseBathymetryAtlas(input: unknown): BathymetryAtlas {
  if (!record(input) || input.schemaVersion !== 2 || !metadata(input.metadata) || !Array.isArray(input.sectors) || input.sectors.length < 2 || input.sectors.length > 96) throw new Error('Invalid bathymetry atlas');
  const ids = new Set<string>();
  for (const s of input.sectors) {
    if (!record(s) || typeof s.id !== 'string' || !/^[a-z-]+$/.test(s.id) || ids.has(s.id) || typeof s.label !== 'string' || s.label.length > 120 ||
        !bounds(s.bbox) || typeof s.simplified !== 'boolean' || !Array.isArray(s.resources) || s.resources.length < 1 || s.resources.length > 32) throw new Error('Invalid bathymetry sector');
    const names = new Set<string>();
    for (const filename of s.resources) {
      if (typeof filename !== 'string' || !new RegExp(`^contours-${s.id}-[0-9]+\\.json$`).test(filename) || names.has(filename)) throw new Error('Unsafe bathymetry resource');
      names.add(filename);
    }
    ids.add(s.id);
  }
  if (!ids.has('overview') || !['cyprus', 'levant', 'adriatic-north'].every(region => [...ids].some(id => id === region || id.startsWith(`${region}-`)))) throw new Error('Incomplete Mediterranean atlas');
  return input as unknown as BathymetryAtlas;
}

/** Every selected part is validated before reaching Leaflet; no depth calculations consume this layer. */
export function parseRegionalBathymetry(input: unknown, expected: BathymetrySector, allowedLevels: readonly number[] = levels): RegionalBathymetryChart {
  if (!record(input) || input.type !== 'FeatureCollection' || !metadata(input.smartcharts, allowedLevels) || input.smartcharts.schemaVersion !== 2 || input.smartcharts.id !== expected.id ||
      input.smartcharts.simplified !== expected.simplified || !finite(input.smartcharts.cellSizeDegrees) || Math.abs(input.smartcharts.cellSizeDegrees - 1 / 960) > 1e-12 ||
      !Array.isArray(input.smartcharts.sourceTiles) || input.smartcharts.sourceTiles.length < 1 || !input.smartcharts.sourceTiles.every(t => typeof t === 'string' && tiles.has(t)) ||
      !bounds(input.bbox) || JSON.stringify(input.bbox) !== JSON.stringify(expected.bbox) || !Array.isArray(input.features) || input.features.length > 50000) throw new Error('Invalid regional bathymetry');
  let vertices = 0;
  for (const feature of input.features) {
    if (!record(feature) || feature.type !== 'Feature' || !record(feature.properties) || !record(feature.geometry)) throw new Error('Invalid contour');
    const p = feature.properties;
    if (!finite(p.depth_m) || !allowedLevels.includes(p.depth_m) || p.elevation_m !== -p.depth_m || p.navigationUse !== false) throw new Error('Invalid contour sign or level');
    const coords = feature.geometry.coordinates;
    if (feature.geometry.type !== 'LineString' || !Array.isArray(coords) || coords.length < 2 || coords.length > 5000) throw new Error('Invalid contour geometry');
    vertices += coords.length;
    if (vertices > 400000) throw new Error('Contour input exceeds vertex limit');
    for (const xy of coords) {
      if (!Array.isArray(xy) || xy.length !== 2 || !xy.every(finite) || xy[0] < expected.bbox[0] - 1e-7 || xy[0] > expected.bbox[2] + 1e-7 || xy[1] < expected.bbox[1] - 1e-7 || xy[1] > expected.bbox[3] + 1e-7) throw new Error('Contour outside selected sector');
    }
  }
  return input as unknown as RegionalBathymetryChart;
}

export async function loadBathymetrySector(sector: BathymetrySector, read: (filename: string) => Promise<unknown>, allowedLevels: readonly number[] = levels): Promise<RegionalBathymetryChart> {
  const parts = await Promise.all(sector.resources.map(async filename => parseRegionalBathymetry(await read(filename), sector, allowedLevels)));
  const features = parts.flatMap(part => part.features);
  const vertices = features.reduce((count, feature) => count + feature.geometry.coordinates.length, 0);
  if (vertices > 400000 || features.length > 50000) throw new Error('Selected bathymetry sector exceeds display limits');
  const first = parts[0];
  if (!first) throw new Error('Missing bathymetry resource');
  return { ...first, features };
}
