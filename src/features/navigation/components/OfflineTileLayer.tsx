import React, { useEffect } from 'react';
import { TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import localforage from 'localforage';

// Configure localforage for tile caching
const tileCache = localforage.createInstance({
  name: 'tileCache',
  storeName: 'tiles'
});

const MAX_TILES = 50;

class OfflineTileLayerClass extends L.TileLayer {
  createTile(coords: L.Coords, done: L.DoneCallback): HTMLElement {
    const tile = document.createElement('img');
    const url = this.getTileUrl(coords);
    const key = `tile-${coords.z}-${coords.x}-${coords.y}`;

    L.DomEvent.on(tile, 'load', L.Util.bind((this as any)._tileOnLoad, this, done, tile));
    L.DomEvent.on(tile, 'error', L.Util.bind((this as any)._tileOnError, this, done, tile));

    // Async cache check and fetch
    (async () => {
      try {
        const cachedTile = await tileCache.getItem<Blob>(key);
        if (cachedTile) {
          tile.src = URL.createObjectURL(cachedTile);
          return;
        }
      } catch (err) {
        console.error('Error reading from cache', err);
      }

      // If not in cache, fetch and store
      fetch(url)
        .then(response => response.blob())
        .then(async blob => {
          tile.src = URL.createObjectURL(blob);
          
          // Manage cache size (simple LRU-like)
          const keys = await tileCache.keys();
          if (keys.length >= MAX_TILES) {
            await tileCache.removeItem(keys[0]);
          }
          await tileCache.setItem(key, blob);
        })
        .catch(() => {
          // If fetch fails and not in cache, show nothing or a placeholder
          tile.src = ''; 
        });
    })();

    return tile;
  }
}

export const OfflineTileLayer = (props: any) => {
  const map = useMap();

  useEffect(() => {
    const layer = new OfflineTileLayerClass(props.url, props);
    layer.addTo(map);
    return () => {
      map.removeLayer(layer);
    };
  }, [map, props.url]);

  return null;
};
