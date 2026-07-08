import React, { useEffect, useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { supabase } from '../supabaseClient';

export const DepthPage = ({ currentDepth, depthHistory, shipId }: any) => {
  const [period, setPeriod] = useState(10);
  const isShallow = currentDepth < 2;
  
  const filteredHistory = useMemo(() => {
    return depthHistory.slice(-(period * 2));
  }, [depthHistory, period]);

  useEffect(() => {
    if (isShallow) {
      const logAlert = async () => {
        try {
          await supabase.from('bitacora').insert([{
              barco_id: shipId,
              titulo: 'ALERTA DE SEGURIDAD',
              descripcion: `Baja profundidad detectada: ${currentDepth.toFixed(1)} metros`,
              tipo_evento: 'ALERTA_SEGURIDAD',
              categoria: 'Seguridad',
              created_at: new Date().toISOString(),
          }]);
        } catch (err) {
          console.error("Error logging depth alert:", err);
        }
      };
      logAlert();
    }
  }, [isShallow, currentDepth, shipId]);

  const chartWidth = 280;
  const chartHeight = 80;
  const padding = 5;

  const points = useMemo(() => {
    if (filteredHistory.length < 2) return "";
    const depths = filteredHistory.map((d: any) => d.depth);
    const minDepth = Math.min(...depths, 0);
    const maxDepth = Math.max(...depths, 10);
    const range = maxDepth - minDepth || 1;
    return filteredHistory.map((d: any, i: number) => {
      const x = (i / (filteredHistory.length - 1)) * (chartWidth - 2 * padding) + padding;
      const y = chartHeight - ((d.depth - minDepth) / range) * (chartHeight - 2 * padding) - padding;
      return `${x},${y}`;
    }).join(" ");
  }, [filteredHistory]);

  return (
    <div className="w-full h-full flex flex-col bg-white">
      {/* Primary Depth Display */}
      <div className="flex-grow flex flex-col items-center justify-center border-b border-zinc-200 py-4">
        <span className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] mb-1">PROFUNDIDAD m</span>
        <motion.div 
          animate={isShallow ? { opacity: [1, 0.4, 1] } : {}}
          transition={{ repeat: Infinity, duration: 0.8 }}
          className={cn("text-7xl font-black font-mono tracking-tighter leading-none transition-colors", isShallow ? "text-red-500" : "text-black")}
        >
          {currentDepth.toFixed(1)}
        </motion.div>
      </div>
      
      {/* Time Plot Section */}
      <div className="h-[140px] flex flex-col bg-zinc-50 py-2">
        <div className="flex justify-between px-4 mb-1">
          <span className="text-[7px] font-black text-zinc-400 uppercase tracking-widest">HISTORIAL {period} MIN</span>
          <div className="flex gap-1.5">
            {[10, 30, 60].map(p => (
                <button 
                    key={p} 
                    onClick={() => setPeriod(p)}
                    className={cn(
                      "px-1.5 py-0.5 rounded transition-all text-[6px] font-black uppercase tracking-tighter", 
                      period === p 
                        ? "bg-black text-white" 
                        : "bg-white text-zinc-400 border border-zinc-200 hover:text-black"
                    )}
                >
                    {p}M
                </button>
            ))}
          </div>
        </div>
        
        <div className="flex-grow relative px-4">
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-full overflow-visible">
            <polyline fill="none" stroke={isShallow ? "#ef4444" : "#2563eb"} strokeWidth="2.5" strokeLinejoin="round" points={points} className="drop-shadow-sm" />
          </svg>
        </div>
      </div>
    </div>
  );
};
