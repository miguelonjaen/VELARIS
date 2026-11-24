export type SurfaceId = 'sea' | 'land' | 'inlandWater';
export type SurfacePosition = [number, number];
export interface SurfaceFeature { type: 'Feature'; id: string; properties: { kind: SurfaceId; navigationUse: false; depthKnown?: false }; geometry: { type: 'Polygon'; coordinates: SurfacePosition[][] } }
export interface SurfaceCollection { type: 'FeatureCollection'; features: SurfaceFeature[] }
export interface SurfaceSector { schemaVersion: 1; id: string; navigationUse: false; officialEnc: false; depthKnown: false; experimental: true; license: 'ODbL-1.0'; coverage: [number, number, number, number]; layers: Record<SurfaceId, SurfaceCollection> }
const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function parseSurfaceSector(input: unknown, expectedId: string): SurfaceSector {
  if (!record(input) || input.schemaVersion !== 1 || input.id !== expectedId || input.navigationUse !== false || input.officialEnc !== false || input.depthKnown !== false || input.experimental !== true || input.license !== 'ODbL-1.0' || !record(input.layers)) throw new Error('Invalid experimental surface contract');
  const coverage = input.coverage;
  if (!Array.isArray(coverage) || coverage.length !== 4 || !coverage.every(v => typeof v === 'number' && Number.isFinite(v)) || !(coverage[0] < coverage[2] && coverage[1] < coverage[3])) throw new Error('Invalid display coverage');
  for (const id of ['sea', 'land', 'inlandWater'] as const) {
    const layer = input.layers[id];
    if (!record(layer) || layer.type !== 'FeatureCollection' || !Array.isArray(layer.features) || layer.features.length > 50000) throw new Error('Invalid surface collection');
    const ids = new Set<string>();
    for (const feature of layer.features) {
      if (!record(feature) || feature.type !== 'Feature' || typeof feature.id !== 'string' || ids.has(feature.id) || !record(feature.properties) || feature.properties.kind !== id || feature.properties.navigationUse !== false || (id !== 'land' && feature.properties.depthKnown !== false) || !record(feature.geometry) || feature.geometry.type !== 'Polygon' || !Array.isArray(feature.geometry.coordinates) || feature.geometry.coordinates.length === 0) throw new Error('Invalid surface feature');
      ids.add(feature.id);
      for (const ring of feature.geometry.coordinates) {
        if (!Array.isArray(ring) || ring.length < 4) throw new Error('Invalid polygon ring');
        for (const position of ring) {
          if (!Array.isArray(position) || position.length !== 2 || typeof position[0] !== 'number' || typeof position[1] !== 'number' || !Number.isFinite(position[0]) || !Number.isFinite(position[1]) || position[0] < coverage[0] - 1e-9 || position[0] > coverage[2] + 1e-9 || position[1] < coverage[1] - 1e-9 || position[1] > coverage[3] + 1e-9) throw new Error('Invalid polygon coordinate');
        }
        const first: unknown = ring[0], last: unknown = ring[ring.length - 1];
        if (!Array.isArray(first) || !Array.isArray(last) || first[0] !== last[0] || first[1] !== last[1]) throw new Error('Open surface ring');
      }
    }
  }
  // All nested fields and critical safety flags above were validated at the boundary.
  return input as unknown as SurfaceSector;
}

/** Display-only point classification; never used as a navigability or grounding decision. */
export function containsSurface(collection: SurfaceCollection, point: SurfacePosition): boolean {
  const ringContains = (ring: SurfacePosition[]): boolean => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j]; if (!a || !b) continue;
      if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  };
  return collection.features.some(f => { const outer = f.geometry.coordinates[0]; return !!outer && ringContains(outer) && !f.geometry.coordinates.slice(1).some(ringContains); });
}

/** Assemble bounded local resources without changing the host app's PWA cache limit. */
export async function loadSurfaceSector(id: string, read: (filename: string) => Promise<unknown>): Promise<SurfaceSector> {
  if (!/^[a-z-]+$/.test(id)) throw new Error('Invalid surface sector ID');
  const index = await read(`index-${id}.json`);
  if (!record(index) || !record(index.layerParts)) throw new Error('Invalid surface resource index');
  const entries = await Promise.all((['sea','land','inlandWater'] as const).map(async kind => {
    const filenames: unknown = (index.layerParts as Record<string, unknown>)[kind];
    if (!Array.isArray(filenames) || filenames.length < 1 || filenames.length > 100) throw new Error('Invalid surface parts');
    const collections = await Promise.all(filenames.map(async (filename: unknown) => {
      if (typeof filename !== 'string' || !new RegExp(`^base-${id}-${kind}-[0-9]+\\.json$`).test(filename)) throw new Error('Invalid local resource name');
      const data = await read(filename);
      if (!record(data) || data.type !== 'FeatureCollection' || !Array.isArray(data.features)) throw new Error('Invalid surface part');
      return data.features as unknown[];
    }));
    return [kind, {type:'FeatureCollection',features:collections.flat()}] as const;
  }));
  return parseSurfaceSector({...index,layers:Object.fromEntries(entries)},id);
}
