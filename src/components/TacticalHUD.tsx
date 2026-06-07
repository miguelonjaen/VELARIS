import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Gauge, Navigation, Wind, Fuel, Anchor, Clock,
  ChevronLeft, ChevronRight, Settings, Cloud, X,
  Play, Pause, RotateCcw, Flag
} from 'lucide-react';
import { cn } from '../lib/utils';
import { AnchorWatchPage } from './AnchorWatchPage';
import { H5000WindHub } from './H5000WindHub';

interface TacticalHUDProps {
  isOpen: boolean;
  onClose: () => void;
  sog: number;
  hdg: number;
  twd: number;
  tws: number;
  twa: number;
  awa: number;
  aws: number;
  vmg: number;
  onTabChange: (tab: string) => void;
  onMotor: () => void;
  onVela: () => void;
  onMOB: () => void;
  onToggleLights: () => void;
  lightsOn: boolean;
  mobActive: boolean;
  activeTab: string;
  isNavigating: boolean;
  initialPageIndex: number;
  onPageIndexChange: (index: number) => void;
  onRaceTimerFinished: () => void;
  depth: number;
  depthHistory: { time: number; depth: number }[];
  trip1: number;
  trip2: number;
  engineData: { rpm: number; temp: number; voltage: number; fuel: number; water: number };
  navData: {
    btw: number;
    dtw: number;
    xte: number;
    waypointName: string;
    eta?: string; // Add eta to navData interface
    isAnchorActive?: boolean;
    anchorDistance?: number; 
  };
  onTripAction: (action: 'start' | 'stop' | 'reset') => void;
  shipId: string;
  // Nuevas props para el fondeo avanzado
  anchorPosition: { lat: number; lng: number } | null;
  shipPosition: { lat: number; lng: number } | null;
  swingRadius: number;
  currentAnchorDistance: number;
  isAnchorWatchActive: boolean;
  anchorTrend: 'stable' | 'drifting' | 'swinging';
}

export const TacticalHUD: React.FC<TacticalHUDProps> = ({
  isOpen,
  onClose,
  sog,
  hdg,
  twd,
  tws,
  twa,
  awa,
  aws,
  vmg,
  onTabChange,
  onMotor,
  onVela,
  onMOB,
  onToggleLights,
  lightsOn,
  mobActive,
  activeTab,
  isNavigating,
  initialPageIndex,
  onPageIndexChange,
  onRaceTimerFinished,
  depth,
  depthHistory,
  trip1,
  trip2,
  engineData,
  navData,
  onTripAction,
  shipId,
  anchorPosition,
  shipPosition,
  swingRadius,
  currentAnchorDistance,
  isAnchorWatchActive,
  anchorTrend
}) => {
  const [pageIndex, setPageIndex] = useState(initialPageIndex);
  const [raceTimer, setRaceTimer] = useState(0);
  const [isRaceTimerRunning, setIsRaceTimerRunning] = useState(false);
  const raceTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setPageIndex(initialPageIndex);
  }, [initialPageIndex]);

  const pages = useMemo(() => [
    { id: 'nav', label: 'Navegación', icon: <Navigation className="w-5 h-5" /> },
    { id: 'sail', label: 'Vela', icon: <Wind className="w-5 h-5" /> },
    { id: 'engine', label: 'Motor', icon: <Fuel className="w-5 h-5" /> },
    { id: 'weather', label: 'H5000', icon: <Gauge className="w-5 h-5" /> },
    { id: 'anchor', label: 'Fondeo', icon: <Anchor className="w-5 h-5" /> },
    { id: 'race', label: 'Regata', icon: <Flag className="w-5 h-5" /> },
    { id: 'settings', label: 'Ajustes', icon: <Settings className="w-5 h-5" /> },
  ], []);

  const currentPage = pages[pageIndex];

  useEffect(() => {
    onPageIndexChange(pageIndex);
  }, [pageIndex, onPageIndexChange]);

  const handleNextPage = useCallback(() => {
    setPageIndex((prev) => (prev + 1) % pages.length);
  }, [pages.length]);

  const handlePrevPage = useCallback(() => {
    setPageIndex((prev) => (prev - 1 + pages.length) % pages.length);
  }, [pages.length]);

  // Race Timer Logic
  useEffect(() => {
    if (isRaceTimerRunning) {
      raceTimerRef.current = setInterval(() => {
        setRaceTimer((prev) => {
          if (prev <= 1) {
            clearInterval(raceTimerRef.current!);
            setIsRaceTimerRunning(false);
            onRaceTimerFinished();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (raceTimerRef.current) {
      clearInterval(raceTimerRef.current);
      raceTimerRef.current = null;
    }
    return () => {
      if (raceTimerRef.current) clearInterval(raceTimerRef.current);
    };
  }, [isRaceTimerRunning, onRaceTimerFinished]);

  const formatTime = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0, x: -50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed left-8 top-[15%] w-[450px] h-[500px] bg-slate-900/95 backdrop-blur-xl text-white shadow-[0_0_50px_rgba(0,0,0,0.5)] z-[8000] flex flex-col pointer-events-auto border border-white/10 rounded-[40px] overflow-hidden"
    >
      <div className="flex-none p-4 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Gauge className="w-6 h-6 text-cyan-400" />
          <h2 className="text-lg font-black uppercase tracking-widest text-white">SmartHUD</h2>
        </div>
        <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 transition-colors">
          <X className="w-5 h-5 text-slate-400" />
        </button>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Page Content */}
        <div className={cn(
          'flex-1 overflow-y-auto custom-scrollbar',
          currentPage.id === 'weather' || currentPage.id === 'sail' ? 'p-0' : 'p-6',
        )}>
          {currentPage.id === 'nav' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-black/40 border border-white/5 p-4 rounded-2xl">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">SOG</p>
                  <p className="text-3xl font-black text-white font-mono">{sog.toFixed(1)} <span className="text-sm text-slate-500">kn</span></p>
                </div>
                <div className="bg-black/40 border border-white/5 p-4 rounded-2xl">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">HDG</p>
                  <p className="text-3xl font-black text-white font-mono">{hdg.toFixed(0)} <span className="text-sm text-slate-500">°</span></p>
                </div>
              </div>
              <div className="bg-black/40 border border-white/5 p-4 rounded-2xl">
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Destino</p>
                <p className="text-xl font-black text-white font-mono">{navData.waypointName}</p>
                <div className="flex justify-between items-center mt-2">
                  <span className="text-xs text-slate-400">Dist: {navData.dtw.toFixed(1)} NM</span>
                  <span className="text-xs text-slate-400">ETA: {navData.eta}</span>
                </div>
              </div>
              <div className="bg-black/40 border border-white/5 p-4 rounded-2xl">
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Profundidad</p>
                <p className="text-3xl font-black text-white font-mono">{depth.toFixed(1)} <span className="text-sm text-slate-500">m</span></p>
                <div className="h-1 bg-slate-800 rounded-full mt-3 overflow-hidden">
                  <motion.div
                    initial={{ width: '100%' }}
                    animate={{ width: `${Math.min(100, depth / 20 * 100)}%` }} // Assuming max depth 20m for visual
                    className={cn("h-full bg-cyan-500", depth < 5 && "bg-amber-500", depth < 2 && "bg-red-500")}
                  />
                </div>
              </div>
            </div>
          )}

          {currentPage.id === 'sail' && (
            <H5000WindHub
              sog={sog}
              hdg={hdg}
              twd={twd}
              tws={tws}
              twa={twa}
              awa={awa}
              aws={aws}
              vmg={vmg}
              depth={depth}
              voltage={engineData.voltage}
              xte={navData.xte}
              btw={navData.btw}
              dtw={navData.dtw}
              waypointName={navData.waypointName}
              eta={navData.eta}
            />
          )}

          {currentPage.id === 'engine' && (
            <EnginePage
              rpm={engineData.rpm}
              temp={engineData.temp}
              voltage={engineData.voltage}
              fuel={engineData.fuel}
              water={engineData.water}
              onMotor={onMotor}
              onVela={onVela}
              isEngineOn={engineData.rpm > 0}
            />
          )}

          {currentPage.id === 'weather' && (
            <H5000WindHub
              sog={sog}
              hdg={hdg}
              twd={twd}
              tws={tws}
              twa={twa}
              awa={awa}
              aws={aws}
              vmg={vmg}
              depth={depth}
              voltage={engineData.voltage}
              xte={navData.xte}
              btw={navData.btw}
              dtw={navData.dtw}
              waypointName={navData.waypointName}
              eta={navData.eta}
            />
          )}

          {currentPage.id === 'anchor' && (
            <AnchorWatchPage
              anchorPosition={anchorPosition}
              shipPosition={shipPosition}
              swingRadius={swingRadius}
              currentAnchorDistance={currentAnchorDistance}
              isAnchorWatchActive={isAnchorWatchActive}
              anchorTrend={anchorTrend}
            />
          )}

          {currentPage.id === 'race' && (
            <div className="space-y-6 text-center">
              <h3 className="text-xl font-black uppercase tracking-widest text-cyan-400">Temporizador de Regata</h3>
              <div className="text-7xl font-mono font-bold text-white">
                {formatTime(raceTimer)}
              </div>
              <div className="flex justify-center gap-4">
                <button
                  onClick={() => setIsRaceTimerRunning(!isRaceTimerRunning)}
                  className="p-3 rounded-full bg-cyan-600 hover:bg-cyan-500 text-white"
                >
                  {isRaceTimerRunning ? <Pause /> : <Play />}
                </button>
                <button
                  onClick={() => {
                    setIsRaceTimerRunning(false);
                    setRaceTimer(0);
                  }}
                  className="p-3 rounded-full bg-slate-700 hover:bg-slate-600 text-white"
                >
                  <RotateCcw />
                </button>
                <button
                  onClick={() => {
                    setIsRaceTimerRunning(false);
                    setRaceTimer(600); // 10 minutes
                  }}
                  className="p-3 rounded-full bg-slate-700 hover:bg-slate-600 text-white"
                >
                  <Clock /> 10 min
                </button>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-6">
                <div className="bg-black/40 border border-white/5 p-4 rounded-2xl">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Trip 1</p>
                  <p className="text-2xl font-black text-white font-mono">{trip1.toFixed(1)} <span className="text-[10px] text-slate-500">NM</span></p>
                  <button onClick={() => onTripAction('reset')} className="text-[8px] text-slate-500 hover:text-white mt-1">Reset</button>
                </div>
                <div className="bg-black/40 border border-white/5 p-4 rounded-2xl">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Trip 2</p>
                  <p className="text-2xl font-black text-white font-mono">{trip2.toFixed(1)} <span className="text-[10px] text-slate-500">NM</span></p>
                  <button onClick={() => onTripAction('reset')} className="text-[8px] text-slate-500 hover:text-white mt-1">Reset</button>
                </div>
              </div>
            </div>
          )}

          {currentPage.id === 'settings' && (
            <div className="space-y-6">
              <h3 className="text-xl font-black uppercase tracking-widest text-cyan-400">Ajustes del HUD</h3>
              <div className="bg-black/40 border border-white/5 p-4 rounded-2xl flex items-center justify-between">
                <span className="text-sm font-bold">Luces de Navegación</span>
                <button
                  onClick={onToggleLights}
                  className={cn(
                    "px-4 py-2 rounded-full text-xs font-bold",
                    lightsOn ? "bg-emerald-600 text-white" : "bg-slate-700 text-slate-300"
                  )}
                >
                  {lightsOn ? 'ON' : 'OFF'}
                </button>
              </div>
              <div className="bg-black/40 border border-white/5 p-4 rounded-2xl flex items-center justify-between">
                <span className="text-sm font-bold">Alerta MOB</span>
                <button
                  onClick={onMOB}
                  className={cn(
                    "px-4 py-2 rounded-full text-xs font-bold",
                    mobActive ? "bg-red-600 text-white animate-pulse" : "bg-slate-700 text-slate-300"
                  )}
                >
                  {mobActive ? 'ACTIVO' : 'INACTIVO'}
                </button>
              </div>
              <div className="bg-black/40 border border-white/5 p-4 rounded-2xl flex items-center justify-between">
                <span className="text-sm font-bold">Modo Noche</span>
                <button
                  onClick={() => onTabChange('config')} // Assuming config tab has night mode toggle
                  className="px-4 py-2 rounded-full text-xs font-bold bg-slate-700 text-slate-300 hover:bg-slate-600"
                >
                  Configurar
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Page Navigation */}
        <div className="flex-none p-4 border-t border-white/10 flex items-center justify-between">
          <button onClick={handlePrevPage} className="p-2 rounded-full hover:bg-white/10 transition-colors">
            <ChevronLeft className="w-5 h-5 text-slate-400" />
          </button>
          <div className="flex gap-2">
            {pages.map((page, index) => (
              <button
                key={page.id}
                onClick={() => setPageIndex(index)}
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center transition-colors",
                  pageIndex === index ? "bg-cyan-600 text-white" : "bg-slate-700 text-slate-400 hover:bg-slate-600"
                )}
              >
                {page.icon}
              </button>
            ))}
          </div>
          <button onClick={handleNextPage} className="p-2 rounded-full hover:bg-white/10 transition-colors">
            <ChevronRight className="w-5 h-5 text-slate-400" />
          </button>
        </div>
      </div>
    </motion.div>
  );
};

interface EnginePageProps {
  rpm: number;
  temp: number;
  voltage: number;
  fuel: number;
  water: number;
  onMotor: () => void;
  onVela: () => void;
  isEngineOn: boolean;
}

const EnginePage: React.FC<EnginePageProps> = ({ rpm, temp, voltage, fuel, onMotor, onVela, isEngineOn }) => (
  <div className="space-y-6">
    <h3 className="text-xl font-black uppercase tracking-widest text-cyan-400">Motor y Propulsión</h3>
    <div className="grid grid-cols-2 gap-4">
      <div className="bg-black/40 border border-white/5 p-4 rounded-2xl">
        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">RPM</p>
        <p className="text-3xl font-black text-white font-mono">{rpm.toFixed(0)}</p>
      </div>
      <div className="bg-black/40 border border-white/5 p-4 rounded-2xl">
        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Temp. Motor</p>
        <p className="text-3xl font-black text-white font-mono">{temp.toFixed(1)}°C</p>
      </div>
      <div className="bg-black/40 border border-white/5 p-4 rounded-2xl">
        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Voltaje</p>
        <p className="text-3xl font-black text-white font-mono">{voltage.toFixed(1)}V</p>
      </div>
      <div className="bg-black/40 border border-white/5 p-4 rounded-2xl">
        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Combustible</p>
        <p className="text-3xl font-black text-white font-mono">{fuel.toFixed(0)}%</p>
      </div>
    </div>
    <div className="flex justify-center gap-4 mt-6">
      <button
        onClick={onMotor}
        className={cn(
          "flex-1 py-3 rounded-xl text-xs font-bold uppercase tracking-widest",
          isEngineOn ? "bg-emerald-600 text-white" : "bg-slate-700 text-slate-300"
        )}
      >
        Motor
      </button>
      <button
        onClick={onVela}
        className={cn(
          "flex-1 py-3 rounded-xl text-xs font-bold uppercase tracking-widest",
          !isEngineOn ? "bg-emerald-600 text-white" : "bg-slate-700 text-slate-300"
        )}
      >
        Vela
      </button>
    </div>
  </div>
);

interface SailSteerProps {
  sog: number;
  twa: number;
  twd: number;
  tws: number;
  hdg: number;
  trueWindDir?: number;
}

export const SailSteerPage: React.FC<SailSteerProps> = ({ sog, twa, twd, tws, hdg }) => (
  <div className="space-y-6">
    <h3 className="text-xl font-black uppercase tracking-widest text-cyan-400">Gobierno a Vela</h3>
    <div className="grid grid-cols-2 gap-4">
      <div className="bg-black/40 border border-white/5 p-4 rounded-2xl">
        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">SOG</p>
        <p className="text-3xl font-black text-white font-mono">{sog?.toFixed(1) || '---'} <span className="text-sm text-slate-500">kn</span></p>
      </div>
      <div className="bg-black/40 border border-white/5 p-4 rounded-2xl">
        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">TWA</p>
        <p className="text-3xl font-black text-white font-mono">{twa?.toFixed(0) || '---'} <span className="text-sm text-slate-500">°</span></p>
      </div>
      <div className="bg-black/40 border border-white/5 p-4 rounded-2xl">
        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">TWS</p>
        <p className="text-3xl font-black text-white font-mono">{tws?.toFixed(1) || '---'} <span className="text-sm text-slate-500">kn</span></p>
      </div>
      <div className="bg-black/40 border border-white/5 p-4 rounded-2xl">
        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">HDG</p>
        <p className="text-3xl font-black text-white font-mono">{hdg?.toFixed(0) || '---'} <span className="text-sm text-slate-500">°</span></p>
      </div>
    </div>
  </div>
);

interface WeatherPageProps {
  tws: number;
  twd: number;
  seaState: string;
  waveHeight: number;
  temperature: number;
  pressure: number;
}

const WeatherPage: React.FC<WeatherPageProps> = ({ tws, twd, seaState, waveHeight, temperature, pressure }) => (
  <div className="space-y-6">
    <h3 className="text-xl font-black uppercase tracking-widest text-cyan-400">Meteorología</h3>
    <div className="grid grid-cols-2 gap-4">
      <div className="bg-black/40 border border-white/5 p-4 rounded-2xl">
        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Viento (TWS)</p>
        <p className="text-3xl font-black text-white font-mono">{tws.toFixed(1)} <span className="text-sm text-slate-500">kn</span></p>
      </div>
      <div className="bg-black/40 border border-white/5 p-4 rounded-2xl">
        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Dirección (TWD)</p>
        <p className="text-3xl font-black text-white font-mono">{twd.toFixed(0)} <span className="text-sm text-slate-500">°</span></p>
      </div>
      <div className="bg-black/40 border border-white/5 p-4 rounded-2xl">
        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Estado Mar</p>
        <p className="text-xl font-black text-white font-mono">{seaState}</p>
      </div>
      <div className="bg-black/40 border border-white/5 p-4 rounded-2xl">
        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Altura Ola</p>
        <p className="text-xl font-black text-white font-mono">{waveHeight.toFixed(1)} <span className="text-sm text-slate-500">m</span></p>
      </div>
      <div className="bg-black/40 border border-white/5 p-4 rounded-2xl">
        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Temperatura</p>
        <p className="text-xl font-black text-white font-mono">{temperature.toFixed(0)} <span className="text-sm text-slate-500">°C</span></p>
      </div>
      <div className="bg-black/40 border border-white/5 p-4 rounded-2xl">
        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Presión</p>
        <p className="text-xl font-black text-white font-mono">{pressure.toFixed(0)} <span className="text-sm text-slate-500">mb</span></p>
      </div>
    </div>
  </div>
);
