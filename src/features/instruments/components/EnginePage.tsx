import React, { useEffect } from 'react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { supabase } from '../supabaseClient';

interface EnginePageProps {
  rpm: number;
  temp: number;
  voltage: number;
  fuel: number;
  water: number;
  shipId: string;
}

export const EnginePage: React.FC<EnginePageProps> = ({ rpm, temp, voltage, fuel, water, shipId }) => {
  const isTempCritical = temp > 95;
  const isFuelLow = fuel < 10;

  useEffect(() => {
    if (isTempCritical || isFuelLow) {
      const logAlert = async () => {
        const issue = isTempCritical ? 'Temperatura CRÍTICA' : 'Combustible BAJO';
        try {
          await supabase.from('bitacora').insert([{
            barco_id: shipId,
            titulo: 'ALERTA DE MOTOR',
            descripcion: `Nivel crítico de ${issue} detectado: ${isTempCritical ? temp + '°C' : fuel + '%'}`,
            tipo_evento: 'ALERTA_MOTOR',
            categoria: 'Mantenimiento',
            created_at: new Date().toISOString(),
          }]);
        } catch (err) {
          console.error("Error logging engine alert:", err);
        }
      };
      logAlert();
    }
  }, [isTempCritical, isFuelLow, temp, fuel, shipId]);

  const rpmPercent = Math.min(100, (rpm / 4000) * 100);
  const circumference = 2 * Math.PI * 40;
  const strokeDashoffset = circumference - (rpmPercent / 100) * circumference;

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center bg-white px-4">
      {/* Background Grid */}
      <div className="absolute inset-0 grid grid-cols-2 border-zinc-100 pointer-events-none">
          <div className="border-r border-zinc-100" />
          <div />
      </div>

      <div className="grid grid-cols-2 gap-4 w-full relative z-10">
        {/* RPM Gauge */}
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-24 h-24 flex items-center justify-center">
            <svg className="w-full h-full -rotate-90">
              <circle cx="48" cy="48" r="40" fill="none" stroke="#f1f5f9" strokeWidth="6" />
              <motion.circle 
                cx="48" cy="48" r="40" fill="none" 
                stroke={rpm > 3500 ? "#ef4444" : "#1e293b"} 
                strokeWidth="6" 
                strokeDasharray={circumference}
                animate={{ strokeDashoffset }}
                transition={{ type: "spring", damping: 15 }}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute flex flex-col items-center">
              <span className="text-lg font-black text-black font-mono leading-none">{rpm}</span>
              <span className="text-[6px] font-black text-zinc-400 uppercase">RPM</span>
            </div>
          </div>
          <div className="text-center">
            <span className="text-[6px] text-zinc-500 font-black uppercase tracking-widest block mb-1">BATT V</span>
            <span className="text-sm font-black text-black font-mono leading-none">{voltage.toFixed(1)}V</span>
          </div>
        </div>

        {/* Temp Vertical Gauge */}
        <div className="flex flex-col items-center">
          <span className="text-[6px] text-zinc-500 font-black uppercase tracking-widest mb-2">ENGINE TEMP</span>
          <div className="relative w-8 h-24 bg-zinc-100 border border-zinc-200 rounded overflow-hidden flex flex-col-reverse">
             <motion.div 
              animate={{ height: `${Math.min(100, (temp / 120) * 100)}%` }}
              className={cn("w-full transition-all duration-700", isTempCritical ? "bg-red-500 animate-pulse" : "bg-black opacity-90")}
            />
            <div className="absolute inset-0 flex flex-col justify-between py-1 opacity-10"><div className="h-px bg-black w-full"/><div className="h-px bg-black w-full"/><div className="h-px bg-black w-full"/></div>
          </div>
          <span className={cn("mt-2 text-sm font-black font-mono", isTempCritical ? "text-red-500" : "text-black")}>{Math.round(temp)}°C</span>
        </div>
      </div>

      {/* Tanks Horizontal */}
      <div className="w-full mt-8 space-y-3 relative z-10">
        <div className="space-y-1">
          <div className="flex justify-between items-center px-1">
             <span className="text-[6px] font-black text-zinc-500 uppercase">FUEL</span>
             <span className={cn("text-[9px] font-black font-mono", isFuelLow ? "text-red-500" : "text-black")}>{Math.round(fuel)}%</span>
          </div>
          <div className="h-2 bg-zinc-100 rounded-full overflow-hidden border border-zinc-200">
             <motion.div animate={{ width: `${fuel}%` }} className={cn("h-full", isFuelLow ? "bg-red-500" : "bg-black opacity-90")} />
          </div>
        </div>
        <div className="space-y-1">
          <div className="flex justify-between items-center px-1">
             <span className="text-[6px] font-black text-zinc-500 uppercase">WATER</span>
             <span className="text-[9px] font-black font-mono text-black">{Math.round(water)}%</span>
          </div>
          <div className="h-2 bg-zinc-100 rounded-full overflow-hidden border border-zinc-200">
             <motion.div animate={{ width: `${water}%` }} className="h-full bg-black opacity-90" />
          </div>
        </div>
      </div>
    </div>
  );
};
