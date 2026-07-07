import React, { useEffect, useState } from "react";
import { Clock, Battery, Activity } from 'lucide-react';
import { cn } from '../../lib/utils';

interface StatusBarProps {
  vmg: number;
  gpsStatus: 'fix' | 'searching' | 'lost';
  battery: number;
  shipName: string;
  className?: string;
}

export const StatusBar: React.FC<StatusBarProps> = ({ vmg, gpsStatus, battery, shipName, className }) => {
  const [time, setTime] = React.useState(new Date());
  const [appVersion, setAppVersion] = useState("");

  React.useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
  window.VELARISAPI
    .getAppVersion()
    .then(setAppVersion)
    .catch(() => setAppVersion("?"));
}, []);

  return (
    <div className={cn(
      "h-8 bg-black/90 backdrop-blur-md border-b border-white/10 px-6 flex items-center justify-between z-[7000] select-none text-slate-100",
      className
    )}>
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <div className={cn(
            "w-2 h-2 rounded-full",
            gpsStatus === 'fix' ? "bg-emerald-500 shadow-[0_0_8px_#10b981]" : "bg-red-500 animate-pulse"
          )} />
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">GPS {gpsStatus.toUpperCase()}</span>
        </div>
        <div className="h-4 w-px bg-white/10" />
        <div className="flex items-center gap-2 text-cyan-400">
          <Activity size={12} className="animate-pulse" />
          <span className="text-[10px] font-black uppercase">VMG:</span>
          <span className="text-[11px] font-mono font-bold">{vmg.toFixed(1)} <span className="text-[8px] opacity-60">KT</span></span>
        </div>
      </div>

      <div className="absolute left-1/2 -translate-x-1/2">
        <span className="text-[9px] font-black uppercase tracking-[0.4em] text-white/30 italic">{shipName}</span>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <Battery size={12} className={battery < 20 ? "text-red-500" : "text-slate-400"} />
          <span className="text-[10px] font-mono font-bold text-slate-300">{battery}%</span>
        </div>
        <div className="flex items-center gap-2 border-l border-white/10 pl-6">
          <Clock size={12} className="text-slate-400" />
          <span className="text-[11px] font-mono font-black">
            {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <div className="flex items-center gap-2 border-l border-white/10 pl-6">
  <span className="text-[10px] font-mono font-bold text-cyan-400">
    v{appVersion}
  </span>
</div>
      </div>
    </div>
  );
};
