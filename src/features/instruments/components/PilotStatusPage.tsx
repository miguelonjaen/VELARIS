import React from 'react';
import { motion } from 'motion/react';
import { Compass } from 'lucide-react';

export const PilotStatusPage = ({ hdg, isNavigating }: any) => {
  return (
    <div className="w-full h-full bg-black flex flex-col items-center justify-center p-6 select-none">
      <div className="text-[8px] font-black text-slate-500 uppercase tracking-[0.3em] mb-4">PILOTO AUTOMÁTICO</div>
      
      <div className="relative flex items-center justify-center w-40 h-40">
        {/* Steering Wheel Icon */}
        <div className="absolute inset-0 flex items-center justify-center opacity-20">
            <Compass size={120} strokeWidth={0.5} className="text-white" />
        </div>

        <div className="z-10 flex flex-col items-center">
            <div className="text-5xl font-black text-white font-mono leading-none">{Math.round(hdg).toString().padStart(3, '0')}°</div>
            <div className="mt-2 px-3 py-1 bg-cyan-600 rounded text-[9px] font-black text-white uppercase animate-pulse">
                {isNavigating ? 'AUTO' : 'STANDBY'}
            </div>
        </div>
      </div>

      <div className="mt-8 w-full border-t border-white/10 pt-4 flex justify-between px-4">
          <div className="flex flex-col">
              <span className="text-[7px] font-black text-slate-600 uppercase">RUMBO BLOQ.</span>
              <span className="text-sm font-black text-white font-mono">{Math.round(hdg)}°</span>
          </div>
          <div className="flex flex-col items-end">
              <span className="text-[7px] font-black text-slate-600 uppercase">MODO</span>
              <span className="text-sm font-black text-white font-mono">MAGNETIC</span>
          </div>
      </div>
    </div>
  );
};
