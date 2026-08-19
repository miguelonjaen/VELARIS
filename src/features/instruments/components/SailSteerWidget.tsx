import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Compass } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { getUpwindAngle } from '../../../components/utils/polar';

interface SailSteerWidgetProps {
  isOpen: boolean;
  onClose: () => void;
  hdg: number;
  cog: number;
  twa: number;
  tws: number;
  twd: number;
  btw: number;
  waypointName: string;
  sog: number;
  vmg: number;
  isNavigating: boolean;
  waypointBearing?: number;
}

const SailSteerWidget: React.FC<SailSteerWidgetProps> = ({
  isOpen,
  onClose,
  hdg,
  cog,
  twa,
  tws,
  twd,
  btw,
  waypointName,
  isNavigating,
  sog,
  vmg,
  waypointBearing
}) => {
  const size = 260;
  const center = size / 2;
  const radius = center - 20;
  const targetTack = getUpwindAngle(tws);
  
  const noGoAngle = Math.max(30, targetTack - 5);
  const actualAngle =
  Math.abs(twa) > 180
    ? 360 - Math.abs(twa)
    : Math.abs(twa);
    const waypointRad =
  (waypointBearing ?? 0) * Math.PI / 180;
  const wpAngle = waypointBearing ?? 0;

const wpDiff = Math.abs(
  ((wpAngle - twd + 540) % 360) - 180
);
const waypointColor =
  wpDiff < noGoAngle
    ? "#ef4444" // rojo
    : wpDiff < targetTack
    ? "#f59e0b" // ámbar
    : "#22c55e"; // verde
  const waypointX =
  center +
  (radius - 25) * Math.sin(waypointRad);

const waypointY =
  center -
  (radius - 25) * Math.cos(waypointRad);

const angleError = Math.round(actualAngle - targetTack);
console.log("----- WAYPOINT -----");
console.log({
  isNavigating,
  center,
  radius,
  waypointBearing,
  waypointRad,
  waypointX,
  waypointY,
});

// Best Tack Intelligent Calculation
const portLayline = (twd - targetTack + 360) % 360;
const stbdLayline = (twd + targetTack) % 360;
const portDiff = Math.abs(((btw - portLayline + 180 + 360) % 360) - 180);
const stbdDiff = Math.abs(((btw - stbdLayline + 180 + 360) % 360) - 180);
const bestTack = portDiff < stbdDiff ? 'PORT' : 'STARBOARD';



  const DataBox = ({ label, value, unit }: { label: string; value: string | number; unit?: string }) => (
    <div className="flex flex-col items-center justify-center p-2 border border-white/5 bg-black/20 rounded-xl">
      <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">{label}</span>
      <div className="flex items-baseline gap-0.5 leading-none">
        <span className="text-sm font-bold text-white font-mono">{value}</span>
        {unit && <span className="text-[8px] text-slate-500">{unit}</span>}
      </div>
    </div>
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, x: 20, scale: 0.95 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 20, scale: 0.95 }}
          className="absolute right-[90px] top-[80px] w-[340px] h-[520px] z-[7000] bg-gradient-to-b
from-[#111827]/85
to-[#070b14]/75 backdrop-blur-md border border-cyan-500/20 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/5">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 bg-cyan-500/20 rounded flex items-center justify-center">
                <Compass className="w-3.5 h-3.5 text-cyan-400" />
              </div>
              <span className="text-[10px] font-black uppercase tracking-[0.25em] text-white">
                SAILSTEER
              </span>
            </div>
            <button 
              onClick={onClose}
              className="p-1.5 hover:bg-white/10 rounded-lg transition-all text-slate-500 hover:text-white"
            >
              <X size={16} />
            </button>
          </div>

          {/* Compass Area */}
          <div className="flex-1 flex items-center justify-center relative p-4">
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible select-none">
              {/* Outer Rings */}
              <circle cx={center} cy={center} r={radius} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
              <circle cx={center} cy={center} r={radius - 12} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />
              
              {/* Degree Ticks */}
              {[...Array(72)].map((_, i) => {
                const angle = i * 5;
                const rad = (angle * Math.PI) / 180;
                const isMajor = i % 18 === 0;
                const isMedium = i % 6 === 0;
                const innerR = radius - (isMajor ? 15 : isMedium ? 10 : 5);
                return (
                  <line 
                    key={i} 
                    x1={center + radius * Math.sin(rad)} 
                    y1={center - radius * Math.cos(rad)} 
                    x2={center + innerR * Math.sin(rad)} 
                    y2={center - innerR * Math.cos(rad)} 
                    stroke={isMajor ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.2)"} 
                    strokeWidth={isMajor ? 2 : 1} 
                  />
                );
              })}
              {/* Degree Labels */}
{[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg) => {
  const rad = (deg * Math.PI) / 180;
  const labelRadius = radius - 25;

  return (
    <text
      key={deg}
      x={center + labelRadius * Math.sin(rad)}
      y={center - labelRadius * Math.cos(rad)}
      textAnchor="middle"
      dominantBaseline="middle"
      className="fill-slate-500 text-[8px] font-bold"
    >
      {deg}
    </text>
  );
})}
              {/* Cardinal Points */}
<text
  x={center}
  y="18"
  textAnchor="middle"
  fill="#94a3b8"
  fontSize="10"
  fontWeight="bold"
>
  N
</text>

<text
  x={center}
  y={size - 8}
  textAnchor="middle"
  fill="#94a3b8"
  fontSize="10"
  fontWeight="bold"
>
  S
</text>

<text
  x="18"
  y={center + 4}
  textAnchor="middle"
  fill="#94a3b8"
  fontSize="10"
  fontWeight="bold"
>
  W
</text>

<text
  x={size - 18}
  y={center + 4}
  textAnchor="middle"
  fill="#94a3b8"
  fontSize="10"
  fontWeight="bold"
>
  E
</text>
<text x={center + 78} y={center - 78} textAnchor="middle"
  fill="#94a3b8"
  fontSize="10"
  fontWeight="bold">NE</text>
<text x={center + 78} y={center + 86}textAnchor="middle"
  fill="#94a3b8"
  fontSize="10"
  fontWeight="bold">SE</text>

<text x={center - 92} y={center + 86}textAnchor="middle"
  fill="#94a3b8"
  fontSize="10"
  fontWeight="bold">SW</text>
<text x={center - 92} y={center - 78}textAnchor="middle"
  fill="#94a3b8"
  fontSize="10"
  fontWeight="bold">NW</text>
  {/* No-Go Zone */}
{(() => {
  const noGoAngle = Math.max(30, targetTack - 5);
  const actualAngle =
  twa > 180
    ? 360 - twa
    : twa;

const angleError = Math.round(actualAngle - targetTack);

  const startAngle = twd - noGoAngle;
  const endAngle = twd + noGoAngle;

  const startRad = (startAngle * Math.PI) / 180;
  const endRad = (endAngle * Math.PI) / 180;

  const x1 = center + radius * Math.sin(startRad);
  const y1 = center - radius * Math.cos(startRad);

  const x2 = center + radius * Math.sin(endRad);
  const y2 = center - radius * Math.cos(endRad);

  return (
    <path
      d={`
        M ${center} ${center}
        L ${x1} ${y1}
        A ${radius} ${radius} 0 0 1 ${x2} ${y2}
        Z
      `}
      fill="rgba(239,68,68,0.18)"
      stroke="rgba(239,68,68,0.25)"
      strokeWidth="1"
    />
  );
})()}
{/* Upwind Target Sectors */}
{(() => {
  const noGo = 40;
  const target = 45;

  const sectors = [
    [twd - target - 8, twd - target + 8],
    [twd + target - 8, twd + target + 8],
  ];

  return (
    <>
      {sectors.map(([start, end], idx) => {
        const startRad = (start * Math.PI) / 180;
        const endRad = (end * Math.PI) / 180;

        const x1 = center + radius * Math.sin(startRad);
        const y1 = center - radius * Math.cos(startRad);

        const x2 = center + radius * Math.sin(endRad);
        const y2 = center - radius * Math.cos(endRad);

        return (
          <path
            key={idx}
            d={`
              M ${center} ${center}
              L ${x1} ${y1}
              A ${radius} ${radius} 0 0 1 ${x2} ${y2}
              Z
            `}
            fill="rgba(34,197,94,0.15)"
            stroke="rgba(34,197,94,0.25)"
            strokeWidth="1"
          />
        );
      })}
    </>
  );
})()}

              {/* Laylines (Calculated relative to TWD) */}
              {(() => {
                const targetTack = getUpwindAngle(tws);
                const portRad = (twd - targetTack) * (Math.PI / 180);
                const stbdRad = (twd + targetTack) * (Math.PI / 180);
                
                return (
                  <g className="opacity-30">
                    <line x1={center} y1={center} x2={center + (radius - 20) * Math.sin(portRad)} y2={center - (radius - 20) * Math.cos(portRad)} stroke="#ef4444" strokeWidth="2" strokeDasharray="4,4" />
                    <line x1={center} y1={center} x2={center + (radius - 20) * Math.sin(stbdRad)} y2={center - (radius - 20) * Math.cos(stbdRad)} stroke="#22c55e" strokeWidth="2" strokeDasharray="4,4" />
                  </g>
                );
              })()}

              {/* Waypoint Tactical Line (Magenta) */}

              {/* COG Line */}
              <motion.line
  x1={center}
  y1={center}
  x2={center}
  y2={center}
  animate={{
    x2: center + (radius - 5) * Math.sin(cog * Math.PI / 180),
    y2: center - (radius - 5) * Math.cos(cog * Math.PI / 180),
  }}
  stroke="#a855f7"
  strokeWidth="2"
  className="drop-shadow-[0_0_8px_rgba(168,85,247,0.5)]"
/>
              {/* HDG Line */}
              <motion.line
  x1={center}
  y1={center}
  x2={center}
  y2={center}
  animate={{
    x2: center + (radius - 5) * Math.sin(hdg * Math.PI / 180),
    y2: center - (radius - 5) * Math.cos(hdg * Math.PI / 180),
  }}
  stroke="#22d3ee"
  strokeWidth="3"
  className="drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]"
/>
              {/* TRUE WIND DIRECTION */}
<g transform={`rotate(${twd} ${center} ${center})`}>
  <line
    x1={center}
    y1={center}
    x2={center}
    y2={30}
    stroke={
      Math.abs(angleError) <= 3
        ? "#22c55e"
        : Math.abs(angleError) <= 8
        ? "#f59e0b"
        : "#ef4444"
    }
    strokeWidth="4"
    className="drop-shadow-[0_0_10px_rgba(250,204,21,0.9)]"
  />

  <polygon
    points={`${center - 8},42 ${center + 8},42 ${center},20`}
    fill="#facc15"
  />




  
  
</g>
<div className="absolute top-10 left-1/2 -translate-x-1/2 text-[10px] font-black text-yellow-400">
</div>
<text
  x={center + 20}
  y={center + 40}
  className="fill-yellow-400 text-[8px] font-black"
>
  
</text>
{/* WAYPOINT */}

{Number.isFinite(waypointX) &&
 Number.isFinite(waypointY) && (
  <>
    <line
      x1={center}
      y1={center}
      x2={waypointX}
      y2={waypointY}
      stroke={waypointColor}
      strokeWidth="2"
      strokeDasharray="5,4"
      opacity="0.8"
    />

    <circle
      cx={waypointX}
      cy={waypointY}
      r="5"
      fill={waypointColor}
      className={
        waypointColor === "#22c55e"
          ? "drop-shadow-[0_0_10px_rgba(34,197,94,0.8)]"
          : waypointColor === "#f59e0b"
          ? "drop-shadow-[0_0_10px_rgba(245,158,11,0.8)]"
          : "drop-shadow-[0_0_10px_rgba(239,68,68,0.8)]"
      }
    />

    <text
      x={waypointX}
      y={waypointY - 12}
      fill={waypointColor}
      fontSize="10"
      fontWeight="700"
      textAnchor="middle"
    >
      WP
    </text>
  </>
)}

              {/* Boat Icon (Center) */}
              <motion.g animate={{ rotate: hdg }} style={{ originX: `${center}px`, originY: `${center}px` }}>
                <path  d={`
    M ${center} ${center - 15}
    L ${center - 6} ${center + 10}
    L ${center} ${center + 7}
    L ${center + 6} ${center + 10}
    Z
  `} fill="white" stroke="cyan" strokeWidth="1.5" className="drop-shadow-[0_0_5px_rgba(255,255,255,0.4)]" />
              </motion.g>

              <circle cx={center} cy={center} r="4" fill="white" className="shadow-lg" />
            </svg>

            <div className="absolute top-8 left-1/2 -translate-x-1/2 bg-black/60 border border-white/10 px-2 py-0.5 rounded text-[10px] font-bold font-mono text-cyan-400">
              {Math.round(hdg).toString().padStart(3, '0')}°
            </div>
          </div>
          <div className="absolute top-16 left-1/2 -translate-x-1/2">
  </div>
{/* TARGET */}
<div className="absolute top-16 left-1/2 -translate-x-1/2">
  <span className="px-3 py-1 rounded bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 text-[10px] font-black">
    TARGET {targetTack}°
  </span>
</div>

{/* ACTUAL */}
<div className="absolute top-[175px] left-1/2 -translate-x-1/2 flex flex-col items-center">
  <span className="text-[11px] font-bold text-slate-200">
    ACTUAL {Math.round(actualAngle)}°
  </span>

  <span
    className={cn(
      "text-[11px] font-black",
      Math.abs(angleError) <= 3
        ? "text-emerald-400"
        : Math.abs(angleError) <= 8
        ? "text-amber-400"
        : "text-red-400"
    )}
  >
    {angleError > 0 ? '+' : ''}
    {angleError}°
  </span>
</div>
{tws < 4 && (
  <div className="absolute top-[55px] left-1/2 -translate-x-1/2">
    <div className="px-3 py-1 rounded bg-amber-500/20 border border-amber-500/30 text-amber-300 text-[9px] font-black uppercase">
      WIND TOO LIGHT
    </div>
  </div>
)}
{/* BEST TACK */}
<div className="absolute bottom-[135px] left-1/2 -translate-x-1/2">
  <div
    className={cn(
      "px-10 py-0.1 rounded-xl border text-[11px] font-black uppercase text-center shadow-lg",
      bestTack === 'PORT'
        ? "bg-red-500/20 border-red-500/30 text-red-300"
        : "bg-green-500/20 border-green-500/30 text-green-300"
    )}
  >
    BEST TACK
    <br />
    {bestTack}
  </div>

    <span
      className={cn(
        "text-[9px] font-black",
        Math.abs(angleError) <= 3
          ? "text-emerald-400"
          : Math.abs(angleError) <= 8
          ? "text-amber-400"
          : "text-red-400"
      )}
    >
     
    </span>

    
  </div>




          {/* Footer Metrics */}
          <div className="p-4 grid grid-cols-3 gap-3 bg-black/40 border-t border-white/10">

  <DataBox label="HDG" value={Math.round(hdg)} unit="°" />
  <DataBox label="COG" value={Math.round(cog)} unit="°" />
  <DataBox label="TWA" value={Math.round(twa)} unit="°" />

  <DataBox label="TWS" value={tws.toFixed(1)} unit="kt" />
  <DataBox label="TWD" value={Math.round(twd)} unit="°" />
  <DataBox label="VMG" value={vmg.toFixed(1)} unit="kt" />

</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SailSteerWidget;