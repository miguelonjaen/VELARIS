import React from 'react';
import { Waves } from 'lucide-react';

export const TidePage = ({ tideLevel }: { tideLevel?: number }) => {
  return (
    <div className="w-full h-full bg-black flex flex-col p-6 items-center justify-center">
      <div className="text-[8px] font-black text-slate-500 uppercase tracking-[0.3em] mb-6">MAREA</div>
      
      <div className="relative w-full h-32 border-b border-white/20 bg-slate-950/30 rounded-t-xl overflow-hidden shadow-inner">
          <svg viewBox="0 0 400 100" className="w-full h-full">
              <path 
                d="M 0 50 Q 100 0, 200 50 T 400 50" 
                fill="none" 
                stroke="#34d399" 
                strokeWidth="3" 
                className="opacity-80"
              />
              <circle cx={200 + (tideLevel || 0) * 100} cy={50 - (tideLevel || 0) * 20} r="4" fill="white" className="animate-pulse shadow-lg" />
              {/* Reference Lines */}
              <line x1="0" y1="50" x2="400" y2="50" stroke="white" strokeOpacity="0.05" />
          </svg>
          
          <div className="absolute top-4 left-4 flex flex-col">
              <span className="text-[7px] font-black text-emerald-500 uppercase">PRÓX. PLEAMAR</span>
              <span className="text-sm font-black text-white font-mono">14:12 <span className="text-[9px] text-slate-500">+0.8M</span></span>
          </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-8 w-full border-t border-white/5 pt-6">
          <div className="flex flex-col items-center">
              <span className="text-[7px] font-black text-slate-600 uppercase mb-1">ALTURA ACTUAL</span>
              <span className="text-2xl font-black text-white font-mono">{tideLevel?.toFixed(2) || '0.65'} <span className="text-xs text-slate-500">M</span></span>
          </div>
          <div className="flex flex-col items-center">
              <span className="text-[7px] font-black text-slate-600 uppercase mb-1">TENDENCIA</span>
              <span className="text-lg font-black text-emerald-400 uppercase tracking-tighter">SUBIENDO</span>
          </div>
      </div>
    </div>
  );
};
