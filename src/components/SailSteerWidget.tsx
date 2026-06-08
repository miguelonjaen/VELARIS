import React from 'react';
import { motion } from 'motion/react';
import { Wind, Navigation, X } from 'lucide-react';
import { cn } from '../lib/utils';

interface SailSteerWidgetProps {
  shipPosition: { lat: number; lng: number };
  twa: number; // True Wind Angle
  tws: number; // True Wind Speed
  sog: number; // Speed Over Ground
  hdg: number; // Heading
  onClose: () => void;
}

const normalizeAngle = (angle: number) => (angle + 360) % 360;

const calculateVMG = (sog: number, twa: number): number => {
  const twaRad = twa * Math.PI / 180;
  return sog * Math.cos(twaRad);
};

const getOptimalTackAngle = (tws: number): number => {
  // Simplified polar for optimal upwind angle
  if (tws < 5) return 50; // Light wind, wider angle
  if (tws < 15) return 42; // Medium wind
  return 38; // Strong wind, tighter angle
};

export const SailSteerWidget: React.FC<SailSteerWidgetProps> = ({
  shipPosition,
  twa,
  tws,
  sog,
  hdg,
  onClose,
}) => {
  const vmg = calculateVMG(sog, twa);
  const optimalTackAngle = getOptimalTackAngle(tws);

  // Calculate relative angle for the optimal tack indicator
  // If TWA is to port, optimal tack is also to port.
  // If TWA is to starboard, optimal tack is also to starboard.
  const optimalTwaPort = normalizeAngle(180 - optimalTackAngle); // Example: 135 degrees from bow
  const optimalTwaStbd = normalizeAngle(180 + optimalTackAngle); // Example: 225 degrees from bow

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ type: 'spring', damping: 20, stiffness: 300 }}
      className="absolute bottom-24 left-1/2 -translate-x-1/2 z-[7000] w-48 h-48 bg-[#070b14]/90 backdrop-blur-xl border border-cyan-500/30 rounded-full shadow-2xl flex flex-col items-center justify-center p-2 pointer-events-auto"
    >
      <button onClick={onClose} className="absolute top-2 right-2 p-1 rounded-full hover:bg-white/10 transition-colors text-slate-500 hover:text-white">
        <X size={14} />
      </button>

      <div className="relative w-full h-full flex items-center justify-center">
        {/* Wind Rose Background */}
        <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full">
          <circle cx="50" cy="50" r="48" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
          {/* Major ticks */}
          {[0, 90, 180, 270].map(angle => (
            <line
              key={angle}
              x1="50" y1="2"
              x2="50" y2="8"
              transform={`rotate(${angle}, 50, 50)`}
              stroke="rgba(255,255,255,0.3)" strokeWidth="1"
            />
          ))}
          {/* Minor ticks */}
          {[...Array(36)].map((_, i) => i * 10).filter(angle => angle % 90 !== 0).map(angle => (
            <line
              key={angle}
              x1="50" y1="2"
              x2="50" y2="5"
              transform={`rotate(${angle}, 50, 50)`}
              stroke="rgba(255,255,255,0.15)" strokeWidth="0.5"
            />
          ))}
        </svg>

        {/* Optimal Tack Indicators (Green for Starboard, Red for Port) */}
        <motion.div
          className="absolute inset-0"
          style={{ transformOrigin: 'center' }}
          animate={{ rotate: hdg }} // Rotate with heading
        >
          {/* Port Optimal Tack */}
          <div
            className="absolute top-1/2 left-1/2 w-0 h-0 border-l-[10px] border-r-[10px] border-b-[20px] border-l-transparent border-r-transparent border-b-red-500/50"
            style={{ transform: `translate(-50%, -50%) rotate(${normalizeAngle(hdg - optimalTackAngle)}deg) translateY(-30px)` }}
          />
          {/* Starboard Optimal Tack */}
          <div
            className="absolute top-1/2 left-1/2 w-0 h-0 border-l-[10px] border-r-[10px] border-b-[20px] border-l-transparent border-r-transparent border-b-emerald-500/50"
            style={{ transform: `translate(-50%, -50%) rotate(${normalizeAngle(hdg + optimalTackAngle)}deg) translateY(-30px)` }}
          />
        </motion.div>

        {/* True Wind Angle Indicator */}
        <motion.div
          className="absolute inset-0"
          style={{ transformOrigin: 'center' }}
          animate={{ rotate: twa }} // Rotate with TWA
        >
          <Wind size={24} className="absolute top-2 left-1/2 -translate-x-1/2 text-cyan-400" />
        </motion.div>

        {/* Ship Heading Indicator */}
        <motion.div
          className="absolute inset-0"
          style={{ transformOrigin: 'center' }}
          animate={{ rotate: hdg }} // Rotate with Heading
        >
          <Navigation size={24} className="absolute bottom-2 left-1/2 -translate-x-1/2 text-white" />
        </motion.div>

        {/* Central Data */}
        <div className="absolute flex flex-col items-center justify-center">
          <span className="text-[8px] font-black uppercase tracking-widest text-slate-500">TWS</span>
          <span className="text-xl font-black text-white font-mono">{tws.toFixed(1)} <span className="text-[8px] text-slate-500">kt</span></span>
          <span className="text-[8px] font-black uppercase tracking-widest text-slate-500 mt-2">VMG</span>
          <span className="text-xl font-black text-cyan-400 font-mono">{vmg.toFixed(1)} <span className="text-[8px] text-slate-500">kt</span></span>
        </div>
      </div>

      <div className="absolute bottom-3 text-[8px] font-black uppercase tracking-widest text-slate-500">
        HDG {hdg.toFixed(0)}°
      </div>
    </motion.div>
  );
};