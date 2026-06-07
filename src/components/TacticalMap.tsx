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

console.log('TACTICAL MAP ACTIVO');

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
  children?: React.ReactNode;
  
}


const MapUpdater = ({ center }: { center: [number, number] }) => {
  const map = useMap();
  useEffect(() => { map.setView(center); }, [center, map]);
  return null;
};

const ZoomIndicator = () => {
  const [zoom, setZoom] = useState(15);
  const map = useMapEvents({ zoomend: () => setZoom(map.getZoom()) });
  return (
    <div className="absolute bottom-6 right-6 z-[6000] bg-slate-950/80 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-xl flex items-center gap-2 shadow-lg">
      <Gauge className="w-3 h-3 text-cyan-400" />
      <span className="text-[10px] font-black text-white uppercase tracking-widest">Zoom: {zoom}</span>
    </div>
  );
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
  center, zoom, shipPosition, shipName, navPlan, targetDestination, currentPath, onMapClick, onMapRightClick, onDragStart, children
}) => {
  return (
    <div
  style={{
    width: '100%',
    height: '100%',
    minHeight: '600px'
  }}
>
      <MapContainer center={center} zoom={zoom} minZoom={10} maxZoom={16} className="h-full w-full" zoomControl={false}>
        <ZoomControl position="topright" />
        <MapUpdater center={center} />
        <ZoomIndicator />
        <InternalEvents onMapClick={onMapClick} onMapRightClick={onMapRightClick} onDragStart={onDragStart} />
        <TileLayer
  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
  attribution="© OpenStreetMap contributors"
/>

        {shipPosition && (
          <Marker 
            position={[shipPosition.lat, shipPosition.lng]} 
            icon={L.icon({ 
              iconUrl: 'barco-player.png', 
              iconSize: [36, 36], 
              iconAnchor: [18, 18], 
              popupAnchor: [0, -18] 
            })}
          >
            <Popup className="custom-popup">
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 w-48 shadow-2xl text-white">
                <p className="text-xs font-black text-emerald-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Buque Insignia
                </p>
                <p className="text-sm font-bold text-white uppercase tracking-tighter">{shipName}</p>
                <div className="mt-2 pt-2 border-t border-slate-900">
                  <p className="text-[10px] text-slate-500 font-mono">
                    LAT: {shipPosition.lat.toFixed(4)}
                  </p>
                  <p className="text-[10px] text-slate-500 font-mono">
                    LNG: {shipPosition.lng.toFixed(4)}
                  </p>
                </div>
              </div>
            </Popup>
          </Marker>
        )}

        {navPlan.targetCoords && shipPosition && (
          <>
            <Polyline positions={[[shipPosition.lat, shipPosition.lng], [navPlan.targetCoords.lat, navPlan.targetCoords.lng]]} color="#00FFFF" weight={2} dashArray="5, 10" opacity={0.8} />
            <Marker position={[navPlan.targetCoords.lat, navPlan.targetCoords.lng]} icon={L.divIcon({ className: 'target-flag-icon', html: '<div class="w-10 h-10 flex flex-col items-center justify-center filter drop-shadow-[0_0_8px_cyan]"><svg viewBox="0 0 24 24" fill="none" stroke="cyan" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-8 h-8 fill-cyan/20"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg></div>', iconSize: [40, 40], iconAnchor: [20, 35] })} />
          </>
        )}

        {currentPath.length > 0 && <Polyline positions={currentPath} color="#3b82f6" weight={3} opacity={0.6} />}
        
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

        {children}
      </MapContainer>
    </div>
  );
};