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
  Target
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ShipData, VesselStatus, ProcessedWeather, LogEntry } from '../shared/types';
import { SupabaseClient } from '@supabase/supabase-js';

import { cn } from '../lib/utils';

import { RouteBriefing } from './RouteBriefing';
import { TacticalHUD } from './TacticalHUD';
import { calculateDistanceNM } from '../lib/utils';

const isValidLatLng = (lat: any, lng: any) => {
  return typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng);
};

const isValidPath = (path: any[]): path is [number, number][] => {
  return Array.isArray(path) && path.length > 0 && path.every(p => Array.isArray(p) && p.length >= 2 && isValidLatLng(p[0], p[1]));
};

interface CommandCenterProps {
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
  setActiveTab?: (tab: 'control' | 'fleet' | 'logbook' | 'inventory' | 'guide' | 'profile' | 'admin') => void;
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
  onMotor?: () => void;
  onVela?: () => void;
  propulsionMode?: 'MOTOR' | 'VELA';
  targetDestination: { lat: number; lng: number } | null;
  setTargetDestination: (dest: { lat: number; lng: number } | null) => void;
  plannedPath: [number, number][];
  setPlannedPath: (route: [number, number][]) => void;
  tacticalAdvice: string | null;
  setTacticalAdvice: (advice: string | null) => void;
  handleAcceptTactical: () => Promise<void>;
  activeRouteId: string | null;
  isAutoCenter: boolean;
  setIsAutoCenter: (val: boolean) => void;
  navigationDestination: string;
  onClose: () => void;
}

export const CommandCenter: React.FC<CommandCenterProps> = ({
  isNightMode,
  setIsNightMode,
  fleet,
  selectedShipId,
  setSelectedShipId,
  destination,
  setDestination,
  weather,
  isAdvisorOpen,
  setIsAdvisorOpen,
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
  onMotor,
  onVela,
  propulsionMode = 'MOTOR',
  targetDestination,
  setTargetDestination,
  plannedPath,
  setPlannedPath,
  tacticalAdvice,
  setTacticalAdvice,
  handleAcceptTactical,
  activeRouteId,
  isAutoCenter,
  setIsAutoCenter,
  navigationDestination,
  onClose
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

  const [simulatedDepth, setSimulatedDepth] = useState(15.0);
  const [showBriefing, setShowBriefing] = useState(true);
  const [isRaceHUDOpen, setIsRaceHUDOpen] = useState(false);
  const lastFollowPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const [aiPrompt, setAiPrompt] = useState('');
  const [showAiInput, setShowAiInput] = useState(false);

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
      // Registro de Arribada ANTES de finalizar
      await saveLogEntry(
        'Arribada',
        'Travesía finalizada en puerto - Atracado en Motril',
        'Navegación'
      );

      const activeShip = fleet.find(s => s.id === selectedShipId) || fleet[0];
      const barcoIdReal = activeShip ? activeShip.id : selectedShipId;

      const { error } = await supabase
        .from('vessel_status')
        .update({ is_navigating: false })
        .eq('barco_id', barcoIdReal);
      
      if (error) throw error;
      onEndNavigation();
    } catch (err: unknown) {
      console.error('Error in handleEndVoyage:', err);
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido';
      setAdvisorMessage(`Error al finalizar travesía: ${errorMessage}`);
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

  const [localActiveTab, setLocalActiveTab] = useState<'viento' | 'motor' | 'nav' | 'advisor'>('viento');
  
  const activeShip = fleet.find(s => s.id === selectedShipId) || fleet[0];
  const currentHeading = activeShip?.cog || 113;

  return (
    <motion.div 
      initial={{ opacity: 0, x: 50, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 50, scale: 0.95 }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed right-8 top-1/2 -translate-y-1/2 w-[450px] max-h-[90vh] bg-slate-900/95 backdrop-blur-xl text-white font-['Roboto_Mono'] shadow-[0_0_50px_rgba(0,0,0,0.5)] z-[8000] flex flex-col pointer-events-auto border border-white/10 rounded-[40px] overflow-hidden"
    >
      {/* Header */}
      <div className="p-6 flex items-center justify-between border-b border-slate-900 bg-black/40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-cyan-600/20 rounded-xl flex items-center justify-center border border-cyan-500/30">
            <Gauge className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest text-white">Sistemas</h2>
            <p className="text-[8px] font-bold text-cyan-500 uppercase tracking-widest">Protocolo Activo</p>
          </div>
        </div>
        <button 
          onClick={onClose}
          className="p-2 hover:bg-red-500/10 rounded-full transition-colors group z-[110]"
        >
          <X className="w-6 h-6 text-slate-500 group-hover:text-red-500" />
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
        {localActiveTab === 'viento' && (
          <div className="h-full flex flex-col">
            {/* Wind Hub Stage */}
            <div className="relative aspect-square w-full bg-slate-950/50 flex flex-col items-center justify-center p-8">
              {/* Corner Data Blocks */}
              <div className="absolute top-8 left-8 text-left">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">BSPD</div>
                <div className="text-4xl font-black text-white font-mono">{simulatedSog.toFixed(1)}</div>
                <div className="text-[8px] font-bold text-cyan-500 uppercase mt-1">Nudos</div>
              </div>
              
              <div className="absolute top-8 right-8 text-right">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">TWA</div>
                <div className="text-4xl font-black text-white font-mono">{Math.round((weather?.windDir || 0) - currentHeading + 360) % 360}°</div>
                <div className="text-[8px] font-bold text-cyan-500 uppercase mt-1">Viento</div>
              </div>

              <div className="absolute bottom-8 left-8 text-left">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">TWD</div>
                <div className="text-4xl font-black text-white font-mono">{Math.round(weather?.windDir || 0)}°</div>
                <div className="text-[8px] font-bold text-cyan-500 uppercase mt-1">Dirección</div>
              </div>

              <div className="absolute bottom-8 right-8 text-right">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">TWS</div>
                <div className="text-4xl font-black text-white font-mono">{(weather?.wind || 0).toFixed(1)}</div>
                <div className="text-[8px] font-bold text-cyan-500 uppercase mt-1">Velocidad</div>
              </div>

              {/* Main Wind Rose */}
              <div className="relative w-72 h-72 rounded-full flex items-center justify-center">
                {/* Rotating Degree Ring */}
                <motion.div 
                  animate={{ rotate: -currentHeading }}
                  transition={{ type: 'spring', damping: 30, stiffness: 100 }}
                  className="absolute inset-0 rounded-full border-[1.5px] border-slate-800 shadow-[inset_0_0_40px_rgba(6,182,212,0.05)]"
                >
                  {[...Array(36)].map((_, i) => (
                    <div key={i} className="absolute inset-x-0 top-0 bottom-0 flex justify-center" style={{ transform: `rotate(${i * 10}deg)` }}>
                      <div className={cn(
                        "w-0.5 mt-2 transition-colors",
                        i % 9 === 0 ? "h-4 bg-white" : i % 3 === 0 ? "h-3 bg-slate-500" : "h-2 bg-slate-700"
                      )} />
                      {i % 9 === 0 && (
                        <span className="absolute top-7 text-[8px] font-black text-slate-500" style={{ transform: `rotate(${-i * 10}deg)` }}>
                          {i * 10 === 0 ? 'N' : i * 10 === 90 ? 'E' : i * 10 === 180 ? 'S' : i * 10 === 270 ? 'W' : i * 10}
                        </span>
                      )}
                    </div>
                  ))}
                </motion.div>

                {/* Static Ship & Sectors Container (Ring rotates, ship stays up) */}
                <div className="relative w-48 h-48 rounded-full flex items-center justify-center">
                  {/* Wind Sectors (VMG Optimized) */}
                  <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute inset-0 border-[40px] border-transparent border-t-green-500/10 border-r-green-500/10 rotate-[35deg] rounded-full" />
                    <div className="absolute inset-0 border-[40px] border-transparent border-t-red-500/10 border-l-red-500/10 rotate-[-35deg] rounded-full" />
                  </div>

                  {/* Ship Silhouette */}
                  <div className="relative z-10 flex flex-col items-center">
                    <div className="absolute -top-12 bg-slate-900 border border-cyan-500/40 px-3 py-1 rounded-sm shadow-xl shadow-cyan-500/20 backdrop-blur-md">
                      <span className="text-xl font-black text-white font-mono tracking-tighter">{Math.round(currentHeading).toString().padStart(3, '0')}°</span>
                    </div>
                    <div className="w-10 h-20 bg-gradient-to-b from-white to-slate-400 rounded-t-[55%] rounded-b-[15%] shadow-[0_0_30px_rgba(255,255,255,0.15)] ring-1 ring-white/20" />
                  </div>

                  {/* True Wind Pointer (Relative to ship orientation) */}
                  <motion.div 
                    animate={{ rotate: (weather?.windDir || 0) - currentHeading }}
                    transition={{ type: 'spring', damping: 25, stiffness: 80 }}
                    className="absolute inset-0 z-20"
                  >
                    <div className="absolute top-2 left-1/2 -ml-[10px] flex flex-col items-center">
                      <div className="w-0 h-0 border-l-[10px] border-r-[10px] border-b-[20px] border-b-blue-500 drop-shadow-[0_0_8px_rgba(59,130,246,0.6)]" />
                      <div className="mt-1 bg-blue-600 text-[8px] font-black px-1.5 py-0.5 rounded-sm shadow-lg text-white">T</div>
                    </div>
                  </motion.div>
                </div>
              </div>
            </div>

            {/* Vessel Vitals Section */}
            <div className="px-8 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-900/40 border border-slate-800 p-4 rounded-2xl">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Combustible</span>
                    <Fuel className="w-4 h-4 text-amber-500" />
                  </div>
                  <div className="text-3xl font-black text-white font-mono">{vesselStatus?.fuel_level ?? 85}%</div>
                  <div className="h-1 bg-slate-800 rounded-full mt-3 overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${vesselStatus?.fuel_level ?? 85}%` }}
                      className="h-full bg-amber-500"
                    />
                  </div>
                </div>
                
                <div className="bg-slate-900/40 border border-slate-800 p-4 rounded-2xl">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Batería</span>
                    <Zap className="w-4 h-4 text-yellow-500" />
                  </div>
                  <div className="text-3xl font-black text-white font-mono">{(vesselStatus?.battery_voltage || 12.6).toFixed(1)}V</div>
                  <div className="h-1 bg-slate-800 rounded-full mt-3 overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, ((vesselStatus?.battery_voltage || 12.6) / 14.4) * 100)}%` }}
                      className="h-full bg-yellow-500"
                    />
                  </div>
                </div>
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
            <h3 className="text-lg font-black uppercase tracking-tighter">Navegación</h3>
            <div className="bg-slate-900/40 border border-slate-800 p-6 rounded-3xl space-y-4">
              <div className="flex items-center gap-4">
                <Navigation className="w-6 h-6 text-cyan-400" />
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Destino Actual</p>
                  <p className="text-sm font-black text-white">{navigationDestination || 'Muelle de Motril'}</p>
                </div>
              </div>
              <div className="pt-4 border-t border-slate-800/40 grid grid-cols-2 gap-4">
                <div className="text-center">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">ETA</p>
                  <p className="text-xl font-black text-white font-mono">18:45</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Distancia</p>
                  <p className="text-xl font-black text-white font-mono">12.4 mn</p>
                </div>
              </div>
              <div className="pt-4 border-t border-slate-800 flex flex-col gap-3">
                <button 
                  onClick={() => {
                    if (isTravesiaActive) {
                      handleEndVoyage();
                    } else {
                      setIsSelectingNavigationMode(true);
                    }
                  }}
                  className={cn(
                    "w-full py-4 rounded-2xl font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3",
                    isTravesiaActive 
                      ? "bg-red-600 text-white shadow-lg shadow-red-900/40 border border-red-500/30" 
                      : "bg-cyan-600 text-white shadow-lg shadow-cyan-900/40 border border-cyan-500/30"
                  )}
                >
                  <Navigation className={cn("w-5 h-5", isTravesiaActive ? "animate-pulse" : "")} />
                  {isTravesiaActive ? "Finalizar Travesía" : "Iniciar Travesía"}
                </button>
                {isTravesiaActive && (
                  <p className="text-[8px] font-bold text-center text-cyan-500 uppercase tracking-widest animate-pulse">
                    Navegación Activa - Registrando Datos
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {localActiveTab === 'advisor' && (
          <div className="p-8 space-y-6">
             <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-cyan-500/20 rounded-xl flex items-center justify-center border border-cyan-500/30">
                  <Zap className="w-5 h-5 text-cyan-400 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-widest">IA Strategic Advisor</h3>
                </div>
              </div>
            <div className="bg-slate-900/40 border border-cyan-500/20 p-6 rounded-3xl">
              <p className="text-sm font-bold text-slate-300 leading-relaxed italic">"{aiBriefing || getTacticalAdvice.message}"</p>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Hub Navigation */}
      <div className="h-24 bg-black/60 border-t border-slate-900 px-4 grid grid-cols-4 gap-2 text-center pointer-events-auto">
        {[
          { id: 'viento', label: 'Viento', icon: Wind },
          { id: 'motor', label: 'Motor', icon: Fuel },
          { id: 'nav', label: 'Nav', icon: Navigation },
          { id: 'advisor', label: 'IA Advisor', icon: Zap }
        ].map((tab) => (
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
    </motion.div>
  );
};

// export default CommandCenter;
