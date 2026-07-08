import React from 'react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

export const InstrumentGridPage = ({ sog, twa, twd, tws, depth, voltage }: any) => {
  return (
    <div className="w-full h-full flex flex-col bg-black">
      {/* Primary Data Row (Top) - High impact BSPD */}
      <div className="flex-[1.8] flex flex-col items-center justify-center border-b border-white/5 relative overflow-hidden">
        <span className="absolute top-4 left-4 text-[9px] font-black text-slate-500 uppercase tracking-[0.25em]">BSPD kt</span>
        <div className="flex items-center">
          <span className="text-8xl font-black text-white font-mono tracking-[-0.08em] leading-none">{sog.toFixed(1)}</span>
        </div>
      </div>

      {/* Secondary Data Grid (Middle) - 2 columns */}
      <div className="flex-[1.2] grid grid-cols-2 border-b border-white/5">
        <div className="flex flex-col items-center justify-center border-r border-white/5 relative p-4">
          <span className="absolute top-2 left-2 text-[8px] font-black text-slate-600 uppercase tracking-widest">DEPTH m</span>
          <span className="text-4xl font-black text-white font-mono leading-none tracking-tighter mt-1">{depth.toFixed(1)}</span>
        </div>
        <div className="flex flex-col items-center justify-center relative p-4">
          <span className="absolute top-2 left-2 text-[8px] font-black text-slate-600 uppercase tracking-widest">TWA</span>
          <span className="text-4xl font-black text-white font-mono leading-none tracking-tighter mt-1">{Math.round(twa)}°</span>
        </div>
      </div>

      {/* Tertiary Data Grid (Bottom) - 2 columns */}
      <div className="flex-[1] grid grid-cols-2">
        <div className="flex flex-col items-center justify-center border-r border-white/5 relative p-4">
          <span className="absolute top-2 left-2 text-[8px] font-black text-slate-600 uppercase tracking-widest">TWS kt</span>
          <span className="text-3xl font-black text-white font-mono leading-none tracking-tighter mt-1">{tws.toFixed(1)}</span>
        </div>
        <div className="flex flex-col items-center justify-center relative p-4">
          <span className="absolute top-2 left-2 text-[8px] font-black text-slate-600 uppercase tracking-widest">BATT V</span>
          <span className="text-3xl font-black text-white font-mono leading-none tracking-tighter mt-1">{voltage.toFixed(1)}</span>
        </div>
      </div>
    </div>
  );
};
