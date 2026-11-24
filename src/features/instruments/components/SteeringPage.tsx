import React from 'react';
import { motion } from 'motion/react';

export const SteeringPage = ({ hdg, rudderAngle }: any) => {
  return (
    <div className="w-full h-full bg-black flex flex-col p-6 items-center justify-center">
      <div className="text-[8px] font-black text-slate-500 uppercase tracking-[0.3em] mb-12">GOBIERNO</div>
      
      <div className="flex flex-col items-center gap-12 w-full max-w-[260px]">
          {/* Main Heading Readout */}
          <div className="flex flex-col items-center">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2 font-mono">MAGNETIC HDG</span>
              <div className="text-7xl font-black text-white font-mono leading-none tracking-tighter">
                  {Math.round(hdg).toString().padStart(3, '0')}°
              </div>
          </div>

          {/* Rudder Indicator (Visual representation of Recipe 3 in SKILL.md) */}
          <div className="w-full space-y-3">
              <div className="flex justify-between text-[7px] font-black text-slate-600 uppercase tracking-widest px-1">
                  <span>PORT</span>
                  <span>CENTER</span>
                  <span>STBD</span>
              </div>
              <div className="relative w-full h-2 bg-slate-900 rounded-full border border-white/5 overflow-visible">
                  {/* Ticks */}
                  <div className="absolute inset-0 flex justify-between px-2 items-center pointer-events-none">
                      <div className="w-px h-3 bg-red-600/50" />
                      <div className="w-px h-4 bg-white/20" />
                      <div className="w-px h-3 bg-emerald-600/50" />
                  </div>
                  
                  {/* Rudder Indicator Needle */}
                  <motion.div 
                    animate={{ x: `${(rudderAngle / 40) * 100}%` }}
                    className="absolute top-1/2 left-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-6 bg-white rounded-sm shadow-[0_0_15px_rgba(255,255,255,0.4)] z-10 border border-black/50"
                  />
              </div>
              <div className="flex justify-between text-[12px] font-black font-mono text-white px-2">
                  <span className="text-red-500">40°</span>
                  <span>0°</span>
                  <span className="text-emerald-500">40°</span>
              </div>
          </div>
      </div>
    </div>
  );
};
