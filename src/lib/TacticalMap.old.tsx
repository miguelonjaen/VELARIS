import React, { useEffect, useState } from 'react';
import { 
  MapContainer, 
  TileLayer, 
  Marker,
  Polyline, 
  useMapEvents,
  useMap,
  Popup,
  Circle,
  LayersControl,
  ZoomControl
} from 'react-leaflet';
import L from 'leaflet';
import { 
  Navigation, 
  Compass, 
  Zap, 
  Settings,
  AlertTriangle,
  Sun,
  LifeBuoy,
  Gauge,
  Target,
} from 'lucide-react';
import { MBTileLayer } from '../components/MBTileLayer';
import { ShipData, UserProfile } from '@/shared/types';
import { cn } from './utils';
import { calculateVMG, calculateVesselPerformance } from './polarEngine';
export const MBTILES_ZONES = [
  { id: 'portimao-gibraltar', name: 'Portimao - Gibraltar', center: [36.5, -6.5] as [number, number], zoom: 9, file: '/mapas/portimao-gibraltar.mbtiles' },
  { id: 'tarifa-almeria', name: 'Tarifa - Almería', center: [36.75, -3.52] as [number, number], zoom: 12, file: '/mapas/tarifa-almeria.mbtiles' },
  { id: 'almeria-valencia', name: 'Almería - Valencia', center: [38.1, -1.2] as [number, number], zoom: 9, file: '/mapas/almeria-valencia.mbtiles' },
  { id: 'baleares', name: 'Baleares', center: [39.2, 2.8] as [number, number], zoom: 10, file: '/mapas/baleares.mbtiles' },
  { id: 'andalucia', name: 'Andalucía', center: [36.7, -4.5] as [number, number], zoom: 8, file: '/mapas/andalucia.mbtiles' },
  { id: 'andaluciaoccidental', name: 'Andalucía Occ.', center: [36.5, -6.2] as [number, number], zoom: 9, file: '/mapas/andaluciaoccidental.mbtiles' },
];

const MapUpdater = ({ center, zoom }: { center: [number, number], zoom?: number }) => {
  const map = useMapEvents({});
  useEffect(() => {
    if (!map) return;
    try {
      map.setView(center, zoom || map.getZoom());
    } catch (err) {
      console.warn('[Tactical] Fallo al actualizar vista:', err);
    }
  }, [center, zoom, map]);
  return null;
};

const ZoomIndicator = () => {
  const [zoom, setZoom] = useState(15);
  const map = useMapEvents({
    zoomend: () => setZoom(map.getZoom()),
  });
  return (
    <div className="absolute bottom-6 right-6 z-[6000] bg-slate-950/80 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-xl flex items-center gap-2 shadow-lg">
      <Gauge className="w-3 h-3 text-cyan-400" />
      <span className="text-[10px] font-black text-white uppercase tracking-widest">Zoom: {zoom}</span>
    </div>
  );
};

const MapBoundsHandler = ({ path, showControl, showSystems }: { path: [number, number][], showControl: boolean, showSystems: boolean }) => {
  const map = useMap();
  useEffect(() => {
    setTimeout(() => map.invalidateSize(), 300);
  }, [showControl, showSystems, map]);

  useEffect(() => {
    if (path && path.length >= 2) {
      try {
        const bounds = L.latLngBounds(path);
        const paddingLeft = showControl ? 380 : 80;
        const paddingRight = showSystems ? 480 : 80;
        map.fitBounds(bounds, { 
          paddingTopLeft: [paddingLeft, 100], 
          paddingBottomRight: [paddingRight, 100], 
          maxZoom: 16 
        });
      } catch (err) { console.warn('MapBoundsHandler Error:', err); }
    }
  }, [path, map, showControl, showSystems]);
  return null;
};

interface MapEventsHandlerProps {
  showShipForm: boolean;
  activeTab: string;
  setNewShip: React.Dispatch<React.SetStateAction<any>>;
  setAdvisorMessage: (val: string) => void;
  setDestination: (val: any) => void;
  setNavigationDestination: (val: string) => void;
  navPlan: any;
  handleMapRightClick: (e: any) => void;
}

const MapEventsHandler: React.FC<MapEventsHandlerProps> = ({ 
  showShipForm, 
  activeTab, 
  setNewShip, 
  setAdvisorMessage, 
  setDestination, 
  setNavigationDestination, 
  navPlan, 
  handleMapRightClick 
}) => {
  useMapEvents({
    click: (e) => {
      if (showShipForm && activeTab === 'fleet') {
        setNewShip((prev: any) => ({ ...prev, lat: e.latlng.lat, lng: e.latlng.lng }));
        setAdvisorMessage(`Coordenadas fijadas: ${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`);
      } else {
        setDestination({ lat: e.latlng.lat, lng: e.latlng.lng });
        setAdvisorMessage(`Destino fijado: ${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`);
        if (!navPlan?.targetCoords) {
          setNavigationDestination(`${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`);
        }
      }
    },
    contextmenu: handleMapRightClick
  });
  return null;
};

const WindOverlay = ({ center, windDir, windSpeed }: { center: [number, number], windDir: number, windSpeed: number }) => {
  // Generamos una malla de 5x5 puntos alrededor del centro
  const points: [number, number][] = [];
  for (let i = -2; i <= 2; i++) {
    for (let j = -2; j <= 2; j++) {
      points.push([center[0] + i * 0.05, center[1] + j * 0.05]);
    }
  }

  // Color según escala Beaufort simplificada
  const getWindColor = (s: number) => {
    if (s < 10) return '#60a5fa'; // Azul flojo
    if (s < 18) return '#4ade80'; // Verde
    if (s < 25) return '#fbbf24'; // Amarillo
    return '#ef4444'; // Rojo fuerte
  };

  return (
    <>
      {points.map((p, idx) => (
        <Marker 
          key={`wind-${idx}`} 
          position={p} 
          interactive={false}
          icon={L.divIcon({
            className: 'wind-arrow-icon',
            html: `<div style="transform: rotate(${windDir}deg); color: ${getWindColor(windSpeed)}; opacity: 0.6;">
                     <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
                   </div>`,
            iconSize: [20, 20]
          })}
        />
      ))}
    </>
  );
};

const TacticalHUD = ({ sog, cog, windSpeed, windDir }: { sog: number, cog: number, windSpeed: number, windDir: number }) => {
  const twa = Math.abs(((cog - windDir + 180 + 360) % 360) - 180);
  const vmg = calculateVMG(sog, twa);

  const perf = calculateVesselPerformance({
    sog, cog, windSpeed, windDir
  });

  const percentage = (perf.ratio * 100).toFixed(0);
  const colorClass = perf.ratio > 0.9 ? 'text-emerald-400' : perf.ratio > 0.75 ? 'text-amber-400' : 'text-red-400';

  return (
    <div className="absolute bottom-24 left-6 z-[6000] bg-slate-950/90 backdrop-blur-md border border-white/10 p-4 rounded-2xl flex flex-col gap-1 shadow-2xl min-w-[150px]">
      <div className="flex justify-between items-center gap-4">
        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Rendimiento</span>
        <span className={cn("text-xs font-black", colorClass)}>{percentage}%</span>
      </div>
      <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden mt-1">
        <div 
          className={cn("h-full transition-all duration-1000", perf.ratio > 0.9 ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : perf.ratio > 0.75 ? 'bg-amber-500' : 'bg-red-500')}
          style={{ width: `${Math.min(perf.ratio * 100, 100)}%` }}
        />
      </div>
      <div className="flex justify-between items-center mt-2 pt-2 border-t border-white/5">
        <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">VMG (Viento)</span>
        <span className="text-[10px] font-mono text-white font-bold">{vmg.toFixed(1)} <span className="text-[7px] text-slate-500 uppercase">kt</span></span>
      </div>
      <div className="flex justify-between items-center mt-2 pt-2 border-t border-white/5">
        <span className="text-[8px] font-bold text-slate-500 uppercase">Target Polar</span>
        <span className="text-[10px] font-mono text-cyan-400 font-bold">{perf.targetSpeed.toFixed(1)} <span className="text-[7px] text-slate-500 uppercase">kt</span></span>
      </div>
    </div>
  );
};

interface TacticalMapProps {
  mapCenter: [number, number];
  chartMode: 'standard' | 'mbtiles';
  mbtileIndex: number;
  shipPosition: { lat: number; lng: number } | null;
  fleet: ShipData[];
  selectedShip: ShipData | null;
  navPlan: any;
  rutaActiva: [number, number][];
  currentPath: [number, number][];
  // Telemetría para el HUD táctico
  windSpeed?: number;
  windDir?: number;
  sog?: number;
  // Estados de capas
  aisTargets?: any[];
  showAIS?: boolean;
  showWind?: boolean;
  collisionFilter?: boolean;
  targetDestination: { lat: number; lng: number } | null;
  userProfile: UserProfile | null;
  navigationDestination: string;
  listaCartas: { name: string; bounds?: number[] }[];
  cartasActivas: Record<string, boolean>;
  cartasOpacity?: Record<string, number>;
  setCartasOpacity?: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  toggleCarta?: (name: string) => void;
  showControl: boolean;
  showSystems: boolean;
  activeTab: string;
  showShipForm: boolean;
  isTravesiaActive: boolean;
  mobActive: boolean;
  lightsOn: boolean;
  setNewShip: React.Dispatch<React.SetStateAction<any>>;
  setDestination: (val: any) => void;
  setAdvisorMessage: (val: string) => void;
  setNavigationDestination: (val: string) => void;
  setTargetDestination: (val: any) => void;
  handleMapRightClick: (e: any) => void;
  setShowControl: (val: boolean) => void;
  setShowSystems: (val: boolean) => void;
  setShowSafetyModal: (val: boolean) => void;
  handleEndTravesia: () => void;
  handleMOB: () => void;
  handleToggleLights: () => void;
  setActiveTab: (val: any) => void;
  getShipIcon: (tipo?: string, size?: string) => React.ReactNode;
  getShipEmoji: (tipo?: string) => string;
  getDefaultShipImage: (tipo?: string) => string;
  handleNavigateToDestination: (coords: { lat: number; lng: number }) => Promise<void>;
  setLayersState: React.Dispatch<React.SetStateAction<any>>;
  suggestedPath?: [number, number][];
}

export const TacticalMap: React.FC<TacticalMapProps> = (props) => {
  const { 
    mapCenter, chartMode, mbtileIndex, shipPosition, fleet, selectedShip, 
    navPlan, rutaActiva, currentPath, targetDestination, userProfile, 
    windSpeed = 0, windDir = 0, sog = 0, aisTargets = [], 
    listaCartas, cartasActivas, cartasOpacity = {}, setCartasOpacity, 
    showAIS = true, showWind = false, collisionFilter = false,
    navigationDestination, showControl, showSystems, 
    activeTab, showShipForm, isTravesiaActive, mobActive, lightsOn,
    setNewShip, setDestination, setAdvisorMessage, setNavigationDestination, 
    setTargetDestination, handleMapRightClick, setShowControl, setShowSystems, 
    setShowSafetyModal, handleEndTravesia, handleMOB, handleToggleLights, 
    setActiveTab, getShipIcon, getShipEmoji, getDefaultShipImage, handleNavigateToDestination,
    setLayersState, suggestedPath
  } = props;

  // Filtrar objetivos según el filtro de colisión
  const displayedAis = collisionFilter ? aisTargets.filter(t => t.isCollisionRisk) : aisTargets;
  const hasCollisionRisk = aisTargets.some(t => t.isCollisionRisk);

  // Estado para capturar la instancia del mapa
  const [map, setMap] = useState<L.Map | null>(null);

  const centerOnChart = (bounds?: number[]) => {
    if (!map || !bounds) return;
    try {
      // Convertimos [minLon, minLat, maxLon, maxLat] a Leaflet LatLngBounds
      const leafletBounds = L.latLngBounds([
        [bounds[1], bounds[0]], 
        [bounds[3], bounds[2]]
      ]);
      map.fitBounds(leafletBounds, { padding: [50, 50], maxZoom: 15 });
    } catch (e) { console.error("Error al centrar mapa:", e); }
  };

  return (
    <div className="relative flex-1 bg-slate-950 select-none overflow-hidden">
      {/* 🗺️ PANEL DE CARTOGRAFÍA MARINA LOCAL */}
      <div className="absolute top-24 left-24 z-[6000] w-64 bg-slate-900/80 backdrop-blur-md border border-white/10 p-4 rounded-3xl shadow-2xl flex flex-col gap-4">
        <p className="text-[10px] font-black text-white uppercase tracking-widest border-b border-white/5 pb-2">Cartografía Local</p>
        <div className="max-h-64 overflow-y-auto custom-scrollbar space-y-4 pr-1">
          {listaCartas.map(chart => (
            <div key={chart.name} className="space-y-2 bg-white/5 p-2 rounded-xl border border-white/5">
              <label className="flex items-center justify-between cursor-pointer group">
                <span className="text-[9px] font-bold text-slate-300 group-hover:text-cyan-400 transition-colors truncate max-w-[120px]">{chart.name}</span>
                <div className="flex items-center gap-2">
                  {chart.bounds && (
                    <button 
                      onClick={(e) => { e.preventDefault(); centerOnChart(chart.bounds); }}
                      className="p-1 hover:bg-cyan-500/20 rounded-md text-slate-500 hover:text-cyan-400 transition-all"
                      title="Centrar en mapa"
                    >
                      <Target size={12} />
                    </button>
                  )}
                  <input 
                    type="checkbox" checked={cartasActivas[chart.name]} 
                    onChange={() => props.toggleCarta?.(chart.name)}
                    className="w-3 h-3 rounded bg-slate-800 border-white/10 text-cyan-600 focus:ring-0"
                  />
                </div>
              </label>
              {cartasActivas[chart.name] && (
                <div className="px-1">
                  <div className="flex justify-between text-[7px] text-slate-500 uppercase font-black mb-1">
                    <span>Opacidad</span>
                    <span>{Math.round((cartasOpacity[chart.name] || 0.8) * 100)}%</span>
                  </div>
                  <input 
                    type="range" min="0" max="1" step="0.05"
                    value={cartasOpacity[chart.name] || 0.8}
                    onChange={(e) => setCartasOpacity?.(prev => ({ ...prev, [chart.name]: parseFloat(e.target.value) }))}
                    className="w-full h-1 bg-slate-800 rounded-full appearance-none accent-cyan-500 cursor-pointer"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Capas y Filtros Flotantes */}
      <div className="absolute top-24 right-6 z-[6000] bg-slate-900/80 backdrop-blur-md border border-white/10 p-3 rounded-2xl shadow-2xl flex flex-col gap-3">
        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Capas Inteligentes</p>
        <label className="flex items-center gap-3 cursor-pointer group">
          <input type="checkbox" checked={showAIS} onChange={(e) => setLayersState({ showAIS: e.target.checked })} className="sr-only peer" />
          <div className="w-8 h-4 bg-slate-700 rounded-full peer peer-checked:bg-cyan-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:after:translate-x-4"></div>
          <span className="text-[10px] font-bold text-slate-300 group-hover:text-white uppercase">AIS</span>
        </label>
        <label className="flex items-center gap-3 cursor-pointer group">
          <input type="checkbox" checked={showWind} onChange={(e) => setLayersState({ showWind: e.target.checked })} className="sr-only peer" />
          <div className="w-8 h-4 bg-slate-700 rounded-full peer peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:after:translate-x-4"></div>
          <span className="text-[10px] font-bold text-slate-300 group-hover:text-white uppercase">Viento</span>
        </label>
        <div className="h-px bg-white/5 my-1" />
        <label className="flex items-center gap-3 cursor-pointer group">
          <input type="checkbox" checked={collisionFilter} onChange={(e) => setLayersState({ collisionFilter: e.target.checked })} className="sr-only peer" />
          <div className="w-8 h-4 bg-slate-700 rounded-full peer peer-checked:bg-red-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:after:translate-x-4"></div>
          <span className="text-[10px] font-bold text-slate-300 group-hover:text-white uppercase">Alerta CPA</span>
        </label>
      </div>

      {isTravesiaActive && <TacticalHUD sog={sog} cog={selectedShip?.cog || 0} windSpeed={windSpeed} windDir={windDir} />}
      
        <MapContainer 
        center={mapCenter} 
        zoom={15} 
        minZoom={3} 
        maxZoom={16} 
        className="h-full w-full" 
        zoomControl={false}
        ref={setMap}
      >
        <ZoomControl position="topright" />
        <MapUpdater center={mapCenter} zoom={chartMode === 'mbtiles' ? MBTILES_ZONES[mbtileIndex].zoom : undefined} />
        <ZoomIndicator />
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked={chartMode === 'standard'} name="OpenStreetMap">
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Satélite">
            <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
          </LayersControl.BaseLayer>
        </LayersControl>

        {/* 🗺️ RENDERIZADO DINÁMICO DE CARTAS MBTILES */}
        {listaCartas.map((chart) => cartasActivas[chart.name] && (
          <TileLayer 
            key={chart.name}
            url={`http://localhost:8089/tiles/${chart.name}/{z}/{x}/{y}.png`}
            attribution="SmartShip PRO MBTiles Engine"
            zIndex={100}
            maxZoom={18}
            opacity={cartasOpacity[chart.name] || 0.8}
          />
        ))}

        {/* Capa de Enrutamiento Táctico sugerido (Bordos en ceñida) */}
        {isTravesiaActive && suggestedPath && suggestedPath.length > 0 && (
          <Polyline 
            positions={suggestedPath}
            pathOptions={{ color: '#4ade80', weight: 3, dashArray: '10, 10', opacity: 0.8 }}
          />
        )}

        {showWind && <WindOverlay center={mapCenter} windDir={windDir} windSpeed={windSpeed} />}

        {showAIS && displayedAis.map(target => (
          <Marker 
            key={target.mmsi}
            position={[target.lat, target.lng]}
            icon={L.divIcon({
              className: `ais-target-${target.mmsi}`,
              html: `<div class="relative ${target.isCollisionRisk ? 'animate-pulse' : ''}">
                       <svg width="24" height="24" viewBox="0 0 24 24" style="transform: rotate(${target.cog}deg); fill: ${target.isCollisionRisk ? '#ef4444' : '#fbbf24'}; stroke: #000; stroke-width: 1;">
                         <path d="M12 2L4 21L12 17L20 21L12 2Z"/>
                       </svg>
                     </div>`,
              iconSize: [24, 24],
              iconAnchor: [12, 12]
            })}
          >
            <Popup className="custom-popup">
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 w-48 text-white shadow-2xl">
                <div className="flex justify-between items-start mb-2 border-b border-white/10 pb-2">
                  <div>
                    <h4 className="text-xs font-black uppercase text-cyan-400 leading-none">{target.nombre}</h4>
                    <p className="text-[8px] text-slate-500 font-mono mt-1">MMSI: {target.mmsi}</p>
                  </div>
                  <span className={cn("text-[7px] font-bold px-1 rounded uppercase", target.status === 'Navegando' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-500/20 text-slate-400')}>
                    {target.status}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div>
                    <p className="text-[7px] text-slate-500 uppercase font-bold">COG / SOG</p>
                    <p className="text-[10px] font-mono font-black">{target.cog}° / {target.sog}kt</p>
                  </div>
                  <div>
                    <p className="text-[7px] text-slate-500 uppercase font-bold">Tipo</p>
                    <p className="text-[10px] font-black">{target.tipo}</p>
                  </div>
                </div>
                {target.cpa !== undefined && (
                  <div className={cn("mt-2 p-1.5 rounded-lg text-center", target.isCollisionRisk ? "bg-red-500/20 border border-red-500/30" : "bg-white/5")}>
                    <p className="text-[7px] uppercase font-black text-slate-400">Punto Máx. Aproximación</p>
                    <p className={cn("text-xs font-mono font-black", target.isCollisionRisk ? "text-red-400" : "text-emerald-400")}>
                      {target.cpa.toFixed(0)}m / {target.tcpa?.toFixed(1)} min
                    </p>
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        ))}

        {chartMode === 'mbtiles' && userProfile?.plan_tactico !== 'basico' && (
          <MBTileLayer url={MBTILES_ZONES[mbtileIndex].file} name={MBTILES_ZONES[mbtileIndex].name} plan_tactico={userProfile?.plan_tactico} navigationDestination={navigationDestination} shipPosition={shipPosition} />
        )}
        
        <MapEventsHandler 
          showShipForm={showShipForm}
          activeTab={activeTab}
          setNewShip={setNewShip}
          setAdvisorMessage={setAdvisorMessage}
          setDestination={setDestination}
          setNavigationDestination={setNavigationDestination}
          navPlan={navPlan}
          handleMapRightClick={handleMapRightClick}
        />

        {navPlan.targetCoords && (
          <>
            <Polyline positions={[[shipPosition?.lat || 36.7215, shipPosition?.lng || -3.5235], [navPlan.targetCoords.lat, navPlan.targetCoords.lng]]} color="#00FFFF" weight={2} dashArray="5, 10" opacity={0.8} />
            <Marker position={[navPlan.targetCoords.lat, navPlan.targetCoords.lng]} icon={L.divIcon({
              className: 'target-flag-icon',
              html: `<div class="w-10 h-10 flex flex-col items-center justify-center filter drop-shadow-[0_0_8px_cyan]">
                <svg viewBox="0 0 24 24" fill="none" stroke="cyan" stroke-width="2.5" class="w-8 h-8 fill-cyan/20"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg>
                <div class="px-2 py-0.5 bg-black/80 border border-cyan-500/50 rounded-full -mt-1 scale-75"><p class="text-[8px] font-black text-cyan-400 uppercase">${navPlan.targetName}</p></div>
              </div>`,
              iconSize: [40, 40], iconAnchor: [20, 35]
            })} />
          </>
        )}

        {rutaActiva.length >= 2 && (
          <>
            <MapBoundsHandler path={rutaActiva} showControl={showControl} showSystems={showSystems} />
            <Polyline positions={rutaActiva} color="#FF8C00" weight={5} opacity={0.9} />
          </>
        )}
        
        {currentPath.length > 0 && <Polyline positions={currentPath} color="#3b82f6" weight={3} opacity={0.6} />}

        {fleet.map(ship => (
          <Marker key={ship.id} position={[ship.lat || 36.7215, ship.lng || -3.5235]} icon={L.icon({
            iconUrl: 'barco-player.png', iconSize: [25, 50], iconAnchor: [12.5, 25], popupAnchor: [0, -25], className: 'ship-tactical-render'
          })}>
            <Popup className="custom-popup">
              <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden p-0 w-56 shadow-2xl">
                <div className="relative h-28">
                  <img src={ship.foto_url || getDefaultShipImage(ship.tipo_barco)} className="w-full h-full object-cover" />
                  <div className="absolute top-2 left-2 bg-slate-950/90 backdrop-blur-md p-1.5 rounded-xl border border-slate-800 flex items-center gap-2">
                    {getShipIcon(ship.tipo_barco, "w-3.5 h-3.5")}
                    <span className="text-[8px] font-black text-white uppercase tracking-widest">{ship.tipo_barco}</span>
                  </div>
                </div>
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{getShipEmoji(ship.tipo_barco)}</span>
                    <p className="text-sm font-black text-white uppercase truncate">{ship.nombre || 'Sin Nombre'}</p>
                  </div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase">{ship.marca} {ship.modelo}</p>
                  <div className="mt-3 pt-3 border-t border-slate-900 flex justify-between items-center">
                    <p className="text-[8px] font-black text-cyan-500 uppercase">{ship.matricula}</p>
                    <div className="flex gap-2 items-center"><div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /><span className="text-[8px] font-bold text-slate-400 uppercase">Sistemas OK</span></div>
                  </div>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        {targetDestination && (
          <Marker position={[targetDestination.lat, targetDestination.lng]} icon={L.divIcon({
            className: 'target-dest-icon',
            html: `<div class="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center border-2 border-white shadow-lg animate-bounce"><span class="text-white text-xs">📍</span></div>`,
            iconSize: [32, 32], iconAnchor: [16, 32]
          })}>
            <Popup className="custom-popup">
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 w-56 shadow-2xl">
                <p className="text-xs font-black text-cyan-400 uppercase mb-3 flex items-center gap-2"><Navigation className="w-3.5 h-3.5" /> Objetivo Táctico</p>
                <div className="space-y-1 mb-4">
                  <p className="text-[10px] text-slate-500 font-mono">LAT: {targetDestination.lat.toFixed(4)}</p>
                  <p className="text-[10px] text-slate-500 font-mono">LNG: {targetDestination.lng.toFixed(4)}</p>
                </div>
                <button onClick={() => handleNavigateToDestination(targetDestination)} className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white text-[10px] font-black uppercase rounded-xl transition-all flex items-center justify-center gap-2">
                  <Compass className="w-3.5 h-3.5" /> Navegar aquí
                </button>
              </div>
            </Popup>
          </Marker>
        )}

        {shipPosition && (
          <>
            <Circle 
              center={[shipPosition.lat, shipPosition.lng]} 
              radius={500} 
              pathOptions={{ 
                color: hasCollisionRisk ? '#ef4444' : '#06b6d4', 
                fillColor: hasCollisionRisk ? '#ef4444' : '#06b6d4', 
                fillOpacity: 0.1, 
                weight: 1, 
                dashArray: '5, 10' 
              }} 
            />
          <Marker key="buque-insignia-unico" position={[shipPosition.lat, shipPosition.lng]} icon={L.icon({
            iconUrl: 'barco-player.png', iconSize: [36, 36], iconAnchor: [18, 18], popupAnchor: [0, -18]
          })}>
            <Popup className="custom-popup">
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 w-48 shadow-2xl">
                <p className="text-xs font-black text-emerald-400 uppercase mb-2 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Buque Insignia</p>
                <p className="text-sm font-bold text-white uppercase">{selectedShip?.nombre || 'Buque Activo'}</p>
                <div className="mt-2 pt-2 border-t border-slate-900">
                  <p className="text-[10px] text-slate-500 font-mono">LAT: {shipPosition.lat.toFixed(4)}</p>
                  <p className="text-[10px] text-slate-500 font-mono">LNG: {shipPosition.lng.toFixed(4)}</p>
                </div>
              </div>
            </Popup>
          </Marker>
          </>
        )}
      </MapContainer>

      <div className="absolute right-4 top-1/2 -translate-y-1/2 z-[500] flex flex-col gap-3">
        <button onClick={() => setShowControl(!showControl)} className={cn(
          "w-14 h-24 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all border border-white/10 shadow-2xl backdrop-blur-md group overflow-hidden relative",
          showControl ? "bg-emerald-600 text-white" : "bg-cyan-600 text-white hover:bg-cyan-500"
        )}>
          <Navigation className={cn("w-6 h-6", isTravesiaActive ? "animate-pulse" : "")} />
          <span className="text-[7px] font-black uppercase tracking-[0.2em] leading-tight text-center px-1">HUB</span>
        </button>

        <button onClick={() => setShowSystems(!showSystems)} className={cn(
          "w-14 h-14 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all border border-white/10 shadow-2xl backdrop-blur-md",
          showSystems ? "bg-amber-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"
        )}>
          <Settings className="w-5 h-5 text-amber-400 animate-pulse" />
          <span className="text-[8px] font-black uppercase tracking-[0.1em] text-center">COMMAND</span>
        </button>

        {!isTravesiaActive ? (
          <button onClick={() => setShowSafetyModal(true)} className="w-14 h-14 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all border border-emerald-500/30 bg-emerald-600 text-white shadow-2xl backdrop-blur-md hover:bg-emerald-500 group overflow-hidden relative">
            <Navigation className="w-5 h-5 animate-pulse" />
            <span className="text-[8px] font-black uppercase tracking-widest text-center">TRAVESÍA</span>
          </button>
        ) : (
          <button onClick={handleEndTravesia} className="w-14 h-14 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all border border-red-500/30 bg-red-600 text-white shadow-2xl backdrop-blur-md hover:bg-red-500 group overflow-hidden relative">
            <AlertTriangle className="w-5 h-5" />
            <span className="text-[8px] font-black uppercase tracking-widest text-center">ARRIBAR</span>
          </button>
        )}

        {[
          { id: 'logbook', icon: Navigation, label: 'Bitácora', color: 'bg-slate-800', active: activeTab === 'logbook', onClick: () => setActiveTab('logbook') },
          { id: 'mob', icon: LifeBuoy, label: 'MOB', color: 'bg-red-600', active: mobActive, onClick: handleMOB },
          { id: 'lights', icon: Sun, label: 'Luces', color: 'bg-slate-800', active: lightsOn, onClick: handleToggleLights }
        ].map(btn => (
          <button key={btn.id} onClick={btn.onClick} className={cn(
            "w-14 h-14 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all border border-white/10 shadow-2xl backdrop-blur-md",
            btn.active ? "bg-cyan-600 text-white" : `${btn.color} text-slate-400 hover:text-white`
          )}>
            <btn.icon className="w-5 h-5" />
            <span className="text-[8px] font-black uppercase tracking-widest text-center">{btn.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};