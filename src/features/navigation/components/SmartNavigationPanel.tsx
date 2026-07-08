import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { AlertTriangle, TrendingUp, Compass, Clock, AlertCircle, Anchor, Wind } from 'lucide-react';
import { cn } from '../lib/utils';
import { LaylineData, AnchorWatchData } from '../lib/laylineCalculator';

interface SmartNavigationPanelProps {
  eta?: string;
  distanceNM?: number;
  sog?: number;
  laylineData?: LaylineData;
  anchorWatchData?: AnchorWatchData;
  waypointName?: string;
  className?: string;
}

export const SmartNavigationPanel: React.FC<SmartNavigationPanelProps> = ({
  eta,
  distanceNM = 0,
  sog = 0,
  laylineData,
  anchorWatchData,
  waypointName = 'Navegación libre',
  className = ''
}) => {
  // Calculate time remaining
  const timeRemaining = useMemo(() => {
    if (!eta || sog <= 0) return null;
    
    const now = new Date();
    const etaDate = new Date(eta);
    const diffMs = etaDate.getTime() - now.getTime();
    
    if (diffMs < 0) return null;
    
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    return { hours, minutes };
  }, [eta, sog]);

  return (
    <div className={cn("space-y-3", className)}>
      {/* Destination & ETA */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-4 bg-gradient-to-br from-cyan-600/20 to-cyan-600/10 border border-cyan-500/30 rounded-2xl"
      >
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-cyan-400" />
            <span className="text-[9px] font-black text-cyan-400 uppercase tracking-widest">Destino</span>
          </div>
          {sog > 0 && <span className="text-[8px] font-bold text-cyan-400">{sog.toFixed(1)} kn</span>}
        </div>
        
        <p className="text-sm font-black text-white uppercase tracking-tight mb-3 truncate">
          {waypointName}
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1">Distancia</p>
            <p className="text-lg font-black text-white font-mono">{distanceNM.toFixed(1)} <span className="text-xs text-slate-500">NM</span></p>
          </div>
          <div>
            <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1">ETA</p>
            {timeRemaining ? (
              <div className="flex items-baseline gap-1">
                <span className="text-lg font-black text-white font-mono">
                  {timeRemaining.hours.toString().padStart(2, '0')}:{timeRemaining.minutes.toString().padStart(2, '0')}
                </span>
                <span className="text-[8px] text-slate-500">h</span>
              </div>
            ) : (
              <p className="text-sm font-black text-slate-500">—</p>
            )}
          </div>
        </div>

        {eta && (
          <p className="text-[8px] text-slate-500 mt-2">
            Estimado: {new Date(eta).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </motion.div>

      {/* Layline Information */}
      {laylineData && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className={cn(
            "p-4 border rounded-2xl transition-all",
            laylineData.isOffLayline
              ? "bg-red-600/20 border-red-500/50"
              : laylineData.isDeviated
              ? "bg-amber-600/20 border-amber-500/30"
              : "bg-emerald-600/20 border-emerald-500/30"
          )}
        >
          <div className="flex items-center gap-2 mb-3">
            {laylineData.isOffLayline ? (
              <AlertTriangle className="w-4 h-4 text-red-400" />
            ) : laylineData.isDeviated ? (
              <AlertCircle className="w-4 h-4 text-amber-400" />
            ) : (
              <TrendingUp className="w-4 h-4 text-emerald-400" />
            )}
            <span className={cn(
              "text-[9px] font-black uppercase tracking-widest",
              laylineData.isOffLayline
                ? "text-red-400"
                : laylineData.isDeviated
                ? "text-amber-400"
                : "text-emerald-400"
            )}>
              {laylineData.isOffLayline ? 'Fuera de Layline' : laylineData.isDeviated ? 'Desviación' : 'En Layline'}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-3">
            <div>
              <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1">Rumbo Ópt.</p>
              <p className="text-lg font-black text-white font-mono">{Math.round(laylineData.optimalBearing)}°</p>
            </div>
            <div>
              <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1">Actual</p>
              <p className="text-lg font-black text-white font-mono">{Math.round(laylineData.currentCOG)}°</p>
            </div>
            <div>
              <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1">Desv.</p>
              <p className={cn("text-lg font-black font-mono", laylineData.isDeviated ? "text-amber-400" : "text-emerald-400")}>
                {laylineData.deviation > 0 ? '+' : ''}{laylineData.deviation.toFixed(0)}°
              </p>
            </div>
          </div>

          {/* Wind Angle Info */}
          <div className="p-2 bg-black/20 rounded-xl">
            <div className="flex items-center gap-2">
              <Wind className="w-3 h-3 text-cyan-400" />
              <p className="text-[8px] text-slate-400">
                Viento aparente: <span className="font-bold text-white">{Math.round(laylineData.apparentWind)}°</span>
                {' '} • Ángulo óptimo: <span className="font-bold text-white">{Math.round(laylineData.windOptimalAngle)}°</span>
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Anchor Watch Alert */}
      {anchorWatchData?.isDrifting && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="p-4 bg-red-600/30 border border-red-500/50 rounded-2xl"
        >
          <div className="flex items-center gap-2 mb-3">
            <Anchor className="w-4 h-4 text-red-400 animate-pulse" />
            <span className="text-[9px] font-black text-red-400 uppercase tracking-widest">Alerta de Deriva</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1">Distancia</p>
              <p className="text-lg font-black text-red-300 font-mono">
                {(anchorWatchData.driftDistance).toFixed(0)} <span className="text-xs text-slate-400">m</span>
              </p>
            </div>
            <div>
              <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1">Umbral</p>
              <p className="text-lg font-black text-slate-400 font-mono">
                {anchorWatchData.driftThreshold} <span className="text-xs text-slate-500">m</span>
              </p>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-red-500/30">
            <p className="text-[9px] font-bold text-red-300">
              ⚠️ Barco desplazado {anchorWatchData.driftDistance.toFixed(0)}m del punto de fondeo. Verificar anclaje.
            </p>
          </div>
        </motion.div>
      )}

      {/* Anchor Watch OK */}
      {anchorWatchData && !anchorWatchData.isDrifting && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="p-4 bg-emerald-600/20 border border-emerald-500/30 rounded-2xl"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Anchor className="w-4 h-4 text-emerald-400" />
              <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">Fondeo Seguro</span>
            </div>
            <p className="text-sm font-black text-emerald-300 font-mono">
              {(anchorWatchData.driftDistance).toFixed(0)}m
            </p>
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default SmartNavigationPanel;
