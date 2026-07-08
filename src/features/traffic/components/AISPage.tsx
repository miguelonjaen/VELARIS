import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../../lib/utils';
import { supabase } from '../../../supabaseClient';

interface AISVessel {
  id: string;
  name: string;
  lat_offset: number; // in NM units for simplified radar display
  lng_offset: number;
  cog: number;
  sog: number;
  cpa: number;
  tcpa: number;
}

export const AISPage = ({ shipId }: { shipId: string }) => {
  // Mocking some nearby vessels for the display
  const [vessels] = useState<AISVessel[]>([
    { id: 'ais-vessel-01', name: 'TANKER PRIDE', lat_offset: 1.2, lng_offset: 0.8, cog: 210, sog: 12, cpa: 0.8, tcpa: 15 },
    { id: 'ais-vessel-02', name: 'FAST FERRY', lat_offset: -0.4, lng_offset: -0.1, cog: 45, sog: 25, cpa: 0.15, tcpa: 3 },
    { id: 'ais-vessel-03', name: 'SAIL DREAM', lat_offset: 3.5, lng_offset: -2.0, cog: 120, sog: 6, cpa: 2.1, tcpa: 45 },
  ]);

  const [hoveredVessel, setHoveredVessel] = useState<AISVessel | null>(null);

  useEffect(() => {
    // Check for critical CPA
    const criticalVessel = vessels.find(v => v.cpa < 0.2);
    if (criticalVessel) {
      const logAlert = async () => {
        try {
          await supabase.from('bitacora').insert([{
            barco_id: shipId,
            titulo: 'ALERTA AIS',
            descripcion: `Riesgo de colisión con buque ${criticalVessel.name} - CPA Crítico: ${criticalVessel.cpa}NM`,
            tipo_evento: 'ALERTA_AIS',
            categoria: 'Seguridad',
            created_at: new Date().toISOString(),
          }]);
        } catch (err) {
          console.error("Error logging AIS alert:", err);
        }
      };
      logAlert();
    }
  }, [vessels, shipId]);

  // Radar logic
  const radarSize = 200;
  const maxRange = 5;

  const getPosition = (latOff: number, lngOff: number) => {
    const x = (lngOff / maxRange) * (radarSize / 2) + radarSize / 2;
    const y = radarSize / 2 - (latOff / maxRange) * (radarSize / 2);
    return { x, y };
  };

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center bg-black px-4">
      {/* Background Grid */}
      <div className="absolute inset-0 grid grid-cols-2 border-white/5 pointer-events-none">
          <div className="border-r border-white/5" />
          <div />
      </div>

      <div className="text-[7px] font-black text-slate-500 uppercase tracking-widest mb-4 z-10">RADAR AIS (5 NM)</div>
      
      {/* Radar Container */}
      <div className="relative w-[210px] h-[210px] flex items-center justify-center border border-white/10 rounded-full bg-slate-950 shadow-inner overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(34,211,238,0.05)_0%,transparent_70%)]" />
        <svg width={radarSize} height={radarSize} viewBox={`0 0 ${radarSize} ${radarSize}`} className="overflow-visible z-10">
          {[1, 2.5, 5].map((range) => (
             <circle key={range} cx={radarSize/2} cy={radarSize/2} r={(range/maxRange) * (radarSize/2)} fill="none" stroke="white" strokeOpacity={0.1} strokeWidth="1" />
          ))}
          <line x1={radarSize/2} y1="0" x2={radarSize/2} y2={radarSize} stroke="white" strokeOpacity={0.05} />
          <line x1="0" y1={radarSize/2} x2={radarSize} y2={radarSize/2} stroke="white" strokeOpacity={0.05} />

          {/* Own ship center */}
          <circle cx={radarSize/2} cy={radarSize/2} r="4" fill="#0ea5e9" className="shadow-[0_0_10px_rgba(14,165,233,0.5)]" />

          {/* AIS Targets (Bright on dark bg) */}
          {vessels.map((v) => {
            const pos = getPosition(v.lat_offset, v.lng_offset);
            const isDangerous = v.cpa < 0.5;
            return (
              <g key={v.id} onMouseEnter={() => setHoveredVessel(v)} onMouseLeave={() => setHoveredVessel(null)} className="cursor-crosshair">
                <motion.path d="M0 -6 L 4 6 L -4 6 Z" transform={`translate(${pos.x}, ${pos.y}) rotate(${v.cog})`} fill={isDangerous ? "#ef4444" : "#cbd5e1"} animate={isDangerous ? { opacity: [1, 0.4, 1] } : {}} transition={{ repeat: Infinity, duration: 1 }} />
              </g>
            );
          })}
        </svg>

        {/* Floating Tooltip */}
        <AnimatePresence>
            {hoveredVessel && (
                <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute z-50 top-4 bg-[#121212] border border-white/20 p-2 rounded shadow-2xl text-left min-w-[140px]">
                    <div className="text-white text-[8px] font-black uppercase mb-1">{hoveredVessel.name}</div>
                    <div className="flex justify-between gap-4 text-[7px]"><span className="text-slate-500">CPA</span><span className={cn("font-bold", hoveredVessel.cpa < 0.5 ? "text-red-500" : "text-white")}>{hoveredVessel.cpa} NM</span></div>
                    <div className="flex justify-between gap-4 text-[7px]"><span className="text-slate-500">TCPA</span><span className="text-white font-bold">{hoveredVessel.tcpa} min</span></div>
                </motion.div>
            )}
        </AnimatePresence>
      </div>

      {/* Legend */}
      <div className="mt-6 flex gap-4 text-[6px] font-black uppercase tracking-widest text-slate-500 z-10">
          <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 bg-slate-300" /> SAFE</div>
          <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 bg-red-500 animate-pulse" /> DANGEROUS</div>
      </div>
    </div>
  );
};
