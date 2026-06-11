import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Radar, AlertTriangle, ChevronRight } from 'lucide-react';
import { cn } from '@lib/utils';

interface AISTacticalDrawerProps {
  isOpen: boolean;
  targets: any[];
  onClose: () => void;
}

export const AISTacticalDrawer: React.FC<AISTacticalDrawerProps> = ({
  isOpen,
  targets,
  onClose,
}) => {
  // Ordenar por riesgo de colisión primero y luego por CPA ascendente
  const sortedTargets = useMemo(() => {
    return [...targets].sort((a, b) => {
      if (a.isCollisionRisk && !b.isCollisionRisk) return -1;
      if (!a.isCollisionRisk && b.isCollisionRisk) return 1;
      return (a.cpa || 99) - (b.cpa || 99);
    });
  }, [targets]);

  const getCPAColor = (cpa: number, isRisk: boolean) => {
    if (isRisk || cpa < 0.5) return 'text-red-500';
    if (cpa < 1.5) return 'text-amber-400';
    return 'text-emerald-400';
  };

  const getStatusIcon = (cpa: number, isRisk: boolean) => {
    if (isRisk || cpa < 0.5) return <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_#ef4444]" />;
    if (cpa < 1.5) return <div className="w-2 h-2 rounded-full bg-amber-400" />;
    return <div className="w-2 h-2 rounded-full bg-emerald-500" />;
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: 50, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 50, opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="absolute right-[90px] top-[150px] h-[420px] w-[320px] z-[7000] bg-[#070b14]/95 backdrop-blur-xl border border-cyan-500/20 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="p-4 border-b border-white/10 bg-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Radar className="w-4 h-4 text-cyan-400" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white">
                AIS TARGETS ({targets.length})
              </span>
            </div>
            <button 
              onClick={onClose}
              className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-slate-500 hover:text-white"
            >
              <X size={16} />
            </button>
          </div>

          {/* Targets List */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2">
            {sortedTargets.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center opacity-30 p-8 text-center">
                <Radar size={48} className="mb-4 text-slate-500" />
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">No se detectan objetivos en el rango de escaneo</p>
              </div>
            ) : (
              sortedTargets.map((target) => (
                <div 
                  key={target.mmsi} 
                  className={cn(
                    "p-3 rounded-xl border border-white/5 bg-black/40 hover:bg-white/5 transition-all group",
                    target.isCollisionRisk && "border-red-500/30 bg-red-500/5"
                  )}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(target.cpa || 10, !!target.isCollisionRisk)}
                      <h4 className={cn(
                        "text-xs font-black uppercase truncate max-w-[160px]",
                        target.isCollisionRisk ? "text-red-400" : "text-white"
                      )}>
                        {target.nombre || target.shipName || target.vesselName || 'AIS TARGET'}
                      </h4>
                    </div>
                    <span className="text-[8px] font-mono text-slate-500">MMSI: {target.mmsi}</span>
                  </div>
                  <div className="flex gap-4 mt-1 text-[9px] text-slate-400 font-mono">
  <span>COG {Math.round(target.cog || 0)}°</span>
  <span>SOG {(target.sog || 0).toFixed(1)}kt</span>
</div>

                  <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-white/5">
                    <div>
                      <p className="text-[7px] text-slate-500 uppercase font-black tracking-widest">CPA</p>
                      <p className={cn("text-sm font-mono font-black", getCPAColor(target.cpa || 10, !!target.isCollisionRisk))}>
                        {(target.cpa || 0).toFixed(2)} <span className="text-[8px] opacity-60">nm</span>
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[7px] text-slate-500 uppercase font-black tracking-widest">TCPA</p>
                      <p className="text-sm font-mono font-black text-slate-200">
                        {(target.tcpa || 0).toFixed(0)} <span className="text-[8px] opacity-60">min</span>
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};