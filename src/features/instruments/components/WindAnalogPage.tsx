import React from 'react';
import { motion } from 'motion/react';

export const WindAnalogPage = ({ awa, tws, twa }: any) => {
  return (
    <div className="relative w-full h-full flex flex-col bg-black">
      {/* Background Grid */}
      <div className="absolute inset-0 grid grid-cols-2 border-white/5 pointer-events-none">
          <div className="border-r border-white/5" />
          <div />
      </div>

      {/* Main Analog Instrument Instrument */}
      <div className="flex-grow flex items-center justify-center relative z-10 py-6 scale-95">
        <div className="relative w-48 h-48 rounded-full border border-white/10 bg-slate-900/20 flex items-center justify-center shadow-[inset_0_0_20px_rgba(0,0,0,0.5)]">
          <svg viewBox="0 0 200 200" className="w-full h-full p-2">
            <circle cx="100" cy="100" r="95" fill="transparent" stroke="#1e293b" strokeWidth="1" />
            
            {/* Color Sectors (Triton² style: Red/Port, Green/Starboard) */}
            <path d="M 100 100 L 100 25 A 75 75 0 0 0 54 44 Z" fill="#ef4444" fillOpacity="0.3" />
            <path d="M 100 100 L 100 25 A 75 75 0 0 1 146 44 Z" fill="#22c55e" fillOpacity="0.3" />
            
            {[...Array(36)].map((_, i) => {
              const angle = i * 10;
              const x1 = 100 + 88 * Math.sin((angle * Math.PI) / 180);
              const y1 = 100 - 88 * Math.cos((angle * Math.PI) / 180);
              const x2 = 100 + (i % 3 === 0 ? 80 : 84) * Math.sin((angle * Math.PI) / 180);
              const y2 = 100 - (i % 3 === 0 ? 80 : 84) * Math.cos((angle * Math.PI) / 180);
              return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={i % 9 === 0 ? "white" : "#334155"} strokeWidth={i % 9 === 0 ? "1.5" : "1"} />;
            })}

            <text x="100" y="40" textAnchor="middle" fontSize="10" fontWeight="900" fill="white">0</text>
            <text x="100" y="170" textAnchor="middle" fontSize="10" fontWeight="900" fill="#64748b">180</text>

            <motion.g 
              animate={{ rotate: awa }}
              className="origin-center"
              style={{ originX: "100px", originY: "100px" }}
              transition={{ type: "spring", damping: 30 }}
            >
              {/* Pointer (Classic blue arrow head) */}
              <path d="M 100 12 L 92 48 L 108 48 Z" fill="#0ea5e9" className="drop-shadow-[0_0_8px_rgba(14,165,233,0.5)]" />
              <line x1="100" y1="48" x2="100" y2="100" stroke="#0ea5e9" strokeWidth="2" strokeOpacity="0.4" />
            </motion.g>
            <circle cx="100" cy="100" r="4" fill="white" stroke="#000" strokeWidth="1" />
          </svg>

          {/* Value Readout */}
          <div className="absolute top-[60%] bg-black/80 px-2 py-0.5 rounded border border-white/10 shadow-lg">
              <span className="text-[12px] font-black text-white font-mono tracking-tighter leading-none">{Math.round(awa)}°</span>
          </div>
        </div>
      </div>

      {/* Side Secondary Data (Corner cells) */}
      <div className="absolute top-0 left-0 p-3 border-b border-r border-white/5 w-1/2">
          <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1 block">TWS kt</span>
          <span className="text-xl font-black text-white font-mono leading-none tracking-tighter">{tws.toFixed(1)}</span>
      </div>

      <div className="absolute top-0 right-0 p-3 border-b border-white/5 w-1/2 text-right">
          <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1 block">TWA</span>
          <span className="text-xl font-black text-white font-mono leading-none tracking-tighter">{Math.round(twa)}°</span>
      </div>
    </div>
  );
};
