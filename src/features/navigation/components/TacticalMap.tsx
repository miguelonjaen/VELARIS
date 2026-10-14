import React, { useState, useEffect } from 'react';
import WindLayer from './WindLayer';
import MarineLayer from './MarineLayer';
import type { MarineWeatherData } from '../../../lib/useMarineWeather';
import BoatLayer from "./SailHUD/layers/BoatLayer";
import { 
  MapContainer, 
  TileLayer,
  Marker, 
  Polyline, 
  useMapEvents,
  useMap,
  Popup,
  LayersControl,
  GeoJSON,
  ZoomControl
} from 'react-leaflet';
import L from 'leaflet';
import type { Feature, FeatureCollection, GeoJsonObject, Geometry } from 'geojson';
import 'leaflet/dist/leaflet.css';
import { Gauge, Navigation as NavIcon } from 'lucide-react';
// import { cn } from '@lib/utils';

import { calculateBearing } from '../../../navigation/calculateBearing';
import SailHUDLayer from "./SailHUD/SailHUDLayer";
import VelarisLinkLayer from "../../link/VelarisLinkLayer";
if (import.meta.env.DEV) {
  console.log('TACTICAL MAP ACTIVO');
}

type EncOverlayStatus = 'loading' | 'ready' | 'empty' | 'error' | 'zoom-in';
type EncPreviewFeature = Feature<Geometry, Record<string, unknown>>;
type EncPreviewCollection = FeatureCollection<Geometry, Record<string, unknown>>;

interface EncVectorOverlayProps {
  filename: string;
  bounds: [number, number, number, number];
  onStatusChange: (status: EncOverlayStatus) => void;
}

const ENC_LAYER_COLORS: Record<string, string> = {
  DEPARE: '#38bdf8',
  DEPCNT: '#67e8f9',
  SOUNDG: '#e0f2fe',
  COALNE: '#f8fafc',
  LNDARE: '#c9b989',
  LAKARE: '#2563eb',
  OBSTRN: '#fb7185',
  UWTROC: '#f43f5e',
  WRECKS: '#f97316',
  LIGHTS: '#facc15',
  BOYLAT: '#fb923c',
  BOYSPP: '#fbbf24',
  BCNLAT: '#fb923c',
  BCNSPP: '#fbbf24',
  DAYMAR: '#fde047',
  PILPNT: '#fbbf24',
  FAIRWY: '#22d3ee',
  RESARE: '#a78bfa',
  M_COVR: '#94a3b8',
  M_QUAL: '#c084fc',
  BRIDGE: '#e2e8f0',
  SLCONS: '#cbd5e1',
  BUISGL: '#94a3b8'
};

const getEncLayerName = (feature: EncPreviewFeature | undefined): string => {
  const layerName = feature?.properties?.__s57Layer;
  return typeof layerName === 'string' ? layerName : 'UNKNOWN';
};

const EncVectorOverlay: React.FC<EncVectorOverlayProps> = ({ filename, bounds, onStatusChange }) => {
  const map = useMap();
  const [viewBounds, setViewBounds] = useState('');
  const [collection, setCollection] = useState<EncPreviewCollection | null>(null);

  useEffect(() => {
    map.fitBounds(
      [[bounds[1], bounds[0]], [bounds[3], bounds[2]]],
      { padding: [24, 24], maxZoom: 12 }
    );
  }, [map, filename, bounds]);

  useEffect(() => {
    const updateViewBounds = () => {
      const mapBounds = map.getBounds();
      const west = mapBounds.getWest();
      const south = mapBounds.getSouth();
      const east = mapBounds.getEast();
      const north = mapBounds.getNorth();
      if (east - west > 2 || north - south > 2) {
        setViewBounds('');
        return;
      }
      setViewBounds([west, south, east, north].map(value => value.toFixed(5)).join(','));
    };

    map.on('moveend', updateViewBounds);
    updateViewBounds();
    return () => { map.off('moveend', updateViewBounds); };
  }, [map]);

  useEffect(() => {
    if (!viewBounds) {
      setCollection(null);
      onStatusChange('zoom-in');
      return;
    }

    const controller = new AbortController();
    onStatusChange('loading');
    const query = new URLSearchParams({ bbox: viewBounds });
    fetch(`http://localhost:8089/api/enc-charts/${encodeURIComponent(filename)}/preview?${query}`, {
      signal: controller.signal
    })
      .then(async (response) => {
        const payload = await response.json() as EncPreviewCollection | { error?: string };
        if (!response.ok) {
          throw new Error('error' in payload && payload.error ? payload.error : 'No se pudo cargar la vista ENC.');
        }
        const preview = payload as EncPreviewCollection;
        setCollection(preview);
        onStatusChange(preview.features.length > 0 ? 'ready' : 'empty');
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        setCollection(null);
        onStatusChange('error');
        console.error('[ENC] Error cargando superposición vectorial:', error);
      });

    return () => controller.abort();
  }, [filename, viewBounds, onStatusChange]);

  if (!collection) return null;

  return (
    <GeoJSON
      key={`${filename}:${viewBounds}`}
      data={collection as GeoJsonObject}
      style={(feature) => {
        const layerName = getEncLayerName(feature as EncPreviewFeature | undefined);
        const color = ENC_LAYER_COLORS[layerName] ?? '#cbd5e1';
        const isArea = ['DEPARE', 'LNDARE', 'LAKARE', 'RESARE', 'M_COVR', 'M_QUAL'].includes(layerName);
        const isCoverageBoundary = layerName === 'M_COVR' || layerName === 'M_QUAL';
        return {
          color,
          weight: isCoverageBoundary ? 0.8 : layerName === 'DEPARE' ? 0.8 : 1.3,
          opacity: 0.9,
          fillColor: color,
          fillOpacity: isCoverageBoundary ? 0 : layerName === 'DEPARE' ? 0.18 : isArea ? 0.16 : 0.05,
          dashArray: isCoverageBoundary || layerName === 'DEPCNT' ? '4 3' : undefined
        };
      }}
      pointToLayer={(feature, latlng) => {
        const layerName = getEncLayerName(feature as EncPreviewFeature | undefined);
        const color = ENC_LAYER_COLORS[layerName] ?? '#cbd5e1';
        return L.circleMarker(latlng, {
          radius: layerName === 'SOUNDG' ? 2.5 : 4,
          color,
          fillColor: color,
          fillOpacity: 0.95,
          weight: 1
        });
      }}
      onEachFeature={(feature, layer) => {
        const encFeature = feature as EncPreviewFeature;
        const container = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = getEncLayerName(encFeature);
        container.appendChild(title);

        const attributes = Object.entries(encFeature.properties ?? {})
          .filter(([key, value]) => key !== '__s57Layer' && value !== null && value !== undefined)
          .slice(0, 6);
        for (const [key, value] of attributes) {
          const row = document.createElement('div');
          row.textContent = `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`;
          container.appendChild(row);
        }
        layer.bindPopup(container);
      }}
    />
  );
};

interface TacticalMapProps {
  center: [number, number] | null;
  zoom: number;
  shipPosition: { lat: number; lng: number } | null;
  shipName: string;
  navPlan: any;
  targetDestination: { lat: number; lng: number } | null;
  currentPath: [number, number][];
  onMapClick: (lat: number, lng: number) => void;
  onMapRightClick: (e: any) => void;
  onDragStart: () => void;
  isLaylinesActive: boolean; // New prop
  portLaylinePath?: [number, number][];
  stbdLaylinePath?: [number, number][];
  collisionFilter?: boolean;
  children?: React.ReactNode;
  compact?: boolean;
  listaCartas: any[];
  cartasActivas: Record<string, boolean>;
  isSailSteerWidgetOpen?: boolean;
  twd?: number;
  waypointBearing?: number;
  heading?: number;
  showWind?: boolean;
  windSpeed?: number;
  windDirection?: number;
  marineWeather?: MarineWeatherData | null;
  showWaves?: boolean;
  showCurrent?: boolean;
  encOverlay?: { filename: string; bounds: [number, number, number, number] } | null;
  onEncOverlayStatusChange?: (status: EncOverlayStatus) => void;
  encOverlayStatus?: EncOverlayStatus;
    
}


const MapUpdater = ({ center }: { center: [number, number] }) => {
  const map = useMap();
  useEffect(() => { map.setView(center); }, [center, map]);
  return null;
};

const ZoomWatcher = ({
  onZoomChange
}: {
  onZoomChange: (zoom: number) => void;
}) => {

  useMapEvents({
    zoomend(e) {
      onZoomChange(e.target.getZoom());
    }
  });

  return null;
};
     
  

const InternalEvents = ({ onMapClick, onMapRightClick, onDragStart }: any) => {
  useMapEvents({
    click: (e) => onMapClick(e.latlng.lat, e.latlng.lng),
    contextmenu: onMapRightClick,
    dragstart: onDragStart
  });
  return null;
};

export const TacticalMap: React.FC<TacticalMapProps> = ({
    center,
    zoom,
    shipPosition,
    shipName,
    navPlan,
    targetDestination,
    currentPath,
    onMapClick,
    onMapRightClick,
    onDragStart,
    isLaylinesActive,
    portLaylinePath,
    isSailSteerWidgetOpen,
    stbdLaylinePath,
    collisionFilter,
    listaCartas,
    cartasActivas,
    twd,
    waypointBearing,
    heading,
    children,
    showWind,
windSpeed,
windDirection,
    marineWeather,
    showWaves = false,
    showCurrent = false,
    encOverlay = null,
    onEncOverlayStatusChange = () => undefined,
    encOverlayStatus = 'ready',
    compact = false
}) => {
  const [mapZoom, setMapZoom] = useState(zoom);
  if (center === null) {
    return <div className="h-full w-full bg-slate-950" />;
  }
  // console.log("HUD Heading:", heading);
  const shipHeading = heading ?? 0;
const shipSize = Math.max(
  12,
  Math.min(
    60,
    mapZoom * 4
  )
);
  
  return (
    <div
  className="relative"
  style={{
    width: '100%',
    height: '100%',
    minHeight: compact ? '100%' : '600px'
  }}
>
      <MapContainer
    center={center}
    zoom={zoom}
    minZoom={compact ? zoom : 4}
    maxZoom={compact ? zoom : 16}
    className="h-full w-full"
    zoomControl={!compact}
    dragging={!compact}
    scrollWheelZoom={!compact}
    doubleClickZoom={!compact}
    touchZoom={!compact}
    boxZoom={!compact}
    keyboard={!compact}
    attributionControl={!compact}
>
        {!compact && (
    <ZoomControl position="topright" />
)}
        <MapUpdater center={center} />
        <ZoomWatcher
  onZoomChange={setMapZoom}
/>     
        
        
        {!compact && (
    <InternalEvents
        onMapClick={onMapClick}
        onMapRightClick={onMapRightClick}
        onDragStart={onDragStart}
    />
)}
        <TileLayer
  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
  attribution="© OpenStreetMap contributors"
/>

{listaCartas?.map(chart =>
  cartasActivas?.[chart.name] ? (
    <TileLayer
      key={chart.name}
      url={`http://localhost:8089/tiles/${chart.name}/{z}/{x}/{y}.png`}
      opacity={1}
    />
  ) : null
)}

{encOverlay && (
  <EncVectorOverlay
    filename={encOverlay.filename}
    bounds={encOverlay.bounds}
    onStatusChange={onEncOverlayStatusChange}
  />
)}

       

{windSpeed !== undefined && windDirection !== undefined && (
<WindLayer
  shipPosition={shipPosition}
  windSpeed={windSpeed}
  windDirection={windDirection}
  visible={showWind === true}
/>
)}

<MarineLayer
  shipPosition={shipPosition}
  marineWeather={marineWeather ?? null}
  showWaves={showWaves}
  showCurrent={showCurrent}
/>

<BoatLayer
  shipPosition={shipPosition}
  heading={shipHeading}
/>

 
{isSailSteerWidgetOpen && twd !== undefined && waypointBearing !== undefined && (
  <SailHUDLayer
  shipPosition={shipPosition}
  heading={shipHeading}
  twd={twd}
  waypointBearing={waypointBearing}
/>
)}

  
        
{currentPath.length > 1 && (
  <Polyline
    positions={currentPath}
    color="#00ffff"
    weight={3}
    opacity={0.8}
  />
)}
        {/*
        {navPlan.targetCoords && shipPosition && (
          <>
            <Polyline positions={[[shipPosition.lat, shipPosition.lng], [navPlan.targetCoords.lat, navPlan.targetCoords.lng]]} color="#00FFFF" weight={2} dashArray="5, 10" opacity={0.8} />
            <Marker position={[navPlan.targetCoords.lat, navPlan.targetCoords.lng]} icon={L.divIcon({ className: 'target-flag-icon', html: '<div class="w-10 h-10 flex flex-col items-center justify-center filter drop-shadow-[0_0_8px_cyan]"><svg viewBox="0 0 24 24" fill="none" stroke="cyan" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-8 h-8 fill-cyan/20"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg></div>', iconSize: [40, 40], iconAnchor: [20, 35] })} />
          </>
        )}
          */}
{navPlan.targetCoords && (
  <Marker
    position={[
      navPlan.targetCoords.lat,
      navPlan.targetCoords.lng
    ]}
    icon={L.divIcon({
      className: 'target-flag-icon',
      html: '...',
      iconSize: [40, 40],
      iconAnchor: [20, 35]
    })}
  />
)}
        {/* Laylines (Task 3) */}
        {isLaylinesActive && portLaylinePath && portLaylinePath.length >= 2 && (
          <Polyline
            positions={portLaylinePath}
            color="#ef4444" // Red for Port
            weight={2}
            dashArray="10, 5"
          />
        )}
        {isLaylinesActive && stbdLaylinePath && stbdLaylinePath.length >= 2 && (
          <Polyline
            positions={stbdLaylinePath}
            color="#22c55e" // Green for Starboard
            weight={2}
            dashArray="10, 5"
          />
        )}

        {currentPath.length > 0 && <Polyline positions={currentPath} color="#3b82f6" weight={3} opacity={0.6} />}
        
        {/*
        {shipPosition && targetDestination && (
  <Polyline
    positions={[
      [shipPosition.lat, shipPosition.lng],
      [targetDestination.lat, targetDestination.lng]
    ]}
    color="#ff00ff"
    weight={3}
    dashArray="6,4"
  />
)}
  */}
        {targetDestination && (
          <Marker position={[targetDestination.lat, targetDestination.lng]} icon={L.divIcon({ className: 'target-dest-icon', html: '<div class="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center border-2 border-white shadow-lg animate-bounce">📍</div>', iconSize: [32, 32], iconAnchor: [16, 32] })}>
            <Popup className="custom-popup">
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 w-56 shadow-2xl text-white">
                <p className="text-xs font-black text-cyan-400 uppercase tracking-widest mb-3 flex items-center gap-2"><NavIcon className="w-3.5 h-3.5" /> Punto Táctico</p>
                <p className="text-[10px] text-slate-500 font-mono">LAT: {targetDestination.lat.toFixed(4)}</p>
                <p className="text-[10px] text-slate-500 font-mono">LNG: {targetDestination.lng.toFixed(4)}</p>
              </div>
            </Popup>
          </Marker>
        )}
{/* AIS Táctico temporalmente deshabilitado */}

{/* Teléfonos vinculados por VELARIS Link: capa propia, separada de la posición del barco */}
<VelarisLinkLayer />
{children}
</MapContainer>
      {encOverlay && (
        <div className="pointer-events-none absolute left-3 top-3 z-[1000] max-w-[min(92%,420px)] rounded-xl border border-amber-400/50 bg-slate-950/95 px-3 py-2 text-amber-100 shadow-xl">
          <p className="text-[10px] font-black uppercase tracking-wide">ENC S-57 · vista de referencia · no usar para navegar</p>
          <p className="mt-1 text-[9px] text-slate-300">
            {encOverlay.filename} · {{
              loading: 'cargando viewport…',
              ready: 'objetos visibles',
              empty: 'sin objetos ENC en esta zona',
              error: 'no se pudo cargar la capa',
              'zoom-in': 'acerca el zoom a menos de 2°'
            }[encOverlayStatus]}
          </p>
        </div>
      )}
    </div>
  );
};

export default TacticalMap;
