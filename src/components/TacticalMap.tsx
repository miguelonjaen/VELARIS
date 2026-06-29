import React, { useState, useEffect } from 'react';
import { 
  MapContainer, 
  TileLayer,
  Marker, 
  Polyline, 
  useMapEvents,
  useMap,
  Popup,
  LayersControl,
  ZoomControl
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Gauge, Navigation as NavIcon } from 'lucide-react';
import { cn } from '@lib/utils';
import OwnShipLayer from './navigation/OwnShipLayer';
import { calculateBearing } from '../navigation/calculateBearing';

if (import.meta.env.DEV) {
  console.log('TACTICAL MAP ACTIVO');
}

interface TacticalMapProps {
  center: [number, number];
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
  listaCartas: any[];
  cartasActivas: Record<string, boolean>;
    
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
    center, zoom, shipPosition, shipName, navPlan, targetDestination, currentPath, onMapClick, onMapRightClick, onDragStart,
  isLaylinesActive, portLaylinePath, stbdLaylinePath, collisionFilter, listaCartas,
  cartasActivas,children
}) => {
  const [mapZoom, setMapZoom] = useState(zoom);
  let shipHeading = 0;

if (shipPosition && currentPath.length > 1) {
  shipHeading = calculateBearing(
    shipPosition,
    {
      lat: currentPath[1][0],
      lng: currentPath[1][1]
    }
  );
}
const shipSize = Math.max(
  12,
  Math.min(
    60,
    mapZoom * 4
  )
);
  
  return (
    <div
  style={{
    width: '100%',
    height: '100%',
    minHeight: '600px'
  }}
>
      <MapContainer center={center} zoom={zoom} minZoom={4} maxZoom={16} className="h-full w-full" zoomControl={false}>
        <ZoomControl position="topright" />
        <MapUpdater center={center} />
        <ZoomWatcher
  onZoomChange={setMapZoom}
/>     
        
        
        <InternalEvents onMapClick={onMapClick} onMapRightClick={onMapRightClick} onDragStart={onDragStart} />
        <TileLayer
  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
  attribution="© OpenStreetMap contributors"
/>

{listaCartas?.map(chart =>
  cartasActivas?.[chart.name] ? (
    <TileLayer
      key={chart.name}
      url={`http://localhost:8089/tiles/${chart.name}/{z}/{x}/{y}`}
      opacity={1}
    />
  ) : null
)}

       <OwnShipLayer
  shipPosition={shipPosition}
  shipName={shipName}
  heading={shipHeading}
  iconSize={shipSize}
/>
        
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

{children}
</MapContainer>
    </div>
  );
};

export default TacticalMap;