import React, { useEffect, useState, useRef } from 'react';
import { 
  Zap, 
  Wind, 
  Sun, 
  Thermometer, 
  Droplets, 
  Gauge, 
  AlertTriangle, 
  LifeBuoy, 
  Moon, 
  ArrowUp, 
  Activity, 
  X, 
  Navigation,
  Fuel,
  ChevronDown,
  Target,
  Settings,
  Terminal,
  ShieldAlert,
  ShieldCheck,
  Cpu,
  Send,
  Loader2
} from 'lucide-react';
import { TacticalAdvisorPanel } from './TacticalAdvisorPanel';
import { motion, AnimatePresence } from 'motion/react';
import { ShipData, VesselStatus, ProcessedWeather, LogEntry, SmartshipAlarm, SecurityThresholds } from '../shared/types';
import { SupabaseClient } from '@supabase/supabase-js';

import { cn } from '../lib/utils';
import { RUTAS_FRECUENTES } from '../rutasFrecuentes';

import { RouteBriefing } from './RouteBriefing';
import { TacticalHUD } from './TacticalHUD';
import { calculateDistanceNM } from '../lib/utils';
import { WindInstrument } from './WindInstrument';
import { callGemini } from '../lib/gemini';
import H5000Frame from './H5000Frame';

const NAUTICAL_PORTS: Record<string, [number, number]> = {
  'adra': [36.744, -3.015],
  'nerja': [36.74, -3.87],
  'motril': [36.72, -3.52],
  'marbella': [36.50, -4.88],
  'almeria': [36.83, -2.47],
  'almería': [36.83, -2.47],
  'malaga': [36.71, -4.42],
  'málaga': [36.71, -4.42],
  'estepona': [36.41, -5.15],
  'cadiz': [36.53, -6.29],
  'cádiz': [36.53, -6.29],
  'huelva': [37.25, -6.95],
  'almuñécar': [36.73, -3.69],
  'caleta': [36.74, -4.01],
  'fuengirola': [36.54, -4.62],
  'gibraltar': [36.14, -5.35],
  'ibiza': [38.9067, 1.4206],
};

const isValidLatLng = (lat: any, lng: any) => {
  return typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng);
};

const isValidPath = (path: any[]): path is [number, number][] => {
  return Array.isArray(path) && path.length > 0 && path.every(p => Array.isArray(p) && p.length >= 2 && isValidLatLng(p[0], p[1]));
};

interface ControlCenterProps {
  isNightMode: boolean;
  setIsNightMode: (val: boolean) => void;
  fleet: ShipData[];
  selectedShipId: string | null;
  setSelectedShipId: (id: string | null) => void;
  destination: { lat: number; lng: number } | null;
  setDestination: (dest: { lat: number; lng: number } | null) => void;
  weather: ProcessedWeather | null;
  isAdvisorOpen: boolean;
  setIsAdvisorOpen: (val: boolean) => void;
  advisorMessage: string;
  setAdvisorMessage: (msg: string) => void;
  getTacticalAdvice: { message: string; icon: React.ReactNode };
  closeAdvisor: () => void;
  getShipEmoji: (tipo?: string) => string;
  getShipIcon: (tipo?: string, size?: string) => React.ReactNode;
  getDefaultShipImage: (tipo?: string) => string;
  showShipForm?: boolean;
  activeTab?: string;
  setActiveTab?: (tab: any) => void;
  setNewShip?: React.Dispatch<React.SetStateAction<Partial<ShipData>>>;
  isTravesiaActive: boolean;
  setIsTravesiaActive: (val: boolean) => void;
  isEngineOn: boolean;
  setIsEngineOn: (val: boolean) => void;
  tripDistance: number;
  setTripDistance: (val: number) => void;
  startTime: Date | null;
  setStartTime: (val: Date | null) => void;
  onEndNavigation: () => void;
  setShowSafetyModal: (val: boolean) => void;
  supabase: SupabaseClient;
  saveLogEntry: (titulo: string, descripcion: string, categoria?: string) => Promise<void>;
  isProcessing?: boolean;
  isSelectingNavigationMode: boolean;
  setIsSelectingNavigationMode: (val: boolean) => void;
  setNavigationMode: (mode: 'Libre' | 'Planificada' | null) => void;
  setNavigationDestination: (dest: string) => void;
  currentPath: [number, number][];
  setCurrentPath: (route: [number, number][]) => void;
  aiBriefing: string | null;
  setIsLogbookOpen: (val: boolean) => void;
  shipPosition: { lat: number; lng: number } | null;
  onDispatch: (modo: 'Libre' | 'IA') => void;
  logEntries: LogEntry[];
  setLogEntries: React.Dispatch<React.SetStateAction<LogEntry[]>>;
  simulatedSog: number;
  setSimulatedSog: (val: number | ((prev: number) => number)) => void;
  saveTechnicalEvent: (titulo: string, descripcion: string) => void;
  lightsOn: boolean;
  setLightsOn: (val: boolean) => void;
  mobActive: boolean;
  setMobActive: (val: boolean) => void;
  isAnchorWatchActive: boolean;
  onToggleAnchorWatch: () => void;
  currentAnchorDistance: number;
  anchorTrend: 'stable' | 'drifting' | 'swinging';
  anchorPosition?: { lat: number; lng: number } | null;
  onMotor?: () => void;
  onVela?: () => void;
  propulsionMode?: 'MOTOR' | 'VELA';
  targetDestination: { lat: number; lng: number } | null;
  setTargetDestination: (dest: { lat: number; lng: number } | null) => void;
  tacticalAdvisorActions?: {
    label: string;
    onClick: () => Promise<void> | void;
    variant?: 'primary' | 'secondary';
  }[];
  tacticalAdvisorAlertCount?: number;
  plannedPath: [number, number][];
  setPlannedPath: (route: [number, number][]) => void;
  rutaActiva: [number, number][];
  setRutaActiva: (route: [number, number][]) => void;
  tacticalAdvice: string | null;
  setTacticalAdvice: (advice: string | null) => void;
  handleAcceptTactical: () => Promise<void>;
  activeRouteId: string | null;
  isAutoCenter: boolean;
  setIsAutoCenter: (val: boolean) => void;
  navigationDestination: string;
  onClose: () => void;
  userProfile: any;
  depth?: number;
  alarms: SmartshipAlarm[];
  thresholds: SecurityThresholds;
  telemetry: {
    internalTemp: number;
    humidity: number;
  };
  captainPreferences?: string;
  navPlan: {
    targetCoords: { lat: number; lng: number } | null;
    targetName: string;
    distanceNM: number;
    eta: string;
    isCalculating: boolean;
  };
  PORT_LIST: { name: string; coords: { lat: number; lng: number } }[];
  updateNavigationPlan: (coords: { lat: number; lng: number }, name: string) => void;
  aiLogs?: any[];
  refreshAiLogs?: () => void;
}

export const ControlCenter: React.FC<ControlCenterProps> = ({
  isNightMode,
  setIsNightMode,
  fleet,
  selectedShipId,
  setSelectedShipId,
  destination,
  setDestination,
  weather,
  advisorMessage,
  setAdvisorMessage,
  getTacticalAdvice,
  closeAdvisor,
  getShipEmoji,
  getShipIcon,
  getDefaultShipImage,
  showShipForm,
  activeTab,
  setActiveTab,
  setNewShip,
  isTravesiaActive,
  setIsTravesiaActive,
  isEngineOn,
  setIsEngineOn,
  tripDistance,
  setTripDistance,
  startTime,
  setStartTime,
  onEndNavigation,
  setShowSafetyModal,
  supabase,
  isSelectingNavigationMode,
  isProcessing,
  setIsSelectingNavigationMode,
  setNavigationMode,
  setNavigationDestination,
  currentPath,
  setCurrentPath,
  aiBriefing,
  setIsLogbookOpen,
  shipPosition,
  onDispatch,
  logEntries,
  setLogEntries,
  saveLogEntry,
  simulatedSog,
  setSimulatedSog,
  saveTechnicalEvent,
  lightsOn,
  setLightsOn,
  mobActive,
  setMobActive,
  isAnchorWatchActive,
  onToggleAnchorWatch,
  currentAnchorDistance,
  anchorTrend,
  anchorPosition,
  onMotor,
  onVela,
  propulsionMode = 'MOTOR',
  targetDestination,
  setTargetDestination,
  tacticalAdvisorActions,
  plannedPath,
  setPlannedPath,
  rutaActiva,
  setRutaActiva,
  tacticalAdvice,
  setTacticalAdvice,
  handleAcceptTactical,
  activeRouteId,
  isAutoCenter,
  tacticalAdvisorAlertCount,
  setIsAutoCenter,
  navigationDestination,
  onClose,
  userProfile,
  depth,
  alarms,
  thresholds,
  telemetry,
  captainPreferences = "",
  navPlan,
  PORT_LIST,
  updateNavigationPlan,
  aiLogs = [],
  refreshAiLogs
}) => {
  const [vesselStatus, setVesselStatus] = useState<VesselStatus | null>(null);
  const [openAccordion, setOpenAccordion] = useState<string | null>('vitals');
  const [showRouteHistory, setShowRouteHistory] = useState(false);
  const [routeHistory, setRouteHistory] = useState<any[]>([]);
  const [activeControls, setActiveControls] = useState({
    pump: false,
    music: false
  });
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [newOfficerName, setNewOfficerName] = useState('');
  const [navCommand, setNavCommand] = useState('');
  const [destinationSearch, setDestinationSearch] = useState('');
  const [isAdvisorOpen, setIsAdvisorOpen] = useState(false);

  const getAlarmFor = (type: SmartshipAlarm['type']) => {
    return alarms.find(a => a.type === type);
  };

  const isAlarming = (type: SmartshipAlarm['type']) => !!getAlarmFor(type);


  // Procesador de Comandos Náuticos vía Gemini LLM
  const handleNavigationOrder = async () => {
    const query = navCommand.toLowerCase();
    if (query.length < 5 || !shipPosition) return;

    setAdvisorMessage('Analizando derrota táctica...');

    let plan = null;

    try {
      const activeShip = fleet.find(s => s.id === selectedShipId) || fleet[0];
      const draft = activeShip?.calado || activeShip?.draft || 1.5;
      
      const systemInstruction = "Actúa como un Navegador Náutico experto y Oficial de Puente. Tu misión es trazar derrotas precisas evitando tierra y respetando las preferencias del Almirante. La salida debe ser exclusivamente un JSON.";
      
      const prompt = `Calcula una derrota táctica basada en esta orden: "${navCommand}".
      
      CONTEXTO TÁCTICO INTEGRAL:
      - Buque de Operaciones: ${activeShip?.nombre || 'Nucleus Zero'} | Calado: ${draft}m | Eslora: ${activeShip?.eslora || 'N/A'}m.
      - Posición de Origen: [${shipPosition.lat}, ${shipPosition.lng}].
      - Entorno Meteorológico: Viento ${weather?.wind} kn (${weather?.windDir}°) | Mar: ${weather?.seaState} | Altura de Ola: ${weather?.waveHeight || 'N/A'}m.
      - Condiciones Hidrográficas: Marea de ${weather?.tideLevel || '0.5'}m.
      - Preferencias del Almirante: "${captainPreferences}".
      
      REQUERIMIENTOS TÉCNICOS:
      - Genera 5-7 waypoints marítimos seguros y profundos.
      - Garantiza seguridad de navegación considerando el calado de ${draft}m.
      - Salida JSON obligatorio: {"puntos": [[lat1, lng1], [lat2, lng2]...], "mensaje": "Resumen táctico de la derrota", "distancia": 12.5}`;

      const result = await callGemini(prompt, systemInstruction, true);
      
      if (result && result.puntos) {
        plan = result;
      }
    } catch (error) {
      console.error("Error en Gemini Tactical Navigation:", error);
    }

    // Fallback manual (rutasFrecuentes.ts)
    if (!plan || !plan.puntos) {
      let destFound: [number, number] | null = null;
      Object.keys(RUTAS_FRECUENTES).forEach(port => {
        if (query.includes(port)) destFound = RUTAS_FRECUENTES[port];
      });

      if (destFound) {
        plan = {
          puntos: [
            [shipPosition.lat, shipPosition.lng],
            [shipPosition.lat - 0.02, shipPosition.lng],
            [destFound[0] - 0.02, destFound[1]],
            destFound
          ],
          mensaje: "Derrota de emergencia: Base de datos."
        };
      }
    }

    if (plan && plan.puntos) {
      setRutaActiva(plan.puntos);
      setPlannedPath(plan.puntos);
      setTargetDestination({ lat: plan.puntos[plan.puntos.length - 1][0], lng: plan.puntos[plan.puntos.length - 1][1] });
      setAdvisorMessage(plan.mensaje || 'Entendido Almirante, orden recibida.');
    } else {
      setAdvisorMessage('Error: No se pudo calcular la derrota táctica.');
    }
  };

  const [simulatedDepth, setSimulatedDepth] = useState(15.0);
  const [showBriefing, setShowBriefing] = useState(true);
  const [isRaceHUDOpen, setIsRaceHUDOpen] = useState(false);
  const lastFollowPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const [aiPrompt, setAiPrompt] = useState('');
  const [showAiInput, setShowAiInput] = useState(false);

  // Auto-switch to nav tab when travesia starts
  useEffect(() => {
    if (isTravesiaActive) {
      setLocalActiveTab('nav');
    }
  }, [isTravesiaActive]);

  useEffect(() => {
    if (aiBriefing) {
      setShowBriefing(true);
    }
  }, [aiBriefing]);

  useEffect(() => {
    if (!isTravesiaActive) {
      setSimulatedSog(0);
      return;
    }

    const interval = setInterval(() => {
      // Simulate SOG based on engine state
      const targetSog = isEngineOn ? 15.0 + (Math.random() * 2 - 1) : 6.0 + (Math.random() * 1.5 - 0.5);
      setSimulatedSog(prev => {
        const diff = targetSog - prev;
        return prev + diff * 0.1; // Smooth transition
      });

      // Simulate Depth
      setSimulatedDepth(prev => {
        const newDepth = prev + (Math.random() * 2 - 1);
        return Math.max(5, Math.min(200, newDepth)); // Keep between 5 and 200
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isTravesiaActive, isEngineOn]);

  useEffect(() => {
    if (!selectedShipId) return;

    // Initial fetch
    supabase
      .from('vessel_status')
      .select('*')
      .eq('barco_id', selectedShipId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setVesselStatus(data);
          if (data.is_navigating !== isTravesiaActive) {
            setIsTravesiaActive(data.is_navigating);
          }
        }
      });

    // Real-time subscription
    const channel = supabase
      .channel(`vessel_status_${selectedShipId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'vessel_status',
          filter: `barco_id=eq.${selectedShipId}`
        },
        (payload) => {
          const newData = payload.new as VesselStatus;
          setVesselStatus(newData);
          if (newData.is_navigating !== isTravesiaActive) {
            setIsTravesiaActive(newData.is_navigating);
            if (!newData.is_navigating) {
              setCurrentPath([]);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedShipId, supabase, isTravesiaActive, setIsTravesiaActive]);

  const tacticalAlertSummary = tacticalAdvisorAlertCount && tacticalAdvisorAlertCount > 0
    ? `${tacticalAdvisorAlertCount} alerta${tacticalAdvisorAlertCount > 1 ? 's' : ''} táctic${tacticalAdvisorAlertCount > 1 ? 'as' : 'a'} activas`
    : 'Estado táctico estable';

  const togglePropulsion = async () => {
    const newState = !isEngineOn;
    setIsEngineOn(newState);
    await saveTechnicalEvent(
      'Sistema de Propulsión', 
      newState ? 'Motor Encendido' : 'Navegando a Vela'
    );
  };

  const toggleControl = async (id: 'pump' | 'music') => {
    const newState = !activeControls[id];
    setActiveControls(prev => ({ ...prev, [id]: newState }));
    
    let message = '';
    let title = 'Evento de Sistemas';
    
    if (id === 'pump') {
      title = 'Sistema de Achique';
      message = `Bomba de Achique: ${newState ? 'ON' : 'OFF'}`;
    }
    if (id === 'music') {
      title = 'Sistema Multimedia';
      message = `Sistema de Música: ${newState ? 'ON' : 'OFF'}`;
    }
    
    await saveTechnicalEvent(title, message);
  };

  const fetchRouteHistory = async () => {
    const { data, error } = await supabase
      .from('rutas')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
    if (!error && data) setRouteHistory(data);
  };

  useEffect(() => {
    if (showRouteHistory) fetchRouteHistory();
  }, [showRouteHistory]);

  const toggleLights = () => {
    const newState = !lightsOn;
    setLightsOn(newState);
    saveTechnicalEvent('Sistema Eléctrico', `Luces de Navegación: ${newState ? 'ON' : 'OFF'}`);
  };

  const toggleMob = () => {
    const newState = !mobActive;
    setMobActive(newState);
    if (newState) {
      saveTechnicalEvent('EMERGENCIA MOB', `¡HOMBRE AL AGUA! Posición: [${shipPosition?.lat.toFixed(4)}, ${shipPosition?.lng.toFixed(4)}]`);
    } else {
      saveTechnicalEvent('EMERGENCIA MOB', 'Alerta MOB desactivada.');
    }
  };

  const toggleNightMode = async () => {
    const newState = !isNightMode;
    setIsNightMode(newState);
    await saveTechnicalEvent('Sistema de Iluminación', `Modo Noche ${newState ? 'Activado' : 'Desactivado'}`);
  };

  const handleEndVoyage = async () => {
    if (!selectedShipId) return;
    try {
      // Registrar en bitácora local antes de pasar al cierre global
      await saveLogEntry(
        'Arribada',
        'Travesía finalizada en puerto - Atracado en Motril',
        'Navegación'
      );
      // Delegar el cierre de estados y UI al padre
      onEndNavigation();
    } catch (err: any) {
      console.error('Error in handleEndVoyage:', err);
      alert('Error al finalizar travesía: ' + err.message);
    }
  };

  const handleShiftChange = () => {
    setShowShiftModal(true);
  };

  const confirmShiftChange = () => {
    if (newOfficerName.trim()) {
      saveLogEntry(
        'Cambio de Guardia',
        `Entra ${newOfficerName}. Barco en rumbo ${weather?.windDir || 0}° a ${simulatedSog.toFixed(1)} nudos. Todo novedad.`,
        'Navegación'
      );
      setNewOfficerName('');
      setShowShiftModal(false);
    }
  };

  const [localActiveTab, setLocalActiveTab] = useState<'viento' | 'motor' | 'nav' | 'advisor' | 'config'>('nav');
  
  const activeShip = fleet.find(s => s.id === selectedShipId) || fleet[0];
  const currentHeading = activeShip?.cog || 113;
  const draft = activeShip?.calado || activeShip?.draft || 1.5;
  const isDepthCritical = depth !== undefined && depth < (draft + 0.5);

  return (
    <motion.div 
      initial={{ opacity: 0, x: 50, scale: 0.95 }}
      animate={{ 
        opacity: 1, 
        x: 0, 
        scale: 1,
        backgroundColor: isDepthCritical ? ['rgba(15, 23, 42, 0.95)', 'rgba(185, 28, 28, 0.8)', 'rgba(15, 23, 42, 0.95)'] : 'rgba(15, 23, 42, 0.95)'
      }}
      transition={isDepthCritical ? { duration: 1, repeat: Infinity, ease: "easeInOut" } : { type: 'spring', damping: 25, stiffness: 200 }}
      exit={{ opacity: 0, x: 50, scale: 0.95 }}
      className={cn(
        "fixed right-8 top-[15%] w-[450px] h-[500px] backdrop-blur-xl text-white shadow-[0_0_50px_rgba(0,0,0,0.5)] z-[8000] flex flex-col pointer-events-auto border rounded-[40px] overflow-hidden transition-all duration-500",
        isDepthCritical ? "border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.3)] bg-red-950/20" : "border-white/10 bg-slate-900/95"
      )}
    >
      {isDepthCritical && (
        <div className="bg-red-600 text-white text-[10px] font-black uppercase tracking-[0.3em] py-2 text-center animate-pulse z-50">
          ¡ATENCIÓN: CALADO CRÍTICO! ({depth.toFixed(1)}m)
        </div>
      )}
      <TacticalAdvisorPanel 
        isOpen={isAdvisorOpen}
        onClose={() => setIsAdvisorOpen(false)}
        message={getTacticalAdvice.message}
        priority={isDepthCritical ? 'critical' : 'info'}
        isProcessing={isProcessing}
        actions={tacticalAdvisorActions}
      />
      <H5000Frame title="SISTEMAS" hdg={Math.round(currentHeading)} isNavigating={isTravesiaActive} onClose={onClose}>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
          <div className="px-4 py-3 border-b border-white/10 bg-slate-950/80">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Estado Táctico</p>
                <p className="text-sm font-bold text-white">{tacticalAlertSummary}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={onToggleAnchorWatch}
                  className={cn(
                    "rounded-2xl px-3 py-2 text-[10px] uppercase tracking-[0.3em] font-black transition-all",
                    isAnchorWatchActive ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400' : 'bg-slate-800 text-white hover:bg-slate-700'
                  )}
                >
                  {isAnchorWatchActive ? 'Anchor Watch' : 'Fondeo'}
                </button>
                {isAnchorWatchActive && (
                  <span className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-300">
                    {currentAnchorDistance.toFixed(0)}m · {anchorTrend === 'drifting' ? 'GARREO' : anchorTrend === 'swinging' ? 'BORNEO' : 'ESTABLE'}
                  </span>
                )}
                {tacticalAdvisorActions && tacticalAdvisorActions.length > 0 && (
                  <button
                    onClick={() => tacticalAdvisorActions[0].onClick()}
                    className={cn(
                      "rounded-2xl px-3 py-2 text-[10px] uppercase tracking-[0.3em] font-black transition-all",
                      tacticalAdvisorActions[0].variant === 'primary'
                        ? 'bg-cyan-500 text-slate-950 hover:bg-cyan-400'
                        : 'bg-slate-800 text-white hover:bg-slate-700'
                    )}
                  >
                    {tacticalAdvisorActions[0].label}
                  </button>
                )}
              </div>
            </div>
          </div>
        {localActiveTab === 'viento' && (
          <div className="h-full flex flex-col p-4">
            {/* Tactical Wind Hub */}
            <div className="relative w-full flex flex-col items-center justify-center py-6">
              <WindInstrument 
                awa={Math.round((weather?.windDir || 0) - currentHeading + 360) % 360 > 180 ? (Math.round((weather?.windDir || 0) - currentHeading + 360) % 360) - 360 : (Math.round((weather?.windDir || 0) - currentHeading + 360) % 360)}
                aws={weather?.wind || 0}
                twa={Math.round((weather?.windDir || 0) - currentHeading + 360) % 360}
                tws={weather?.wind || 0}
                heading={currentHeading}
                boatSpeed={simulatedSog}
              />
              
              {/* Corner Data Blocks */}
              <div className="w-full grid grid-cols-2 gap-4 mt-8">
                 <div className="bg-black/40 border border-white/5 p-4 rounded-2xl">
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">BSPD (Vel.)</p>
                    <p className="text-2xl font-black text-white font-mono">{simulatedSog.toFixed(1)} <span className="text-[10px] text-slate-500">kn</span></p>
                 </div>
                 <div className="bg-black/40 border border-white/5 p-4 rounded-2xl text-right">
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">COG (Rumbo)</p>
                    <p className="text-2xl font-black text-white font-mono">{Math.round(currentHeading).toString().padStart(3, '0')}°</p>
                 </div>
              </div>
            </div>

            {/* Vessel Vitals Section */}
            <div className="space-y-4 mt-auto p-2">
              <div className="grid grid-cols-2 gap-4">
                <motion.div 
                  animate={isAlarming('fuel') ? { backgroundColor: ['rgba(15, 23, 42, 0.4)', 'rgba(220, 38, 38, 0.2)', 'rgba(15, 23, 42, 0.4)'] } : {}}
                  transition={{ duration: 1, repeat: Infinity }}
                  className={cn(
                    "border p-4 rounded-3xl transition-all duration-500",
                    isAlarming('fuel') ? "border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.2)]" : "bg-slate-900/40 border-slate-800"
                  )}
                >
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Combustible</span>
                    <Fuel className={cn("w-4 h-4", isAlarming('fuel') ? "text-red-500 animate-pulse" : "text-amber-500")} />
                  </div>
                  <div className="text-3xl font-black text-white font-mono">{vesselStatus?.fuel_level ?? 85}%</div>
                  <div className="h-1 bg-slate-800 rounded-full mt-3 overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${vesselStatus?.fuel_level ?? 85}%` }}
                      className={cn("h-full", isAlarming('fuel') ? "bg-red-500" : "bg-amber-500")}
                    />
                  </div>
                </motion.div>
                
                <div className="bg-slate-900/40 border border-slate-800 p-4 rounded-3xl">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Agua Limpia</span>
                    <Droplets className="w-4 h-4 text-cyan-500" />
                  </div>
                  <div className="text-3xl font-black text-white font-mono">{vesselStatus?.water_level ?? 92}%</div>
                  <div className="h-1 bg-slate-800 rounded-full mt-3 overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${vesselStatus?.water_level ?? 92}%` }}
                      className="h-full bg-cyan-500"
                    />
                  </div>
                </div>
              </div>

              {/* Internal Telemetry (Panic Mode Integrated) */}
              <div className="grid grid-cols-2 gap-4">
                <motion.div 
                  animate={isAlarming('internal_temp') ? { backgroundColor: ['rgba(15, 23, 42, 0.4)', 'rgba(220, 38, 38, 0.2)', 'rgba(15, 23, 42, 0.4)'] } : {}}
                  transition={{ duration: 1, repeat: Infinity }}
                  className={cn(
                    "border p-4 rounded-3xl transition-all duration-500",
                    isAlarming('internal_temp') ? "border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.2)]" : "bg-slate-900/40 border-slate-800"
                  )}
                >
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Temp. Cabina</span>
                    <Thermometer className={cn("w-4 h-4", isAlarming('internal_temp') ? "text-red-500 animate-pulse" : "text-emerald-500")} />
                  </div>
                  <div className="text-3xl font-black text-white font-mono">{telemetry.internalTemp}°C</div>
                  <div className="text-[9px] font-mono text-slate-500 mt-2 uppercase tracking-tighter">Umbral: {thresholds.maxInternalTemp}°C</div>
                </motion.div>

                <motion.div 
                  animate={isAlarming('humidity') ? { backgroundColor: ['rgba(15, 23, 42, 0.4)', 'rgba(245, 158, 11, 0.1)', 'rgba(15, 23, 42, 0.4)'] } : {}}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className={cn(
                    "border p-4 rounded-3xl transition-all duration-500",
                    isAlarming('humidity') ? "border-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.1)]" : "bg-slate-900/40 border-slate-800"
                  )}
                >
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Humedad</span>
                    <Droplets className={cn("w-4 h-4", isAlarming('humidity') ? "text-amber-500 animate-pulse" : "text-blue-400")} />
                  </div>
                  <div className="text-3xl font-black text-white font-mono">{telemetry.humidity}%</div>
                  <div className="text-[9px] font-mono text-slate-500 mt-2 uppercase tracking-tighter">Umbral: {thresholds.maxHumidity}%</div>
                </motion.div>
              </div>
            </div>
          </div>
        )}

        {localActiveTab === 'motor' && (
          <div className="p-8 space-y-6">
            <h3 className="text-lg font-black uppercase tracking-tighter">Control de Motor</h3>
            <div className="bg-slate-900/40 border border-slate-800 p-6 rounded-3xl flex flex-col items-center gap-6">
              <div className="w-32 h-32 rounded-full border-[8px] border-slate-800 flex items-center justify-center relative">
                <div className="text-2xl font-black">1850</div>
                <div className="absolute bottom-6 text-[10px] font-bold text-slate-500">RPM</div>
              </div>
              <button 
                onClick={togglePropulsion}
                className={cn(
                  "w-full py-4 rounded-2xl font-black uppercase tracking-widest transition-all",
                  isEngineOn ? "bg-red-600 text-white shadow-lg shadow-red-900/40" : "bg-cyan-600 text-white shadow-lg shadow-cyan-900/40"
                )}
              >
                {isEngineOn ? "Apagar Motor" : "Encender Motor"}
              </button>
            </div>
          </div>
        )}

        {localActiveTab === 'nav' && (
          <div className="p-8 space-y-6">
            <div className="bg-slate-900/40 border border-slate-800 p-6 rounded-3xl space-y-6">
              {!isTravesiaActive ? (
                <div className="space-y-4">
                  {/* Comando Almirante */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-cyan-500 uppercase tracking-widest ml-1">¿A dónde quieres navegar, Almirante?</label>
                    <div className="relative">
                      <input 
                        type="text"
                        value={navCommand}
                        onChange={(e) => setNavCommand(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleNavigationOrder()}
                        placeholder="Ej: Sal de Motril a Nerja..."
                        className="w-full bg-black/60 border border-white/10 p-4 rounded-2xl text-xs text-white font-bold focus:border-cyan-500 outline-none transition-all pr-12"
                      />
                      <Target className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-500/50" />
                    </div>
                  </div>

                  <button 
                    onClick={handleNavigationOrder}
                    className="w-full py-4 bg-slate-800 hover:bg-slate-700 text-white rounded-2xl font-black uppercase tracking-widest transition-all shadow-lg flex items-center justify-center gap-2"
                  >
                    <Target className="w-5 h-5" />
                    Calcular Derrota (IA)
                  </button>

                  {/* IA Advisor Flash Message */}
                  <div className="p-4 bg-slate-800/40 border border-white/5 rounded-2xl">
                    <div className="flex items-center gap-2 mb-1">
                      <Zap className="w-3 h-3 text-cyan-400" />
                      <span className="text-[10px] font-black text-cyan-500 uppercase tracking-widest">Estado IA Advisor:</span>
                    </div>
                    <p className="text-[11px] font-bold text-white transition-all duration-500">
                      {advisorMessage}
                    </p>
                  </div>

                  {/* Selector de Puertos Andaluces - REQUERIMIENTO ALMIRANTE */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-cyan-500 uppercase tracking-widest ml-1">Selector de Puertos (Andalucía)</label>
                    <div className="relative group">
                      <select 
                        onChange={(e) => {
                          const port = PORT_LIST.find(p => p.name === e.target.value);
                          if (port) updateNavigationPlan(port.coords, port.name);
                        }}
                        className="w-full bg-black/60 border border-white/10 p-4 rounded-2xl text-xs text-white font-bold appearance-none focus:border-cyan-500 outline-none transition-all cursor-pointer"
                        value={navPlan.targetName || ""}
                      >
                        <option value="" disabled>Seleccione puerto de destino...</option>
                        {PORT_LIST.map(port => (
                          <option key={port.name} value={port.name}>{port.name}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-500/50 pointer-events-none group-hover:text-cyan-400 transition-colors" />
                    </div>
                  </div>

                  <button 
                    onClick={() => setShowSafetyModal(true)}
                    className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black uppercase tracking-widest transition-all shadow-lg shadow-emerald-900/20 flex items-center justify-center gap-2"
                  >
                    <Navigation className="w-5 h-5" />
                    Iniciar Travesía
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-cyan-600/20 rounded-xl flex items-center justify-center border border-cyan-500/30">
                      <Navigation className="w-6 h-6 text-cyan-400 animate-pulse" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Estado: En Navegación</p>
                      <p className="text-sm font-black text-white">{navigationDestination || 'Ruta Optimizada AIS'}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-800/40">
                    <div className="text-left">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">ETA (Estimada)</p>
                      <p className="text-xl font-black text-white font-mono">{navPlan.eta || '--:--'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Distancia</p>
                      <p className="text-xl font-black text-white font-mono">{navPlan.distanceNM || '0.0'} NM</p>
                    </div>
                  </div>

                  <button 
                    onClick={handleEndVoyage}
                    className="w-full py-4 bg-red-600 hover:bg-red-500 text-white rounded-2xl font-black uppercase tracking-widest transition-all shadow-lg shadow-red-900/40 flex items-center justify-center gap-2"
                  >
                    <AlertTriangle className="w-5 h-5" />
                    Finalizar Travesía
                  </button>
                </div>
              )}
            </div>
            
            {showAiInput && !isTravesiaActive && (
              <div className="mt-4 p-4 bg-slate-900 border border-white/5 rounded-2xl space-y-3">
                 <textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="Describa su destino (ej: Ir a Ibiza evitando mal tiempo)..."
                  className="w-full h-24 bg-black border border-white/10 rounded-xl p-3 text-xs text-white placeholder:text-slate-600 focus:border-cyan-500/50 outline-none transition-all resize-none"
                />
                <button
                  onClick={() => onDispatch('IA')}
                  className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                >
                  Confirmar Plan IA
                </button>
              </div>
            )}
          </div>
        )}

        {localActiveTab === 'config' && (
          <div className="p-8 space-y-8">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-slate-500/20 rounded-xl flex items-center justify-center border border-slate-500/30">
                <Settings className="w-5 h-5 text-slate-400" />
              </div>
              <div>
                <h3 className="text-sm font-black text-white uppercase tracking-widest">Controles de Sistema</h3>
                <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">Acceso Rápido y Seguridad</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-slate-900/40 border border-white/5 p-6 rounded-[2.5rem] space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-cyan-500/10 rounded-2xl border border-cyan-500/20 text-cyan-400">
                      <Cpu size={20} />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-white uppercase tracking-tight italic">Panel Global</h4>
                      <p className="text-[9px] font-mono text-slate-500">Ajustes de Telemetría</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setActiveTab?.('config')}
                    className={cn(
                      "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                      activeTab === 'config' ? "bg-cyan-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"
                    )}
                  >
                    {activeTab === 'config' ? 'Abierto' : 'Abrir'}
                  </button>
                </div>

                <div className="h-px bg-white/5" />

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "p-3 rounded-2xl border transition-all",
                      activeTab === 'shield' ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400" : "bg-slate-500/10 border-slate-500/20 text-slate-500"
                    )}>
                      <ShieldCheck size={20} />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-white uppercase tracking-tight italic">SmartShield</h4>
                      <p className="text-[9px] font-mono text-slate-500">Núcleo de Protección</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setActiveTab?.(activeTab === 'shield' ? 'control' : 'shield')}
                    className={cn(
                      "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                      activeTab === 'shield' ? "bg-emerald-600 text-white shadow-lg shadow-emerald-900/40" : "bg-slate-800 text-slate-400 hover:text-white"
                    )}
                  >
                    {activeTab === 'shield' ? 'Activo' : 'Activar'}
                  </button>
                </div>

                <div className="h-px bg-white/5" />

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "p-3 rounded-2xl border transition-all",
                      isNightMode ? "bg-red-500/20 border-red-500/40 text-red-400" : "bg-slate-500/10 border-slate-500/20 text-slate-500"
                    )}>
                      <Moon size={20} />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-white uppercase tracking-tight italic">Modo Nocturno</h4>
                      <p className="text-[9px] font-mono text-slate-500">Preservar Visión Nocturna</p>
                    </div>
                  </div>
                  <button 
                    onClick={toggleNightMode}
                    className={cn(
                      "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                      isNightMode ? "bg-red-600 text-white shadow-lg shadow-red-900/40" : "bg-slate-800 text-slate-400 hover:text-white"
                    )}
                  >
                    {isNightMode ? 'Activo' : 'Desactivado'}
                  </button>
                </div>
              </div>

              <div className="p-4 bg-amber-500/5 border border-amber-500/10 rounded-2xl">
                 <p className="text-[9px] font-bold text-amber-500/60 uppercase tracking-wider leading-relaxed">
                   * Nota: El sistema Shield monitoriza automáticamente calado, motor y proximidad AIS. El panel global permite ajustar los umbrales de telemetría en tiempo real.
                 </p>
              </div>
            </div>
          </div>
        )}

        {localActiveTab === 'advisor' && (
          <div className="p-8 space-y-6">
             <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-cyan-500/20 rounded-xl flex items-center justify-center border border-cyan-500/30">
                    <Zap className="w-5 h-5 text-cyan-400 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-widest">IA Strategic Advisor</h3>
                  </div>
                </div>
                {refreshAiLogs && (
                  <button 
                    onClick={refreshAiLogs}
                    className="p-2 hover:bg-white/10 rounded-lg transition-all"
                    title="Actualizar Historial"
                  >
                    <Activity className="w-4 h-4 text-cyan-500" />
                  </button>
                )}
              </div>
            
            <div className="flex flex-col gap-4 overflow-hidden h-full">
              {/* Actual Briefing */}
              <div className="bg-slate-900/40 border border-cyan-500/20 p-6 rounded-3xl">
                <div className="flex items-center gap-2 mb-2">
                  <Terminal className="w-3 h-3 text-cyan-400" />
                  <span className="text-[9px] font-black text-cyan-500 uppercase tracking-widest italic">Informe en tiempo real:</span>
                </div>
                <p className="text-sm font-bold text-slate-300 leading-relaxed italic">"{aiBriefing || getTacticalAdvice.message}"</p>
              </div>

              {/* Message History Log */}
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex items-center gap-2 mb-3">
                  <Target className="w-3 h-3 text-slate-500" />
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Historial de Comando (AI Logs)</span>
                </div>
                
                <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-2 pb-6">
                  {aiLogs.length === 0 ? (
                    <div className="p-4 border border-white/5 rounded-2xl text-center">
                      <p className="text-[10px] font-bold text-slate-600 uppercase">Sin registros en la base de datos.</p>
                    </div>
                  ) : (
                    aiLogs.map((log: any) => (
                      <div key={log.id} className="p-4 bg-black/40 border border-white/5 rounded-2xl space-y-2 group hover:border-cyan-500/30 transition-all">
                        <div className="flex justify-between items-center opacity-60">
                          <span className="text-[8px] font-mono text-cyan-500">{new Date(log.created_at).toLocaleString()}</span>
                          <span className="text-[8px] font-black text-slate-500 uppercase tracking-tighter">{log.categoria_consulta || 'TÁCTICO'}</span>
                        </div>
                        <div className="space-y-1">
                          <div className="flex gap-2 items-start">
                            <Send className="w-2.5 h-2.5 text-slate-600 mt-0.5 shrink-0" />
                            <p className="text-[10px] font-bold text-slate-400 leading-tight italic">"{log.prompt_usuario}"</p>
                          </div>
                          <div className="flex gap-2 items-start pt-1 border-t border-white/5">
                            <Zap className="w-2.5 h-2.5 text-cyan-500 mt-0.5 shrink-0" />
                            <p className="text-[11px] font-bold text-white leading-relaxed">{log.respuesta_ia}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Hub Navigation */}
      <div className="h-24 bg-black/60 border-t border-slate-900 px-4 grid grid-cols-5 gap-2 text-center pointer-events-auto">
        {[
          { id: 'viento', label: 'Viento', icon: Wind },
          { id: 'motor', label: 'Motor', icon: Fuel },
          { id: 'nav', label: 'Nav', icon: Navigation },
          { id: 'config', label: 'Configuración', icon: Settings },
          { id: 'advisor', label: 'IA Advisor', icon: Zap, restricted: true }
        ].filter(t => !t.restricted || (t.restricted && userProfile?.plan_nivel !== 'Gratis')).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setLocalActiveTab(tab.id as any)}
            className="flex flex-col items-center justify-center gap-1.5 relative group mt-2"
          >
            <tab.icon className={cn(
              "w-5 h-5 transition-all duration-300",
              localActiveTab === tab.id ? "text-cyan-400 scale-110" : "text-slate-600 group-hover:text-slate-400"
            )} />
            <span className={cn(
              "text-[8px] font-black uppercase tracking-widest transition-all",
              localActiveTab === tab.id ? "text-white" : "text-slate-700 group-hover:text-slate-500"
            )}>
              {tab.label}
            </span>
            {localActiveTab === tab.id && (
              <motion.div 
                layoutId="activeTabUnderline"
                className="absolute bottom-2 w-8 h-1 bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.5)] rounded-full"
              />
            )}
          </button>
        ))}
      </div>
      </H5000Frame>
    </motion.div>
  );
};

// export default ControlCenter;
