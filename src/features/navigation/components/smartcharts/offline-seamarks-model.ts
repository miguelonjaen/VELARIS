export interface OfflineSeamarkCatalog {
  schemaVersion: 1;
  transparent: true;
  scheme: 'xyz';
  minZoom: number;
  maxZoom: number;
  bounds: [number, number, number, number];
  sourceTimestamp: string;
  inputObjects: number;
  tiles: Record<string, string>;
  packs: Record<string, { bytes: number; sha256: string }>;
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const resourceName = /^seamarks-pack-\d+\.json$/;
export function tileKey(z: number, x: number, y: number): string | null {
  return [z, x, y].every(Number.isInteger) && z >= 0 && z <= 20 && x >= 0 && y >= 0 && x < 2 ** z && y < 2 ** z ? `${z}/${x}/${y}` : null;
}

export function parseOfflineSeamarkCatalog(value: unknown): OfflineSeamarkCatalog {
  if (!record(value) || value.schemaVersion !== 1 || value.transparent !== true || value.scheme !== 'xyz' || value.navigationUse !== false || value.officialEnc !== false ||
      !Number.isInteger(value.minZoom) || !Number.isInteger(value.maxZoom) || (value.minZoom as number) < 0 || (value.maxZoom as number) > 16 || (value.minZoom as number) > (value.maxZoom as number) ||
      !Array.isArray(value.bounds) || value.bounds.length !== 4 || !value.bounds.every(v => typeof v === 'number' && Number.isFinite(v)) ||
      value.bounds[0] < -180 || value.bounds[2] > 180 || value.bounds[1] < -85 || value.bounds[3] > 85 || value.bounds[0] >= value.bounds[2] || value.bounds[1] >= value.bounds[3] ||
      typeof value.sourceTimestamp !== 'string' || !Number.isFinite(Date.parse(value.sourceTimestamp)) || !Number.isInteger(value.inputObjects) || (value.inputObjects as number) <= 0 ||
      !record(value.tiles) || !record(value.packs) || Object.keys(value.tiles).length > 250000) throw new Error('Catálogo de señales offline inválido');
  const packs: OfflineSeamarkCatalog['packs'] = {};
  for (const [name, info] of Object.entries(value.packs)) {
    if (!resourceName.test(name) || !record(info) || !Number.isInteger(info.bytes) || (info.bytes as number) <= 0 || (info.bytes as number) > 1_500_000 || typeof info.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(info.sha256)) throw new Error('Recurso de señales offline inválido');
    packs[name] = { bytes: info.bytes as number, sha256: info.sha256 };
  }
  const tiles: Record<string, string> = {};
  for (const [key, resource] of Object.entries(value.tiles)) {
    const [z, x, y] = key.split('/').map(Number);
    if (tileKey(z, x, y) !== key || z < (value.minZoom as number) || z > (value.maxZoom as number) || typeof resource !== 'string' || !Object.hasOwn(packs, resource)) throw new Error('Índice XYZ de señales inválido');
    tiles[key] = resource;
  }
  if (!Object.keys(tiles).length) throw new Error('Paquete de señales vacío');
  return { schemaVersion: 1, transparent: true, scheme: 'xyz', minZoom: value.minZoom as number, maxZoom: value.maxZoom as number,
    bounds: value.bounds as OfflineSeamarkCatalog['bounds'], sourceTimestamp: value.sourceTimestamp, inputObjects: value.inputObjects as number, packs, tiles };
}

export function parseOfflineSeamarkPack(value: unknown, resource: string, catalog: OfflineSeamarkCatalog): Record<string, string> {
  if (!record(value) || !resourceName.test(resource) || !Object.hasOwn(catalog.packs, resource) || Object.keys(value).length > 10000) throw new Error('Bloque de señales inválido');
  const result: Record<string, string> = {};
  for (const [key, png] of Object.entries(value)) {
    if (catalog.tiles[key] !== resource || typeof png !== 'string' || png.length > 500000 || !/^iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(png)) throw new Error('Imagen de señal inválida');
    result[key] = png;
  }
  return result;
}

/** Bounded shared pack cache; failed reads are evicted so a local resource can be retried. */
export class OfflineSeamarkRepository {
  private readonly cache = new Map<string, Promise<Record<string, string>>>();
  constructor(readonly catalog: OfflineSeamarkCatalog, private readonly read: (resource: string) => Promise<unknown>, private readonly maxPacks = 12) {
    if (!Number.isInteger(maxPacks) || maxPacks < 1 || maxPacks > 16) throw new Error('Límite de caché inválido');
  }
  async getTile(z: number, x: number, y: number): Promise<string | null> {
    const key = tileKey(z, x, y);
    if (!key || !Object.hasOwn(this.catalog.tiles, key)) return null;
    const resource = this.catalog.tiles[key];
    let pending = this.cache.get(resource);
    if (pending) { this.cache.delete(resource); this.cache.set(resource, pending); }
    else {
      pending = this.read(resource).then(value => parseOfflineSeamarkPack(value, resource, this.catalog));
      this.cache.set(resource, pending);
      const current = pending;
      void pending.catch(() => { if (this.cache.get(resource) === current) this.cache.delete(resource); });
      while (this.cache.size > this.maxPacks) this.cache.delete(this.cache.keys().next().value!);
    }
    const pack = await pending;
    if (!Object.hasOwn(pack, key)) throw new Error('Tesela de señales ausente del bloque');
    return `data:image/png;base64,${pack[key]}`;
  }
}
