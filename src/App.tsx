import React, { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from 'react';
import {
  TileLayer,
  Marker,
  Polyline,
  useMap,
  useMapEvents,
  Popup,
  Circle,
  LayersControl,
  ZoomControl
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Ship,
  Wind,
  Navigation,
  LogOut,
  Plus,
  Wrench,
  Box,
  Search,
  Zap,
  ShieldAlert,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Volume2,
  Moon,
  Compass,
  LayoutDashboard,
  BookOpen,
  LifeBuoy,
  Target,
  Activity,
  Flag,
  Menu,
  X,
  AlertTriangle,
  Sun,
  Anchor,
  Loader2,
  Camera,
  User,
  Globe,
  MapPin,
  Phone,
  Heart,
  Fuel,
  DollarSign,
  Book,
  Waves,
  Thermometer,
  ArrowUp,
  ArrowRight,
  Droplets,
  Cloud,
  Eye,
  Trash2,
  CheckCircle2,
  Circle as CircleIcon,
  FileText,
  ShieldCheck,
  Radio,
  Clock,
  History,
  Gauge,
  Settings,
  Send,
  Terminal,
  Command
} from 'lucide-react';
import { callGemini } from './lib/gemini';
import { NAV_TOOLS } from './lib/tools';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { supabase } from './supabaseClient';
import { userRepository, vesselRepository, logRepository } from './lib/supabaseRepository';
import { db, auth, onAuthStateChanged, collection, query, orderBy, onSnapshot, addDoc, serverTimestamp } from './firebase';
import { getTripLogger, TripLogger } from './lib/tripLogger';
import { useNavigationCore } from '../useNavigationCore';
import { TacticalTerminal } from './components/TacticalTerminal';
import { useSmartShield } from './useSmartShield';
import { useAIS } from './lib/useAIS';
import { useTacticalRouting } from './useTacticalRouting';
import { useTacticalAdvisor } from './hooks/useTacticalAdvisor';
import { CommandSidebar } from './components/CommandSidebar';
import { calculateDistanceNM, cn } from '@lib/utils';
import { enrichAisTarget, VesselVector } from './lib/ais';
import {
  createInitialSensorQualityMap,
  getOverallSensorConfidence,
  markSensorUpdated,
  refreshSensorQualityMap,
  SensorId
} from './lib/sensorQuality';
import { calculateLaylineDeviation, calculateAnchorDrift, calculateETA } from '@lib/laylineCalculator';
import { GPXRoute, GPXWaypoint } from './lib/gpxParser';
import { UserProfile, ShipData, LogEntry, VesselStatus, WeatherResponse, ProcessedWeather, InventoryItem, SmartshipAlarm, SecurityThresholds, AlarmSeverity } from '@/shared/types';
// ... (rest of imports remains same, just fixing firebase ones)
import AuthScreen from './components/AuthScreen';
import TestSubidaFoto from './components/TestSubidaFoto';
import { ControlCenter } from './components/ControlCenter';
import Logbook from './components/Logbook';
import FleetManager from './components/FleetManager';
import AdminPanel from './components/AdminPanel';
import ProfileEditor from './components/ProfileEditor';
import SafetyModal from './components/SafetyModal';
import { translations, Language } from './i18n';
import { TacticalAdvisorPanel, TacticalAdvisorToggle } from './components/TacticalAdvisorPanel';
import PanelAlmirantazgo from './components/PanelAlmirantazgo';
import { MBTileLayer } from './components/MBTileLayer';
import { TacticalMap } from './components/TacticalMap';
import { NavigationDashboard } from './components/NavigationDashboard';
import { FleetLayer } from './components/FleetLayer';
import { WeatherLayer } from './WeatherLayer';
import { ConfigurationPanel } from './components/ConfigurationPanel';
import { StatusBar } from "./components/layout/StatusBar";
import { ZeusSidebar } from "./components/layout/ZeusSidebar";
import { TacticalHUD } from './components/TacticalHUD'; // Asegúrate de que TacticalHUD esté importado
import { Zeus3SChartplotterOverlay } from './components/Zeus3SChartplotterOverlay';
import { calculateSwingRadius, analyzeAnchorTrend, formatAnchorLog } from './lib/anchorManager';
import { WatchdogPanel } from './components/WatchdogPanel';
import { AlarmToasts } from './components/AlarmToasts';
import ErrorBoundary from './components/ErrorBoundary';
import InventoryManager from './components/InventoryManager';
import packageJson from '../package.json';
import { releases } from './content/releases';
import { ChangelogModal } from './components/ChangelogModal';
import SailSteerWidget from './components/SailSteerWidget';
import { getUpwindAngle } from './components/utils/polar';
import { AISStreamService } from './services/aisStreamService';
import { app } from "@/application";
import { updateRealSensors } from "@/telemetry/helpers/SensorQualityUpdater";


const Vademecum = lazy(() => import('./components/Vademecum'));

declare global {
  interface Window {
    smartshipAPI: any;
  }
}

// Componente Táctico para auto-centrado de cartas
const ChartCenteringHandler = ({ charts }: { charts: any[] }) => {
  const map = useMap();

  useEffect(() => {
    const onOverlayAdd = (e: any) => {
      //console.log(`⚓ Capa seleccionada en el puente: ${e.name}`); // Para ver el nombre exacto en consola

      // 1. Limpiamos el nombre de la capa que viene del click para comparar de forma flexible
      // Quitamos la palabra "Carta:", espacios y lo pasamos a minúsculas
      console.log('AIS API:', import.meta.env.VITE_AISSTREAM_API_KEY);
      console.log(`⚓ Capa seleccionada en el puente: ${e.name}`);
      const cleanEventName = e.name.replace(/carta:/i, '').trim().toLowerCase();

      // 2. Buscamos la carta en tu array de datos
      const chart = charts.find((c: any) => {
        const cleanChartName = c.name.replace('.mbtiles', '').trim().toLowerCase();
        return cleanChartName === cleanEventName || cleanEventName.includes(cleanChartName);
      });

      if (chart && chart.bounds) {
        // Convertimos las esquinas a números por seguridad
        const minLon = parseFloat(chart.bounds[0]);
        const minLat = parseFloat(chart.bounds[1]);
        const maxLon = parseFloat(chart.bounds[2]);
        const maxLat = parseFloat(chart.bounds[3]);

        if (!isNaN(minLat) && !isNaN(minLon) && !isNaN(maxLat) && !isNaN(maxLon)) {
          console.log(`🗺️ [ÉXITO] Saltando a los límites de la carta local: ${chart.name}`);

          // 3. Forzamos el encuadre inmediato sin animaciones intermedias
          map.fitBounds([[minLat, minLon], [maxLat, maxLon]], {
            padding: [50, 50],
            maxZoom: 14,      // Zoom perfecto para ver la costa
            animate: false,   // Evita que pase por el mapa mundial
            duration: 0
          });
          return;
        }
      }


      // 🛟 FALLBACK DE RESPALDO: Si la comparación falló pero sabemos que es una carta local,
      // o si estás probando la app, el mapa te lleva directo a tu zona base de Motril
      if (cleanEventName.includes('motril') || cleanEventName.includes('carta')) {
        console.log("⚓ Aplicando ruta directa por defecto a la costa de Motril.");
        map.setView([36.72, -3.52], 13, { animate: false });
      }
      // 1. FORZADO DE ZOOM NÁUTICO: Desactivamos cualquier intento de Leaflet
      // de alejar el mapa al plano mundial. Al activar la carta, congelamos
      // la vista en un zoom óptimo de navegación (Zoom 13 o 14).

      // Intentamos centrar en las coordenadas base de Motril, manteniendo tu rango seguro
      map.setView([36.72, -3.52], 14, { animate: false });

      // 2. Si quieres que el mapa viaje a la posición real de tu barco al activar la carta:
      // (Si tienes un estado global o una variable para la posición del barco, úsala aquí)
      // if (vesselPosition) {
      //   map.setView([vesselPosition.lat, vesselPosition.lng], 14, { animate: false });
      // }

      console.log("🎯 Vista protegida: Bloqueado el salto al mapa mundial.");
    };

    map.on('overlayadd', onOverlayAdd);
    return () => { map.off('overlayadd', onOverlayAdd); };
  }, [map, charts]);

  return null;
};
// --- Constants ---

const APP_ID = "react-example";
const GEMINI_MODEL = "gemini-2.5-flash";
const DEFAULT_SHIP_POSITION = { lat: 36.7215, lng: -3.5235 };
const DEFAULT_DEPTH = 10.5;

// --- Constants for Charts ---
const MBTILES_ZONES = [
  { id: 'portimao-gibraltar', name: 'Portimao - Gibraltar', center: [36.5, -6.5] as [number, number], zoom: 9, file: '/mapas/portimao-gibraltar.mbtiles' },
  { id: 'tarifa-almeria', name: 'Tarifa - Almería', center: [36.75, -3.52] as [number, number], zoom: 12, file: '/mapas/tarifa-almeria.mbtiles' },
  { id: 'almeria-valencia', name: 'Almería - Valencia', center: [38.1, -1.2] as [number, number], zoom: 9, file: '/mapas/almeria-valencia.mbtiles' },
  { id: 'baleares', name: 'Baleares', center: [39.2, 2.8] as [number, number], zoom: 10, file: '/mapas/baleares.mbtiles' },
  { id: 'andalucia', name: 'Andalucía', center: [36.7, -4.5] as [number, number], zoom: 8, file: '/mapas/andalucia.mbtiles' },
  { id: 'andaluciaoccidental', name: 'Andalucía Occ.', center: [36.5, -6.2] as [number, number], zoom: 9, file: '/mapas/andaluciaoccidental.mbtiles' },
];

const SUPABASE_URL = "https://puxkefnscvzzrdsmckjt.supabase.co";
const SUPABASE_ANON_KEY_VAL = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB1eGtlZm5zY3Z6enJkc21ja2p0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4NTUwMDIsImV4cCI6MjA5MDQzMTAwMn0.b02TnDBYir17BtzA79pec1EO8Lkf3CYJsMGD4ldAXbE";


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

// --- Main App Component ---

function App() {
  // 🏷️ [ETIQUETA: CARTAS LOCALES - ESTADOS Y EFECTOS]
  const [cartasPath, setCartasPath] = useState<string>('Buscando entorno SmartShip...');
  // --- CONTROL DE NOVEDADES (CHANGELOG) ---
  const [showChangelog, setShowChangelog] = useState(false);
  const [changelogData, setChangelogData] = useState(releases[0]);
  const [simulationSpeed, setSimulationSpeed] = useState(1);
  const [vesselStatus, setVesselStatus] = useState<VesselStatus | null>(null);

  useEffect(() => {

    if (!window.smartshipAPI?.onAISMessage) return;

    const unsubscribe =
      window.smartshipAPI.onAISMessage((msg: any) => {
        // console.log(
   //  '🚢 AIS RECIBIDO EN REACT',
    // msg
  // );


        if (msg.MessageType !== 'PositionReport') return;

        const report = msg.Message?.PositionReport;
        const meta = msg.MetaData;

        if (!report || !meta) return;

        setAisTargets((prev: any[]) => {

          const filtered = prev.filter(
            target => target.mmsi !== meta.MMSI
          );

          const freshTargets = filtered.filter(
            t => Date.now() - (t.timestamp || 0) < 10 * 60 * 1000
          );

          return [
            ...freshTargets,
            {
              id: String(meta.MMSI),
              mmsi: meta.MMSI,
              nombre: meta.ShipName || `MMSI ${meta.MMSI}`,
              lat: report.Latitude,
              lng: report.Longitude,
              sog: report.Sog,
              cog: report.Cog,
              heading:
                report.TrueHeading === 511
                  ? report.Cog
                  : report.TrueHeading,
              source: 'AISSTREAM',
              timestamp: Date.now()
            }
          ];
        });

      });

    return () => {
      unsubscribe?.();
    };

  }, []);

  useEffect(() => {
    const currentVersion = packageJson.version;
    const lastRunVersion = localStorage.getItem('smartship_last_version');

    if (lastRunVersion !== currentVersion) {
      // Si es una versión nueva, mostramos las novedades
      setShowChangelog(true);
      // Actualizamos el registro para que no vuelva a salir hasta la siguiente update
      localStorage.setItem('smartship_last_version', currentVersion);
    }
  }, []);


  const [listaCartas, setListaCartas] = useState<any[]>([]);
  // 🗺️ CONTROL DE CAPAS DESPLEGABLES
  const [isLayersMenuOpen, setIsLayersMenuOpen] = useState<boolean>(false);
  const [cartasActivas, setCartasActivas] = useState<Record<string, boolean>>({});
  const [cartasOpacity, setCartasOpacity] = useState<Record<string, number>>({});

  const toggleCarta = (nombreArchivo: string) => {
    setCartasActivas(prev => ({
      ...prev,
      [nombreArchivo]: !prev[nombreArchivo]
    }));
  };

  // Sincronización con el servidor MBTiles local al arrancar
  useEffect(() => {
    fetch('http://localhost:8089/api/charts')
      .then(res => res.json())
      .then(data => {
        setListaCartas(data);
        const ops: Record<string, number> = {};
        const actives: Record<string, boolean> = {};
        data.forEach((chart: any) => {
          ops[chart.name] = 0.8;
          actives[chart.name] = false;
        });
        setCartasOpacity(ops);
        setCartasActivas(actives);
      })
      .catch(err => console.info("🛰️ Servidor de cartas MBTiles offline o no iniciado:", err));
  }, []);

  useEffect(() => {
    const savedChartsPath = localStorage.getItem('smartship_charts_path');

    if (savedChartsPath) {
      setCartasPath(savedChartsPath);
      fetch('http://localhost:8089/api/settings/charts-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: savedChartsPath })
      })
        .then(() => fetch('http://localhost:8089/api/charts'))
        .then(res => res.json())
        .then(archivos => {
          setListaCartas(archivos);
          const iniciales: Record<string, boolean> = {};
          archivos.forEach((a: any) => {
            iniciales[a.name] = false;
          });
          setCartasActivas(iniciales);
        })
        .catch((err: any) => {
          console.error('Error al sincronizar el servidor MBTiles con la ruta guardada:', err);
        });
      return;
    }

    if (window.smartshipAPI && window.smartshipAPI.getDefaultChartsPath) {
      window.smartshipAPI.getDefaultChartsPath()
        .then(async (pathStr: string) => {
          setCartasPath(pathStr);

          // Sincronizar el servidor de mapas con la ruta por defecto
          try {
            await fetch('http://localhost:8089/api/settings/charts-path', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ path: pathStr })
            });

            const res = await fetch('http://localhost:8089/api/charts');
            const archivos = await res.json();
            setListaCartas(archivos);
            const iniciales: Record<string, boolean> = {};
            archivos.forEach((a: any) => {
              iniciales[a.name] = false;
            });
            setCartasActivas(iniciales);
          } catch (err) {
            console.error('Error al leer archivos de arranque:', err);
            setListaCartas([]);
          }
        })
        .catch((err: any) => {
          console.error('Error al obtener la ruta de cartas por defecto:', err);
        });
    }
  }, []); // 👈 Aquí termina de forma limpia el useEffect en la línea 230

  const handleCambiarCarpeta = async () => {
    try {
      const api = (window as any).smartshipAPI;
      let nuevaRuta: string | null = null;

      if (api && typeof api.selectChartsDirectory === 'function') {
        nuevaRuta = await api.selectChartsDirectory();
        console.log('[App] smartshipAPI.selectChartsDirectory ->', nuevaRuta);
      } else if ((window as any).require) {
        const { ipcRenderer } = (window as any).require('electron');
        if (ipcRenderer?.invoke) {
          try {
            nuevaRuta = await ipcRenderer.invoke('select-charts-directory');
            console.log('[App] ipcRenderer.invoke(select-charts-directory) ->', nuevaRuta);
          } catch (err) {
            console.warn('[App] select-charts-directory no registrado, intentando select-directory...', err);
            nuevaRuta = await ipcRenderer.invoke('select-directory');
            console.log('[App] ipcRenderer.invoke(select-directory) ->', nuevaRuta);
          }
        }
      } else {
        console.error('[App] No hay API de Electron disponible para seleccionar directorio.');
        alert('No se encontró la API de Electron para seleccionar directorio. Reinicia la app o revisa la configuración de Electron.');
        return;
      }

      if (!nuevaRuta) {
        console.log('[App] Selección de carpeta cancelada o no se devolvió ruta.');
        return;
      }

      setCartasPath(nuevaRuta);
      localStorage.setItem('smartship_charts_path', nuevaRuta);

      await fetch('http://localhost:8089/api/settings/charts-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: nuevaRuta })
      });

      const res = await fetch('http://localhost:8089/api/charts');
      const archivos = await res.json();
      setListaCartas(archivos);

      const initialStates: Record<string, boolean> = {};
      archivos.forEach((chart: any) => {
        initialStates[chart.name] = false;
      });
      setCartasActivas(initialStates);
    } catch (error) {
      console.error('Error al cambiar de carpeta manualmente:', error);
      alert(`Error al cambiar carpeta: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // --------------------------------------------------
  // --- DECK ALPHA: ESTADOS CONSOLIDADOS (Saneamiento de 85 errores) ---
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // Capas del Mapa
  const [layersState, setLayersState] = useState({
    showAIS: true,
    showWind: false,
    collisionFilter: false
  });
  const [historicalPath, setHistoricalPath] = useState<any[]>([]);
  const [playbackCoord, setPlaybackCoord] = useState<any>(null);

  const [lang, setLang] = useState<Language>('es');
  const t = translations[lang];
  const [messages, setMessages] = useState<any[]>([]);
  const [coreTelemetryRevision, setCoreTelemetryRevision] = useState(0);
  const refreshCoreTelemetry = useCallback(() => {
    setCoreTelemetryRevision(prev => prev + 1);
  }, []);

  useEffect(() => {
    const unsubscribePosition = app.events.subscribe("core.position.updated", refreshCoreTelemetry);
    const unsubscribeMotion = app.events.subscribe("core.motion.updated", refreshCoreTelemetry);
    const unsubscribeDepth = app.events.subscribe("core.depth.updated", refreshCoreTelemetry);
    const unsubscribeWind = app.events.subscribe("core.wind.updated", refreshCoreTelemetry);

    return () => {
      unsubscribePosition();
      unsubscribeMotion();
      unsubscribeDepth();
      unsubscribeWind();
    };
  }, [refreshCoreTelemetry]);

  const shipPosition = app.state.shipPosition ?? DEFAULT_SHIP_POSITION;
  const setShipPosition = useCallback((value: React.SetStateAction<{ lat: number; lng: number } | null>) => {
    const currentPosition = app.state.shipPosition ?? DEFAULT_SHIP_POSITION;
    const nextPosition = typeof value === 'function'
      ? value(currentPosition)
      : value;

    if (!nextPosition) return;

    app.state.updatePosition(
      nextPosition.lat,
      nextPosition.lng,
      app.state.sog,
      app.state.cog,
      "system"
    );
    refreshCoreTelemetry();
  }, [refreshCoreTelemetry]);

  const [fleet, setFleet] = useState<ShipData[]>([]);
  const [selectedShipId, setSelectedShipId] = useState<string | null>(null);

  // --- CONFIGURACIONES DE NAVEGACIÓN ---
  const isNavigationAuto = false;

  // --- BARCOS SELECCIONADOS CALCULADOS ---
  const selectedShip = useMemo(() => {
    if (!fleet || !fleet.length) return null;
    const found = fleet.find(s => String(s.id) === String(selectedShipId));
    return found || fleet[0];
  }, [fleet, selectedShipId]);

  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isTravesiaActive, setIsTravesiaActive] = useState(false);
  const [weatherState, setWeatherState] = useState<ProcessedWeather>({ temp: 22, wind: 12, windDir: 0, condition: 'Despejado', seaState: 'Calma', humidity: 60, pressure: 1013, visibility: 10000, waveHeight: 0.5, tideLevel: 0.5 });
  const weather = useMemo<ProcessedWeather>(() => ({
    ...weatherState,
    wind: app.state.wind.speed > 0 ? app.state.wind.speed : weatherState.wind,
    windDir: app.state.wind.angle > 0 ? app.state.wind.angle : weatherState.windDir
  }), [weatherState, coreTelemetryRevision]);
  const setWeather: React.Dispatch<React.SetStateAction<ProcessedWeather>> = useCallback((value) => {
    setWeatherState(prev => {
      const nextWeather = typeof value === 'function'
        ? value(prev)
        : value;

      app.state.updateWind(nextWeather.wind, nextWeather.windDir, "system");
      return nextWeather;
    });
    refreshCoreTelemetry();
  }, [refreshCoreTelemetry]);
  const depth = app.state.depth > 0 ? app.state.depth : DEFAULT_DEPTH;
  const setDepth = useCallback((value: React.SetStateAction<number>) => {
    const nextDepth = typeof value === 'function'
      ? value(app.state.depth > 0 ? app.state.depth : DEFAULT_DEPTH)
      : value;

    app.state.updateDepth(nextDepth, "system");
    refreshCoreTelemetry();
  }, [refreshCoreTelemetry]);
  const [depthHistory, setDepthHistory] = useState(() => app.simulation.createInitialDepthHistory());
  const simulatedSog = app.state.sog;
  const setSimulatedSog = useCallback((value: React.SetStateAction<number>) => {
    const nextSog = typeof value === 'function'
      ? value(app.state.sog)
      : value;
    const currentPosition = app.state.shipPosition ?? DEFAULT_SHIP_POSITION;

    app.state.updatePosition(
      currentPosition.lat,
      currentPosition.lng,
      nextSog,
      app.state.cog,
      "system"
    );
    refreshCoreTelemetry();
  }, [refreshCoreTelemetry]);
  const [isEngineOn, setIsEngineOn] = useState(false);
  const [engineData, setEngineData] = useState({ rpm: 0, temp: 20, voltage: 12.8, fuel: 85, water: 90 });
  const [navigationDestination, setNavigationDestination] = useState<string>('');
  const [targetDestination, setTargetDestination] = useState<{ lat: number; lng: number } | null>(null);
  const [chatHistory, setChatHistory] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);
  const isWaitingAtBottom = useRef(false);
  const [isIntMin, setIntMin] = useState(true);
  const [telemetry] = useState({ hullPress: 1.02, internalTemp: 24, humidity: 45 });
  const [aisTargets, setAisTargets] = useState<any[]>([]);
  const [sensorQuality, setSensorQuality] = useState(createInitialSensorQualityMap);
  const [currentAnchorDistance, setCurrentAnchorDistance] = useState(0);
  const [anchorTrend, setAnchorTrend] = useState<'stable' | 'drifting' | 'swinging'>('stable');
  const sensorConfidence = useMemo(() => getOverallSensorConfidence(sensorQuality), [sensorQuality]);
  const ownShipVector = useMemo<VesselVector | null>(() => {
    if (!shipPosition) return null;
    return {
      lat: shipPosition.lat,
      lng: shipPosition.lng,
      sog: simulatedSog || selectedShip?.sog || 0,
      cog: selectedShip?.cog || 0,
    };
  }, [shipPosition, simulatedSog, selectedShip?.sog, selectedShip?.cog]);
  const tacticalAisTargets = useMemo(
    () => aisTargets.map(target => enrichAisTarget(ownShipVector, target)),
    [aisTargets, ownShipVector]
  );
  useEffect(() => {
  }, [aisTargets]);
  // --- ALMIRANTE NOTIFICATION SYSTEM ---
  const [adviceQueue, setAdviceQueue] = useState<{ message: string; priority: any; commentWithAi: boolean }[]>([]);
  const isAdviceProcessingRef = useRef(false);

  const notifyAdmiral = useCallback((message: string, priority: 'info' | 'warning' | 'critical' | 'success', commentWithAi = false) => {
    setAdviceQueue(prev => [...prev, { message, priority, commentWithAi }]);
  }, []);

  // --- SMART SHIP SHIELD: ALARMS & WATCHDOG (CENTRALIZADO) ---
  const {
    alarms, alarmHistory, thresholds, setThresholds,
    isAlertMuted, setIsAlertMuted, removeAlarm, removeAlarmByType, addAlarm
  } = useSmartShield({
    userProfile,
    supabase,
    fleet,
    selectedShipId,
    depth,
    engineData,
    aisTargets: tacticalAisTargets,
    telemetry,
    isTravesiaActive,
    isEngineOn,
    sensorQuality,
    anchorWatch: {
      anchorTrend,
      currentAnchorDistance,
    }
  });

  // --- AIS SIMULADO CORE ---
  const ownAISData = useMemo(() => shipPosition ? ({
    lat: shipPosition.lat,
    lng: shipPosition.lng,
    sog: simulatedSog,
    cog: selectedShip?.cog || 0
  }) : null, [shipPosition, simulatedSog, selectedShip]);

  const simulatedAisTargets = useAIS(ownAISData);

  useEffect(() => {

   app.ais.update(simulatedAisTargets);

        
}, [simulatedAisTargets]);

useEffect(() => {

    
}, [simulatedAisTargets]);

  // --- MOTOR TÁCTICO DE POLARES Y ENRUTAMIENTO ---
  const tacticalData = useTacticalRouting({
    shipPos: shipPosition,
    targetPos: targetDestination,
    sog: simulatedSog,
    cog: selectedShip?.cog || 0,
    tws: weather?.wind || 0,
    twd: weather?.windDir || 0
  });

  const tacticalAdvisor = useTacticalAdvisor({
    shipPos: shipPosition,
    targetPos: targetDestination,
    sog: simulatedSog,
    cog: selectedShip?.cog || 0,
    windSpeed: weather?.wind || 0,
    windDir: weather?.windDir || 0,
    currentSailConfig: isEngineOn ? 'motor' : 'full',
    saveLogEntry: saveTechnicalLog
  });

  // --- NAVEGACIÓN CORE HOOK ---
  const { navPlan, updateNavigationPlan: updateCoreNavigationPlan, anchorPosition, setAnchorPosition, isAnchorWatchActive, setIsAnchorWatchActive } = useNavigationCore({
    shipPosition, weather, selectedShip, simulatedSog, isTravesiaActive, addAlarm, removeAlarmByType
  });
  // --- FUNCIONES AUXILIARES DE NAVEGACIÓN ---
  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    // Retorna una distancia ficticia en millas náuticas para que compile el ETA del barco
    return 10;
  };
  // --- MANEJADORES DE CLICKS EN EL MAPA ---
  const handleMapClick = useCallback((e: any) => {
    console.log("Click en el mapa:", e.latlng);
  }, []);

  const updateNavigationPlan = useCallback((coords: { lat: number; lng: number }, name: string) => {
    updateCoreNavigationPlan(coords, name);
    setNavigationDestination(name);
    setTargetDestination(coords);
    const dist = calculateDistanceNM(shipPosition?.lat || 36.7215, shipPosition?.lng || -3.5235, coords.lat, coords.lng);
    const avgSpeed = simulatedSog > 0 ? simulatedSog : 15;
    const hours = dist / avgSpeed;
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    notifyAdmiral(`Rumbo fijado: ${name}. Distancia: ${dist.toFixed(1)} NM. ETA: ${h}h ${m}m`, 'info');
  }, [shipPosition, simulatedSog, updateCoreNavigationPlan, notifyAdmiral]);

  const handleMapRightClick = useCallback((e: any) => {
    const { lat, lng } = e.latlng;
    const coords = { lat, lng };
    setTargetDestination(coords);
    setNavigationDestination(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
    updateCoreNavigationPlan(coords, `Coordenadas tacticas (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
    notifyAdmiral(`Destino tactico fijado: ${lat.toFixed(4)}, ${lng.toFixed(4)}`, 'info');
  }, [notifyAdmiral, updateCoreNavigationPlan]);

  const PORT_LIST = [
    { name: 'Motril (Puerto Base)', coords: { lat: 36.7215, lng: -3.5235 } },
    { name: 'Adra', coords: { lat: 36.7464, lng: -3.0189 } },
    {name: 'Aguadulce', coords: { lat: 36.8142, lng: -2.5726 } },
    { name: 'Almería', coords: { lat: 36.8340, lng: -2.4637 } },
    { name: 'Málaga', coords: { lat: 36.7112, lng: -4.4143 } },
    { name: 'Fuengirola', coords: { lat: 36.5417, lng: -4.6212 } },
    { name: 'Marbella (Banus)', coords: { lat: 36.4870, lng: -4.9514 } },
    { name: 'Estepona', coords: { lat: 36.4132, lng: -5.1437 } },
    { name: 'Sotogrande', coords: { lat: 36.2952, lng: -5.2754 } },
    { name: 'Gibraltar', coords: { lat: 36.1408, lng: -5.3536 } },
    { name: 'Tarifa', coords: { lat: 36.0094, lng: -5.6025 } },
    { name: 'Barbate', coords: { lat: 36.1837, lng: -5.9224 } },
    { name: 'Cádiz', coords: { lat: 36.5333, lng: -6.2833 } },
    { name: 'Huelva', coords: { lat: 37.2614, lng: -6.9447 } },
    { name: 'Formentera', coords: { lat: 38.6853, lng: 1.4552 } },
    { name: 'Ibiza', coords: { lat: 38.9067, lng: 1.4206 } }
  ];
  const handleScroll = () => {
    if (!terminalRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = terminalRef.current;
    // Si el usuario está a menos de 30px del fondo, reactivamos auto-scroll
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 30;
    setIsAutoScrollEnabled(isAtBottom);
  };

  const prevMessagesLength = useRef(0);

  useEffect(() => {
    // Only auto-scroll if we have new messages and auto-scroll is enabled
    if (messages.length > prevMessagesLength.current) {
      if (isAutoScrollEnabled && messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }
    prevMessagesLength.current = messages.length;
  }, [messages, isAutoScrollEnabled]);

  const handleTacticalOrder = async (order: string) => {
    if (!order.trim() || isProcessing) return;

    // --- INTERCEPTOR DE COMANDOS LOCALES DEL SISTEMA ---
    const command = order.toLowerCase().trim();
    if (['changelog', 'novedades', 'version', 'actualizaciones'].includes(command)) {
      const userMsg = { id: crypto.randomUUID(), role: 'user', text: order, timestamp: new Date() };
      setMessages(prev => [...prev, userMsg]);
      setInput('');
      setShowChangelog(true);
      const aiResponse = { id: crypto.randomUUID(), role: 'ai', text: "Entendido, Almirante. Accediendo al registro de versiones del puente de mando. Desplegando el historial de cambios (Changelog)...", timestamp: new Date() };
      setMessages(prev => [...prev, aiResponse]);
      return;
    }

    // Conciencia Situacional Profunda para el Núcleo Nucleus AI
    const currentInventory = selectedShip?.inventory?.map(i => `${i.nombre}: ${i.cantidad_actual}${i.unidad ? ' ' + i.unidad : ''}`).join(', ') || 'Optimizado';

    // DETECCIÓN DE DESTINO EN EL TEXTO
    if (order.toLowerCase().includes('pon rumbo a') || order.toLowerCase().includes('ir a') || order.toLowerCase().includes('navegar hacia')) {
      const portFound = PORT_LIST.find(p => order.toLowerCase().includes(p.name.toLowerCase()));
      
      if (portFound) {
        console.log('⚓ Puerto detectado:', portFound.name);
        updateNavigationPlan(portFound.coords, portFound.name);
      } else {
        // Intento de extraer coordenadas si el Almirante las proporciona
        const coordsMatch = order.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
        if (coordsMatch) {
          const lat = parseFloat(coordsMatch[1]);
          const lng = parseFloat(coordsMatch[2]);
          updateNavigationPlan({ lat, lng }, `Coordenadas Tácticas (${lat}, ${lng})`);
        }
      }
    }

    const statusAtScale = isTravesiaActive ? 'EN OPERACIÓN (TRAVESÍA ACTIVA)' : 'EN REPOSO (ATRACADO)';
    const captainName = userProfile?.name || 'Comandante';
    // 1. Saneamos la búsqueda asegurando que comparamos Strings puros (evita fallos de tipo UUID)
    const activeShip = fleet.find(s => String(s.id) === String(selectedShipId || selectedShip?.id)) || selectedShip || fleet[0];
    // 2. Control de nombre por si viene vacío
    const shipName = activeShip?.nombre || 'Nucleus Zero';

    const systemPrompt = `
      ASISTENTE DE COMANDO PRO-NAUTIC (PROTOCOLO NUCLEUS):
      
      - ROL: Segundo de a bordo, experto en ingeniería naval, mantenimiento y navegación (COLREG/SOLAS).
      - INTERLOCUTOR: Almirante ${captainName}. Tono: Militar, ultra-preciso, técnico y leal.
      
      - FICHA TÉCNICA DEL BUQUE (${shipName}):
        * Modelo: ${activeShip?.modelo || 'N/A'} | Marca: ${activeShip?.marca || 'N/A'}
        * Dimensiones: Eslora ${activeShip?.eslora || 'N/A'}m | Manga ${activeShip?.manga || 'N/A'}m | Calado ${activeShip?.calado || 'N/A'}m.
        * Propulsión: ${activeShip?.potencia_cv || 'N/A'} CV
        * Identificación: MMSI ${activeShip?.mmsi || 'N/A'} | Registro ${activeShip?.matricula || 'N/A'}
      
      - ESTADO DE CONSUMIBLES:
        * Combustible: ${activeShip?.fuel_level || engineData.fuel || 0}%
        * Agua Dulce: ${activeShip?.water_level || 0}%
      
      - ENTORNO TÁCTICO Y METEOROLOGÍA:
        * Cinematica: Posición [${shipPosition?.lat.toFixed(4)}, ${shipPosition?.lng.toFixed(4)}] | Rumbo: ${activeShip?.cog || 0}° | Velocidad: ${activeShip?.sog || 0}kn.
        * Destino: ${navPlan.targetName || 'Navegación libre'}.
        * Viento (Real): ${weather.wind.toFixed(1)}kts de ${weather.windDir}°.
        * Mar: Ola ${weather.waveHeight}m | Marea ${weather.tideLevel}m.
        * Profundidad: ${depth.toFixed(1)}m (Umbral de seguridad: ${thresholds.minDepth}m).
        * Calidad sensores: ${(sensorConfidence * 100).toFixed(0)}% | GPS ${sensorQuality.gps.status} | Viento ${sensorQuality.wind.status} | Sonda ${sensorQuality.depth.status}.
        
      - LOGÍSTICA E INVENTARIO:
        * Equipamiento disponible: ${JSON.stringify(activeShip?.inventory || [])}
        * Estado Mantenimiento: ${JSON.stringify(activeShip?.maintenance || [])}

      - CAPACIDADES TÁCTICAS (HERRAMIENTAS):
        * Puedes dibujar rutas en el mapa (derrotas) usando 'set_navigation_target'.
        * Puedes iniciar oficialmente la travesía (zarpar) con 'start_travesia'.
        * Puedes finalizar la travesía (arribar) con 'end_travesia'.
        * Puedes activar alertas MOB en emergencia con 'activate_mob'.

      INSTRUCCIÓN CRUCIAL: Como segundo de a bordo, considera SIEMPRE todos estos datos para dar respuestas operativas. Si falta combustible, advierte. Si la profundidad es crítica para el calado (${activeShip?.calado}m), alerta inmediatamente. Si se solicita una ruta, considera el viento y el calado.

      FORMATO DE RESPUESTA OBLIGATORIO:
      1. **Análisis Táctico**: Resumen de situación actual basado en telemetría.
      2. **Respuesta Operativa**: Solución técnica y directa a la petición del Almirante.
      3. **Advertencia de Seguridad**: Basada en ficha técnica vs entorno real.
    `.trim();

    console.log("⚓ Iniciando orden táctica:", order);
    const userMsg = { id: crypto.randomUUID(), role: 'user', text: order, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    // Persistir mensaje de usuario en Supabase
    if (userProfile) {
      logRepository.logAiOrder(userProfile.id, selectedShip?.id || null, order, 'Procesando...', {
        shipName, isTravesiaActive, position: shipPosition
      }).catch(err => console.error("Error saving user message log:", err));
    }

    setInput('');
    setIsProcessing(true);

    try {
      const result = await callGemini(order, systemPrompt, false, NAV_TOOLS);
      const aiText = typeof result === 'string' ? result : result.text || 'Orden procesada.';
      const functionCalls = typeof result === 'string' ? [] : result.functionCalls || [];
console.log('FUNCTION CALLS RECIBIDAS:', functionCalls);
      // Ejecutar herramientas si existen
      if (functionCalls && functionCalls.length > 0) {
        for (const call of functionCalls) {
          if (call.name === 'set_navigation_target') {
            const { name, lat, lng } = call.args;
            updateNavigationPlan({ lat, lng }, name);
          } else if (call.name === 'start_travesia') {
            const { assisted } = call.args;
            handleStartTravesia(assisted ? 'IA' : 'Libre');
          } else if (call.name === 'end_travesia') {
            handleEndTravesia();
          } else if (call.name === 'activate_mob') {
            handleMOB();
          }
        }
      }

      const aiResponseMsg = {
        id: crypto.randomUUID(),
        role: 'ai',
        text: aiText,
        timestamp: new Date(),
        isOfflineMode: typeof result === 'object' ? result.isOfflineMode : false
      };
      setMessages(prev => [...prev, aiResponseMsg]);

      // Persistir respuesta de IA en Supabase (buscamos el último registro o insertamos nuevo)
      if (userProfile) {
        logRepository.logAiOrder(userProfile.id, selectedShip?.id || null, order, aiText, {
          role: 'ai', shipName, executedTools: functionCalls?.map((c: any) => c.name)
        }).then(() => fetchAiLogs(selectedShip?.id || null))
          .catch(err => console.error("Error updating AI message log:", err));
      }
    } catch (error) {
      console.error("❌ Error AI:", error);
      const errorMsg = { id: crypto.randomUUID(), role: 'ai', text: "Error de conexión con el núcleo estratégico.", isError: true, timestamp: new Date() };
      setMessages(prev => [...prev, errorMsg]);

      // Log de error en Supabase
      if (userProfile) {
        logRepository.logAiOrder(userProfile.id, selectedShip?.id || null, order, "ERROR_SISTEMA: " + (error instanceof Error ? error.message : String(error)), {
          error: true, categoria: 'error_ai'
        }).catch(err => console.error("Error saving error log:", err));
      }
    } finally {
      setIsProcessing(false);
      // El scroll automático se maneja mediante el useEffect de terminalRef
    }
  };

  const handleTerminalChat = async (e: React.FormEvent) => {
    e.preventDefault();
    handleTacticalOrder(input);
  };

  const [isSelectingNavigationMode, setIsSelectingNavigationMode] = useState(false);
  const [isDemoMode] = useState(true); // Always true as requested
  const [activeTab, setActiveTab] = useState<'control' | 'fleet' | 'inventory' | 'guide' | 'admin' | 'profile' | 'logbook' | 'navigation' | 'config' | 'shield'>('control');
  const [dataSource, setDataSource] = useState<Record<string, 'real' | 'simulated'>>({
    gps: 'simulated',
    heading: 'simulated',
    sog: 'simulated',
    depth: 'simulated',
    wind: 'simulated',
    ais: 'simulated'
  });
  const isSimulationMode =
    Object.values(dataSource).every(
      v => v === 'simulated'
    );
  const [fleetTab, setFleetTab] = useState<'datos' | 'mantenimiento'>('datos');
  const [isNightMode, setIsNightMode] = useState(() => {
    // Load night mode preference from localStorage on mount
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('smartship_night_mode');
      return saved ? JSON.parse(saved) : false;
    }
    return false;
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [allShips, setAllShips] = useState<(ShipData & { capitan_email?: string })[]>([]);
  // --- Pro Navigation Features ---
  const [currentRoute, setCurrentRoute] = useState<GPXRoute | null>(null);
  const [currentWaypoint, setCurrentWaypoint] = useState<GPXWaypoint | null>(null);
  const [waypointIndex, setWaypointIndex] = useState(0);
  const tripLoggerRef = useRef<TripLogger | null>(null);

  // --- NMEA REAL-TIME INTEGRATION ---
  useEffect(() => {
    console.log("NMEA useEffect mounted");

    const handleTelemetry = (data: any) => {
      console.log("RECIBIDO", data);
      if (!data?.type) return;
      console.log("APP handleTelemetry", data.type, data);

      switch (data.type) {
        case 'GPS':
          console.log("CORE STATE", app.state);
          console.log('GPS RECIBIDO', data);

          if (!isSimulationMode) {
            console.log('SIM', shipPosition);
          }

          updateRealSensors(['gps', 'heading', 'sog'], setSensorQuality, setDataSource);

          if (selectedShipId) {
            setFleet(prev => prev.map(s =>
              s.id === selectedShipId
                ? {
                    ...s,
                    lat: data.lat,
                    lng: data.lng,
                    cog: data.cog,
                    sog: data.sog
                  }
                : s
            ));
          }
          break;

        case 'WIND':
          setWeather(prev => ({
            ...prev,
            wind: app.state.wind.speed,
            windDir: app.state.wind.angle
          }));

          updateRealSensors(['wind'], setSensorQuality, setDataSource);
          break;

        case 'DEPTH':
          refreshCoreTelemetry();
          updateRealSensors(['depth'], setSensorQuality, setDataSource);
          break;

        case 'AIS':
          setAisTargets(prev => {
            const target = enrichAisTarget(ownShipVector, {
              ...data,
              id: data.id || data.mmsi || `ais-${Date.now()}`,
              nombre: data.nombre || data.name || data.mmsi || 'AIS TARGET',
            });

            const targetId = target.id || target.mmsi;

            return [
              target,
              ...prev.filter(item => (item.id || item.mmsi) !== targetId)
            ].slice(0, 30);
          });

          updateRealSensors(['ais'], setSensorQuality, setDataSource);
          break;

        case 'NMEA_INVALID':
          console.warn('[NMEA] Sentencia rechazada:', data.reason);
          break;
      }
    };

    const api = window.smartshipAPI;
    const telemetryStarted = app.electronTelemetry.start(api, handleTelemetry);

    if (!telemetryStarted) {
      console.info("[NMEA] Puente Electron no disponible; telemetria en modo local.");

      if (!api) {
        console.warn("[NMEA] window.smartshipAPI no esta definido.");
      } else {
        console.warn("[NMEA] Metodos on/removeListener no disponibles en smartshipAPI.");
      }
    }

    return () => {
      app.electronTelemetry.stop();
    };

  }, [selectedShipId, ownShipVector, isSimulationMode, shipPosition, refreshCoreTelemetry]);

  useEffect(() => {
    const interval = setInterval(() => {
      setSensorQuality(prev => refreshSensorQualityMap(prev, dataSource));
    }, 1000);

    return () => clearInterval(interval);
  }, [dataSource]);


  // Night Mode effect: Apply/remove night-mode class and persist preference
  useEffect(() => {
    if (isNightMode) {
      document.body.classList.add('night-mode');
    } else {
      document.body.classList.remove('night-mode');
    }
    localStorage.setItem('smartship_night_mode', JSON.stringify(isNightMode));
  }, [isNightMode]);


  const handleShipSelection = async (shipId: string | null) => {
    if (!userProfile || !shipId) {
      setSelectedShipId(null);
      return;
    }

    // Optimistic UI Update
    setSelectedShipId(shipId);

    try {
      const { error } = await vesselRepository.setActiveVessel(userProfile.id, shipId);
      if (error) throw error;

      setUserProfile(prev => prev ? ({ ...prev, barco_activo_id: shipId }) : null);

      const boatName = fleet.find(s => s.id === shipId)?.nombre || 'Unidad';
      setAdvisorMessage(`ORDEN EJECUTADA: ${boatName} es ahora el Buque de Operaciones activo. Base de datos sincronizada.`);

      // Actualizar flota localmente para reflejar el cambio de is_active inmediatamente
      setFleet(prev => prev.map(s => ({
        ...s,
        is_active: s.id === shipId
      })));

    } catch (err) {
      console.error('Error in ship activation sequence:', err);
      fetchFleet(userProfile.id);
    }
  };

  // Firestore sync effect - Robust Auth Check
  /*
  useEffect(() => {
    // Escucha de autenticación de Firebase para asegurar permisos correctos
    const authUnsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (!firebaseUser) {
        console.log("🔒 Usuario no autenticado en Firebase.");
        return;
      }

      console.log("🔓 Usuario autenticado en Firebase:", firebaseUser.email);

      // Path: /artifacts/${APP_ID}/public/data/intel_logs/{logId}
      const q = query(
        collection(db, `artifacts/${APP_ID}/public/data/intel_logs`)
      );
      
      const unsubscribeSnap = onSnapshot(q, (snapshot) => {
        try {
          const dbMessages = snapshot.docs.map(doc => ({
            id: doc.id,
            role: doc.data().role,
            text: doc.data().content,
            timestamp: doc.data().timestamp?.toDate() || new Date()
          })).sort((a, b) => (a.timestamp?.getTime() || 0) - (b.timestamp?.getTime() || 0));

          if (dbMessages.length > 0) {
            setMessages(prev => {
              const prevIds = new Set(prev.map(m => m.id));
              const newMsgs = dbMessages.filter(m => !prevIds.has(m.id));
              return [...prev, ...newMsgs];
            });
          }
        } catch (err) {
          console.error("Error procesando snapshots de Intel:", err);
        }
      }, (error) => {
        // Manejador de errores robusto según requerimientos
        const errInfo = {
          error: error instanceof Error ? error.message : String(error),
          authInfo: { userId: auth.currentUser?.uid, email: auth.currentUser?.email },
          operationType: 'list',
          path: `artifacts/react-example/public/data/intel_logs`
        };
        console.error('Firestore Tactical Error: ', JSON.stringify(errInfo));
      });

      return () => unsubscribeSnap();
    });

    return () => authUnsubscribe();
  }, [isLoggedIn]);
  */
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [captainPreferences] = useState<string>("Siempre mantente a 1 milla de la costa si es posible. Prioriza rutas con calado superior a 5 metros.");
  const [advisorMessage, setAdvisorMessage] = useState('');
  const [isAdvisorOpen, setIsAdvisorOpen] = useState(true);
  const [isAdvisorProcessing, setIsAdvisorProcessing] = useState(false);
  const [advisorText, setAdvisorText] = useState<any>(null);
  const [advisorActions, setAdvisorActions] = useState<any[]>([]);
  const [hasNewAdvice, setHasNewAdvice] = useState(false);
  const lastLoggedAdvice = useRef<string>('');
  const [destination, setDestination] = useState<any>(null);
  const [loadingWeather, setLoadingWeather] = useState(false);
  const [isSafetyChecklistComplete, setIsSafetyChecklistComplete] = useState(false);
  const [crewOnBoard, setCrewOnBoard] = useState<any[]>([]);
  const [showWatchSelection, setShowWatchSelection] = useState(false);
  const [pendingTravesiaData, setPendingTravesiaData] = useState<any>(null);
  const [showSafetyModal, setShowSafetyModal] = useState(false);
  const [tipoTravesia, setTipoTravesia] = useState<any>(null);
  const [navigationMode, setNavigationMode] = useState<any>(null);
  const [lastTacticalAlerts, setLastTacticalAlerts] = useState<string>('');
  const [currentPath, setCurrentPath] = useState<[number, number][]>([]);
  const [aiBriefing, setAiBriefing] = useState<string | null>(null);
  const [isExplainingAiRoute, setIsExplainingAiRoute] = useState(false);
  const [aiRoutePrompt, setAiRoutePrompt] = useState('');
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [rutaActiva, setRutaActiva] = useState<[number, number][]>([]);
  const [isSafeMode, setIsSafeMode] = useState(true);
  const [aisRetryCount, setAisRetryCount] = useState(0);
  const [isAisCooldown, setIsAisCooldown] = useState(false);
  const [batteryLevel] = useState(95);
  const [batteryVoltage] = useState(12.8);
  const [anchorSettings, setAnchorSettings] = useState({ depth: 0, chain: 0, margin: 5 });
  const [swingRadius, setSwingRadius] = useState(0); // Nuevo estado para el radio de borneo
  const [anchorDistHistory, setAnchorHistory] = useState<number[]>([]);
  const [navData, setNavData] = useState<{ btw: number; dtw: number; xte: number; waypointName: string; isAnchorActive: boolean; anchorDistance: number; swingRadius: number; eta?: string }>({ btw: 145, dtw: 12.4, xte: 0.02, waypointName: 'ISLA_NEGRA', isAnchorActive: false, anchorDistance: 0, swingRadius: 0 });

  // MOTOR DE NAVEGACIÓN SIMULADA

  useEffect(() => {
    
    if (!isSimulationMode) return;

    if (!isTravesiaActive) return;

    if (!shipPosition) return;

    if (rutaActiva.length < 2) return;

    const interval = setInterval(() => {
      if (!isTravesiaActive) return;

      const gpsMessage = app.simulation.tick({
        position: shipPosition,
        route: rutaActiva,
        sog: simulatedSog,
        speedMultiplier: simulationSpeed
      });

      if (app.simulation.hasReachedDestination()) {
        console.log('🏁 DESTINO ALCANZADO');
        setIsTravesiaActive(false);
        handleEndTravesia();
        return;
      }

      if (!gpsMessage) return;

      app.electronTelemetry.forward(gpsMessage);
      console.log("CORE", app.state);

      console.log("SIM GPS", gpsMessage);

    }, 1000);

    return () => clearInterval(interval);

  }, [
    isSimulationMode,
    shipPosition,
    rutaActiva,
    isTravesiaActive,
    simulationSpeed
  ]);

  // --- KERNEL PANIC RECOVERY ---
  useEffect(() => {
    try {
      localStorage.clear();
      // Safe Mode Delay
      const timer = setTimeout(() => setIsSafeMode(false), 4000);
      return () => clearTimeout(timer);
    } catch (e) {
      console.error('Failed to clear cache during panic:', e);
    }
  }, []);

  useEffect(() => {
    const processQueue = async () => {
      if (adviceQueue.length > 0 && !isAdvisorProcessing && !isAdviceProcessingRef.current) {
        isAdviceProcessingRef.current = true;
        const next = adviceQueue[0];

        setAdvisorText({
          text: next.message,
          priority: next.priority,
          timestamp: Date.now()
        });
        setHasNewAdvice(true);

        if (false && next.commentWithAi) {
          setIsAdvisorProcessing(true);
          setAdvisorMessage('Sincronizando con el centro de datos IA...');
          try {
            const comment = await callGemini(`Almirante en el puente. Analiza estos datos y genera un informe de bienvenida corto, profesional y marinero. Destaca anomalías. Evento: ${next.message}`);

            if (comment.text) {
              setAdvisorText({
                text: `${next.message}. [IA]: ${comment.text}`,
                priority: next.priority,
                timestamp: Date.now()
              });
              setAdvisorMessage(`${next.message}. IA: ${comment.text}`);
            }
          } catch (err) {
            console.error('Ai Commentary Error:', err);
          } finally {
            setIsAdvisorProcessing(false);
          }
        }

        // Wait a bit before removing from queue to allow the Almirante to read
        // or just let the next one override it after a delay
        setTimeout(() => {
          setAdviceQueue(prev => prev.slice(1));
          isAdviceProcessingRef.current = false;
        }, 5000); // 5 seconds per message if there's a queue
      }
    };

    processQueue();
  }, [adviceQueue, isAdvisorProcessing]);

  // --- PRO NAVIGATION: Trip Logger (Blackbox) ---
  useEffect(() => {
    const initTripLogger = async () => {
      if (!tripLoggerRef.current) {
        tripLoggerRef.current = getTripLogger();
      }

      if (isTravesiaActive && selectedShipId) {
        // Start new session
        await tripLoggerRef.current.startSession(
          selectedShipId,
          currentRoute?.name || navigationDestination || 'Navegación Libre'
        );

        // Setup automatic logging every 5 minutes
        tripLoggerRef.current.setupAutoLogging(() => ({
          lat: shipPosition?.lat || 36.7215,
          lng: shipPosition?.lng || -3.5235,
          cog: fleet.find(s => s.id === selectedShipId)?.cog || 0,
          sog: simulatedSog,
          windDir: weather?.windDir || 0,
          windSpeed: weather?.wind || 0,
          depth: depth,
          heading: fleet.find(s => s.id === selectedShipId)?.cog || 0,
          fuelLevel: engineData.fuel,
          waterLevel: engineData.water
        }));

        notifyAdmiral('📊 Logger de Travesía: Grabación iniciada. Historial guardado cada 5 minutos.', 'info');
      } else if (tripLoggerRef.current.getCurrentSession()) {
        // End current session
        const endedSession = await tripLoggerRef.current.endSession();
        tripLoggerRef.current.stopAutoLogging();

        if (endedSession) {
          const metrics = TripLogger.calculateMetrics(endedSession);
          if (metrics) {
            notifyAdmiral(
              `📊 Travesía completada.\nDistancia: ${metrics.totalDistance.toFixed(1)} NM\nVelocidad promedio: ${metrics.avgSOG.toFixed(1)} kts\nDuración: ${metrics.durationHours.toFixed(1)}h`,
              'info'
            );
          }
        }
      }
    };

    initTripLogger();
  }, [isTravesiaActive, selectedShipId]);

  // Monitor depth for critical warning
  useEffect(() => {
    if (depth < 3 && depth > 0) {
      notifyAdmiral(`CALADO CRITICO: ${depth.toFixed(1)}m detectado.`, 'critical', true);
    }
  }, [depth]);

  const lastWindRef = useRef(weather.wind);

  // Monitor sensors for automatic notifications
  useEffect(() => {
    const windJump = Math.abs(weather.wind - lastWindRef.current);
    if (windJump > 5 || weather.wind > 25) {
      notifyAdmiral(
        weather.wind > 25
          ? `CONDICIONES ADVERSAS: Viento superior a 25 kts.`
          : `CAMBIO BRUSCO EN VIENTO: Variación detectada (${windJump.toFixed(1)} kts).`,
        weather.wind > 25 ? 'critical' : 'warning',
        true
      );
    }
    lastWindRef.current = weather.wind;
  }, [weather.wind]);

  useEffect(() => {
    // Battery check
    if (batteryLevel < 20) {
      notifyAdmiral(`ALERTA DE ENERGÍA: Batería crítica (${batteryLevel}%).`, 'critical', true);
    }
  }, [batteryLevel]);

  useEffect(() => {
    if (engineData.fuel < 20 && isEngineOn) {
      notifyAdmiral(`ALERTA LOGÍSTICA: Combustible bajo (${engineData.fuel.toFixed(0)}%).`, 'warning', true);
    }
  }, [engineData.fuel, isEngineOn]);

  useEffect(() => {
    if (isTravesiaActive && Math.abs(navData.xte) > 0.1) {
      notifyAdmiral(`DESVIACIÓN DE RUTA: XTE fuera de parámetros (${Math.abs(navData.xte).toFixed(2)} NM).`, 'warning', true);
    }
  }, [isTravesiaActive, navData.xte]);

  useEffect(() => {
    const criticalTarget = tacticalAisTargets.find(t => (t.cpa || 10) < 0.3);
    if (criticalTarget) {
      notifyAdmiral(`ALERTA AIS: Riesgo de colisión detectado con buque ${criticalTarget.name || 'desconocido'}.`, 'critical', true);
    }
  }, [tacticalAisTargets]);

  const [tripDistance, setTripDistance] = useState(0);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const engineStartTimeRef = useRef<Date | null>(null);
  const [accumulatedEngineHours, setAccumulatedEngineHours] = useState(0);
  const [lastMilestonePos, setLastMilestonePos] = useState<[number, number] | null>(null);
  const [initialVoyageLevels, setInitialVoyageLevels] = useState<{ fuel: number; water: number } | null>(null);
  const [activeRouteId, setActiveRouteId] = useState<string | null>(null);
  const [plannedPath, setPlannedPath] = useState<[number, number][]>([]);
  const [tacticalAdvice, setTacticalAdvice] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([36.7215, -3.5235]);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [isLogbookOpen, setIsLogbookOpen] = useState(false);
  const [isTerminalOpen, setIsTerminalOpen] = useState(false); // Empieza en false (cerrada)
  const [lightsOn, setLightsOn] = useState(false);
  const [mobActive, setMobActive] = useState(false);
  const [chartMode, setChartMode] = useState<'standard' | 'mbtiles'>('standard');
  const [mbtileIndex, setMbtileIndex] = useState(0);

  const trazarRutaAdra = () => {
    if (shipPosition) {
      const activeShip = fleet.find(s => s.id === selectedShipId) || fleet[0];
      const isSailboat = activeShip?.tipo_barco?.toLowerCase().includes('velero') || activeShip?.type?.toLowerCase().includes('sail');

      // Waypoints: Motril (Start) -> South (Safety) -> SW (Coast) -> Adra (Port)
      const waypoints: [number, number][] = [
        [shipPosition.lat, shipPosition.lng],         // Motril Start
        [36.680, -3.510],                             // South Safety Point
        [36.690, -3.200],                             // Mid-Coast Safety
        [36.744, -3.015]                              // Adra Port
      ];

      // Haversine para distancia total
      const calculateDistance = (p1: [number, number], p2: [number, number]) => {
        const R = 6371; // km
        const dLat = (p2[0] - p1[0]) * Math.PI / 180;
        const dLon = (p2[1] - p1[1]) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(p1[0] * Math.PI / 180) * Math.cos(p2[0] * Math.PI / 180) *
          Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return (R * c) * 0.539957; // convertir a MN
      };

      let totalDist = 0;
      for (let i = 0; i < waypoints.length - 1; i++) {
        totalDist += calculateDistance(waypoints[i], waypoints[i + 1]);
      }
      setTripDistance(totalDist);

      // Wind optimization logic for Sailboats (Tacking logic remains similar but uses 'waypoints')
      setRutaActiva(waypoints);
      setAdvisorMessage(`Ruta Marítima a Adra: ${totalDist.toFixed(1)} mn. ETA: 2h 15m. Trayectoria segura fuera de costa.`);
    }
  };

  useEffect(() => {
    if (navigationDestination?.toLowerCase().includes('adra')) {
     // trazarRutaAdra();
    } else if (!isSimulationMode) {
      setRutaActiva([]);
    }
  }, [navigationDestination, shipPosition?.lat, shipPosition?.lng, isNavigationAuto ? weather?.windDir : null, isNavigationAuto ? weather?.wind : null]);


  const cycleChart = () => {
    if (chartMode === 'standard') {
      setChartMode('mbtiles');
      setMbtileIndex(0);
      setMapCenter(MBTILES_ZONES[0].center);
      notifyAdmiral(`Cartas tácticas Sector ${MBTILES_ZONES[0].name} cargadas.`, 'info');
    } else if (mbtileIndex < MBTILES_ZONES.length - 1) {
      const nextIndex = mbtileIndex + 1;
      setMbtileIndex(nextIndex);
      setMapCenter(MBTILES_ZONES[nextIndex].center);
      notifyAdmiral(`Cartas tácticas Sector ${MBTILES_ZONES[nextIndex].name} cargadas.`, 'info');
    } else {
      setChartMode('standard');
      setMbtileIndex(0);
      notifyAdmiral('Cambiando a cartografía estándar OpenStreetMap.', 'info');
    }
  };

  const generateMorningReport = async () => {
    console.log('🚫 MORNING REPORT EJECUTADO');
    if (!userProfile || !selectedShipId) {
      console.warn('Morning Report: No profile or ship selected yet.');
      return;
    }

    console.log('SISTEMA OPERATIVO: Conexión con el núcleo de inteligencia Gemini establecida.');

    // Force panel visibility and show "Thinking" message
    setIsAdvisorOpen(true);
    setIsAdvisorProcessing(true);
    setHasNewAdvice(true);
    setAdvisorText({
      text: "Estableciendo conexión con el centro táctico... [RADAR ACTIVO]",
      priority: 'info'
    });
    setAdvisorActions([]);

    try {
      // 1. Gather Data (FORCED MOCK DATA FOR TESTING)
      const battery = 12.8;
      const fuelValue = engineData.fuel || 100;
      const waterValue = 90;
      const windValue = weather.wind || 12;

      // Check stock levels (optional during force)
      const { data: inventoryData } = await supabase
        .from('inventario')
        .select('*')
        .eq('barco_id', selectedShipId);

      const itemsBelowMinimum = inventoryData?.filter(item => item.cantidad_actual < item.cantidad_minima) || [];

      // Weather fallback logic
      const weatherContext = `Despejado, 22°C, Viento ${windValue}kts`;

      const systemInstruction = "Eres el núcleo de inteligencia del SmartShip. Eres experto en navegación, meteorología y logística náutica. Tu tono es el de un oficial leal, culto y eficiente. Responde siempre de forma concisa para que el texto quepa en la Advisor Bar.";

      const prompt = `Almirante en el puente. Analiza situación actual:
      ${weatherContext}
      Viento: ${windValue}kts / 0°
      Sistemas: Batería ${battery}V, Combustible ${fuelValue}%, Agua ${waterValue}%
      Inventario: ${itemsBelowMinimum.length > 0 ? `Bajo en: ${itemsBelowMinimum.map(i => i.nombre).join(', ')}` : 'Suministros OK'}
      
      IMPORTANTE: El barco tiene tanques llenos y sistemas al 100%. Genera un informe de situación marinero, profesional y breve (máximo 2 frases).`;

      const report = await callGemini(prompt, systemInstruction);

      setIsAdvisorProcessing(false);
      const reportText = report.text;
      setAdvisorMessage(reportText);
      // 3. Show Result
      setAdvisorText({
        text: reportText,
        priority: (weather.wind > 25 || itemsBelowMinimum.length > 0 || loadingWeather) ? 'warning' : 'info',
        timestamp: Date.now()
      });

      // 4. Suggested Actions
      const actions: { label: string; onClick: () => void; variant?: 'primary' | 'secondary' }[] = [];

      if (itemsBelowMinimum.length > 0) {
        actions.push({
          label: '¿Desea actualizar la lista de la compra?',
          onClick: () => {
            setActiveTab('inventory');
            setIsAdvisorOpen(false);
          },
          variant: 'primary'
        });
      }

      actions.push({
        label: 'Iniciar Planificación de Travesía',
        onClick: () => {
          setIsSelectingNavigationMode(true);
          setIsAdvisorOpen(false);
        },
        variant: itemsBelowMinimum.length === 0 ? 'primary' : 'secondary'
      });

      actions.push({
        label: 'Revisar Sistemas',
        onClick: () => {
          setShowSystems(true);
          setIsAdvisorOpen(false);
        },
        variant: 'secondary'
      });

      setAdvisorActions(actions);

    } catch (err) {
      console.error('Morning Report Error:', err);
      setIsAdvisorProcessing(false);
      setAdvisorText({
        text: `Sistemas listos (Modo Manual). Batería: 12.8V. Combustible: ${engineData.fuel || 100}%. Agua: 90%. Buen viaje, Almirante.`,
        priority: 'warning',
        timestamp: Date.now()
      });
    }
  };

  const handleSendMessage = async (msg: string) => {
    if (!msg.trim()) return;

    setIsAdvisorProcessing(true);
    setAdvisorMessage('Procesando órdenes tácticas...');
    setAdvisorText({
      text: "Procesando petición, Almirante...",
      priority: 'info'
    });

    try {
      const prompt = `Analiza: ${msg}. Responde como el núcleo táctico del SmartShip. Sé conciso y profesional.`;
      const responseText = await callGemini(prompt);

      setAdvisorMessage(responseText.text);
      setAdvisorText({
        text: responseText.text,
        priority: 'info',
        timestamp: Date.now()
      });

      setChatHistory(prev => [
        ...prev,
        { role: 'user' as const, parts: [{ text: msg }] },
        { role: 'model' as const, parts: [{ text: responseText }] }
      ].slice(-20)); // Keep last 10 pairs (20 messages)

    } catch (err) {
      console.error('Advisor Chat Error:', err);
      setAdvisorText({
        text: "Error de conexión con el centro táctico. Reintentando...",
        priority: 'critical',
        timestamp: Date.now()
      });
    } finally {
      setIsAdvisorProcessing(false);
    }
  };

  const handleMOB = async () => {
    const newState = !mobActive;
    setMobActive(newState);

    if (newState) {
      setAdvisorMessage('¡ALERTA MOB ACTIVADA! Registrando posición y activando protocolo de rescate.');

      const activeShip = fleet.find(s => s.id === selectedShipId) || fleet[0];
      const barcoId = activeShip?.id || null;

      try {
        const { error } = await supabase.from('bitacora').insert([{
          barco_id: barcoId,
          capitan_id: userProfile?.id || null,
          titulo: '¡HOMBRE AL AGUA!',
          descripcion: '¡HOMBRE AL AGUA! Activado desde el panel principal. Protocolo de emergencia iniciado.',
          tipo_evento: 'ALERTA_MOB',
          categoria: 'Seguridad',
          latitud: shipPosition?.lat,
          longitud: shipPosition?.lng,
          created_at: new Date().toISOString(),
          is_auto: true
        }]);

        if (!error) console.log('App: MOB Event registered in bitacora');
      } catch (err) {
        console.error('Error logging MOB:', err);
      }
    } else {
      setAdvisorMessage('Alerta MOB desactivada.');
    }
  };

  const handleToggleLights = async () => {
    const newState = !lightsOn;
    setLightsOn(newState);

    const activeShip = fleet.find(s => s.id === selectedShipId) || fleet[0];
    const barcoId = activeShip?.id || null;

    try {
      const { error } = await supabase.from('bitacora').insert([{
        barco_id: barcoId,
        capitan_id: userProfile?.id || null,
        titulo: 'Sistema de Iluminación',
        descripcion: `Cambio de estado de iluminación de navegación/cubierta: ${newState ? 'ENCENDIDAS' : 'APAGADAS'}.`,
        tipo_evento: 'SISTEMAS',
        categoria: 'Mantenimiento',
        created_at: new Date().toISOString(),
        is_auto: true
      }]);

      if (!error) console.log('App: Lights Event registered in bitacora');
    } catch (err) {
      console.error('Error logging Lights toggle:', err);
    }
  };
  useEffect(() => {
    console.log('AISStream activo');
  }, []);

  // Simulation: Depth and AIS (Keep for simulation if no real AIS)
  useEffect(() => {
    if (import.meta.env.VITE_AISSTREAM_API_KEY) return; // Skip simulation if real AIS is on
    const interval = setInterval(() => {
      setDepth(prev => app.simulation.simulateDepth(prev));
      setDepthHistory(prev => app.simulation.appendDepthHistory(prev, depth));

      const aisTarget = app.simulation.maybeCreateAisTarget({
        isTravesiaActive,
        targetCount: aisTargets.length,
        ownPosition: shipPosition
      });

      if (aisTarget) {
        setAisTargets(prev => [...prev, aisTarget]);
        setSensorQuality(prev => markSensorUpdated(prev, ['ais'], 'simulated'));
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [isTravesiaActive, aisTargets.length, depth, shipPosition]);

  const [trip1, setTrip1] = useState(0);
  const [trip2, setTrip2] = useState(0);
  const [isTripRunning, setIsTripRunning] = useState(false);

  // Navigation simulation
  useEffect(() => {
    const interval = setInterval(() => {
      setNavData((prev) => {
        if (!prev) return prev; // Salvaguarda por si prev es nulo
        return app.simulation.simulateNavigationData(prev);
      });
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Engine Simulation
  useEffect(() => {
    const interval = setInterval(() => {
      setEngineData(prev => app.simulation.simulateEngineData(prev, isTravesiaActive));
    }, 2000);
    return () => clearInterval(interval);
  }, [isTravesiaActive]);

  // Logic for trip tracking (basic)
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isTripRunning) {
      interval = setInterval(() => {
        setTrip1(prev => prev + 0.01);
        setTrip2(prev => prev + 0.01);
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [isTripRunning]);

  const handleTripAction = async (action: string) => {
    const activeShip = fleet.find(s => s.id === selectedShipId) || fleet[0];
    const barcoId = activeShip?.id;

    if (action === 'start') setIsTripRunning(true);
    else if (action === 'stop') setIsTripRunning(false);
    else if (action === 'reset') { setTrip1(0); setTrip2(0); }

    if (barcoId) {
      const payload = {
        viaje_1_nm: trip1,
        viaje_2_nm: trip2
      };
      await supabase.from('barcos').update(payload).eq('id', barcoId);
    }
  };

  const [hudPageIndex, setHudPageIndex] = useState(0);
  const [isAutoCenter, setIsAutoCenter] = useState(true);
  const [showControl, setShowControl] = useState(false);
  const [showSystems, setShowSystems] = useState(false);
  const [zeusPage, setZeusPage] = useState<'chart' | 'sailsteer' | 'race' | 'laylines' | 'windplot' | 'pilot' | 'weather' | 'charts'>('chart');
  const [isWeatherPanelOpen, setIsWeatherPanelOpen] = useState(false); // New state for weather panel
  const [isLaylinesActive, setIsLaylinesActive] = useState(false); // New state for laylines
  const [isSailSteerWidgetOpen, setIsSailSteerWidgetOpen] = useState(false); // New state for SailSteer widget

  const [autopilotMode, setAutopilotMode] = useState<'standby' | 'auto' | 'wind' | 'nav'>('standby');

  const openZeusHudPage = useCallback((page: number) => {
    setHudPageIndex(page);
    setShowControl(true);
  }, []);

  // Dummy Layline Calculation (Replace with actual logic)
  const calculateLaylinePaths = useCallback((
    currentLat: number, currentLng: number,
    twd: number, tws: number, sog: number
  ) => {
    const optimalTackAngle = getUpwindAngle(tws);
    const tackDistance = Math.max(8, sog * 4);
    const calculateBearing = (
      lat1: number,
      lon1: number,
      lat2: number,
      lon2: number
    ) => {

      const dLon = (lon2 - lon1) * Math.PI / 180;

      const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180);

      const x =
        Math.cos(lat1 * Math.PI / 180) *
        Math.sin(lat2 * Math.PI / 180) -
        Math.sin(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *
        Math.cos(dLon);

      return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    };


    // const bestTack =
    //portDiff < stbdDiff
    // ? 'PORT'
    //: 'STARBOARD';

    // Convert degrees to radians
    const toRadians = (deg: number) => deg * Math.PI / 180;

    // Port Layline (e.g., 45 degrees off true wind on port side)
    const portLaylineBearing = toRadians(twd - optimalTackAngle);
    const portLaylineLat = currentLat + tackDistance * Math.cos(portLaylineBearing) / 60;
    const portLaylineLng = currentLng + tackDistance * Math.sin(portLaylineBearing) / (60 * Math.cos(toRadians(currentLat)));

    // Starboard Layline (e.g., 45 degrees off true wind on starboard side)
    const stbdLaylineBearing = toRadians(twd + optimalTackAngle);
    const stbdLaylineLat = currentLat + tackDistance * Math.cos(stbdLaylineBearing) / 60;
    const stbdLaylineLng = currentLng + tackDistance * Math.sin(stbdLaylineBearing) / (60 * Math.cos(toRadians(currentLat)));

    const portPath: [number, number][] = [[currentLat, currentLng], [portLaylineLat, portLaylineLng]];
    const stbdPath: [number, number][] = [[currentLat, currentLng], [stbdLaylineLat, stbdLaylineLng]];
    return { portPath, stbdPath };
  }, []);

  const toggleZeusAutopilot = useCallback(() => {
    setAutopilotMode((current) => {
      const next = current === 'standby' ? 'auto' : current === 'auto' ? 'wind' : current === 'wind' ? 'nav' : 'standby';
      setAdvisorMessage(`Piloto Zeus 3S: modo ${next.toUpperCase()}`);
      return next;
    });
  }, [setAdvisorMessage]);

  // Auto-collapse SmartShip sidebar when navigation is active
  useEffect(() => {
    if (isTravesiaActive) {
      setIsSidebarOpen(false);
    } else {
      // Auto-collapse when activeTab is 'control' (where the Zeus3SChartplotterOverlay is rendered)
      const zeusControlledTabs = ['control'];
      if (zeusControlledTabs.includes(activeTab)) {
        setIsSidebarOpen(false);
      }
    }
  }, [isTravesiaActive]);
  // Auto-maximize intel window on new AI message
  useEffect(() => {
    if (messages.length > 0 && messages[messages.length - 1].role === 'ai') {
      setIntMin(false);
    }
  }, [messages.length]);

  // Logic for auto-scroll
  useEffect(() => {
    const term = terminalRef.current;
    if (!term || isIntMin) return;

    const scrollSpeed = 1;
    const interval = setInterval(() => {
      if (isWaitingAtBottom.current) return;

      if (term.scrollTop + term.clientHeight >= term.scrollHeight - 5) {
        isWaitingAtBottom.current = true;

        // Wait 15 seconds
        setTimeout(() => {
          if (term) term.scrollTop = 0; // Vuelve al principio
          isWaitingAtBottom.current = false;
        }, 15000);
      } else {
        term.scrollTop += scrollSpeed;
      }
    }, 50);
    return () => clearInterval(interval);
  }, [messages, isIntMin]);

  // Auto-maximize on new messages logic was partially redundant based on the above,
  // the previous implementation did it via second useEffect. I keep one version now.

  // Load HUD page index
  /* 
  useEffect(() => {
    const loadHudConfig = async () => {
      try {
        const { data, error } = await supabase
          .from('configuracion_hub')
          .select('pagina_actual')
          .eq('user_id', userProfile?.id)
          .maybeSingle();
        
        if (!error && data) {
          setHudPageIndex(data.pagina_actual);
        }
      } catch (err) {
        console.warn('App: Fail to load configuracion_hub (maybe column name user_id?):', err);
        setHudPageIndex(0);
      }
    };
    if (userProfile?.id) loadHudConfig();
  }, [userProfile?.id]);
  */

  const handlePageChange = async (index: number) => {
    setHudPageIndex(index);
    /*
    await supabase
      .from('configuracion_hub')
      .upsert({ user_id: userProfile?.id, pagina_actual: index });
    */
  };

  const handleRaceTimerFinished = async () => {
    setAdvisorMessage('Salida de regata: ¡Tiempo cumplido!');
    await supabase.from('bitacora').insert([{
      barco_id: selectedShipId || null,
      capitan_id: userProfile?.id || null,
      titulo: 'REGATA',
      descripcion: 'Salida de regata: ¡Tiempo cumplido!',
      tipo_evento: 'REGATA',
      categoria: 'Navegación',
      created_at: new Date().toISOString(),
    }]);
  };

  useEffect(() => {
    if (activeTab !== 'control') {
      setShowControl(false);
    }
  }, [activeTab]);

  // Track engine hours
  useEffect(() => {
    if (isEngineOn) {
      engineStartTimeRef.current = new Date();
    } else {
      if (engineStartTimeRef.current) {
        const hours = (new Date().getTime() - engineStartTimeRef.current.getTime()) / (1000 * 60 * 60);
        setAccumulatedEngineHours(prev => prev + hours);
        engineStartTimeRef.current = null;
      }
    }
  }, [isEngineOn]);

  // Effect to handle navigation tracking and milestones
  useEffect(() => {
    if (!isTravesiaActive) return;

    if (!startTime) {
      setStartTime(new Date());
      if (shipPosition) {
        setLastMilestonePos([shipPosition.lat, shipPosition.lng]);
      }
      return;
    }

    if (shipPosition && lastMilestonePos &&
      !isNaN(shipPosition.lat) && !isNaN(shipPosition.lng) &&
      !isNaN(lastMilestonePos[0]) && !isNaN(lastMilestonePos[1])) {
      const distanceSinceLastMilestone = calculateDistanceNM(
        lastMilestonePos[0], lastMilestonePos[1],
        shipPosition.lat, shipPosition.lng
      );

      // Log milestone every 10 NM
      if (!isNaN(distanceSinceLastMilestone) && distanceSinceLastMilestone >= 10) {
        const totalDistance = tripDistance + distanceSinceLastMilestone;
        setTripDistance(totalDistance);
        setLastMilestonePos([shipPosition.lat, shipPosition.lng]);

        // Calculate average speed for this segment
        const timeElapsedHours = (new Date().getTime() - startTime.getTime()) / (1000 * 60 * 60);
        const avgSpeed = timeElapsedHours > 0 ? (totalDistance / timeElapsedHours).toFixed(1) : '0.0';

        saveLogEntry(
          'Evento Automático',
          `Hito: ${Math.floor(totalDistance)} millas navegadas. Posición: ${shipPosition.lat.toFixed(4)}, ${shipPosition.lng.toFixed(4)}. Velocidad media: ${avgSpeed} kn`,
          'Navegación'
        );
      }
    }
  }, [shipPosition, isTravesiaActive, startTime, lastMilestonePos, tripDistance]);

  // Breadcrumb trail for free navigation
  useEffect(() => {
    if (!isTravesiaActive || !shipPosition || isNaN(shipPosition.lat) || isNaN(shipPosition.lng)) return;

    // Only add if position changed significantly to avoid massive arrays
    setCurrentPath(prev => {
      if (prev.length === 0) return [[shipPosition.lat, shipPosition.lng]];
      const last = prev[prev.length - 1];
      if (isNaN(last[0]) || isNaN(last[1])) return prev;

      const dist = calculateDistanceNM(last[0], last[1], shipPosition.lat, shipPosition.lng);
      if (!isNaN(dist) && dist > 0.01) { // 0.01 NM ~ 18 meters
        return [...prev, [shipPosition.lat, shipPosition.lng]];
      }
      return prev;
    });
  }, [shipPosition, isTravesiaActive]);

  // Handle ending navigation
  const handleEndTravesia = async () => {
    let effectiveShipId = selectedShipId;
    if (!effectiveShipId) effectiveShipId = localStorage.getItem('selectedShipId');

    const activeShip = fleet.find(s => s.id === effectiveShipId) || fleet[0];
    const barcoIdReal = activeShip?.id || effectiveShipId || null;

    try {

      // 1. Bitacora Entry for Arrival
      await saveTechnicalLog(
        'Arribada',
        `Travesía finalizada correctamente. Distancia total: ${tripDistance.toFixed(1)} mn.`,
        'Navegación'
      );

      // 2. Find and close the open navigation log
      if (!barcoIdReal) {
        console.warn('App: Skipper, no barco_id for closing log');
        return;
      }

      console.log('App: Quering active log with is.null in bitacora for ship:', barcoIdReal);
      const { data: openLog } = await logRepository.getActiveLog(barcoIdReal);

      if (openLog) {
        await logRepository.updateLog(openLog.id, { fecha_fin: new Date().toISOString() });
      }

      // 3. Sync states to Supabase
      await vesselRepository.updateVessel(barcoIdReal, { en_navegacion: false });
      await vesselRepository.updateVesselStatus(barcoIdReal, { is_navigating: false });

      // REACTIVIDAD: Limpiar UI inmediatamente
      setIsTravesiaActive(false);
      setRutaActiva([]);
      app.simulation.resetNavigation(1);
      setNavigationDestination('');
      setPlannedPath([]);
      setCurrentPath([]);
      setTripDistance(0);
      setStartTime(null);
      setIsEngineOn(false);
      setAdvisorMessage('Travesía finalizada y registrada correctamente.');

      // Force refresh logs because of the new Arribada entry and update
      // setLogEntries will be handled by saveTechnicalLog optimistically for the Arribada entry
    } catch (err: any) {
      console.error('App: handleEndTravesia failure:', err);
      alert('Error al finalizar travesía: ' + err.message);
    }
  };
  const [selectedBarco, setSelectedBarco] = useState<ShipData | null>(null);
  const [historial, setHistorial] = useState<any[]>([]);
  const [aiLogs, setAiLogs] = useState<any[]>([]);

  const fetchAiLogs = async (barcoId: string | null) => {
    if (!barcoId) return;
    try {
      const { data, error } = await logRepository.getAiLogs(barcoId);
      if (error) throw error;
      if (data) setAiLogs(data);
    } catch (err) {
      console.error("Error fetching AI logs:", err);
    }
  };

  useEffect(() => {
    if (selectedShipId) {
      fetchAiLogs(selectedShipId);
    }
  }, [selectedShipId]);
  const [profileForm, setProfileForm] = useState({
    nombre_completo: '',
    telefono: '',
    licencia_nautica: '',
    dni_nie: '',
    fecha_nacimiento: '',
    foto_perfil_url: '',
    nacionalidad: '',
    direccion: '',
    poblacion: '',
    codigo_postal: '',
    provincia: '',
    contacto_emergencia_nombre: '',
    contacto_emergencia_telefono: '',
    grupo_sanguineo: '',
    observaciones_medicas: ''
  });

  useEffect(() => {
    if (userProfile) {
      setProfileForm({
        nombre_completo: userProfile.nombre_completo || '',
        telefono: userProfile.telefono || '',
        licencia_nautica: userProfile.licencia_nautica || '',
        dni_nie: userProfile.dni_nie || '',
        fecha_nacimiento: userProfile.fecha_nacimiento || '',
        foto_perfil_url: userProfile.foto_perfil_url || '',
        nacionalidad: userProfile.nacionalidad || '',
        direccion: userProfile.direccion || '',
        poblacion: userProfile.poblacion || '',
        codigo_postal: userProfile.codigo_postal || '',
        provincia: userProfile.provincia || '',
        contacto_emergencia_nombre: userProfile.contacto_emergencia_nombre || '',
        contacto_emergencia_telefono: userProfile.contacto_emergencia_telefono || '',
        grupo_sanguineo: userProfile.grupo_sanguineo || '',
        observaciones_medicas: userProfile.observaciones_medicas || ''
      });
    }
  }, [userProfile]);

  const getWeatherData = async (lat: number, lng: number) => {
    setLoadingWeather(true);
    try {
      const API_KEY = import.meta.env.VITE_OPENWEATHERMAP_API_KEY;

      if (!API_KEY || API_KEY === 'YOUR_API_KEY' || API_KEY.length < 10) {
        throw new Error("API_KEY_INVALID");
      }

      const response = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${API_KEY}&units=metric&lang=es`);

      if (!response.ok) throw new Error(`HTTP_ERROR_${response.status}`);

      const data: WeatherResponse = await response.json();
      if (data.main && data.wind && data.weather) {
        const windKnots = Math.round(data.wind.speed * 1.94384);

        let seaState = 'Calma';
        if (windKnots < 1) seaState = 'Calma';
        else if (windKnots < 4) seaState = 'Mar rizada';
        else if (windKnots < 7) seaState = 'Marejadilla';
        else if (windKnots < 11) seaState = 'Marejada';
        else if (windKnots < 17) seaState = 'Fuerte marejada';
        else if (windKnots < 22) seaState = 'Gruesa';
        else if (windKnots < 28) seaState = 'Muy gruesa';
        else seaState = 'Arbolada';

        setWeather({
          temp: Math.round(data.main.temp),
          wind: windKnots,
          windDir: data.wind.deg,
          condition: data.weather[0].description.charAt(0).toUpperCase() + data.weather[0].description.slice(1),
          seaState: seaState,
          humidity: data.main.humidity,
          pressure: data.main.pressure,
          visibility: data.visibility || 10000,
          waveHeight: Number((windKnots * 0.12).toFixed(2)),
          tideLevel: Number((0.5 + Math.sin(Date.now() / 1000000) * 0.5).toFixed(2))
        });
      }
    } catch (error) {
      console.warn("📡 ENLACE METEO INESTABLE: Activando protocolos tácticos secundarios.", error);
      // Fallback: Datos sintéticos coherentes para evitar fallos en la UI
      setWeather({
        temp: 22,
        wind: 15,
        windDir: 270,
        condition: "Modo Simulación (Fallo de Red)",
        seaState: "Marejadilla",
        humidity: 65,
        pressure: 1013,
        visibility: 10000,
        waveHeight: 0.8,
        tideLevel: 0.45
      });
    } finally {
      setLoadingWeather(false);
    }
  };

  useEffect(() => {
    const selectedShip = fleet.find(s => s.id === selectedShipId);
    if (selectedShip && selectedShip.lat && selectedShip.lng) {
      getWeatherData(selectedShip.lat, selectedShip.lng);
    } else {
      getWeatherData(36.72, -3.52); // Motril (Lat: 36.72, Lng: -3.52)
    }
  }, [selectedShipId, fleet]);

  const getTacticalAdvice = useMemo(() => {
    if (tacticalAdvisor && tacticalAdvisor.advisory) {
      let icon = <Zap className="w-4 h-4 text-cyan-400 animate-pulse" />;
      if (tacticalAdvisor.advisory.priority === 'critical') {
        icon = <AlertTriangle className="w-6 h-6 text-red-500 animate-bounce" />;
      } else if (tacticalAdvisor.advisory.priority === 'warning') {
        icon = <ShieldAlert className="w-4 h-4 text-amber-400" />;
      }
      return { message: tacticalAdvisor.advisory.message, icon };
    }

    const selectedShip = fleet.find(s => s.id === selectedShipId) || fleet[0];
    let advice = advisorMessage;
    let icon = <Zap className="w-4 h-4 text-cyan-400 animate-pulse" />;

    if (!selectedShip) return { message: advice, icon };

    const { wind, windDir } = weather;
    const isVelero = selectedShip.tipo_barco === 'Velero';
    const isMotora = selectedShip.tipo_barco === 'Motora';

    // Navigation Advice Logic
    if (isVelero) {
      if (wind < 5) {
        advice = "Calma chicha. Encienda motor a 1800 RPM para evitar fatiga de velas.";
        icon = <Fuel className="w-4 h-4 text-emerald-400" />;
      } else if (wind >= 5 && wind <= 18) {
        advice = "Viento ideal. Trimado: Caza escotas y busca el ángulo de ceñida óptimo.";
        icon = <Navigation className="w-4 h-4 text-cyan-400" />;
      } else if (wind > 20) {
        advice = "¡Alerta de ráfagas! Recomiendo primer rizo en la mayor y reducir génova.";
        icon = <AlertTriangle className="w-6 h-6 text-red-500 animate-bounce" />;
      }
    } else if (isMotora) {
      if (wind > 15) {
        advice = "Mar picada. Ajuste el trim para elevar la proa y evitar pantocazos.";
        icon = <AlertTriangle className="w-6 h-6 text-amber-500" />;
      } else if (wind < 10) {
        advice = "Mar plato. Régimen de crucero recomendado para ahorro de combustible.";
        icon = <Fuel className="w-4 h-4 text-emerald-400" />;
      }
    }

    // Route Advice
    if (destination && selectedShip.lat && selectedShip.lng) {
      const dy = destination.lat - selectedShip.lat;
      const dx = Math.cos(Math.PI / 180 * selectedShip.lat) * (destination.lng - selectedShip.lng);
      const bearing = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
      const relativeWind = (windDir - bearing + 360) % 360;

      if (relativeWind < 45 || relativeWind > 315) {
        advice += " Viento de proa detectado. Maniobra de ceñida requerida.";
      } else if (relativeWind > 135 && relativeWind < 225) {
        advice += " Viento de popa. Navegación en empopada favorable.";
      }
    }

    return { message: advice || "Sistemas operativos al 100%. Rumbo estable.", icon };
  }, [tacticalAdvisor, selectedShipId, fleet, weather, destination, advisorMessage]);

  const closeAdvisor = () => {
    setIsAdvisorOpen(false);
    localStorage.setItem('bienvenida_leida', 'true');
  };

  const fetchFleet = async (userId: string) => {
    const { data, error } = await vesselRepository.getFleet(userId);

    if (error) {
      if (error.message.includes('permission') || error.code === '42501') {
        setAdvisorMessage('Almirante, no tiene permisos para ver esta unidad (Tabla Barcos).');
      }
      console.error('Error fetching fleet:', error);
      return;
    }
    if (data) {
      const formattedShips: ShipData[] = data.map(s => ({
        id: s.id,
        name: s.nombre,
        brand: s.marca,
        model: s.modelo,
        registration: s.matricula,
        length: s.eslora,
        beam: s.manga,
        draft: s.calado,
        capitan_id: s.capitan_id,
        user_id: s.capitan_id,
        tipo_barco: s.tipo_barco,
        foto_url: s.foto_url,
        mmsi: s.mmsi,
        ais: s.ais,
        ultimo_mantenimiento_motor: s.ultimo_mantenimiento_motor,
        ultima_revision_balsa: s.ultima_revision_balsa,
        ultima_revision_extintores: s.ultima_revision_extintores,
        // FORCED MOTRIL POSITION - NO AUTO-DETECTION
        lat: 36.7215,
        lng: -3.5235,
        type: s.tipo || 'Motor',
        cog: s.cog || 0,
        sog: s.sog || 0,
        inventory: s.inventario || [],
        maintenance: s.mantenimiento || [],
        fuel_level: s.fuel_level,
        water_level: s.water_level,
        estado_aceite: s.estado_aceite,
        modelo: s.modelo,
        nombre: s.nombre,
        horas_motor: s.horas_motor,
        is_active: s.is_active,
        marca: s.marca,
        matricula: s.matricula,
        eslora: s.eslora,
        manga: s.manga,
        calado: s.calado,
        numero_serie_casco: s.numero_serie_casco,
        potencia_cv: s.potencia_cv,
        fecha_itb: s.fecha_itb,
        fecha_seguro: s.fecha_seguro,
        documentacion_url: s.documentacion_url,
        manual_pdf: s.manual_pdf
      }));
      setFleet(formattedShips);

      // Conectar buque activo persistente (Prioridad: is_active -> barco_activo_id -> first)
      if (formattedShips.length > 0) {
        const activeByColumn = formattedShips.find(s => s.is_active);
        const activeByProfile = formattedShips.find(s => s.id === userProfile?.barco_activo_id);

        if (activeByColumn) {
          setSelectedShipId(activeByColumn.id);
        } else if (activeByProfile) {
          setSelectedShipId(activeByProfile.id);
        } else if (!selectedShipId) {
          setSelectedShipId(formattedShips[0].id);
        }
      }
    }
  };

  // Geolocation Watcher - DELETED as requested

  // Consumption Logic (Phase A)
  useEffect(() => {
    const processConsumption = async () => {
      const barcoIdReal = selectedShipId || null;
      if (!isTravesiaActive && initialVoyageLevels && selectedShipId && userProfile) {
        // Fetch final levels
        const { data: finalStatus } = await vesselRepository.getVesselStatus(barcoIdReal);

        if (finalStatus) {
          // Fuel consumption is now handled by engine hours in handleEndNavigation, 
          // but we can still track water consumption or other inventory here if needed.
          const waterConsumed = initialVoyageLevels.water - finalStatus.water_level;

          if (waterConsumed > 0) {
            // Update ship inventory (separate table now as requested)
            const { data: items } = await vesselRepository.getInventory(barcoIdReal);

            if (items) {
              const waterItem = items.find(item => item.nombre.toLowerCase().includes('agua'));
              if (waterItem) {
                await vesselRepository.updateInventoryItem(waterItem.id, {
                  cantidad_actual: (waterItem.cantidad_actual || 0) - waterConsumed
                });
              }
            }
          }

          // Log alert if fuel < 15%
          if (finalStatus.fuel_level < 15) {
            await saveLogEntry("Alerta de Combustible", "Nivel de reserva alcanzado. Repostar necesario.", "SISTEMA CRÍTICO");
          }
        }
        setInitialVoyageLevels(null);
      }
    };

    processConsumption();
  }, [isTravesiaActive, initialVoyageLevels, selectedShipId, userProfile, fleet]);

  const [propulsionMode, setPropulsionMode] = useState<'MOTOR' | 'VELA'>('MOTOR');

  const handleMotor = async () => {
    if (propulsionMode === 'MOTOR') return;
    setPropulsionMode('MOTOR');

    // Si la travesía está activa y hay motor encendido, se registra el evento
    const effectiveShipId = selectedShipId || selectedBarco?.id;

    await forceSaveLog(
      'Propulsión: MOTOR',
      'Cambio a propulsión por MOTOR - Sistema de propulsión acoplado',
      'Propulsión',
      undefined,
      undefined,
      true,
      activeRouteId || undefined
    );
  };

  const handleVela = async () => {
    if (propulsionMode === 'VELA') return;
    setPropulsionMode('VELA');

    await forceSaveLog(
      'Propulsión: VELA',
      'Cambio a propulsión por VELA - Aprovechando energía eólica',
      'Propulsión',
      undefined,
      undefined,
      true,
      activeRouteId || undefined
    );
  };

  // TACTICAL LOGGING HELPER
  const registerTacticalChange = async (titulo: string, descripcion: string, categoria: string = 'NAVEGACIÓN TÁCTICA') => {
    return saveTechnicalLog(titulo, descripcion, categoria, navigationMode || undefined, navigationDestination, true);
  };
  const recentLogEntries = useRef<Record<string, number>>({});

  async function saveTechnicalLog(
    titulo: string,
    descripcion: string,
    categoria: string = 'Técnico',
    tipo_navegacion?: 'Libre' | 'Planificada',
    destino_planificado?: string,
    isAuto: boolean = true,
    rutaId?: string
  ) {
    const logKey = `${categoria}|${titulo}`;
const now = Date.now();

if (
  recentLogEntries.current[logKey] &&
  now - recentLogEntries.current[logKey] < 600000 // 10 min
) {
  console.log('⏭️ Log duplicado ignorado:', titulo);
  return;
}

recentLogEntries.current[logKey] = now;
    try {
      const activeShip = fleet.find(s => s.id === selectedShipId) || fleet[0];
      const barcoIdReal = activeShip?.id || selectedShipId || null;

      const capitanId = userProfile?.id || null;

      const newEntry: any = {
        barco_id: barcoIdReal,
        capitan_id: capitanId,
        titulo,
        descripcion,
        categoria,
        tipo_evento: categoria,
        ubicacion_texto: 'Navegación en curso',
        horas_motor: vesselStatus?.engine_hours || 0,
        created_at: new Date().toISOString(),
        tipo_navegacion,
        destino_planificado,
        latitud: shipPosition?.lat,
        longitud: shipPosition?.lng,
        viento_nudos: weather?.wind || 0,
        velocidad_gps: simulatedSog,
        rumbo: activeShip?.cog || 0,
        viento: `${weather?.wind || 0} kts ${weather?.windDir || 0}°`,
        estado_del_mar: weather?.seaState || 'Calma',
        is_auto: isAuto,
        propulsion: propulsionMode,
        ruta_id: rutaId
      };

      // REACTIVIDAD INSTANTÁNEA: Update local state immediately (Optimistic)
      setLogEntries(prev => [{ ...newEntry, id: 'temp-' + Date.now() }, ...prev]);

      const { data, error } = await logRepository.insertEntry(newEntry);

      if (error) throw error;

      if (data && data.length > 0) {
        // Replace temp entry with real one from DB
        setLogEntries(prev => prev.map(e => e.id.toString().startsWith('temp-') ? data[0] : e));
      }
    } catch (err: unknown) {
      console.error('App: saveTechnicalLog CRITICAL FAILURE:', err);
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido';
      setAdvisorMessage(`Fallo crítico en bitácora técnica: ${errorMessage}`);
    }
  };

  const saveTechnicalEvent = (titulo: string, descripcion: string, isAuto: boolean = true) => {
    saveTechnicalLog(titulo, descripcion, 'Técnico', undefined, undefined, isAuto);
  };

  const forceSaveLog = saveTechnicalLog;
  const saveLogEntry = saveTechnicalLog; // Alias para compatibilidad

  // TACTICAL ALERT MONITORING - Real-time analysis with automatic bitácora logging
  useEffect(() => {
    const activeShip = fleet.find(s => String(s.id) === String(selectedShipId || selectedShip?.id)) || selectedShip || fleet[0];
    if (!activeShip || !isLoggedIn || !destination || !isTravesiaActive) return;

    const interval = setInterval(async () => {
      try {
        const { generateTacticalAlerts, formatTacticalAdvisory } = await import('./lib/tacticalAlertSystem');

        const telemetry = {
          lat: activeShip.lat || 0,
          lng: activeShip.lng || 0,
          cog: activeShip.cog || 0,
          sog: activeShip.sog || 0,
          windDir: weather.windDir || 0,
          windSpeed: weather.wind || 0,
          waypointLat: destination.lat,
          waypointLng: destination.lng,
          currentSailConfig: 'full' // TODO: Connect to sail config state when added
        };

        const alerts = generateTacticalAlerts(telemetry);

        if (alerts.length > 0) {
          const advisory = formatTacticalAdvisory(alerts);
          setAdvisorMessage(advisory.message);
          setAdvisorText({
            text: advisory.message,
            priority: advisory.priority,
            timestamp: Date.now()
          });
          setHasNewAdvice(true);

          // AUTOMATIC BITÁCORA LOGGING FOR CRITICAL/WARNING ALERTS
          const alertKey = alerts.map(a => a.type + a.severity).join('|');
          if (alertKey !== lastTacticalAlerts) {
            // Only log if alerts changed to avoid spam
            for (const alert of alerts) {
              // Log only critical, warning, and sail alerts
              if ((alert.severity === 'critical' || alert.severity === 'warning' || alert.type === 'sail') && alert.logbookEntry) {
                await registerTacticalChange(
                  alert.logbookEntry.titulo,
                  alert.logbookEntry.descripcion,
                  alert.logbookEntry.categoria
                );
              }
            }
            setLastTacticalAlerts(alertKey);
          }
        }
      } catch (err) {
        // Silent fail to avoid disrupting navigation
        console.debug('Tactical alert system temporarily unavailable:', err);
      }
    }, 1000); // Update every 1 second

    return () => clearInterval(interval);
  }, [fleet, selectedShipId, destination, weather, isLoggedIn, isTravesiaActive, navigationMode, navigationDestination, lastTacticalAlerts]);

  // Tactical Advisor Auto-Opening Logic & Analysis
  useEffect(() => {
    if (!isTravesiaActive) {
      setAdvisorText(null);
      setIsAdvisorOpen(false);
      return;
    }

    const checkTactical = async () => {
      let newAdvice: { text: string; priority: 'info' | 'warning' | 'critical' } | null = null;
      const currentDepth = depth ?? 10.5;
      const currentXte = navData?.xte ?? 0;
      const currentFuel = engineData?.fuel ?? 85;

      // 0. AIS Collision Risk
      const criticalTarget = tacticalAisTargets.find(t => (t.cpa || 1) < 0.15);
      if (criticalTarget) {
        newAdvice = {
          text: `[SYS]: ALERTA DE COLISIÓN CPA: ${criticalTarget.cpa.toFixed(2)}NM. Buque: ${criticalTarget.nombre}. Altere rumbo inmediatamente.`,
          priority: 'critical'
        };
      }
      // 1. Critical Depth
      else if (currentDepth < 3.0) {
        newAdvice = {
          text: `[SYS]: ALERTA DE SONDA. Profundidad crítica: ${currentDepth.toFixed(1)}m. Riesgo de encallamiento.`,
          priority: 'critical'
        };
      }
      // 2. High Wind
      else if (weather.wind > 25) {
        newAdvice = {
          text: `[SYS]: ALERTA METEOROLÓGICA. Viento superior a 25kt. Reduzca superficie velica inmediatamente (Rizos).`,
          priority: 'critical'
        };
      }
      // 3. Course Deviation (XTE)
      else if (Math.abs(currentXte) > 0.15) {
        newAdvice = {
          text: `[XO]: DESVIACIÓN DE RUTA. XTE: ${Math.abs(currentXte).toFixed(2)}NM. Corrija rumbo a ${currentXte > 0 ? 'Babor' : 'Estribor'}.`,
          priority: 'warning'
        };
      }
      // 4. Low Fuel
      else if (currentFuel < 15 && isEngineOn) {
        newAdvice = {
          text: `[SYS]: RESERVA DE COMBUSTIBLE. Nivel bajo (${currentFuel.toFixed(0)}%). Planifique repostaje.`,
          priority: 'warning'
        };
      }

      if (newAdvice && (!advisorText || newAdvice.text !== advisorText.text)) {
        setAdvisorText(newAdvice);
        setIsAdvisorOpen(true); // Auto-open for warnings/critical
        setHasNewAdvice(true);

        // Log critical alerts for traceability
        if (
  (newAdvice.priority === 'critical' ||
   newAdvice.priority === 'warning') &&
  lastLoggedAdvice.current !== newAdvice.text
) {

  lastLoggedAdvice.current = newAdvice.text;

  saveTechnicalLog(
    newAdvice.priority === 'critical'
      ? 'Alerta Crítica del Sistema'
      : 'Advertencia Táctica',
    newAdvice.text,
    newAdvice.priority === 'critical'
      ? 'SEGURIDAD'
      : 'NAVEGACIÓN',
    undefined,
    undefined,
    true
  );
}
      }
    };

    const interval = setInterval(checkTactical, 10000);
    return () => clearInterval(interval);
  }, [isTravesiaActive, depth, weather.wind, navData.xte, engineData.fuel, isEngineOn, advisorText, tacticalAisTargets]);

  const handleAcceptTactical = async () => {
    if (!tacticalAdvice) return;
    await saveTechnicalLog('Ajuste Táctico Realizado', tacticalAdvice, 'SISTEMA', undefined, undefined, true, activeRouteId || undefined);
    setTacticalAdvice(null);
  };

  const generateAIRoute = async (dest: string) => {
    setAdvisorMessage('Calculando ruta meteorológica óptima con IA...');
    try {
      const prompt = `
        Eres un capitán experto y meteorólogo náutico. 
        Origen: ${shipPosition ? `${shipPosition.lat}, ${shipPosition.lng}` : '36.7215, -3.5235'}.
        Destino final: ${targetDestination ? `${targetDestination.lat}, ${targetDestination.lng}` : dest}.
        Condiciones: Viento ${weather.wind} kt de ${weather.windDir}°, Mar ${weather.seaState}.
        
        INSTRUCCIONES CRÍTICAS:
        1. Si el viento es de proa (viento de cara respecto al destino), NO traces una línea recta. Genera una ruta en ZIG-ZAG (bordos) para optimizar la navegación a vela.
        2. Evita obstáculos costeros y profundidades menores a ${selectedShip?.calado || 2.0}m.
        3. Genera un array de coordenadas lat/lng (mínimo 5 puntos).
        
        Briefing táctico:
        - Recomendación de propulsión (VELA o MOTOR).
        - Configuración de velas.
        - ETA y distancia.

        Responde ESTRICTAMENTE con un JSON que tenga esta estructura:
        {
          "briefing": "texto",
          "route": [[lat1, lng1], ...],
          "propulsion": "VELA/MOTOR",
          "velas": "configuración",
          "distancia": 0,
          "eta": "tiempo"
        }
      `;

      const result = await callGemini(prompt, undefined, true);
      if (!result.route || !Array.isArray(result.route)) {

  console.log('⚠️ Gemini no disponible. Generando derrota local.');

if (shipPosition && targetDestination) {

  const localRoute = app.simulation.createLocalOffshoreRoute(
    shipPosition,
    targetDestination
  );

  console.log(
    '🧭 RUTA LOCAL GENERADA:',
    localRoute.length,
    'waypoints'
  );

  setPlannedPath(localRoute);
}

return;
}

      if (result.route && Array.isArray(result.route)) {
        const validRoute = result.route.filter((p: any) =>
          Array.isArray(p) && p.length >= 2 &&
          typeof p[0] === 'number' && !isNaN(p[0]) &&
          typeof p[1] === 'number' && !isNaN(p[1])
        );

        if (validRoute.length > 0) {
          setPlannedPath(validRoute);
          setAiBriefing(result.briefing);
          setAdvisorMessage(`Ruta meteorológica generada. ${result.briefing}`);

          const activeShip = fleet.find(s => s.id === selectedShipId) || fleet[0];
          const barcoIdReal = activeShip ? activeShip.id : (selectedShipId || '00000000-0000-0000-0000-000000000000');

          // Persistencia en tabla 'rutas'
          const { data: rutaData, error: rutaError } = await supabase
            .from('rutas')
            .insert([{
              barco_id: barcoIdReal,
              waypoints: validRoute,
              tipo: 'planificada',
              estado: 'activa',
              meteo_data: {
                viento: weather.wind,
                direccion: weather.windDir,
                mar: weather.seaState,
                timestamp: new Date().toISOString()
              }
            }])
            .select()
            .single();

          if (!rutaError && rutaData) {
            setActiveRouteId(rutaData.id);
          }

          // Registro en Bitácora
          await supabase.from('bitacora').insert([{
            barco_id: barcoIdReal,
            capitan_id: userProfile?.id || null,
            titulo: `Planificación: Ruta a ${dest}`,
            descripcion: `Viento: ${weather.wind} kn | Propulsión: ${result.propulsion}. ${result.briefing}`,
            categoria: 'Planificación',
            waypoints: JSON.stringify(validRoute),
            ruta_id: rutaData?.id,
            is_auto: true,
            propulsion: result.propulsion
          }]);
        }
      }
    } catch (error) {
      if (shipPosition && targetDestination) {

    const localRoute = app.simulation.createLocalOffshoreRoute(
      shipPosition,
      targetDestination
    );

    console.log('🧭 FALLBACK LOCAL:', localRoute.length, 'waypoints');

    setPlannedPath(localRoute);
    setAdvisorMessage('Ruta local generada (Gemini desactivado)');
  }
    }
  };

  // --- PRO NAVIGATION: Route & Waypoint Management ---
  const handleRouteLoaded = async (route: GPXRoute) => {
    setCurrentRoute(route);
    setWaypointIndex(0);

    if (route.waypoints.length > 0) {
      setCurrentWaypoint(route.waypoints[0]);

      // Auto-navigate to first waypoint
      const firstWp = route.waypoints[0];
      updateNavigationPlan(
        { lat: firstWp.lat, lng: firstWp.lng },
        firstWp.name
      );

      notifyAdmiral(
        `📍 Ruta Importada: "${route.name}"\n` +
        `${route.waypoints.length} waypoints | ${route.distance?.toFixed(1) || '?'} NM\n` +
        `Navegando a: ${firstWp.name}`,
        'info'
      );
    }
  };

  const handleNextWaypoint = async () => {
    if (!currentRoute || waypointIndex >= currentRoute.waypoints.length - 1) {
      notifyAdmiral('✓ Ruta completada', 'info');
      setCurrentRoute(null);
      return;
    }

    const nextIdx = waypointIndex + 1;
    const nextWp = currentRoute.waypoints[nextIdx];

    setWaypointIndex(nextIdx);
    setCurrentWaypoint(nextWp);

    // Calculate distance and ETA
    const distance = calculateDistance(
      shipPosition?.lat || 36.7215,
      shipPosition?.lng || -3.5235,
      nextWp.lat,
      nextWp.lng
    );

    const eta = calculateETA(distance, simulatedSog);

    updateNavigationPlan(
      { lat: nextWp.lat, lng: nextWp.lng },
      nextWp.name
    );

    notifyAdmiral(
      `➤ Siguiente waypoint: ${nextWp.name}\n` +
      `Distancia: ${distance.toFixed(1)} NM | ETA: ${eta ? new Date(eta).toLocaleTimeString() : '--:--'}`,
      'info'
    );
  };

  const handleActivateAnchorWatch = () => {
    if (!shipPosition) {
      notifyAdmiral('⚓ Error: Posición no disponible', 'warning');
      return;
    }

    setAnchorPosition(shipPosition);
    setIsAnchorWatchActive(true);
    notifyAdmiral(
      `⚓ Anchor Watch ACTIVO\n` +
      `Posición de fondeo: ${shipPosition.lat.toFixed(4)}°, ${shipPosition.lng.toFixed(4)}°\n` +
      `Umbral: 200m`,
      'info'
    );
  };

  const handleDeactivateAnchorWatch = () => {
    setIsAnchorWatchActive(false);
    setAnchorPosition(null);
    removeAlarmByType('anchor_drift');
    removeAlarmByType('anchor_drag');
    notifyAdmiral('⚓ Anchor Watch DESACTIVADO', 'info');
  };

  const toggleAnchorWatch = () => {
    if (isAnchorWatchActive) {
      handleDeactivateAnchorWatch();
    } else {
      handleActivateAnchorWatch();
    }
  };

  const handleNavigateToDestination = async (coords: { lat: number; lng: number }) => {
    const name = `Punto Táctico (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`;
    updateNavigationPlan(coords, name);

    // Generar ruta óptima y esperar a que se complete para iniciar
    setAdvisorMessage('Calculando derrota óptima e iniciando travesía...');
    await generateAIRoute(name);

    // Iniciar travesía (esto puede abrir el selector de guardia/seguridad)
    handleStartTravesia('IA');
  };

  const handleCourseChange = (newCourse: number) => {
    saveLogEntry('Evento Automático', `Navegación: Rumbo alterado a ${newCourse.toFixed(0)}°`, 'Navegación');
  };

  const handleStartTravesia = async (modo: 'Libre' | 'IA', levels?: { fuel_level: number; water_level: number }, crew?: any[]) => {
    console.log('App: handleStartTravesia called', { modo, userProfile, selectedShipId, levels, crew });

    const activeCrew = crew && crew.length > 0 ? crew : (userProfile ? [{
      id: 'captain-' + userProfile.id,
      nombre: userProfile.name,
      rango: 'Capitán',
      is_captain: true
    }] : []);

    if (activeCrew.length > 0) {
      console.log('App: Transitioning to Watch Selection with crew:', activeCrew.map(c => c.nombre));
      setCrewOnBoard(activeCrew);
      setPendingTravesiaData({ modo, levels });
      setShowWatchSelection(true);
      return;
    }

    console.log('App: Absolutely no crew available, proceeding directly');
    await proceedWithStartTravesia(modo, levels);
  };

  const proceedWithStartTravesia = async (modo: 'Libre' | 'IA', levels?: { fuel_level: number; water_level: number }, startingOfficerId?: string) => {
    console.log('App: proceedWithStartTravesia called', { modo, levels, startingOfficerId });


    const activeShip = fleet.find(s => s.id === selectedShipId) || fleet[0];
    const barcoIdReal = activeShip?.id || null;

    setIsTravesiaActive(true);
    setStartTime(new Date());
    setTripDistance(0);
    setCurrentPath([]);
    if (
      Object.values(dataSource).every(v => v === 'simulated') &&
      shipPosition &&
      navPlan.targetCoords
    ) {

      app.simulation.resetNavigation(1);

if (plannedPath.length > 1) {

  console.log(
    '🧭 Derrota cargada:',
    plannedPath.length,
    'waypoints'
  );

  setRutaActiva(plannedPath);

} else {

  console.log(
    '⚠️ Generando derrota local'
  );

  const localRoute = app.simulation.createLocalOffshoreRoute(
    shipPosition,
    navPlan.targetCoords
  );

  setRutaActiva(localRoute);
}



      const modeText = modo === 'IA' ? 'Planificada' : 'Libre';
      setNavigationMode(modeText as any);
      setTipoTravesia(modo === 'IA' ? 'asistida' : 'libre');

      // REGISTRO DE BITÁCORA ENRIQUECIDO - REQUERIMIENTO ALMIRANTE
      if (navPlan.targetCoords) {
        await saveTechnicalLog(
          'INICIO DE DERROTA ASISTIDA',
          `Misión iniciada. Origen: Motril. Destino: ${navPlan.targetName}. Distancia: ${navPlan.distanceNM} NM. ETA: ${navPlan.eta}. Sistemas en línea.`,
          'Navegación',
          'Planificada',
          navPlan.targetName
        );
      } else {
        await saveTechnicalLog(
          'NAVEGACIÓN LIBRE',
          `Misión iniciada en modo libre. Posición inicial: ${shipPosition?.lat.toFixed(4)}, ${shipPosition?.lng.toFixed(4)}. Rumbo operativo fijado.`,
          'Navegación',
          'Libre'
        );
      }

      if (selectedShipId) {
        try {
          const statusUpdate: any = { is_navigating: true };
          if (levels) {
            statusUpdate.fuel_level = levels.fuel_level;
            statusUpdate.water_level = levels.water_level;
          }

          await supabase
            .from('vessel_status')
            .update(statusUpdate)
            .eq('barco_id', selectedShipId);
        } catch (e) {
          console.warn('App: Failed to update vessel_status, continuing anyway:', e);
        }
      }

      setIsSafetyChecklistComplete(true);
      setShowSafetyModal(false);
      setShowWatchSelection(false);
      setIsExplainingAiRoute(false);
      setActiveTab('control');

      const motrilPos = { lat: 36.7215, lng: -3.5235 };
      setShipPosition(motrilPos);

      try {
        // Solo generar entrada automática si es PLANIFICADA (IA)
        if (modo === 'IA') {
          await forceSaveLog(
            'Iniciar Travesía Planificada',
            `Zarpando de Puerto de Salida: Motril -> Destino: ${navigationDestination || 'Ibiza'}. Navegación Asistida activa.`,
            'Navegación',
            'Planificada',
            navigationDestination || undefined,
            true,
            activeRouteId || undefined
          );
        } else {
          // En libre, solo mencionamos que se ha activado el sistema
          setAdvisorMessage('Sistemas tácticos activados. Modo Navegación Libre.');
        }

        await supabase
          .from('barcos')
          .update({
            lat: motrilPos.lat,
            lng: motrilPos.lng,
            en_navegacion: true,
            ultima_actividad: new Date().toISOString()
          })
          .eq('id', barcoIdReal);
      } catch (err: unknown) {
        console.error('Error in handleStartTravesia:', err);
        alert('Error al guardar en base de datos navigation status');
      }
    };
    };

    useEffect(() => {
      if (!selectedShipId) return;

      const barcoIdReal = selectedShipId;

      console.log('App: Fetching vessel_status for barco_id', barcoIdReal);
      supabase
        .from('vessel_status')
        .select('*')
        .eq('barco_id', barcoIdReal)
        .maybeSingle()
        .then(({ data, error }) => {
          if (error) {
            console.error('App: Error fetching vessel_status', error);
          }
          if (data) {
            console.log('App: vessel_status data', data);
            setVesselStatus(data);
            if (data.is_navigating !== isTravesiaActive) {
              setIsTravesiaActive(data.is_navigating);
            }
          }
        });

      // Real-time subscription
      const channel = supabase
        .channel(`vessel_status_global_${barcoIdReal}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'vessel_status',
            filter: `barco_id=eq.${barcoIdReal}`
          },
          (payload) => {
            const newData = payload.new as VesselStatus;
            setVesselStatus(newData);
            setIsTravesiaActive(newData.is_navigating);
          }

        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }, [selectedShipId]);

    const handleUpdateProfile = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!userProfile) return;
      setIsUpdatingProfile(true);

      const updateData = {
        id: userProfile!.id,
        email: userProfile!.email,
        nombre: profileForm.nombre_completo || 'Capitán',
        nombre_completo: profileForm.nombre_completo,
        telefono: profileForm.telefono,
        licencia_nautica: profileForm.licencia_nautica,
        dni_nie: profileForm.dni_nie,
        fecha_nacimiento: profileForm.fecha_nacimiento || null,
        foto_perfil_url: profileForm.foto_perfil_url,
        nacionalidad: profileForm.nacionalidad,
        direccion: profileForm.direccion,
        poblacion: profileForm.poblacion,
        codigo_postal: profileForm.codigo_postal,
        provincia: profileForm.provincia,
        contacto_emergencia_nombre: profileForm.contacto_emergencia_nombre,
        contacto_emergencia_telefono: profileForm.contacto_emergencia_telefono,
        grupo_sanguineo: profileForm.grupo_sanguineo,
        observaciones_medicas: profileForm.observaciones_medicas,
        rol: userProfile.role || 'capitan',
        updated_at: new Date().toISOString()
      };

      console.log('--- PERSISTENCIA TÁCTICA: GUARDANDO PERFIL ---');
      console.log('Datos a enviar:', updateData);

      const { error } = await supabase
        .from('usuarios')
        .upsert(updateData, { onConflict: 'id' });

      if (error) {
        console.error('ERROR DE PERSISTENCIA (Supabase):', error);
        setAdvisorMessage(`FALLO EN LA BASE DE DATOS: ${error.message}`);
        alert(`Error crítico al guardar: ${error.message}\nCódigo: ${error.code}`);
      } else {
        //console.log('PERFIL GUARDADO EXITOSAMENTE');
        setAdvisorMessage('¡Sistemas de persistencia OK! Perfil sincronizado en la nube.');
        await fetchProfile(userProfile.id);
      }
      setIsUpdatingProfile(false);
    };

    const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !userProfile) return;

      setIsUpdatingProfile(true);
      // Filename as requested: avatar_${userProfile!.id}.png
      const fileName = `avatar_${userProfile!.id}.png`;

      const { error: uploadError } = await supabase.storage
        .from('avatares')
        .upload(fileName, file, { upsert: true });

      if (uploadError) {
        setAdvisorMessage(`Error al subir avatar: ${uploadError.message}`);
        setIsUpdatingProfile(false);
        return;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('avatares')
        .getPublicUrl(fileName);



      // Forced update to database immediately
      const { error: updateError } = await supabase
        .from('usuarios')
        .update({
          foto_perfil_url: publicUrl
        })
        .eq('id', userProfile.id);

      if (updateError) {
        console.error("Error al actualizar foto_perfil_url:", updateError);
        setAdvisorMessage(`Error al guardar URL de avatar: ${updateError.message}`);
      } else {


        // Add a cache-busting timestamp to the URL to force browser refresh
        const cacheBustedUrl = `${publicUrl}?t=${Date.now()}`;

        setProfileForm(prev => ({ ...prev, foto_perfil_url: cacheBustedUrl }));
        setAdvisorMessage('Avatar actualizado y sincronizado en todos los sistemas.');

        // Update global state immediately with cache-busting
        setUserProfile(prev => prev ? ({ ...prev, photoUrl: cacheBustedUrl, foto_perfil_url: cacheBustedUrl }) : null);

        // Also fetch from server to be sure
        await fetchProfile(userProfile.id);
      }
      setIsUpdatingProfile(false);
    };

    useEffect(() => {
      if (selectedShipId) {
        // fetchLogEntries is now handled in Logbook component
      }
    }, [selectedShipId]);

    // Sync engineData with selectedShip levels
    useEffect(() => {
      if (selectedShip) {
        setEngineData(prev => ({
          ...prev,
          fuel: selectedShip.fuel_level ?? prev.fuel,
          water: selectedShip.water_level ?? prev.water
        }));
      }
    }, [selectedShip]);

    // --- MONITOR TÁCTICO DE FONDEO ---
    useEffect(() => {
      if (!isAnchorWatchActive || !anchorPosition || !shipPosition) return;

      const monitorInterval = setInterval(async () => {
        const distToAnchor = calculateDistanceNM(
          shipPosition.lat, shipPosition.lng,
          anchorPosition.lat, anchorPosition.lng
        ) * 1852; // Convertir a metros

        const radius = calculateSwingRadius(anchorSettings.depth, anchorSettings.chain, anchorSettings.margin);

        setSwingRadius(radius);
        setCurrentAnchorDistance(distToAnchor);

        setAnchorHistory(prev => {
          const newHistory = [...prev, distToAnchor].slice(-30);
          const trend = analyzeAnchorTrend(newHistory, radius);
          setAnchorTrend(trend);
          return newHistory;
        });

        if (anchorTrend === 'drifting') {
          notifyAdmiral(`ALERTA DE GARREO: El buque está desplazándose fuera del radio de borneo (${distToAnchor.toFixed(0)}m).`, 'critical');
        }

        // Registro Automático cada 10 minutos o cambio de viento brusco
        const trend = "linear";
        setAnchorSettings(prev => ({ ...prev, trend })); // Actualizar la tendencia de garreo
        if (Date.now() % 600000 < 5000) {
          await saveTechnicalLog(
            'Log de Fondeo',
            formatAnchorLog(selectedShip?.nombre || 'Buque', anchorSettings.depth, anchorSettings.chain, weather.wind, distToAnchor),
            'Seguridad'
          );
        }

        setNavData(prev => ({
          ...prev,
          isAnchorActive: true,
          anchorDistance: distToAnchor,
          swingRadius: radius
        }));

      }, 5000);

      return () => clearInterval(monitorInterval);
    }, [isAnchorWatchActive, anchorPosition, shipPosition, anchorSettings, weather.wind, anchorTrend, selectedShip?.nombre]);

    useEffect(() => {
      // Check initial session
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          fetchProfile(session.user.id);
          fetchFleet(session.user.id);
        } else {
          setIsInitialLoading(false);
        }
      });

      // Listen for auth changes
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          fetchProfile(session.user.id);
          // Load fleet on login - FORCED MOTRIL POSITION
          fetchFleet(session.user.id);
        } else {
          setIsLoggedIn(false);
          setUserProfile(null);
          setIsInitialLoading(false);
        }
      });

      return () => subscription.unsubscribe();
    }, []);


    const fetchProfile = async (userId: string) => {
      const { data, error } = await userRepository.getProfile(userId);

      if (error) {
        console.error('Error fetching profile:', error);
        // Fallback: If auth exists but profile fetch failed, try to use auth data anyway
        // to avoid locking out the user completely
        const authUser = (await supabase.auth.getUser()).data.user;
        if (authUser) {
          setUserProfile({
            id: authUser.id,
            email: authUser.email || '',
            name: authUser.user_metadata?.nombre || authUser.user_metadata?.full_name || 'Capitán',
            role: 'capitan',
            plan_tactico: 'basico',
            suscripcion_activa: true,
            plan_nivel: 'gratis',
            photoUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${authUser.email}`
          });
          setIsLoggedIn(true);
        } else {
          setIsLoggedIn(false);
        }
        setIsInitialLoading(false);
        return;
      }

      if (data) {
        setUserProfile({
          id: data.id,
          email: data.email,
          name: data.nombre || 'Capitán',
          role: data.rol || 'capitan',
          barco_activo_id: data.barco_activo_id,
          plan_tactico: data.suscripciones?.[0]?.plan_tactico || 'basico',
          photoUrl: data.foto_perfil_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${data.email}`,
          suscripcion_activa: true,
          plan_nivel: 'gratis',
          ...data
        });
        if (data.barco_activo_id) {
          setSelectedShipId(data.barco_activo_id);
        }
        setIsLoggedIn(true);
      } else {
        // Data is null but no error? Could happen if no row matches
        const authUser = (await supabase.auth.getUser()).data.user;
        if (authUser) {
          setUserProfile({
            id: authUser.id,
            email: authUser.email || '',
            name: authUser.user_metadata?.nombre || authUser.user_metadata?.full_name || 'Capitán',
            role: 'capitan',
            plan_tactico: 'basico',
            suscripcion_activa: true,
            plan_nivel: 'gratis',
            photoUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${authUser.email}`
          });
          setIsLoggedIn(true);
        }
      }
      setIsInitialLoading(false);
    };

    // Fetch active route on ship selection
    useEffect(() => {
      const fetchActiveRoute = async () => {
        // 0. Safety Check - MUST have a valid ship ID
        if (!selectedShipId || fleet.length === 0) {
          setIsTravesiaActive(false);
          return;
        }

        const activeShip = fleet.find(s => s.id === selectedShipId) || fleet[0];
        const barcoIdReal = activeShip?.id;

        if (!barcoIdReal) return;

        // 1. Check active routes
        const { data: routeData } = await logRepository.getActiveRuta(barcoIdReal);

        if (routeData) {
          setPlannedPath(routeData.waypoints);
          setActiveRouteId(routeData.id);
        }

        // 2. Check ANY active log in bitacora (MASTER SOURCE OF TRUTH)
        const { data: activeLog, error: bitacoraError } = await logRepository.getActiveLog(barcoIdReal);

        if (bitacoraError) {
          console.error('App: bitacora fetch error:', bitacoraError);
        }

        if (activeLog) {
          setIsTravesiaActive(true);
          if (activeLog.destino_planificado) {
            setNavigationDestination(activeLog.destino_planificado);
            setTargetDestination({ lat: 38.9067, lng: 1.4206 }); // Fallback to Ibiza for visualization
          }
          if (activeLog.tipo_navegacion) {
            setNavigationMode(activeLog.tipo_navegacion as any);
          }
        } else {
          setIsTravesiaActive(false);
          setNavigationDestination('');
        }
      };
      fetchActiveRoute();
    }, [selectedShipId, fleet.length]); // Better dependencies to avoid loops

    const morningReportTriggeredRef = useRef(false);

    useEffect(() => {
      if (isLoggedIn && userProfile?.id && selectedShipId) {
        if (morningReportTriggeredRef.current) return;

        // Fetch user's ships
        fetchFleet(userProfile.id);

        if (userProfile.role === 'admin') {
          userRepository.getAllUsers().then(({ data, error }) => {
            if (error && (error.message.includes('permission') || error.code === '42501')) {
              setAdvisorMessage('Almirante, no tiene permisos para ver la lista de usuarios.');
            }
            if (data) setAllUsers(data);
          });

          // Fetch all ships with captain emails for admin
          vesselRepository.getAllVessels().then(({ data, error }) => {
            if (error) {
              if (error.message.includes('permission') || error.code === '42501') {
                setAdvisorMessage('Almirante, no tiene permisos para ver la flota global.');
              }
              return;
            }
            if (data) {
              const formattedAllShips: (ShipData & { capitan_email?: string })[] = data.map((s: any) => ({
                id: s.id,
                name: s.nombre,
                brand: s.marca,
                model: s.modelo,
                registration: s.matricula,
                length: s.eslora,
                beam: s.manga,
                draft: s.calado,
                capitan_id: s.capitan_id,
                user_id: s.capitan_id,
                capitan_email: s.usuarios?.email,
                tipo_barco: s.tipo_barco,
                foto_url: s.foto_url,
                lat: s.lat || 36.7215,
                lng: s.lng || -3.5235,
                type: s.tipo_barco || 'Motor',
                // Add missing required fields for ShipData
                nombre: s.nombre,
                modelo: s.modelo,
                marca: s.marca,
                matricula: s.matricula,
                eslora: s.eslora,
                manga: s.manga,
                calado: s.calado,
                potencia_cv: s.potencia_cv || 0,
                numero_serie_casco: s.numero_serie_casco || '',
                fecha_itb: s.fecha_itb || '',
                fecha_seguro: s.fecha_seguro || '',
                fuel_level: s.fuel_level,
                water_level: s.water_level
              }));
              setAllShips(formattedAllShips);
            }
          });
        }

        // Advisor Greeting & Morning Report
        if (userProfile.role === 'admin') {
          setAdvisorMessage(`Bienvenido de nuevo, Almirante ${userProfile.name.split(' ')[0]}.`);
        } else {
          setAdvisorMessage(`¡Buenos días, Capitán ${userProfile.name}!`);
        }

        // Force Morning Report
        morningReportTriggeredRef.current = true;
        // generateMorningReport();
      }
    }, [isLoggedIn, userProfile?.id, selectedShipId]);

    useEffect(() => {
      if (userProfile?.role === 'almirante') {
        const andaluciaIndex = MBTILES_ZONES.findIndex(z => z.id === 'andalucia');
        if (andaluciaIndex !== -1) {
          setChartMode('mbtiles');
          setMbtileIndex(andaluciaIndex);
          setMapCenter(MBTILES_ZONES[andaluciaIndex].center);
        }
      }
    }, [userProfile?.role]);

    const [showShipForm, setShowShipForm] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [shipPhoto, setShipPhoto] = useState<File | null>(null);
    const [editShipPhoto, setEditShipPhoto] = useState<File | null>(null);
    const [newShip, setNewShip] = useState({
      nombre: '', marca: '', modelo: '', matricula: '', eslora: '', manga: '', calado: '', tipo_barco: 'Velero',
      mmsi: '', ais: '', ultimo_mantenimiento_motor: null as string | null, ultima_revision_balsa: null as string | null,
      lat: 36.7215, lng: -3.5235
    });

    const handleAddShip = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!userProfile) return;

      // Verificar sesión antes de subir
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setAdvisorMessage('Almirante, la sesión ha expirado. Por favor, vuelva a entrar.');
        return;
      }

      const canAddShip = (userProfile?.role === 'almirante' || userProfile?.role === 'admin') ||
        (userProfile?.plan_nivel === 'oro') ||
        (userProfile?.plan_nivel === 'plata' && fleet.length < 5) ||
        (userProfile?.plan_nivel === 'gratis' && fleet.length < 1);

      if (!canAddShip) {
        setAdvisorMessage('Límite de flota alcanzado para su plan actual. Actualice para añadir más unidades.');
        return;
      }

      setIsUploading(true);

      try {
        let foto_url = null;

        if (shipPhoto) {
          try {
            const fileName = `barcos/${session.user.id}/${Date.now()}-${shipPhoto.name}`;
            const { error: uploadError } = await supabase.storage
              .from('fotos-barco')
              .upload(fileName, shipPhoto, { upsert: true });

            if (uploadError) {
              console.error('Error de Storage:', uploadError);
              setAdvisorMessage('Almirante, fallo en el sistema de imágenes. Registrando solo datos técnicos...');
            } else {
              const { data: { publicUrl } } = supabase.storage
                .from('fotos-barco')
                .getPublicUrl(fileName);
              foto_url = publicUrl;
            }
          } catch (storageErr) {
            console.error('Excepción en Storage:', storageErr);
            setAdvisorMessage('Almirante, el hangar de fotos no responde. Procediendo con el registro de datos.');
          }
        }

        const shipToInsert = {
          nombre: newShip.nombre,
          marca: newShip.marca,
          modelo: newShip.modelo,
          matricula: newShip.matricula,
          eslora: parseFloat(newShip.eslora),
          manga: parseFloat(newShip.manga),
          calado: parseFloat(newShip.calado),
          tipo_barco: newShip.tipo_barco,
          mmsi: newShip.mmsi || null,
          ais: newShip.ais || null,
          ultimo_mantenimiento_motor: newShip.ultimo_mantenimiento_motor || null,
          ultima_revision_balsa: newShip.ultima_revision_balsa || null,
          foto_url: foto_url,
          capitan_id: session.user.id,
          // FORCED MOTRIL POSITION
          lat: 36.7215,
          lng: -3.5235
        };


        const { error } = await vesselRepository.insertVessel(shipToInsert);

        if (error) {
          if (error.message.includes('permission') || error.code === '42501') {
            setAdvisorMessage('Almirante, no tiene permisos para ver esta unidad (Tabla Barcos).');
          }
          throw error;
        }

        setShowShipForm(false);
        setNewShip({
          nombre: '', marca: '', modelo: '', matricula: '', eslora: '', manga: '', calado: '', tipo_barco: 'Velero',
          mmsi: '', ais: '', ultimo_mantenimiento_motor: null, ultima_revision_balsa: null,
          lat: 36.7215, lng: -3.5235
        });
        setShipPhoto(null);

        // Refresh fleet using centralized function
        if (userProfile?.id) {
          fetchFleet(userProfile.id);
        }
      } catch (err: unknown) {
        console.error('Error en registro:', err);
        const errorMessage = err instanceof Error ? err.message : 'Error desconocido';
        if (!errorMessage.includes('permission')) {
          alert('Error al registrar barco: ' + errorMessage);
        }
      } finally {
        setIsUploading(false);
      }
    };

    const getShipIcon = (tipo?: string, size: string = "w-5 h-5") => {
      const className = `${size} text-cyan-400`;
      switch (tipo) {
        case 'Velero': return <Wind className={className} />;
        case 'Motora': return <Zap className={className} />;
        case 'Catamarán': return <LayoutDashboard className={className} />;
        case 'Yate': return <Ship className={className} />;
        case 'Semirrígida': return <Anchor className={className} />;
        default: return <Ship className={className} />;
      }
    };

    const getShipEmoji = (tipo?: string) => {
      switch (tipo) {
        case 'Velero': return '⛵';
        case 'Motora': return '🚤';
        case 'Catamarán': return '🛥️';
        case 'Yate': return '🚢';
        case 'Semirrígida': return '🛶';
        default: return '⚓';
      }
    };

    const getDefaultShipImage = (tipo?: string) => {
      switch (tipo) {
        case 'Velero': return 'https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=1000&auto=format&fit=crop';
        case 'Motora': return 'https://images.unsplash.com/photo-1567899378494-47b22a2ae96a?q=80&w=1000&auto=format&fit=crop';
        case 'Catamarán': return 'https://images.unsplash.com/photo-1516939884455-1445c8652f83?q=80&w=1000&auto=format&fit=crop';
        case 'Yate': return 'https://images.unsplash.com/photo-1569263979104-865ab7cd8d13?q=80&w=1000&auto=format&fit=crop';
        case 'Semirrígida': return 'https://images.unsplash.com/photo-1544551763-47a0159c9638?q=80&w=1000&auto=format&fit=crop';
        default: return 'https://images.unsplash.com/photo-1567899378494-47b22a2ae96a?q=80&w=1000&auto=format&fit=crop';
      }
    };

    const handleCaptureLocation = () => {
      // Static capture for Motril
      setNewShip(prev => ({ ...prev, lat: 36.7215, lng: -3.5235 }));
      setAdvisorMessage(`Ubicación capturada (Motril): 36.7215, -3.5235`);
    };

    const fetchMantenimiento = async (barcoId: string | number) => {
      try {
        const { data, error } = await supabase
          .from('mantenimiento')
          .select('*')
          .eq('barco_id', barcoId)
          .order('fecha', { ascending: false });
        if (error) throw error;
        if (data) setHistorial(data);
      } catch (err: any) {
        console.error('Error fetching maintenance:', err);
      }
    };

    const handleDeleteShip = async (shipId: string) => {
      if (!window.confirm('¿Está seguro de que desea eliminar este barco? Esta acción es irreversible y se perderán todos sus datos asociados.')) return;

      try {
        const { error } = await vesselRepository.deleteVessel(shipId);

        if (error) throw error;

        setAdvisorMessage('Embarcación dada de baja de la flota con éxito.');
        if (selectedShipId === shipId) {
          handleShipSelection(null);
          setSelectedBarco(null);
        }
        fetchFleet(userProfile!.id);
      } catch (err: any) {
        console.error('Error deleting ship:', err);
        if (err.message?.includes('foreign key constraint')) {
          setAdvisorMessage(`Error: No se puede borrar el barco porque tiene registros asociados (Bitácora/Mantenimiento). Contacte con administración para borrado en cascada.`);
        } else {
          setAdvisorMessage(`Fallo al eliminar barco: ${err.message}`);
        }
      }
    };

    const saveFichaTecnica = async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const effectiveShipId = selectedBarco?.id || selectedShipId;
      if (!effectiveShipId || !selectedBarco) {
        alert('Error: No se ha detectado el ID del barco.');
        return;
      }

      setIsUploading(true);
      let finalPhotoUrl = selectedBarco.foto_url || '';

      try {
        if (editShipPhoto) {
          const fileExt = editShipPhoto.name.split('.').pop();
          const fileName = `${effectiveShipId}/${Date.now()}_${editShipPhoto.name}`;
          const filePath = `barcos/${fileName}`;

          if (selectedBarco.foto_url) {
            try {
              const oldPath = selectedBarco.foto_url.split('/public/fotos-barco/').pop();
              if (oldPath) {
                await supabase.storage.from('fotos-barco').remove([oldPath]);
              }
            } catch (err) {
              console.error('Error deleting old photo:', err);
            }
          }

          const { error: uploadError } = await supabase.storage
            .from('fotos-barco')
            .upload(filePath, editShipPhoto);

          if (uploadError) throw uploadError;

          const { data: { publicUrl } } = supabase.storage
            .from('fotos-barco')
            .getPublicUrl(filePath);

          finalPhotoUrl = publicUrl;
        }

        // USANDO ESTADOS REACT DIRECTAMENTE (Eliminando FormData)
        const updates = {
          mmsi: selectedBarco.mmsi,
          ais: selectedBarco.ais,
          ultimo_mantenimiento_motor: selectedBarco.ultimo_mantenimiento_motor ?? undefined,
          ultima_revision_balsa: selectedBarco.ultima_revision_balsa ?? undefined,
          ultima_revision_extintores: selectedBarco.ultima_revision_extintores ?? undefined,
          eslora: selectedBarco.eslora,
          documentacion_url: selectedBarco.documentacion_url,
          manual_pdf: selectedBarco.manual_pdf,
          fuel_level: selectedBarco.fuel_level,
          water_level: selectedBarco.water_level,
          docs_certificado_navegabilidad: selectedBarco.docs_certificado_navegabilidad,
          docs_permiso_navegacion: selectedBarco.docs_permiso_navegacion,
          docs_seguro_vigente: selectedBarco.docs_seguro_vigente,
          docs_itb_vigente: selectedBarco.docs_itb_vigente,
          docs_dni_tripulacion: selectedBarco.docs_dni_tripulacion,
          docs_titulacion_patron: selectedBarco.docs_titulacion_patron,
          docs_leb_mmsi: selectedBarco.docs_leb_mmsi,
          url_certificado_navegabilidad: selectedBarco.url_certificado_navegabilidad,
          url_permiso_navegacion: selectedBarco.url_permiso_navegacion,
          url_seguro: selectedBarco.url_seguro,
          url_itb: selectedBarco.url_itb,
          url_dni_tripulacion: selectedBarco.url_dni_tripulacion,
          url_titulacion_patron: selectedBarco.url_titulacion_patron,
          url_leb_mmsi: selectedBarco.url_leb_mmsi,
          foto_url: finalPhotoUrl
        };

        const { error } = await vesselRepository.updateVessel(effectiveShipId, updates);

        if (error) {
          alert('Error al guardar en base de datos: ' + error.message);
        } else {
          setAdvisorMessage('Ficha técnica actualizada correctamente.');
          setEditShipPhoto(null);
          // Actualizar el objeto seleccionado localmente para reflejar los cambios de inmediato
          if (selectedBarco && selectedBarco.id === effectiveShipId) {
            setSelectedBarco({
              ...selectedBarco,
              ...updates,
              foto_url: finalPhotoUrl
            });
          }
          fetchFleet(userProfile?.id || '');
        }
      } catch (err: any) {
        console.error('Error saving technical file:', err);
        alert('Error al guardar en base de datos: ' + err.message);
      } finally {
        setIsUploading(false);
      }
    };

    const addMantenimiento = async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const effectiveShipId = selectedShipId;
      if (!effectiveShipId) {
        alert('Seleccione un barco primero.');
        return;
      }

      const formData = new FormData(e.currentTarget);
      const tarea = formData.get('tarea') as string;
      const fecha = formData.get('fecha') as string;
      const horas = formData.get('horas_motor_mantenimiento') ? Number(formData.get('horas_motor_mantenimiento')) : null;

      try {
        // CORRECCIÓN: Solo enviar barco_id y datos de tarea (Eliminado capitan_id)
        const { error } = await supabase
          .from('mantenimiento')
          .insert([{
            tarea,
            fecha,
            horas_motor_mantenimiento: horas,
            barco_id: effectiveShipId
          }]);

        if (error) throw error;

        setAdvisorMessage('Tarea de mantenimiento registrada.');
        fetchMantenimiento(effectiveShipId);
        (e.target as HTMLFormElement).reset();
      } catch (err: any) {
        console.error('Error registering task:', err);
        alert('Error al guardar tarea: ' + err.message);
      }
    };


    const handleAiRouteSubmit = async () => {
      if (!aiRoutePrompt.trim()) return;
      setIsAiProcessing(true);

      // Save prompt as destination fallback
      setNavigationDestination(aiRoutePrompt.length > 30 ? aiRoutePrompt.substring(0, 30) + '...' : aiRoutePrompt);

      const mockBriefing = (prompt: string) =>
        `Almirante, la ruta hacia "${prompt}" ha sido validada. Las condiciones son favorables. Proceda con el checklist de seguridad para iniciar la navegación asistida.`;

      try {
        const prompt = `Actúa como un Almirante navegante experto. El usuario quiere realizar la siguiente travesía: "${aiRoutePrompt}". 
      Si mencionan un destino, extráelo y úsalo en tu briefing.
      Confirma la ruta, menciona brevemente los puntos clave y da un briefing estratégico de 3 líneas máximo. 
      Termina siempre pidiendo que el capitán complete el checklist de seguridad.`.replace(/[\r\n]/g, " ");

        const responseText = await callGemini(prompt);

        setAiBriefing(responseText.text);
        setIsExplainingAiRoute(false);
        setShowSafetyModal(true);
      } catch (err) {
        console.error("AI Route Error:", err);
        setAiBriefing(mockBriefing(aiRoutePrompt));
        setAdvisorMessage("AI Briefing en modo simulación (Offline).");
        setIsExplainingAiRoute(false);
        setShowSafetyModal(true);
      } finally {
        setIsAiProcessing(false);
      }
    };

    const renderContent = () => {
      switch (activeTab) {
        case 'navigation':
          return (
            <div className="h-full overflow-y-auto custom-scrollbar">
              <NavigationDashboard
                lang={lang}
                dataSource={dataSource}
                setDataSource={setDataSource}
                sensorQuality={sensorQuality}
              />
            </div>
          );
        case 'logbook':
          return (
            <div className="h-full w-full bg-slate-950 overflow-y-auto custom-scrollbar">
              <Logbook
                userProfile={userProfile!}
                supabase={supabase}
                fleet={fleet}
                selectedShipId={selectedShipId}
                setAdvisorMessage={setAdvisorMessage}
                logEntries={logEntries}
                setLogEntries={setLogEntries}
                saveLogEntry={saveTechnicalLog}
                isEngineOn={isEngineOn}
                setIsEngineOn={setIsEngineOn}
                onClearAdvisor={() => {
                  setAdvisorText(null);
                  setIsAdvisorOpen(false);
                }}
              />
            </div>
          );
        case 'profile':
          return (
            <div className="h-full overflow-y-auto custom-scrollbar">
              <ProfileEditor
                userProfile={userProfile}
                profileForm={profileForm}
                setProfileForm={setProfileForm}
                handleUpdateProfile={handleUpdateProfile}
                isUpdatingProfile={isUpdatingProfile}
                handleAvatarUpload={handleAvatarUpload}
                fetchProfile={fetchProfile}
              />
            </div>
          );
        case 'admin':
          return (
            <div className="h-full overflow-y-auto custom-scrollbar">
              {userProfile?.role === 'almirante' || userProfile?.role === 'admin' ? (
                <PanelAlmirantazgo supabase={supabase} currentUser={userProfile} />
              ) : (
                <AdminPanel
                  userProfile={userProfile}
                  allUsers={allUsers}
                  allShips={allShips}
                />
              )}
            </div>
          );
        case 'inventory':
          return (
            <div className="h-full overflow-y-auto custom-scrollbar">
              <InventoryManager
                inventory={selectedShip?.inventory || []}
                vesselStatus={vesselStatus}
                supabase={supabase}
                selectedShipId={selectedShipId}
                saveLogEntry={async (entry: any) => {
                  if (typeof entry === 'object' && entry.titulo) {
                    await saveTechnicalLog(entry.titulo, entry.descripcion, entry.categoria);
                    notifyAdmiral(`Logística: ${entry.titulo}. ${entry.descripcion}`, 'success');
                  }
                }}
                userProfile={userProfile}
                onClose={() => setActiveTab('control')}
              />
            </div>
          );
        case 'guide':
          return (
            <div className="h-full overflow-y-auto custom-scrollbar">
              <Suspense
                fallback={
                  <div className="h-full min-h-[420px] flex items-center justify-center bg-slate-950 text-cyan-400">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                }
              >
                <Vademecum onClose={() => setActiveTab('control')} />
              </Suspense>
            </div>
          );
        case 'fleet':
          return (
            <div className="h-full overflow-y-auto custom-scrollbar">
              <FleetManager
                fleet={fleet}
                userProfile={userProfile}
                selectedShipId={selectedShipId}
                setSelectedShipId={handleShipSelection}
                showShipForm={showShipForm}
                setShowShipForm={setShowShipForm}
                newShip={newShip}
                setNewShip={setNewShip as any}
                handleAddShip={handleAddShip}
                handleDeleteShip={handleDeleteShip}
                isUploading={isUploading}
                setShipPhoto={setShipPhoto}
                shipPhoto={shipPhoto}
                handleCaptureLocation={handleCaptureLocation}
                getShipIcon={getShipIcon}
                getDefaultShipImage={getDefaultShipImage}
                selectedBarco={selectedBarco}
                setSelectedBarco={setSelectedBarco}
                fleetTab={fleetTab}
                setFleetTab={setFleetTab}
                fetchMantenimiento={fetchMantenimiento}
                saveFichaTecnica={saveFichaTecnica}
                addMantenimiento={addMantenimiento}
                historial={historial}
                editShipPhoto={editShipPhoto}
                setEditShipPhoto={setEditShipPhoto}
              />
            </div>
          );
        case 'shield':
          return (
            <div className="h-full overflow-hidden">
              <WatchdogPanel
                alarms={alarms}
                alarmHistory={alarmHistory}
                thresholds={thresholds}
                onRemoveAlarm={removeAlarm}
                onAddAlarm={addAlarm}
                isMuted={isAlertMuted}
                onMuteToggle={() => setIsAlertMuted(!isAlertMuted)}
              />
            </div>
          );
        case 'config':
          return (
            <div className="h-full overflow-y-auto custom-scrollbar">
              <ConfigurationPanel
                dataSource={dataSource}
                setDataSource={setDataSource}
                thresholds={thresholds}
                setThresholds={setThresholds}
                cartasPath={cartasPath}
                onCambiarCarpeta={handleCambiarCarpeta}
                simulationSpeed={simulationSpeed}
                setSimulationSpeed={setSimulationSpeed}
              />
            </div>
          );
        default: // Control Center
          return null;
      }
    };


    if (isInitialLoading) {
      return (
        <div className="h-screen w-full bg-slate-950 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-12 h-12 text-cyan-500 animate-spin" />
            <p className="text-xs font-black text-cyan-500 uppercase tracking-[0.3em] animate-pulse">Iniciando Sistemas de Navegación...</p>
          </div>
        </div>
      );
    }

    if (!isLoggedIn) return <AuthScreen />;

    return (
      <div className="h-screen w-full bg-[#0a0f18] flex font-sans overflow-hidden relative">
        <AlarmToasts alarms={alarms} onRemove={removeAlarm} isMuted={isAlertMuted} onMuteToggle={() => setIsAlertMuted(!isAlertMuted)} />

        <CommandSidebar
          isSidebarOpen={isSidebarOpen}
          setIsSidebarOpen={setIsSidebarOpen}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          userProfile={userProfile}
          t={t}
          onSignOut={() => supabase.auth.signOut()}
          lang={lang}
          setLang={setLang}
        />

        {/* Main Area */}
        <main className="flex-1 flex flex-col bg-[#0a0f18] overflow-hidden relative">
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] z-0" />

          <StatusBar
            vmg={navPlan?.vmg || 0}
            gpsStatus={dataSource.gps === 'real' ? 'fix' : 'searching'}
            battery={batteryLevel}
            shipName={selectedShip?.nombre || 'Nucleus Zero'}
          // Derive from alarms state
          />

          {/* Contenido Principal - Layout Adaptativo Fluido */}
          <div className={cn(
            "relative overflow-hidden transition-all duration-700 ease-in-out p-6 h-full"
          )}>
            {activeTab === 'control' ? (
              <div className="h-full w-full rounded-[2.5rem] glass-panel relative neon-glow">

                <TacticalTerminal
                  messages={messages}
                  onClearHistory={() => setMessages([])}
                  isIntMin={isIntMin}
                  setIsIntMin={setIntMin}
                />

                <div className="absolute inset-0 flex flex-col">
                  <ErrorBoundary fallbackName="Mapa Táctico">
                    <div className="relative flex-1 bg-slate-950 select-none overflow-hidden">
                      <TacticalMap
                        isLaylinesActive={false}
                        center={mapCenter}
                        zoom={15}
                        shipPosition={shipPosition}
                        shipName={
                          typeof fleet !== 'undefined' && fleet.length > 0
                            ? (
                              fleet.find(s => String(s.id) === String(selectedShipId))
                                ?.nombre ||
                              selectedShip?.nombre ||
                              'Buque Activo'
                            )
                            : (selectedShip?.nombre || 'Buque Activo')
                        }
                        navPlan={navPlan}
                        targetDestination={targetDestination}
                        currentPath={currentPath}
                        onMapClick={(lat, lng) => {
                          if (showShipForm) {
                            setNewShip?.((prev: any) => ({ ...prev, lat, lng }));
                            setAdvisorMessage(
                              `Coordenadas fijadas: ${lat.toFixed(4)}, ${lng.toFixed(4)}`
                            );
                          } else {
                            setDestination({ lat, lng });
                            setAdvisorMessage(
                              `Destino fijado: ${lat.toFixed(4)}, ${lng.toFixed(4)}`
                            );

                            if (!navPlan?.targetCoords) {
                              setNavigationDestination(
                                `${lat.toFixed(4)}, ${lng.toFixed(4)}`
                              );
                            }
                          }
                        }}
                        onMapRightClick={handleMapRightClick}
                        onDragStart={() => setIsAutoCenter(false)}
                        listaCartas={listaCartas}
  cartasActivas={cartasActivas}
                      >
                        {/* Flota */}
                        <FleetLayer
                          fleet={fleet}
                          selectedShipId={selectedShipId}
                          shipPosition={shipPosition}
                          simulatedAisTargets={tacticalAisTargets}
                        />

                        {/* Meteorología */}
                        <WeatherLayer
                          weather={weather}
                          plannedPath={plannedPath}
                        />

                        {/* Autoencuadre de ruta */}
                        {rutaActiva && rutaActiva.length >= 2 && (
                          <MapBoundsHandler
                            path={rutaActiva}
                            showControl={showControl}
                            showSystems={showSystems}
                          />
                        )}

                        {/* Ruta táctica */}
                        {rutaActiva && rutaActiva.length >= 2 && (
                          <Polyline
                            positions={rutaActiva}
                            color="#FF8C00"
                            weight={5}
                            opacity={0.9}
                          >
                            <Popup>Ruta Táctica</Popup>
                          </Polyline>
                        )}

                        {/* Laylines / Bordo sugerido */}
                        {tacticalData?.suggestedPath &&
                          tacticalData.suggestedPath.length >= 2 && (
                            <Polyline
                              positions={tacticalData.suggestedPath}
                              color="#22c55e"
                              weight={4}
                              opacity={0.9}
                              dashArray="12,10"
                            >
                              <Popup>Laylines / Bordo sugerido Zeus 3S</Popup>
                            </Polyline>
                          )}

                        {/* Ruta meteorológica */}
                        {plannedPath && plannedPath.length >= 2 && (
                          <Polyline
                            positions={plannedPath}
                            color="#00e5ff"
                            weight={5}
                            opacity={0.86}
                          >
                            <Popup>PredictWind / Ruta meteorológica</Popup>
                          </Polyline>
                        )}

                        {/* Zona AIS */}
                        {shipPosition && (
                          <Circle
                            center={[shipPosition.lat, shipPosition.lng]}
                            radius={500}
                            pathOptions={{
                              color: simulatedAisTargets.some(t => t.isCollisionRisk)
                                ? '#ef4444'
                                : '#06b6d4',
                              fillColor: simulatedAisTargets.some(t => t.isCollisionRisk)
                                ? '#ef4444'
                                : '#06b6d4',
                              fillOpacity: 0.05,
                              weight: 1,
                              dashArray: '5,5'
                            }}
                          />
                        )}

                      </TacticalMap>

                      <Zeus3SChartplotterOverlay
                        sog={simulatedSog}
                        hdg={selectedShip?.cog || 0}
                        cog={selectedShip?.cog || 0}
                        tws={weather?.wind || 0}
                        twd={weather?.windDir || 0}
                        twa={((weather?.windDir || 0) - (selectedShip?.cog || 0) + 360) % 360}
                        depth={depth}
                        dtw={navPlan.distanceNM || 0}
                        btw={navPlan.btw}
                        eta={navPlan.eta}
                        xte={navPlan.xte || 0}
                        waypointName={navPlan.targetName || navigationDestination || '---'}
                        chartMode={chartMode}
                        activeChartName={MBTILES_ZONES[mbtileIndex]?.name || 'Local'}
                        aisEnabled={layersState.showAIS}
                        windEnabled={layersState.showWind}
                        collisionFilter={layersState.collisionFilter}
                        isNavigating={isTravesiaActive}
                        autopilotMode={autopilotMode}
                        activePage={zeusPage}
                        onSelectPage={setZeusPage}
                        onOpenHud={openZeusHudPage}
                        onOpenSystems={() => setShowSystems(true)}
                        onCycleChart={cycleChart}
                        onToggleAIS={() => setLayersState(prev => ({ ...prev, showAIS: !prev.showAIS }))}
                        onToggleWind={() => setLayersState(prev => ({ ...prev, showWind: !prev.showWind }))}
                        onToggleCollisionFilter={() => setLayersState(prev => ({ ...prev, collisionFilter: !prev.collisionFilter }))}
                        onStartNavigation={() => setShowSafetyModal(true)}
                        onEndNavigation={handleEndTravesia}
                        isSailSteerWidgetOpen={isSailSteerWidgetOpen}
                        onCloseSailSteerWidget={() => setIsSailSteerWidgetOpen(false)}



                        onToggleAutopilot={toggleZeusAutopilot}
                      />

                      <ZeusSidebar
                        activePage={zeusPage}
                        onSelect={(page) => setZeusPage(page as any)}
                        onToggleMenu={() => setShowSystems(!showSystems)}
                        isNavigating={isTravesiaActive}
                        listaCartas={listaCartas}
                        cartasActivas={cartasActivas}
                        toggleCarta={toggleCarta}
                        cartasOpacity={cartasOpacity}
                        setCartasOpacity={setCartasOpacity}
                        layersState={layersState}
                        setLayersState={setLayersState}
                        aisEnabled={layersState.showAIS} // Pass existing state
                        windEnabled={layersState.showWind} // Pass existing state
                        aisTargets={tacticalAisTargets}
                        collisionFilter={layersState.collisionFilter} // Pass existing state
                        autopilotMode={autopilotMode} // Pass existing state
                        onToggleAIS={() => setLayersState(prev => ({ ...prev, showAIS: !prev.showAIS }))} // Pass toggle function
                        onToggleWind={() => setLayersState(prev => ({ ...prev, showWind: !prev.showWind }))} // Pass toggle function
                        onToggleCollisionFilter={() => setLayersState(prev => ({ ...prev, collisionFilter: !prev.collisionFilter }))} // Pass toggle function
                        isWeatherPanelOpen={isWeatherPanelOpen}
                        setIsWeatherPanelOpen={setIsWeatherPanelOpen}
                        isLaylinesActive={isLaylinesActive}
                        isSailSteerWidgetOpen={isSailSteerWidgetOpen}
                        setIsSailSteerWidgetOpen={setIsSailSteerWidgetOpen}
                        setIsLaylinesActive={setIsLaylinesActive}
                        onToggleAutopilot={toggleZeusAutopilot} // Pass toggle function
                      />

                      {/* Columna de Acción: Integrada en el mapa */}


                      {/* Control Toggle y Cartas (Bottom Left del Mapa) - REMOVED BY USER REQUEST */}
                    </div>
                  </ErrorBoundary>
                </div>

                <div className="absolute inset-0 z-[7000] pointer-events-none">
                  {showControl && (
                    <div className="pointer-events-auto h-full">
                      <TacticalHUD
                        isOpen={showControl}
                        onClose={() => setShowControl(false)}
                        sog={simulatedSog}
                        hdg={selectedShip?.cog || 0}
                        twd={weather?.windDir || 0}
                        tws={weather?.wind || 0}
                        twa={((weather?.windDir || 0) - (selectedShip?.cog || 0) + 360) % 360}
                        awa={((weather?.windDir || 0) - (selectedShip?.cog || 0) - 20 + 360) % 360}
                        aws={(weather?.wind || 0) * 1.2}
                        vmg={navPlan.vmg}
                        onTabChange={(tab: any) => setActiveTab(tab)}
                        onMotor={handleMotor}
                        onVela={handleVela}
                        onMOB={handleMOB}
                        onToggleLights={handleToggleLights}
                        lightsOn={lightsOn}
                        mobActive={mobActive}
                        activeTab={activeTab}
                        isNavigating={isTravesiaActive}
                        initialPageIndex={hudPageIndex}
                        onPageIndexChange={handlePageChange}
                        onRaceTimerFinished={handleRaceTimerFinished}
                        depth={depth}
                        depthHistory={depthHistory}
                        trip1={trip1}
                        trip2={trip2}
                        engineData={engineData}
                        navData={{
                          btw: navPlan.btw,
                          dtw: navPlan.distanceNM,
                          eta: navPlan.eta, // Pass ETA to TacticalHUD
                          xte: navPlan.xte,
                          waypointName: navPlan.targetName || '---',
                        }}
                        onTripAction={handleTripAction}
                        shipId={selectedShipId || '00000000-0000-0000-0000-000000000000'}
                        anchorPosition={anchorPosition}
                        shipPosition={shipPosition}
                        swingRadius={swingRadius}
                        currentAnchorDistance={currentAnchorDistance}
                        isAnchorWatchActive={isAnchorWatchActive}
                        anchorTrend={anchorTrend}
                      />
                    </div>
                  )}
                  {showSystems && (
                    <div className="pointer-events-auto h-full">
                      <ControlCenter
                        isNightMode={isNightMode}
                        setIsNightMode={setIsNightMode}
                        fleet={fleet}
                        selectedShipId={selectedShipId}
                        setSelectedShipId={handleShipSelection}
                        destination={destination}
                        setDestination={setDestination}
                        weather={weather}
                        isAdvisorOpen={isAdvisorOpen}
                        setIsAdvisorOpen={setIsAdvisorOpen}
                        advisorMessage={advisorMessage}
                        setAdvisorMessage={setAdvisorMessage}
                        getTacticalAdvice={getTacticalAdvice}
                        closeAdvisor={closeAdvisor}
                        getShipEmoji={getShipEmoji}
                        getShipIcon={getShipIcon}
                        getDefaultShipImage={getDefaultShipImage}
                        showShipForm={showShipForm}
                        activeTab={activeTab}
                        setActiveTab={setActiveTab as any}
                        setNewShip={setNewShip as any}
                        isTravesiaActive={isTravesiaActive}
                        setIsTravesiaActive={setIsTravesiaActive}
                        isEngineOn={isEngineOn}
                        setIsEngineOn={setIsEngineOn}
                        tripDistance={tripDistance}
                        setTripDistance={setTripDistance}
                        startTime={startTime}
                        setStartTime={setStartTime}
                        onEndNavigation={handleEndTravesia}
                        setShowSafetyModal={setShowSafetyModal}
                        supabase={supabase}
                        saveLogEntry={saveTechnicalLog}
                        isProcessing={isAdvisorProcessing}
                        isSelectingNavigationMode={isSelectingNavigationMode}
                        setIsSelectingNavigationMode={setIsSelectingNavigationMode}
                        setNavigationMode={setNavigationMode}
                        setNavigationDestination={setNavigationDestination}
                        currentPath={currentPath}
                        setCurrentPath={setCurrentPath}
                        aiBriefing={aiBriefing}
                        setIsLogbookOpen={(val) => {
                          if (val) setActiveTab('logbook');
                        }}
                        shipPosition={shipPosition}
                        onDispatch={(modo) => {
                          setPendingTravesiaData({ modo });
                          setShowSafetyModal(true);
                        }}
                        logEntries={logEntries}
                        setLogEntries={setLogEntries as any}
                        simulatedSog={simulatedSog}
                        setSimulatedSog={setSimulatedSog}
                        saveTechnicalEvent={saveTechnicalLog}
                        lightsOn={lightsOn}
                        setLightsOn={setLightsOn}
                        mobActive={mobActive}
                        setMobActive={setMobActive}
                        isAnchorWatchActive={isAnchorWatchActive}
                        onToggleAnchorWatch={toggleAnchorWatch}
                        currentAnchorDistance={currentAnchorDistance}
                        anchorTrend={anchorTrend}
                        anchorPosition={anchorPosition}
                        tacticalAdvisorActions={tacticalAdvisor.actions}
                        tacticalAdvisorAlertCount={tacticalAdvisor.alerts.length}
                        onMotor={() => {
                          setPropulsionMode('MOTOR');
                          saveTechnicalLog('Sistema de Propulsión', 'Cambio a propulsión a MOTOR');
                        }}
                        onVela={() => {
                          setPropulsionMode('VELA');
                          saveTechnicalLog('Sistema de Propulsión', 'Cambio a propulsión a VELA');
                        }}
                        propulsionMode={propulsionMode}
                        targetDestination={targetDestination}
                        setTargetDestination={setTargetDestination}
                        aiLogs={aiLogs}
                        refreshAiLogs={() => fetchAiLogs(selectedShipId)}
                        plannedPath={plannedPath}
                        setPlannedPath={setPlannedPath}
                        rutaActiva={rutaActiva}
                        setRutaActiva={setRutaActiva}
                        tacticalAdvice={tacticalAdvice}
                        setTacticalAdvice={setTacticalAdvice}
                        handleAcceptTactical={handleAcceptTactical}
                        activeRouteId={activeRouteId}
                        isAutoCenter={isAutoCenter}
                        setIsAutoCenter={setIsAutoCenter}
                        navigationDestination={navigationDestination}
                        onClose={() => setShowSystems(false)}
                        userProfile={userProfile}
                        depth={depth}
                        alarms={alarms}
                        thresholds={thresholds}
                        telemetry={telemetry}
                        captainPreferences={captainPreferences}
                        navPlan={navPlan}
                        PORT_LIST={PORT_LIST}
                        updateNavigationPlan={updateNavigationPlan}
                      />
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="h-full w-full bg-slate-950 overflow-hidden">
                <div className="h-full w-full overflow-y-auto custom-scrollbar">

                  {renderContent()}

                </div>
              </div>
            )}
          </div>

          {/* Input de Comandos Sticky (Original restored) */}
          {activeTab === 'control' && (
            <div className="absolute bottom-4 left-6 right-70 z-[7500] px-4 py-2 bg-gradient-to-r from-slate-900/40 via-cyan-900/20 to-slate-900/40 border border-cyan-500/30 backdrop-blur-md rounded-xl flex items-center gap-3">
              <form onSubmit={(e) => { e.preventDefault(); handleTacticalOrder(input); }} className="w-full flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ejecutar comando táctico..."
                  className="flex-1 bg-transparent border-none text-white focus:outline-none font-mono text-sm h-8"
                />
                <button type="submit" disabled={isProcessing || !input.trim()} className="h-8 w-8 flex items-center justify-center bg-cyan-600 rounded-lg text-white hover:bg-cyan-500">
                  <Send size={16} />
                </button>
              </form>
            </div>
          )}
        </main>


        {/* Ubiquitous Logbook Drawer */}
        {/* Watch Selection Modal */}
        <AnimatePresence>
          {isSelectingNavigationMode && (
            <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/90 backdrop-blur-xl p-4">
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                className="bg-slate-900 border border-white/10 p-8 rounded-[40px] space-y-6 w-full max-w-lg shadow-[0_40px_100px_rgba(0,0,0,0.8)]"
              >
                <div className="text-center space-y-4">
                  <div className="w-16 h-16 bg-cyan-500/20 rounded-2xl flex items-center justify-center mx-auto border border-cyan-500/30">
                    <Navigation className="w-8 h-8 text-cyan-500" />
                  </div>
                  <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Preparar Travesía</h2>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Almirante, seleccione la doctrina de navegación para esta misión</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button
                    onClick={() => {
                      setIsSelectingNavigationMode(false);
                      setNavigationMode('Libre');
                      setTipoTravesia('libre');
                      setShowSafetyModal(true);
                    }}
                    className="group flex flex-col items-center gap-4 p-6 bg-slate-950/50 border border-white/5 rounded-3xl hover:border-cyan-500 hover:bg-cyan-950/20 transition-all text-center"
                  >
                    <div className="w-12 h-12 bg-slate-800 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-cyan-600 group-hover:text-white transition-all shadow-xl">
                      <Compass className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-white uppercase tracking-tight">Navegación Libre</h3>
                      <p className="text-[8px] font-bold text-slate-500 uppercase mt-1">Manual - Sin asistencia táctica de IA</p>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      setIsSelectingNavigationMode(false);
                      setNavigationMode('Planificada');
                      setTipoTravesia('asistida');
                      setIsExplainingAiRoute(true);
                    }}
                    className="group flex flex-col items-center gap-4 p-6 bg-slate-950/50 border border-white/5 rounded-3xl hover:border-emerald-500 hover:bg-emerald-950/20 transition-all text-center"
                  >
                    <div className="w-12 h-12 bg-slate-800 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-emerald-600 group-hover:text-white transition-all shadow-xl">
                      <Zap className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-white uppercase tracking-tight">Ruta Asistida (IA)</h3>
                      <p className="text-[8px] font-bold text-slate-500 uppercase mt-1">Optimización VMG y meteorología avanzada</p>
                    </div>
                  </button>
                </div>

                <button
                  onClick={() => setIsSelectingNavigationMode(false)}
                  className="w-full py-4 text-slate-500 font-bold uppercase tracking-widest text-[10px] hover:text-white transition-colors border-t border-white/5 mt-4"
                >
                  Abortar Misión
                </button>
              </motion.div>
            </div>
          )}

          {isExplainingAiRoute && (
            <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-slate-950/90 backdrop-blur-xl p-4">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bg-slate-900 border border-emerald-500/20 p-8 rounded-[40px] space-y-6 w-full max-w-lg shadow-[0_40px_100px_rgba(0,163,255,0.2)]"
              >
                <div className="text-center space-y-4">
                  <div className="w-16 h-16 bg-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto border border-emerald-500/30">
                    <Zap className="w-8 h-8 text-emerald-500 animate-pulse" />
                  </div>
                  <h2 className="text-2xl font-black text-white uppercase tracking-tighter italic">AI Tactical Briefing</h2>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Almirante, describa su ruta u objetivo estratégico</p>
                </div>

                <div className="space-y-4">
                  <textarea
                    value={aiRoutePrompt}
                    onChange={(e) => setAiRoutePrompt(e.target.value)}
                    placeholder="Ej: Salida de Motril hacia Almuñécar, navegación costera evitando bancos de arena..."
                    className="w-full h-32 bg-black/50 border border-white/10 rounded-2xl p-4 text-sm text-white placeholder:text-slate-700 focus:border-emerald-500 outline-none transition-all resize-none font-mono"
                  />

                  <button
                    onClick={handleAiRouteSubmit}
                    disabled={isAiProcessing || !aiRoutePrompt.trim()}
                    className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl font-black uppercase tracking-widest transition-all flex items-center justify-center gap-3 shadow-xl shadow-emerald-900/20"
                  >
                    {isAiProcessing ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <Send className="w-5 h-5" />
                        <span>Confirmar Ruta</span>
                      </>
                    )}
                  </button>
                </div>

                <button
                  onClick={() => setIsExplainingAiRoute(false)}
                  className="w-full py-2 text-slate-500 font-bold uppercase tracking-widest text-[9px] hover:text-white transition-colors"
                >
                  Volver
                </button>
              </motion.div>
            </div>
          )}

          {showWatchSelection && (
            <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/90 backdrop-blur-xl p-4">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bg-slate-900 border border-slate-800 p-8 rounded-[40px] space-y-6 w-full max-w-sm shadow-2xl"
              >
                <div className="text-center space-y-4">
                  <div className="w-16 h-16 bg-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto border border-emerald-500/30">
                    <Clock className="w-8 h-8 text-emerald-500" />
                  </div>
                  <h2 className="text-xl font-black text-white uppercase tracking-tighter">Inicio de Guardia</h2>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">¿Quién inicia la guardia en este despacho?</p>
                </div>

                <div className="grid gap-2">
                  {crewOnBoard.map(member => (
                    <button
                      key={member.id}
                      onClick={() => proceedWithStartTravesia(pendingTravesiaData!.modo, pendingTravesiaData!.levels, member.id)}
                      className="flex items-center gap-4 p-4 bg-slate-950/50 border border-slate-800 rounded-2xl hover:border-cyan-500 hover:bg-cyan-950/20 transition-all group"
                    >
                      <div className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center text-xs font-black text-slate-400 group-hover:bg-cyan-600 group-hover:text-white transition-all">
                        {member.nombre.charAt(0)}
                      </div>
                      <div className="text-left">
                        <p className="text-[10px] font-black text-white uppercase tracking-tight">{member.nombre}</p>
                        <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">{member.rango}</p>
                      </div>
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setShowWatchSelection(false)}
                  className="w-full py-3 text-slate-500 font-bold uppercase tracking-widest text-[10px] hover:text-slate-300 transition-colors"
                >
                  Cancelar
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <SafetyModal
          show={showSafetyModal}
          userProfile={userProfile}
          supabase={supabase}
          fleet={fleet}
          onComplete={() => setShowSafetyModal(false)}
          onDispatch={(levels, crew) => {
            console.log('App: SafetyModal onDispatch called', { levels, crewLength: crew?.length });
            setShowSafetyModal(false);
            // Small delay to ensure modal close doesn't interfere with new modal open
            setTimeout(() => {
              const finalMode = navigationMode === 'Planificada' ? 'IA' : 'Libre';
              handleStartTravesia(finalMode, levels, crew);
            }, 100);
          }}
          setAdvisorMessage={setAdvisorMessage}
          selectedShipId={selectedShipId}
        />

        <ChangelogModal
          isOpen={showChangelog}
          onClose={() => setShowChangelog(false)}
          data={changelogData}
        />

        <AnimatePresence>
          {isLogbookOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsLogbookOpen(false)}
                className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[8000]"
              />
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="fixed top-0 right-0 h-full w-full md:w-[600px] bg-slate-950 border-l border-slate-800 z-[8001] shadow-2xl overflow-y-auto custom-scrollbar flex flex-col"
              >
                <div className="p-4 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-slate-950/90 backdrop-blur-md z-10">
                  <div className="flex items-center gap-3">
                    <Book className="w-5 h-5 text-cyan-500" />
                    <h2 className="text-sm font-black text-white uppercase tracking-widest">Bitácora de Navegación</h2>
                  </div>
                  <button
                    onClick={() => setIsLogbookOpen(false)}
                    className="p-2 bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors"
                  >
                    <X className="w-4 h-4 text-slate-400" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  <Logbook
                    userProfile={userProfile!}
                    supabase={supabase}
                    fleet={fleet}
                    selectedShipId={selectedShipId}
                    setAdvisorMessage={setAdvisorMessage}
                    logEntries={logEntries}
                    setLogEntries={setLogEntries}
                    saveLogEntry={saveTechnicalLog}
                    isEngineOn={isEngineOn}
                    setIsEngineOn={setIsEngineOn}
                  />
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    );
  }

  export default App;
