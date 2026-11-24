import { useEffect } from 'react';
import { Pane, useMap } from 'react-leaflet';
import L from 'leaflet';
import rawCatalog from './seamarks-offline/catalog.json';
import { OfflineSeamarkRepository, parseOfflineSeamarkCatalog, type OfflineSeamarkCatalog } from './offline-seamarks-model';

export type OfflineSeamarkStatus = 'loading' | 'ready' | 'error' | 'outside' | 'overview';
const urls = import.meta.glob<string>('./seamarks-offline/packs/seamarks-pack-*.json', { eager: true, query: '?url', import: 'default' });
const catalog = (() => {
  try { return parseOfflineSeamarkCatalog(rawCatalog); }
  catch (error: unknown) { console.error('[SmartCHARTS] Catálogo de señales offline no disponible', error); return null; }
})();
const repository = catalog ? new OfflineSeamarkRepository(catalog, async resource => {
  if (!catalog) throw new Error('Catálogo de señales no disponible');
  const url = urls[`./seamarks-offline/packs/${resource}`];
  if (!url) throw new Error('Bloque local de señales no instalado');
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok && response.status !== 0) throw new Error('No se pudo leer el bloque local de señales');
  const buffer = await response.arrayBuffer();
  const expected = catalog.packs[resource];
  if (buffer.byteLength !== expected.bytes) throw new Error('Longitud de bloque de señales incorrecta');
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  const hash = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  if (hash !== expected.sha256) throw new Error('Integridad de bloque de señales incorrecta');
  return JSON.parse(new TextDecoder().decode(buffer)) as unknown;
}) : null;

class OfflineTiles extends L.GridLayer {
  private serial = 0;
  private readonly pending = new Map<number, { image: HTMLImageElement; done: L.DoneCallback }>();
  constructor(manifest: OfflineSeamarkCatalog) {
    const [west, south, east, north] = manifest.bounds;
    super({ pane: 'smartcharts-offline-seamarks', tileSize: 256, bounds: [[south, west], [north, east]], noWrap: true,
      minZoom: manifest.minZoom, maxNativeZoom: manifest.maxZoom, maxZoom: 20, keepBuffer: 1, updateWhenIdle: true,
      attribution: '© OpenStreetMap contributors / Geofabrik · SeaChart / Malcolm Herring · señales offline experimentales' });
    this.on('tileunload', (event: L.TileEvent) => { this.pending.delete(Number(event.tile.dataset.signalId)); });
  }
  createTile(coords: L.Coords, done: L.DoneCallback): HTMLElement {
    const image = document.createElement('img'), id = ++this.serial;
    image.alt = ''; image.width = 256; image.height = 256; image.dataset.signalId = String(id);
    this.pending.set(id, { image, done });
    if (!repository) { queueMicrotask(() => done(new Error('Señales offline no disponibles'), image)); return image; }
    repository.getTile(coords.z, coords.x, coords.y).then(url => {
      if (!this.pending.has(id)) return;
      if (url === null) { image.src = L.Util.emptyImageUrl; this.pending.delete(id); done(undefined, image); return; }
      image.onload = (): void => { if (this.pending.delete(id)) done(undefined, image); };
      image.onerror = (): void => { if (this.pending.delete(id)) done(new Error('Imagen de señal dañada'), image); };
      image.src = url;
    }).catch((error: unknown) => { if (this.pending.delete(id)) done(error instanceof Error ? error : new Error('Señales locales no disponibles'), image); });
    return image;
  }
  dispose(): void { this.pending.clear(); this.remove(); }
}

function Tiles({ onStatus }: { onStatus: (status: OfflineSeamarkStatus) => void }): null {
  const map = useMap();
  useEffect(() => {
    if (!catalog) { onStatus('error'); return; }
    const layer = new OfflineTiles(catalog);
    let failed = false;
    const report = (status: OfflineSeamarkStatus): void => {
      const bounds = map.getBounds(), [west, south, east, north] = catalog.bounds;
      onStatus(bounds.getEast() < west || bounds.getWest() > east || bounds.getNorth() < south || bounds.getSouth() > north ? 'outside'
        : map.getZoom() < catalog.minZoom ? 'overview' : status);
    };
    layer.on('loading', () => { failed = false; report('loading'); });
    layer.on('tileerror', () => { failed = true; report('error'); });
    layer.on('load', () => report(failed ? 'error' : 'ready'));
    const moved = (): void => report(failed ? 'error' : layer.isLoading() ? 'loading' : 'ready');
    map.on('moveend zoomend', moved);
    layer.addTo(map); moved();
    return () => { map.off('moveend zoomend', moved); layer.dispose(); };
  }, [map, onStatus]);
  return null;
}

export default function OfflineSeamarkLayer({ onStatus }: { onStatus: (status: OfflineSeamarkStatus) => void }): React.ReactElement {
  return <Pane name="smartcharts-offline-seamarks" style={{ zIndex: 370, pointerEvents: 'none' }}><Tiles onStatus={onStatus} /></Pane>;
}
