import React, { useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../../lib/utils';
import { supabase } from '../../../supabaseClient';
import { MapPin, Navigation } from 'lucide-react';

interface Navigation3DPageProps {
  btw: number;
  dtw: number;
  xte: number;
  hdg: number;
  waypointName: string;
  shipId: string;
}

export const Navigation3DPage: React.FC<Navigation3DPageProps> = ({ 
  btw, 
  dtw, 
  xte, 
  hdg, 
  waypointName, 
  shipId 
}) => {
  const isXTECritical = Math.abs(xte) > 0.1;

  useEffect(() => {
    if (isXTECritical) {
      const logAlert = async () => {
        try {
          await supabase.from('bitacora').insert([{
            barco_id: shipId,
            titulo: 'DESVIACIÓN DE RUTA',
            descripcion: `Error de seguimiento (XTE) detectado: ${xte.toFixed(2)} NM`,
            tipo_evento: 'NAVEGACION',
            categoria: 'Navegación',
            created_at: new Date().toISOString(),
          }]);
        } catch (err) {
          console.error("Error logging navigation alert:", err);
        }
      };
      logAlert();
    }
  }, [isXTECritical, xte, shipId]);

  const roadShift = xte * -150;

  return (
    <div className="relative w-full h-full flex flex-col items-center bg-white overflow-hidden px-4 py-8">
      {/* Background Grid */}
      <div className="absolute inset-0 grid grid-cols-2 border-zinc-100 pointer-events-none">
          <div className="border-r border-zinc-100" />
          <div />
      </div>

      {/* Top Digital Data */}
      <div className="w-full flex justify-between mb-6 relative z-10">
        <div>
          <div className="text-[7px] font-black text-zinc-500 uppercase tracking-widest">BTW</div>
          <div className="text-xl font-black text-black font-mono leading-none tracking-tighter">{Math.round(btw).toString().padStart(3, '0')}°</div>
        </div>
        <div className="text-right">
          <div className="text-[7px] font-black text-zinc-500 uppercase tracking-widest">DTW</div>
          <div className="text-xl font-black text-black font-mono leading-none tracking-tighter">{dtw.toFixed(1)} <span className="text-[10px]">NM</span></div>
        </div>
      </div>

      {/* 3D Pathway View (Triton² style: High visibility on white) */}
      <div className="relative w-full h-48 bg-zinc-50 border border-zinc-200 overflow-hidden rounded shadow-inner z-10">
        <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-zinc-100 to-transparent opacity-50" />
        <div className="absolute top-1/2 w-full h-px bg-zinc-300" />

        <motion.div animate={{ x: roadShift * 0.1 }} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full mb-1 flex flex-col items-center">
          <div className="text-[6px] font-black text-white uppercase bg-black px-1.5 py-0.5 rounded shadow-sm mb-0.5">{waypointName}</div>
          <MapPin size={10} className="text-black" />
        </motion.div>

        <svg viewBox="0 0 400 200" className="absolute bottom-0 w-full h-1/2" preserveAspectRatio="none">
          <motion.g animate={{ x: roadShift }}>
            <path d="M 120 200 L 180 0 L 220 0 L 280 200 Z" fill={isXTECritical ? "#fbbf24" : "#e2e8f0"} fillOpacity="0.4" />
            <line x1="200" y1="200" x2="200" y2="0" stroke="black" strokeOpacity="0.1" strokeWidth="1" strokeDasharray="5,5" />
            <line x1="120" y1="200" x2="180" y2="0" stroke="black" strokeOpacity="0.2" />
            <line x1="280" y1="200" x2="220" y2="0" stroke="black" strokeOpacity="0.2" />
          </motion.g>
          <g transform="translate(200, 185)">
            <path d="M 0 -8 L 4 2 L -4 2 Z" fill="#2563eb" className="drop-shadow-sm" />
          </g>
        </svg>
      </div>

      {/* XTE Label */}
      <div className="mt-4 flex flex-col items-center z-10">
        <div className="text-[7px] font-black text-zinc-500 uppercase tracking-widest mb-1">XTE ERROR</div>
        <div className={cn(
          "px-4 py-1 rounded text-sm font-black font-mono shadow-sm",
          isXTECritical ? "bg-amber-600 text-white" : "bg-black text-white border border-black"
        )}>
          {xte >= 0 ? 'R' : 'L'} {Math.abs(xte).toFixed(2)} NM
        </div>
      </div>

      {/* Ship Heading Section */}
      <div className="absolute bottom-4 flex items-center gap-2 z-10 bg-white/50 px-2 py-0.5 rounded shadow-sm">
        <Navigation size={10} className="text-black" style={{ transform: `rotate(${hdg}deg)` }} />
        <span className="text-[7px] font-black text-black uppercase tracking-widest">PROA: {Math.round(hdg).toString().padStart(3, '0')}°</span>
      </div>
    </div>
  );
};
