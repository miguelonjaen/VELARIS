import { renderReliefTile, type ReliefGrid, type ReliefSettings } from './relief-model';
import { decodeReliefAsset, reliefPackKey, type ReliefResource } from './relief-assets';
type TileRequest = { kind: 'tile'; id: number; x: number; y: number; z: number };
type Request = { kind: 'init'; resources: Record<string, ReliefResource>; settings: ReliefSettings } | TileRequest | { kind: 'cancel'; id: number };
let resources: Record<string, ReliefResource> = {};
let settings: ReliefSettings | undefined;
const grids = new Map<string, { promise: Promise<ReliefGrid>; resolved: boolean }>();
const cancelled = new Set<number>();
const queue: TileRequest[] = [];
let active = 0;
async function getGrid(key: string): Promise<ReliefGrid | undefined> {
  const resource = resources[key]; if (!resource) return undefined;
  const cached = grids.get(key);
  if (cached) { grids.delete(key); grids.set(key, cached); return cached.promise; }
  const promise = (async () => {
    const response = await fetch(resource.url);
    if (!response.ok) throw new Error('Recurso de relieve no disponible');
    const text = await response.text();
    if (text.length > 2_000_000) throw new Error('Recurso de relieve demasiado grande');
    const grid = await decodeReliefAsset(JSON.parse(text) as unknown, resource.rawSha256);
    return grid;
  })();
  const entry: { resolved: boolean; promise: Promise<ReliefGrid> } = { resolved: false, promise: promise.then(grid => { entry.resolved = true; return grid; }).catch((error: unknown) => { grids.delete(key); throw error; }) };
  grids.set(key, entry);
  // Two requests at once; up to six decoded packs (~13 MiB), plus those being decoded.
  for (const [id, value] of grids) {
    if (grids.size <= 6) break;
    if (value.resolved && id !== key) grids.delete(id);
  }
  return entry.promise;
}
async function render(request: TileRequest): Promise<void> {
  try {
    if (!settings || cancelled.has(request.id)) return;
    const grid = await getGrid(reliefPackKey(request.x, request.y, request.z));
    if (cancelled.has(request.id)) return;
    const pixels = grid ? renderReliefTile(grid, settings, request.x, request.y, request.z) : new Uint8ClampedArray(256 * 256 * 4);
    self.postMessage({ id: request.id, pixels }, { transfer: [pixels.buffer] });
  } catch (error: unknown) {
    if (!cancelled.has(request.id)) self.postMessage({ id: request.id, error: error instanceof Error ? error.message : 'Error de relieve' });
  } finally { cancelled.delete(request.id); }
}
function pump(): void {
  while (active < 2 && queue.length) {
    const request = queue.shift(); if (!request) return;
    active++;
    void render(request).finally(() => { active--; pump(); });
  }
}
self.onmessage = (event: MessageEvent<Request>): void => {
  const request = event.data;
  if (request.kind === 'init') { resources = request.resources; settings = request.settings; return; }
  if (request.kind === 'cancel') { cancelled.add(request.id); return; }
  queue.push(request); pump();
};
