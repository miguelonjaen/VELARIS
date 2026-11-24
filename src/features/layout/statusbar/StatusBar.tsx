import React, { useEffect, useState } from "react";
import { Clock, Battery, Activity } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { GaulosLinkStatusChip } from '../../link/GaulosLinkPanel';

interface StatusBarProps {
  vmg: number;
  gpsStatus: 'fix' | 'searching' | 'lost';
  /** Origen de la posición: real (receptor) o simulado. */
  gpsSource?: 'real' | 'simulated';
  battery: number;
  /** false cuando no hay sensor de batería conectado: no se muestra la cifra. */
  batteryAvailable?: boolean;
  shipName: string;
  className?: string;
}

const Divider = () => <div className="h-3.5 w-px bg-white/10" aria-hidden="true" />;

/**
 * Barra superior de estado: estrecha (--vl-statusbar-h), sin consumir espacio
 * útil de la carta. GPS, enlace con el móvil, VMG, buque activo, batería,
 * reloj y versión.
 */
export const StatusBar: React.FC<StatusBarProps> = ({
  vmg,
  gpsStatus,
  gpsSource = 'real',
  battery,
  batteryAvailable = true,
  shipName,
  className,
}) => {
  const [time, setTime] = React.useState(new Date());
  const [appVersion, setAppVersion] = useState("");

  React.useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const loadVersion = async () => {
      // Ejecutando en Vite
      if (!window.GAULOSAPI?.getAppVersion) {
        setAppVersion("DEV");
        return;
      }

      try {
        const version = await window.GAULOSAPI.getAppVersion();
        setAppVersion(version);
      } catch {
        setAppVersion("?");
      }
    };

    loadVersion();
  }, []);

  const isSimulated = gpsSource === 'simulated';
  const gpsLabel = isSimulated ? 'GPS SIMULADO' : `GPS ${gpsStatus.toUpperCase()}`;
  const gpsDot = isSimulated
    ? 'bg-amber-400 shadow-[0_0_6px_#f59e0b]'
    : gpsStatus === 'fix'
      ? 'bg-emerald-500 shadow-[0_0_6px_#10b981]'
      : 'bg-red-500 animate-pulse';

  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-between border-b border-white/10 bg-black/90 px-3 text-slate-100 select-none",
        className
      )}
      style={{ height: 'var(--vl-statusbar-h)' }}
      role="status"
      aria-label="Estado del sistema"
    >
      <div className="flex items-center gap-3">
        <div
          className="flex items-center gap-2"
          title={isSimulated ? 'Posición generada por el simulador, no por un receptor GNSS' : 'Estado del receptor GNSS'}
        >
          <div className={cn("h-2 w-2 rounded-full", gpsDot)} />
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{gpsLabel}</span>
        </div>
        <Divider />
        <div className="flex items-center gap-1.5 text-cyan-400" title="Velocidad útil hacia el waypoint (VMG)">
          <Activity size={12} />
          <span className="text-[10px] font-black uppercase">VMG</span>
          <span className="font-mono text-[11px] font-bold">{vmg.toFixed(1)} <span className="text-[8px] opacity-60">kn</span></span>
        </div>
        <Divider />
        <GaulosLinkStatusChip />
      </div>

      <div className="pointer-events-none absolute left-1/2 -translate-x-1/2">
        <span className="text-[9px] font-black uppercase italic tracking-[0.4em] text-white/30">{shipName}</span>
      </div>

      <div className="flex items-center gap-3">
        <div
          className="flex items-center gap-1.5"
          title={batteryAvailable ? 'Batería del sistema' : 'Sin sensor de batería conectado'}
        >
          <Battery size={12} className={batteryAvailable && battery < 20 ? "text-red-500" : "text-slate-400"} />
          <span className={cn("font-mono text-[10px] font-bold", batteryAvailable ? "text-slate-300" : "text-slate-600")}>
            {batteryAvailable ? `${battery}%` : '--'}
          </span>
        </div>
        <Divider />
        <div className="flex items-center gap-1.5" title="Hora local">
          <Clock size={12} className="text-slate-400" />
          <span className="font-mono text-[11px] font-black">
            {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <Divider />
        <span className="font-mono text-[10px] font-bold text-cyan-400" title="Versión de GAULOS">
          v{appVersion}
        </span>
      </div>
    </div>
  );
};
