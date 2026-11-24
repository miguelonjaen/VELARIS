import type { FeatureCollection, LineString } from 'geojson';

export interface ContourProperties {
  depth_m: number;
  elevation_m: number;
  navigationUse: false;
}
export interface BathymetryMetadata {
  schemaVersion: 1;
  experimental: true;
  navigationUse: false;
  officialEnc: false;
  crs: 'EPSG:4326';
  unit: 'm';
  verticalDatum: 'LAT';
  license: 'CC-BY-4.0';
  source: string;
  cellSizeDegrees: number;
  levelsM: number[];
}
export type BathymetryChart = FeatureCollection<LineString, ContourProperties> & {
  bbox: [number, number, number, number];
  smartcharts: BathymetryMetadata;
};
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Display-only contours. Never provide these data to grounding or UKC calculations. */
export function parseBathymetry(input: unknown): BathymetryChart {
  if (!record(input) || input.type !== 'FeatureCollection' || !record(input.smartcharts)) throw new Error('Invalid bathymetry collection');
  const m = input.smartcharts;
  if (m.schemaVersion !== 1 || m.experimental !== true || m.navigationUse !== false || m.officialEnc !== false ||
      m.crs !== 'EPSG:4326' || m.unit !== 'm' || m.verticalDatum !== 'LAT' || m.license !== 'CC-BY-4.0' ||
      m.source !== 'https://downloads.emodnet-bathymetry.eu/v12/F4_2024.asc.zip' ||
      !finite(m.cellSizeDegrees) || Math.abs(m.cellSizeDegrees - 1 / 960) > 1e-10 ||
      !Array.isArray(m.levelsM) || JSON.stringify(m.levelsM) !== '[20,50,100,200,500]') throw new Error('Unsupported bathymetry provenance');
  const bbox = input.bbox;
  if (!Array.isArray(bbox) || bbox.length !== 4 || !bbox.every(finite) ||
      bbox[0] < -3.61 || bbox[2] > -3.44 || bbox[1] < 36.59 || bbox[3] > 36.81 ||
      bbox[0] >= bbox[2] || bbox[1] >= bbox[3]) throw new Error('Invalid Motril bathymetry coverage');
  if (!Array.isArray(input.features) || input.features.length < 1 || input.features.length > 2000) throw new Error('Invalid contour count');
  let vertices = 0;
  for (const f of input.features) {
    if (!record(f) || f.type !== 'Feature' || !record(f.properties) || !record(f.geometry)) throw new Error('Invalid contour');
    const p = f.properties;
    if (!finite(p.depth_m) || !m.levelsM.includes(p.depth_m) || p.elevation_m !== -p.depth_m || p.navigationUse !== false) throw new Error('Invalid contour depth');
    const coords = f.geometry.coordinates;
    if (f.geometry.type !== 'LineString' || !Array.isArray(coords) || coords.length < 2) throw new Error('Invalid contour geometry');
    vertices += coords.length;
    if (vertices > 100000) throw new Error('Contour vertex limit exceeded');
    for (const xy of coords) {
      if (!Array.isArray(xy) || xy.length !== 2 || !xy.every(finite) || xy[0] < bbox[0]-1e-9 || xy[0] > bbox[2]+1e-9 || xy[1] < bbox[1]-1e-9 || xy[1] > bbox[3]+1e-9) throw new Error('Contour outside coverage');
    }
  }
  return input as unknown as BathymetryChart;
}
