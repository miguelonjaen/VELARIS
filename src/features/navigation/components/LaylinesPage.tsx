import React from 'react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

export const LaylinesPage = ({ twa, twd, hdg }: any) => {
  // Target Angles (Simplified logic for replication)
  const targetTack = 45; // Standard upwind target
  const portLayline = (twd - targetTack + 360) % 360;
  const stbdLayline = (twd + targetTack) % 360;

  return (
    <div className="w-full h-full bg-black flex flex-col items-center justify-center p-4">
      <div className="text-[8px] font-black text-slate-500 uppercase tracking-[0.3em] mb-4">LAYLINES</div>
      
      <div className="relative w-48 h-48 flex items-center justify-center">
        {/* Navigation Needle/Rose */}
        <svg viewBox="0 0 100 100" className="w-full h-full">
            <circle cx="50" cy="50" r="45" stroke="#1e293b" strokeWidth="1" fill="transparent" />
            
            {/* TWD Marker */}
            <motion.g animate={{ rotate: twd - hdg }} className="origin-center" style={{ originX: '50px', originY: '50px' }}>
                <path d="M 50 2 L 47 10 L 53 10 Z" fill="#22d3ee" />
                <line x1="50" y1="10" x2="50" y2="20" stroke="#22d3ee" strokeWidth="1" strokeDasharray="2,2" />
            </motion.g>

            {/* Laylines (V-Shape) */}
            <motion.g animate={{ rotate: -hdg }} className="origin-center" style={{ originX: '50px', originY: '50px' }}>
                {/* Port Layline */}
                <line x1="50" y1="50" x2={50 + 40 * Math.sin((portLayline * Math.PI)/180)} y2={50 - 40 * Math.cos((portLayline * Math.PI)/180)} stroke="#ef4444" strokeWidth="2" />
                {/* Starboard Layline */}
                <line x1="50" y1="50" x2={50 + 40 * Math.sin((stbdLayline * Math.PI)/180)} y2={50 - 40 * Math.cos((stbdLayline * Math.PI)/180)} stroke="#22c55e" strokeWidth="2" />
            </motion.g>

            {/* Ship Indicator */}
            <rect x="48" y="45" width="4" height="10" rx="1" fill="white" />
        </svg>

        <div className="absolute bottom-2 bg-black/80 px-2 rounded border border-white/10">
            <span className="text-[10px] font-black text-white font-mono">{Math.round(hdg)}°</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 w-full px-4">
          <div className="flex flex-col">
              <span className="text-[7px] font-black text-slate-600 uppercase">TWA</span>
              <span className="text-sm font-black text-white font-mono">{Math.round(twa)}°</span>
          </div>
          <div className="flex flex-col items-end">
              <span className="text-[7px] font-black text-slate-600 uppercase">TWD</span>
              <span className="text-sm font-black text-white font-mono">{Math.round(twd)}°</span>
          </div>
      </div>
    </div>
  );
};
