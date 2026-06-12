import React from 'react';
import { Settings, Wifi, Compass, Gauge, ShieldAlert, Cpu, ShieldCheck, Activity, FolderOpen, Clock } from 'lucide-react';
import { cn } from '../lib/utils';
import { SecurityThresholds } from '../shared/types';

interface ConfigPanelProps {
  dataSource: Record<string, 'real' | 'simulated'>;
  setDataSource: React.Dispatch<React.SetStateAction<Record<string, 'real' | 'simulated'>>>;
  thresholds: SecurityThresholds;
  setThresholds: React.Dispatch<React.SetStateAction<SecurityThresholds>>;
  cartasPath: string; // 📁 Añadido para el control de cartas
  onCambiarCarpeta: () => void; // 📁 Añadido para el control de cartas
  simulationSpeed: number;
  setSimulationSpeed: React.Dispatch<React.SetStateAction<number>>;
}

export const ConfigurationPanel: React.FC<ConfigPanelProps> = ({
  dataSource,
  setDataSource,
  thresholds,
  setThresholds,
  cartasPath, // 📁 Recibido desde App.tsx
  onCambiarCarpeta, // 📁 Recibido desde App.tsx
  simulationSpeed,
  setSimulationSpeed
}) => {
    const [simulatedTime, setSimulatedTime] = React.useState(new Date());

  const isSimulationMode = Object.values(dataSource).every(v => v === 'simulated');

  const toggleSource = (key: string) => {
    setDataSource(prev => ({
      ...prev,
      [key]: prev[key] === 'real' ? 'simulated' : 'real'
    }));
  };

  React.useEffect(() => {
    if (!isSimulationMode) {
      return;
    }

    const interval = setInterval(() => {
      setSimulatedTime(prevTime => {
        const newTime = new Date(prevTime.getTime() + simulationSpeed * 1000); // Avanza simulationSpeed segundos por cada segundo real
        return newTime;
      });
    }, 1000); // Actualiza cada segundo real

    return () => clearInterval(interval);
  }, [isSimulationMode, simulationSpeed]);

  const updateThreshold = (key: keyof SecurityThresholds, value: number) => {
    setThresholds(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const categories = [
    { name: 'Posición GPS', key: 'gps', icon: Compass },
    { name: 'Rumbo (Heading)', key: 'heading', icon: Gauge },
    { name: 'Velocidad (SOG)', key: 'sog', icon: ShieldAlert },
    { name: 'Profundidad', key: 'depth', icon: Cpu },
  ];

  const handleSave = () => {
    console.log("💾 Guardando configuración en el núcleo táctico...");
    const event = new CustomEvent('tactical-config-saved', { detail: { dataSource, thresholds } });
    window.dispatchEvent(event);
    alert("Configuración sincronizada con el Kernel.");
  };

  return (
    <div className="h-full w-full flex items-start justify-center p-4 overflow-y-auto custom-scrollbar">
      <div className="w-full max-w-4xl bg-slate-900/40 border border-white/5 rounded-[40px] p-8 backdrop-blur-xl mb-12">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-3xl font-black text-white flex items-center gap-3">
            <Settings className="text-cyan-400" />
            Configuración Maestra
          </h2>
          <button
            onClick={handleSave}
            className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-cyan-900/20"
          >
            Guardar en Kernel
          </button>
        </div>

        {/* MASTER SWITCH */}
        <div className="bg-gradient-to-r from-slate-900 to-indigo-950 p-8 rounded-[2.5rem] border border-cyan-500/30 mb-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl shadow-cyan-950/20">
          <div className="flex items-center gap-4">
            <div className="p-4 bg-cyan-500/20 rounded-3xl border border-cyan-500/50">
              <Activity className="text-cyan-400" size={32} />
            </div>
            <div>
              <h3 className="text-xl font-black text-white uppercase tracking-tight italic">Motor de Simulación Maestra</h3>
              <p className="text-xs text-slate-400 font-mono">Control central de telemetría táctica (Real vs Simulado)</p>
            </div>
          </div>
          <div className="flex gap-2 p-1 bg-black/40 rounded-2xl border border-white/10">
            <button
              onClick={() => {
                const newSource = { ...dataSource };
                Object.keys(newSource).forEach(k => newSource[k] = 'real');
                setDataSource(newSource);
              }}
              className={cn(
                "px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                Object.values(dataSource).every(v => v === 'real') ? "bg-emerald-500 text-white shadow-lg shadow-emerald-900/40" : "text-slate-500 hover:text-white"
              )}
            >
              Real
            </button>
            <button
              onClick={() => {
                const newSource = { ...dataSource };
                Object.keys(newSource).forEach(k => newSource[k] = 'simulated');
                setDataSource(newSource);
              }}
              className={cn(
                "px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                Object.values(dataSource).every(v => v === 'simulated') ? "bg-amber-500 text-white shadow-lg shadow-amber-900/40" : "text-slate-500 hover:text-white"
              )}
            >
              Simulado
            </button>
          </div>
        </div>
        {isSimulationMode && (
          <div className="bg-gradient-to-r from-slate-900 to-indigo-950 p-8 rounded-[2.5rem] border border-emerald-500/30 mb-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl shadow-emerald-950/20">

            <div className="flex items-center gap-4">
              <div className="p-4 bg-emerald-500/20 rounded-3xl border border-emerald-500/50">
                <Clock className="text-emerald-400" size={32} />
              </div>

              <div>
                <h3 className="text-xl font-black text-white uppercase tracking-tight italic">
                  Simulación Activa
                </h3>

                <p className="text-xs text-slate-400 font-mono">
                  Hora simulada: {simulatedTime.toLocaleTimeString()}
                </p>
              </div>
            </div>

            <div className="flex gap-2 p-1 bg-black/40 rounded-2xl border border-white/10">
              {[1, 5, 10, 30].map(speed => (
                <button
                  key={speed}
                  onClick={() => setSimulationSpeed(speed)}
                  className={cn(
                    "px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                    simulationSpeed === speed
                      ? "bg-emerald-500 text-white shadow-lg shadow-emerald-900/40"
                      : "text-slate-500 hover:text-white"
                  )}
                >
                  {speed}x
                </button>
              ))}
            </div>

          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* SMARTSHIP SHIELD WATCHDOG THRESHOLDS */}
        <div className="col-span-full bg-slate-950/50 p-6 rounded-3xl border border-slate-800">
          <div className="flex items-center gap-2 text-slate-300 mb-6">
            <ShieldCheck size={20} className="text-emerald-400" />
            <span className="font-bold tracking-tight">Umbrales de Seguridad (Watchdog)</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-xs text-slate-400 font-bold uppercase tracking-wider">Profundidad Mínima</label>
                <span className="text-sm font-mono text-cyan-400 font-bold">{thresholds.minDepth.toFixed(1)}m</span>
              </div>
              <input
                type="range"
                min="0" max="10" step="0.5"
                value={thresholds.minDepth}
                onChange={(e) => updateThreshold('minDepth', parseFloat(e.target.value))}
                className="w-full h-2 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-xs text-slate-400 font-bold uppercase tracking-wider">Temp. Motor Máx.</label>
                <span className="text-sm font-mono text-red-400 font-bold">{thresholds.maxEngineTemp}°C</span>
              </div>
              <input
                type="range"
                min="60" max="120" step="1"
                value={thresholds.maxEngineTemp}
                onChange={(e) => updateThreshold('maxEngineTemp', parseFloat(e.target.value))}
                className="w-full h-2 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-red-500"
              />
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-xs text-slate-400 font-bold uppercase tracking-wider">Nivel Combustible Bajo</label>
                <span className="text-sm font-mono text-amber-400 font-bold">{thresholds.minFuel}%</span>
              </div>
              <input
                type="range"
                min="5" max="30" step="1"
                value={thresholds.minFuel}
                onChange={(e) => updateThreshold('minFuel', parseFloat(e.target.value))}
                className="w-full h-2 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-amber-500"
              />
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-xs text-slate-400 font-bold uppercase tracking-wider">Proximidad AIS (CPA)</label>
                <span className="text-sm font-mono text-red-500 font-bold">{thresholds.minCPA.toFixed(2)} NM</span>
              </div>
              <input
                type="range"
                min="0.05" max="1.0" step="0.05"
                value={thresholds.minCPA}
                onChange={(e) => updateThreshold('minCPA', parseFloat(e.target.value))}
                className="w-full h-2 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-red-600"
              />
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-xs text-slate-400 font-bold uppercase tracking-wider">Temp. Cabina Máx.</label>
                <span className="text-sm font-mono text-red-500 font-bold">{thresholds.maxInternalTemp}°C</span>
              </div>
              <input
                type="range"
                min="20" max="60" step="1"
                value={thresholds.maxInternalTemp}
                onChange={(e) => updateThreshold('maxInternalTemp', parseFloat(e.target.value))}
                className="w-full h-2 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-red-500"
              />
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-xs text-slate-400 font-bold uppercase tracking-wider">Humedad Máx.</label>
                <span className="text-sm font-mono text-amber-500 font-bold">{thresholds.maxHumidity}%</span>
              </div>
              <input
                type="range"
                min="30" max="95" step="1"
                value={thresholds.maxHumidity}
                onChange={(e) => updateThreshold('maxHumidity', parseFloat(e.target.value))}
                className="w-full h-2 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-amber-500"
              />
            </div>
          </div>
        </div>

        {/* CALIBRACIÓN */}
        <div className="col-span-full bg-slate-950/50 p-6 rounded-3xl border border-slate-800">
          <div className="flex items-center gap-2 text-slate-300 mb-4">
            <Settings size={20} />
            <span className="font-bold">Calibración</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Offset Profundidad (m)</label>
              <input type="range" min="0" max="10" step="0.1" className="w-full h-2 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-cyan-500" />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Desvío Compás (°)</label>
              <input type="range" min="-10" max="10" step="0.1" className="w-full h-2 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-cyan-500" />
            </div>
          </div>
        </div>

        {/* GATEWAY NMEA */}
        <div className="col-span-full bg-slate-950/50 p-6 rounded-3xl border border-slate-800">
          <div className="flex items-center gap-2 text-slate-300 mb-4">
            <Wifi size={20} />
            <span className="font-bold">Gateway NMEA</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <input type="text" placeholder="IP: 192.168.1.1" className="bg-slate-900 border border-slate-700 rounded-xl p-3 text-white" />
            <input type="text" placeholder="Puerto: 10110" className="bg-slate-900 border border-slate-700 rounded-xl p-3 text-white" />
          </div>
        </div>

        {/* 📁 SECCIÓN DE CARTAS NÁUTICAS (NUEVA) */}
        <div className="col-span-full bg-slate-950/50 p-6 rounded-3xl border border-slate-800">
          <div className="flex items-center gap-2 text-slate-300 mb-4">
            <FolderOpen size={20} className="text-cyan-400" />
            <span className="font-bold">Repositorio de Cartas Locales</span>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between bg-black/40 p-4 rounded-2xl border border-white/5">
            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest block mb-1">Ruta del Directorio</span>
              <p className="text-sm font-mono text-cyan-400 truncate pr-2">
                {cartasPath || "Cargando repositorio..."}
              </p>
            </div>
            <button
              type="button"
              onClick={onCambiarCarpeta}
              className="w-full sm:w-auto px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all border border-white/10 active:scale-95"
            >
              Cambiar Ruta
            </button>
          </div>
        </div>

      </div>
    </div>
    </div >
  );
};