import React from 'react';
import { 
  MapContainer, 
  TileLayer, 
  Marker, 
  Polyline, 
  useMapEvents,
  Popup,
  LayersControl,
  ZoomControl
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet-rotatedmarker'; // 👈 Extensión de rotación en Leaflet activada
import { motion } from 'framer-motion';
import { Zap, Wind } from 'lucide-react';
import { WeatherWidget } from './features/weather/components/WeatherWidget';

// 1. Importación de los recursos tácticos
// import barcoPlayerImg from '../assets/icons/barco-player.png';
// import barcoRojoImg from '../assets/icons/barco-rojo.png'; // Descomentar al añadir más assets

// 2. Diccionario indexado de instancias de iconos de Leaflet
const diccionarioIconos: Record<string, L.Icon> = {
  'barco-player.png': L.icon({
    iconUrl: '/barco-tactico.png', // 👈 Ruta absoluta a la carpeta public
    iconSize: [24, 48],            // Proporciones verticales correctas para un velero
    iconAnchor: [12, 24],          // Punto de pivote centrado
    popupAnchor: [0, -24],
    className: 'marcador-navegacion-tactica' // Clase para forzar estilos si hiciera falta
  }),
  // Aquí se registrarán los nuevos marcadores de la flota (rojo, patrullera, etc.)
};

interface MapProps {
  center: [number, number];
  zoom: number;
  weather: any;
  fleet: any[];
  selectedShipId: string | null;
  currentPath: [number, number][];
  plannedPath: [number, number][];
  isTravesiaActive: boolean;
  isEngineOn: boolean;
  onMapClick: (lat: number, lng: number) => void;
  getShipEmoji: (tipo?: string) => string;
}

export const Map: React.FC<MapProps> = ({
  center,
  zoom,
  weather,
  fleet,
  selectedShipId,
  currentPath,
  plannedPath,
  isTravesiaActive,
  isEngineOn,
  onMapClick,
  getShipEmoji
}) => {
  
  const MapClickHandler = () => {
    useMapEvents({
      click: (e) => onMapClick(e.latlng.lat, e.latlng.lng)
    });
    return null;
  };
  // Limpieza de marcadores por defecto de Leaflet para evitar conflictos visuales
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: '/barco-tactico.png', // 👈 Forzamos que incluso el icono por defecto sea tu barco
});

  return (
    <MapContainer center={center} zoom={zoom} className="h-full w-full z-0" zoomControl={false}>
      <ZoomControl position="bottomright" />
      {weather && <WeatherWidget weather={weather} />}
      
      <LayersControl position="topright">
        <LayersControl.BaseLayer checked name="OpenStreetMap">
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        </LayersControl.BaseLayer>
        
        <LayersControl.BaseLayer name="Satélite">
          <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
        </LayersControl.BaseLayer>
        
        <LayersControl.BaseLayer name="Cartas Náuticas CM93">
          <TileLayer 
            url="http://localhost:8080/tiles/{z}/{x}/{y}.png" 
            attribution="Cartografía Vectorial CM93 - Servidor Externo"
            minZoom={3}
            maxZoom={18}
            tms={true}
          />
        </LayersControl.BaseLayer>
      </LayersControl>

      <MapClickHandler />

      {fleet
  .filter(ship => String(ship.id) !== String(selectedShipId))
  .map(ship => {
        const esElBarcoSeleccionado = String(selectedShipId) === String(ship.id);
        
        // Extrae el rumbo magnético o verdadero del buque (por defecto 0° / Norte)
        const rumboActual = ship.rumbo || ship.heading || 0;

        // Vinculación dinámica con la columna 'icono_url' de Supabase
        const nombreIconoDb = ship.icono_url || 'barco-player.png';
        const iconoFinal = diccionarioIconos[nombreIconoDb] || diccionarioIconos['barco-player.png'];
        const markerProps = {
          rotationAngle: rumboActual,
          rotationOrigin: 'center center'
        } as any;

        return (
          <Marker
            key={ship.id}
            position={[ship.lat || 36.8, ship.lng || -2.4]}
            icon={iconoFinal}
            {...markerProps}
            eventHandlers={{
      click: () => {
        if (ship.id) {
          // 🚀 AQUÍ ES DONDE EJECUTAS TU FUNCIÓN PARA CAMBIAR EL BARCO EN EL PANEL
          // Descomenta la línea de abajo y usa el nombre real de tu prop (ej: onSelectShip o setSelectedShipId)
          // onSelectShip(ship.id);
          
          console.log("Cambiando mando táctico al buque:", ship.nombre, ship.id);
        }
      }
    }}
  >
            <Popup>
              <div className="text-slate-800 font-sans p-1 min-w-[160px]">
                <strong className="text-cyan-600 font-bold text-sm block border-b border-slate-100 pb-1 mb-1 uppercase">
                  {getShipEmoji(ship.tipo_barco)} {ship.nombre || 'Buque de la Flota'}
                </strong>
                <div className="text-xs mt-1 text-slate-500 space-y-0.5 font-medium">
                  <p>⛵ <span className="text-slate-400">Tipo:</span> {ship.tipo_barco || 'No especificado'}</p>
                  <p>🧭 <span className="text-slate-400">Rumbo:</span> {rumboActual}°</p>
                  <p>⚓ <span className="text-slate-400">Pos:</span> {ship.lat?.toFixed(4)}, {ship.lng?.toFixed(4)}</p>
                  {esElBarcoSeleccionado && (
                    <span className="inline-block mt-2 text-[9px] bg-cyan-500/10 text-cyan-600 px-2 py-0.5 rounded-md font-bold uppercase tracking-wider">
                      Unidad Bajo Mando
                    </span>
                  )}
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}

      {/* Historial de Estela (Ruta recorrida) */}
      {currentPath && currentPath.length > 0 && (
        <Polyline positions={currentPath} color="#3b82f6" weight={3} opacity={0.6}>
          <Popup>Estela de Navegación</Popup>
        </Polyline>
      )}

      {/* Planificación de Derrota (Loxodrómica / IA) */}
      {plannedPath && plannedPath.length > 0 && (
        <Polyline positions={plannedPath} color="#00FFFF" weight={4} opacity={0.9} dashArray="5, 10">
          <Popup>Ruta Planificada por IA</Popup>
        </Polyline>
      )}

      {/* HUD de Estado de Navegación Activa */}
      {isTravesiaActive && (
        <div className="absolute top-8 left-1/2 -translate-x-1/2 z-[6000]">
          <motion.div 
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="bg-slate-950/90 backdrop-blur-md border border-cyan-500/30 px-6 py-2 rounded-full flex items-center gap-3 shadow-[0_0_30px_rgba(6,182,212,0.2)]"
          >
            <div className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
            {isEngineOn ? <Zap className="w-3. h-3 text-cyan-400" /> : <Wind className="w-3 h-3 text-cyan-400" />}
            <span className="text-[9px] font-black text-white uppercase tracking-[0.2em]">En Navegación</span>
          </motion.div>
        </div>
      )}
    </MapContainer>
  );
};
