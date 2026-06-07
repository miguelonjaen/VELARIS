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
  <div className="min-w-[76px] border border-white/10 bg-black/65 px-2 py-1.5">
    <p className="text-[7px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</p>
    <p className="font-mono text-lg font-black leading-none text-white">
      {value}
      {unit && <span className="ml-1 text-[8px] text-slate-500">{unit}</span>}
    </p>
  </div>
);

export const Zeus3SChartplotterOverlay: React.FC<Zeus3SChartplotterOverlayProps> = ({
  sog,
  hdg,
  cog,
  tws,
  twd,
  twa,
  depth,
  dtw,
  eta,
  xte,
  waypointName,
  chartMode,
  activeChartName,
  aisEnabled,
  windEnabled,
  collisionFilter,
  isNavigating,
  autopilotMode,
  activePage,
  onSelectPage,
  onOpenHud,
  onOpenSystems,
  onCycleChart,
  onToggleAIS,
  onToggleWind,
  onToggleCollisionFilter,
  onStartNavigation,
  onEndNavigation,
  onToggleAutopilot,
  onZoomIn,
  onZoomOut,
  className,
}) => {
  const selectedPage = pages.find((page) => page.id === activePage) || pages[0];
  const xteTone = Math.abs(xte) > 0.1 ? 'text-amber-300' : 'text-emerald-300';

  const handlePage = (page: (typeof pages)[number]) => {
    onSelectPage(page.id);
    if (typeof page.hudIndex === 'number') onOpenHud(page.hudIndex);
    if (page.id === 'charts') onCycleChart();
    if (page.id === 'pilot') onToggleAutopilot();
    if (page.id === 'chart') onOpenHud(0);
  };

  return (
    <div className={cn('pointer-events-none absolute inset-0 z-[6400]', className)}>
      <div className="absolute inset-0 pointer-events-none border-[10px] border-[#111827]/85 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08),inset_0_0_40px_rgba(0,0,0,0.45)]" />

      <header className="pointer-events-auto absolute left-6 right-24 top-4 flex items-center justify-between gap-3 border border-white/10 bg-[#07111e]/88 px-4 py-3 shadow-2xl backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-sm border border-cyan-400/40 bg-cyan-400/10 text-cyan-300">
            <Navigation className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.28em] text-white">ZEUS 3S COMMAND CENTER</p>
            <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-slate-500">
              {selectedPage.label} / {chartMode === 'mbtiles' ? activeChartName : 'STANDARD CHART'}
            </p>
          </div>
        </div>
        <div className="hidden items-center gap-2 xl:flex">
          <StatusPill label="AIS" active={aisEnabled} />
          <StatusPill label="WIND" active={windEnabled} />
          <StatusPill label="CPA" active={collisionFilter} />
          <StatusPill label={autopilotMode.toUpperCase()} active={autopilotMode !== 'standby'} />
        </div>
        <div className="grid grid-cols-5 gap-2">
          <DataBox label="SOG" value={sog.toFixed(1)} unit="kt" />
          <DataBox label="HDG" value={Math.round(hdg).toString().padStart(3, '0')} unit="deg" />
          <DataBox label="TWS" value={tws.toFixed(1)} unit="kt" />
          <DataBox label="TWD" value={Math.round(twd).toString().padStart(3, '0')} unit="deg" />
          <DataBox label="DEPTH" value={depth.toFixed(1)} unit="m" />
        </div>
      </header>

      <aside className="pointer-events-auto absolute bottom-24 right-4 top-24 flex w-16 flex-col items-center gap-2 border border-white/10 bg-[#07111e]/90 p-2 shadow-2xl backdrop-blur-md">
        <button onClick={onOpenSystems} className="flex h-12 w-12 items-center justify-center border border-white/10 bg-black/60 text-slate-300 hover:border-cyan-300 hover:text-cyan-200" title="Menu">
          <Menu className="h-5 w-5" />
        </button>
        <button onClick={onCycleChart} className="flex h-12 w-12 items-center justify-center border border-white/10 bg-black/60 text-slate-300 hover:border-cyan-300 hover:text-cyan-200" title="Pages / Cartas">
          <Layers className="h-5 w-5" />
        </button>
        <button onClick={onToggleAutopilot} className={cn('flex h-12 w-12 items-center justify-center border text-slate-300', autopilotMode !== 'standby' ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200' : 'border-white/10 bg-black/60 hover:border-cyan-300 hover:text-cyan-200')} title="Piloto">
          <Compass className="h-5 w-5" />
        </button>
        <button onClick={onToggleAIS} className={cn('flex h-12 w-12 items-center justify-center border', aisEnabled ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200' : 'border-white/10 bg-black/60 text-slate-300')} title="AIS">
          <Radar className="h-5 w-5" />
        </button>
        <button onClick={onToggleWind} className={cn('flex h-12 w-12 items-center justify-center border', windEnabled ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200' : 'border-white/10 bg-black/60 text-slate-300')} title="Viento">
          <Wind className="h-5 w-5" />
        </button>
        <button onClick={onToggleCollisionFilter} className={cn('flex h-12 w-12 items-center justify-center border', collisionFilter ? 'border-red-400 bg-red-500/20 text-red-200' : 'border-white/10 bg-black/60 text-slate-300')} title="Filtro CPA">
          <Crosshair className="h-5 w-5" />
        </button>
        <div className="mt-auto grid gap-2">
          <button onClick={onZoomIn} className="h-9 w-12 border border-white/10 bg-black/60 font-mono text-lg font-black text-white">+</button>
          <button onClick={onZoomOut} className="h-9 w-12 border border-white/10 bg-black/60 font-mono text-lg font-black text-white">-</button>
        </div>
        <button onClick={isNavigating ? onEndNavigation : onStartNavigation} className={cn('flex h-12 w-12 items-center justify-center border', isNavigating ? 'border-red-400 bg-red-500/25 text-red-100' : 'border-emerald-400 bg-emerald-500/25 text-emerald-100')} title="Start/Stop">
          <Power className="h-5 w-5" />
        </button>
      </aside>

      <section className="pointer-events-auto absolute bottom-24 left-6 w-[310px] border border-white/10 bg-[#07111e]/88 p-3 shadow-2xl backdrop-blur-md">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[9px] font-black uppercase tracking-[0.24em] text-cyan-300">{selectedPage.label}</p>
          <p className="font-mono text-[10px] font-black text-slate-400">COG {Math.round(cog).toString().padStart(3, '0')}°</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <DataBox label="Waypoint" value={(waypointName || '---').slice(0, 8).toUpperCase()} />
          <DataBox label="DTW" value={dtw.toFixed(1)} unit="nm" />
          <DataBox label="ETA" value={eta || '--:--'} />
          <div className="min-w-[76px] border border-white/10 bg-black/65 px-2 py-1.5">
            <p className="text-[7px] font-black uppercase tracking-[0.18em] text-slate-500">XTE</p>
            <p className={cn('font-mono text-lg font-black leading-none', xteTone)}>{xte.toFixed(2)}<span className="ml-1 text-[8px] text-slate-500">nm</span></p>
          </div>
          <DataBox label="TWA" value={Math.round(twa).toString()} unit="deg" />
          <DataBox label="Mode" value={autopilotMode.toUpperCase()} />
        </div>
      </section>

      <nav className="pointer-events-auto absolute bottom-4 left-6 right-24 grid grid-cols-8 gap-2 border border-white/10 bg-[#07111e]/90 p-2 shadow-2xl backdrop-blur-md">
        {pages.map((page) => (
          <button
            key={page.id}
            type="button"
            onClick={() => handlePage(page)}
            className={cn(
              'flex h-14 flex-col items-center justify-center gap-1 border border-white/10 bg-black/60 text-[8px] font-black uppercase tracking-[0.12em] text-slate-400 transition-colors hover:border-cyan-300 hover:text-cyan-200',
              activePage === page.id && 'border-cyan-300 bg-cyan-400/20 text-cyan-100',
            )}
          >
            {page.icon}
            <span>{page.label}</span>
          </button>
        ))}
      </nav>

      <div className="pointer-events-auto absolute left-6 top-24 flex gap-2">
        <button onClick={() => onSelectPage('laylines')} className="flex items-center gap-2 border border-cyan-400/30 bg-cyan-400/15 px-3 py-2 text-[9px] font-black uppercase tracking-[0.18em] text-cyan-100">
          <Route className="h-4 w-4" />
          Laylines
        </button>
        <button onClick={() => onSelectPage('race')} className="flex items-center gap-2 border border-white/10 bg-black/60 px-3 py-2 text-[9px] font-black uppercase tracking-[0.18em] text-slate-300">
          <Timer className="h-4 w-4" />
          SailingTime
        </button>
        <button onClick={() => onSelectPage('weather')} className="flex items-center gap-2 border border-white/10 bg-black/60 px-3 py-2 text-[9px] font-black uppercase tracking-[0.18em] text-slate-300">
          <Radio className="h-4 w-4" />
          PredictWind
        </button>
        <button onClick={() => onSelectPage('pilot')} className="flex items-center gap-2 border border-white/10 bg-black/60 px-3 py-2 text-[9px] font-black uppercase tracking-[0.18em] text-slate-300">
          <Zap className="h-4 w-4" />
          Pilot
        </button>
      </div>
    </div>
  );
};

export default Zeus3SChartplotterOverlay;
