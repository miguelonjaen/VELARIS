import React, { useEffect, useState, useRef } from 'react';
import { useMap, TileLayer, Polyline } from 'react-leaflet';
import L from 'leaflet';

// Use initSqlJs from global window to ensure CDN version
declare global {
  interface Window {
    initSqlJs: any;
  }
}

interface MBTileLayerProps {
  url: string;
  name: string;
  plan_tactico?: string;
  navigationDestination?: string;
  shipPosition?: { lat: number; lng: number } | null;
}

export const MBTileLayer: React.FC<MBTileLayerProps> = ({ 
  url, 
  name, 
  plan_tactico,
  navigationDestination,
  shipPosition
}) => {
  const map = useMap();
  console.log('MBTILE URL:', url);
console.log('MBTILE NAME:', name);
  const layerRef = useRef<L.Layer | null>(null);
  const [zoomBounds, setZoomBounds] = useState<{ min: number; max: number }>({ min: 0, max: 16 });

  useEffect(() => {
    let active = true;

    const loadMBTiles = async () => {
      try {
        console.log(`[Tactical] Cargando archivo: ${url}`);
        
        // Ensure SQL module is ready
        const SQL = await window.initSqlJs({
          locateFile: (file: string) => 'https://sql.js.org/dist/' + file
        });

        (window as any).SQL = SQL;

        // Fetching buffer with robustness
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Fallo al descargar MBTiles: ${response.status} ${response.statusText}`);
        }

        const buffer = await response.arrayBuffer();
        if (!buffer || buffer.byteLength < 100) {
          throw new Error('El buffer descargado es demasiado pequeño o está vacío.');
        }

        if (!active) return;

        console.log(`[Tactical] Buffer validado: ${buffer.byteLength} bytes. Esperando sincronización...`);
        
        // Anti-corruption delay
        await new Promise(resolve => setTimeout(resolve, 500));

        if (!active) return;
        if (!map) return;

        let db: any;
        try {
          db = new SQL.Database(new Uint8Array(buffer as any));
        } catch (dbErr) {
          console.error('[Tactical] Error crítico: El archivo no es una base de datos SQLite válida.', dbErr);
          return;
        }

        console.log(`[Tactical] Base de datos abierta correctamente para ${name}.`);

        // Metadata extraction with fail-safe defaults
        let minZ = 0;
        let maxZ = 16;
        try {
          const metaMin = db.exec("SELECT value FROM metadata WHERE name='minzoom'");
          const metaMax = db.exec("SELECT value FROM metadata WHERE name='maxzoom'");
          
          if (metaMin && metaMin.length > 0 && metaMin[0].values.length > 0) {
            minZ = parseInt(metaMin[0].values[0][0] as string);
          }
          if (metaMax && metaMax.length > 0 && metaMax[0].values.length > 0) {
            maxZ = parseInt(metaMax[0].values[0][0] as string);
          }
          console.log(`[Tactical] Metadatos obtenidos: Z${minZ}-Z${maxZ}`);
        } catch (metaErr) {
          console.warn('[Tactical] Error leyendo metadatos. Usando niveles por defecto 0-16.');
          minZ = 0;
          maxZ = 16;
        }

        setZoomBounds({ min: minZ, max: maxZ });

        // Create custom TileLayer extension for MBTiles
        const MBTilesLayer = (L.TileLayer as any).extend({
          initialize: function(dbInstance: any, options: any) {
            this._db = dbInstance;
            (L.TileLayer.prototype as any).initialize.call(this, '', options);
          },
          createTile: function(coords: L.Coords, done: L.DoneCallback) {
            const tile = document.createElement('img');
            
            // MBTiles uses TMS y coordinates (upside down)
            const z = coords.z;
            const x = coords.x;
            const y = coords.y;
            const yInv = Math.pow(2, z) - 1 - y;

            console.log(`[Tactical] Solicitando tile: Z=${z}, X=${x}, Y_inv=${yInv}`);

            try {
              const res = this._db.exec('SELECT tile_data FROM tiles WHERE zoom_level = ? AND tile_column = ? AND tile_row = ?', [z, x, yInv]);
              if (res.length > 0 && res[0].values.length > 0) {
                const blob = new Blob([res[0].values[0][0] as any], { type: 'image/png' });
                const objUrl = URL.createObjectURL(blob);
                tile.src = objUrl;
                tile.onload = () => {
                  URL.revokeObjectURL(objUrl);
                  done(undefined, tile);
                };
              } else {
                console.log(`[Tactical] Tile no encontrado: Z=${z}, X=${x}, Y_inv=${yInv}`);
                done(undefined, tile);
              }
            } catch (err) {
              done(err as Error, tile);
            }

            return tile;
          }
        });

        const mbtilesLayer = new (MBTilesLayer as any)(db, {
          minZoom: minZ,
          maxZoom: 16, // Sincronizado: el zoom del mapa se bloquea en el máximo nativo para nitidez
          maxNativeZoom: 16, // Zoom máximo nativo de andalucia.mbtiles
          tileSize: 256,
          detectRetina: true,
          zoomOffset: 0,
          opacity: 1,
          zIndex: 1000
        });

        if (layerRef.current) {
          map.removeLayer(layerRef.current);
        }

        mbtilesLayer.addTo(map);
        layerRef.current = mbtilesLayer;

      } catch (err) {
        console.error('Error loading MBTiles:', err);
      }
    };

    loadMBTiles();

    return () => {
      active = false;
      const currentLayer = layerRef.current;
      // Tactical safety check before accessing map or layer
      if (!map || !currentLayer) return;
      
      try {
        map.removeLayer(currentLayer);
      } catch (err) {
        console.warn('[Tactical] Error al retirar capa en cleanup:', err);
      }
    };
  }, [url, map]);

  return (
    <>
      <TileLayer 
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" 
        opacity={0.3} 
        attribution="Fallback OSM"
      />
    </>
  );
};
