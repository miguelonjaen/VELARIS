import React from 'react';
import {
  Activity,
  Anchor,
  Compass,
  Crosshair,
  Flag,
  Layers,
  Map,
  Menu,
  Navigation,
  Power,
  Radar,
  Radio,
  Route,
  Sailboat,
  Settings,
  Timer,
  Wind,
  Zap,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';
import SailSteerWidget from '../features/instruments/components/SailSteerWidget';

type ZeusPageId = 'chart' | 'sailsteer' | 'race' | 'laylines' | 'windplot' | 'pilot' | 'weather' | 'charts';

interface Zeus3SChartplotterOverlayProps {
  sog: number;
  hdg: number;
  cog: number;
  tws: number;
  twd: number;
  twa: number;
  depth: number;
  dtw: number;
  btw: number;
  eta?: string;
  xte: number;
  waypointName: string;
  chartMode: 'standard' | 'mbtiles';
  activeChartName: string;
  aisEnabled: boolean;
  windEnabled: boolean;
  collisionFilter: boolean;
  isNavigating: boolean;
  autopilotMode: 'standby' | 'auto' | 'wind' | 'nav';
  activePage: ZeusPageId;
  onSelectPage: (page: ZeusPageId) => void;
  onOpenHud: (pageIndex: number) => void;
  onOpenSystems: () => void;
  onCycleChart: () => void;
  onToggleAIS: () => void;
  onToggleWind: () => void;
  onToggleCollisionFilter: () => void;
  onStartNavigation: () => void;
  onEndNavigation: () => void;
  onToggleAutopilot: () => void;
    isSailSteerWidgetOpen: boolean;
  onCloseSailSteerWidget: () => void;
  isNavFocusMode: boolean;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  className?: string;
  
}

const pages: Array<{ id: ZeusPageId; label: string; icon: React.ReactNode; hudIndex?: number }> = [
  { id: 'chart', label: 'Chart', icon: <Map className="h-4 w-4" /> },
  { id: 'sailsteer', label: 'SailSteer', icon: <Sailboat className="h-4 w-4" />, hudIndex: 1 },
  { id: 'race', label: 'RacePanel', icon: <Flag className="h-4 w-4" />, hudIndex: 5 },
  { id: 'laylines', label: 'Laylines', icon: <Route className="h-4 w-4" /> },
  { id: 'windplot', label: 'WindPlot', icon: <Wind className="h-4 w-4" />, hudIndex: 3 },
  { id: 'pilot', label: 'Pilot', icon: <Compass className="h-4 w-4" /> },
  { id: 'weather', label: 'PredictWind', icon: <Activity className="h-4 w-4" /> },
  { id: 'charts', label: 'Cartas', icon: <Layers className="h-4 w-4" /> },
];

const StatusPill = ({ label, active }: { label: string; active: boolean }) => (
  <span
    className={cn(
      'rounded border px-2 py-1 text-[8px] font-black uppercase tracking-[0.18em]',
      active ? 'border-cyan-400/40 bg-cyan-400/15 text-cyan-200' : 'border-white/10 bg-black/45 text-slate-500',
    )}
  >
    {label}
  </span>
);

const DataBox = ({ label, value, unit }: { label: string; value: string; unit?: string }) => (
  <div className="min-w-[76px] border border-white/10 bg-black/65 px-2 py-0.5">
    <p className="text-[7px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</p>
    <p className="font-mono text-base font-black leading-none text-white">
      {value}
      {unit && <span className="ml-1 text-[8px] text-slate-500">{unit}</span>}
    </p>
  </div>
);

export const Zeus3SChartplotterOverlay: React.FC<Zeus3SChartplotterOverlayProps> = ({
  sog, hdg, cog, tws, twd, twa, depth, dtw, btw, eta, xte, waypointName,
   chartMode, activeChartName, aisEnabled, windEnabled, collisionFilter,
  isNavigating, autopilotMode, isNavFocusMode, activePage, onSelectPage, onOpenHud,
  onOpenSystems, onCycleChart, onToggleAIS, onToggleWind,
  onToggleCollisionFilter, onStartNavigation, onEndNavigation,
  onToggleAutopilot, onZoomIn, onZoomOut, className,  isSailSteerWidgetOpen,
  onCloseSailSteerWidget,
  }) => {
  const selectedPage = pages.find((page) => page.id === activePage) || pages[0];
  const xteTone = Math.abs(xte) > 0.1 ? 'text-amber-300' : 'text-emerald-300';
  const vmg =
  sog * Math.cos((twa * Math.PI) / 180);

  const handlePage = (page: (typeof pages)[number]) => {
    onSelectPage(page.id);
    if (typeof page.hudIndex === 'number') onOpenHud(page.hudIndex);
    if (page.id === 'charts') onCycleChart(); // This is now handled by ZeusSidebar
    if (page.id === 'pilot') onToggleAutopilot(); // This is now handled by ZeusSidebar
    if (page.id === 'chart') onOpenHud(0); // This is now handled by ZeusSidebar
  };

  return (
    <div className={cn('pointer-events-none absolute inset-0 z-[6400]', className)}>
      <div className="absolute inset-0 pointer-events-none border-[10px] border-[#111827]/85 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08),inset_0_0_40px_rgba(0,0,0,0.45)]" />

      {!isNavFocusMode && (
        <header className="pointer-events-auto absolute left-56 right-24 top-4 flex items-center justify-between gap-2 border border-white/10 bg-[#07111e]/88 px-4 py-1.5 shadow-2xl backdrop-blur-md"> {/* Reduced padding and gap */}
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-sm border border-cyan-400/40 bg-cyan-400/10 text-cyan-300">
            <Navigation className="h-4 w-4" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-white">VELARIS COMMAND CENTER</p>
            <p className="text-[7px] font-bold uppercase tracking-[0.2em] text-slate-500">TACTICAL NAVIGATION SYSTEM</p>
          </div>
        </div>
        <div className="grid grid-cols-5 gap-2">
          <DataBox label="SOG" value={sog.toFixed(1)} unit="kt" />
<DataBox label="HDG" value={Math.round(hdg).toString().padStart(3,'0')} unit="deg" />
<DataBox label="DTW" value={dtw.toFixed(1)} unit="nm" />
<DataBox label="ETA" value={eta || '--:--'} />
<DataBox label="DEPTH" value={depth.toFixed(1)} unit="m" />
        </div>
      </header>
      )}
      {!isNavFocusMode && (
        <div className="absolute top-[62px] left-[300px] z-[6500] pointer-events-none">
  <div className="bg-[#07111e]/92 backdrop-blur-md border border-cyan-500/20 rounded-xl px-4 py-1.5 w-[360px] shadow-xl">

    
    <div className="grid grid-cols-5 gap-4">

      <div>
        <div className="text-[8px] text-slate-500 uppercase">WP</div>
        <div className="text-xs font-bold text-white truncate max-w-[90px]">
          {waypointName || '---'}
        </div>
      </div>

      <div>
        <div className="text-[8px] text-slate-500 uppercase">DTW</div>
        <div className="text-xs font-bold text-white">
          {dtw.toFixed(1)} nm
        </div>
      </div>

      <div>
        <div className="text-[8px] text-slate-500 uppercase">ETA</div>
        <div className="text-xs font-bold text-white">
          {eta || '--:--'}
        </div>
      </div>

      <div>
        <div className="text-[8px] text-slate-500 uppercase">XTE</div>
        <div className="text-xs font-bold text-white">
          {xte.toFixed(2)}
        </div>
      </div>

      <div>
        <div className="text-[8px] text-slate-500 uppercase">MODE</div>
        <div className="text-xs font-bold text-cyan-300">
          {autopilotMode.toUpperCase()}
        </div>
      </div>

    </div>

  </div>
</div>
)}
{/*
<SailSteerWidget
  isOpen={isSailSteerWidgetOpen}
  onClose={onCloseSailSteerWidget}
  hdg={hdg}
  cog={cog}
  twa={twa}
  tws={tws}
  twd={twd}
  btw={btw}
  waypointBearing={btw}
  waypointName={waypointName}
  isNavigating={isNavigating}
  sog={sog}
  vmg={vmg}
/>
*/}

      
      
    

    </div>
  );
};

export default Zeus3SChartplotterOverlay;
