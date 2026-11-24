import type { ResolvedNavigationState } from '../core/navigation/SharedNavigationState';
import { presentSharedNavigation } from '../features/navigation/utils/sharedNavigationPresentation';
﻿import React from 'react';
import { Layers, Navigation } from 'lucide-react';
import { cn } from '../lib/utils';
import { useSharedNavigationView } from '../features/navigation/hooks/useSharedNavigationView';
import type { NavigationCellView } from '../features/navigation/utils/sharedNavigationPresentation';

type ZeusPageId = 'chart' | 'sailsteer' | 'race' | 'laylines' | 'windplot' | 'pilot' | 'weather' | 'charts';

interface Zeus3SChartplotterOverlayProps {
  /** Ya no se muestran: posición, SOG, COG y rumbo salen de app.navigationState. Se conservan por compatibilidad con App. */
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
  tripDistanceNm?: number;
  navigationOverride?: ResolvedNavigationState;
  autopilotMode: 'standby' | 'auto' | 'wind' | 'nav';
  activePage: ZeusPageId;
  onSelectPage: (page: ZeusPageId) => void;
  onOpenHud: (pageIndex: number) => void;
  onOpenSystems: () => void;
  onCycleChart: () => void;
  onToggleAIS: () => void;
  onToggleWind: () => void;
  onToggleCollisionFilter: () => void;
  onStartNavigation?: () => void;
  onEndNavigation: () => void;
  onToggleAutopilot: () => void;
    isSailSteerWidgetOpen: boolean;
  onCloseSailSteerWidget: () => void;
  isNavFocusMode: boolean;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  /** false cuando la profundidad no procede de un sensor (no se muestra el valor por defecto). */
  depthAvailable?: boolean;
  /** Identificación de la carta activa que se muestra en la banda. */
  activeChartDetail?: string;
  className?: string;
}

// Nota: la antigua barra de páginas Zeus (Chart, SailSteer, RacePanel...) ya no se
// renderiza; la navegación entre pantallas vive en la barra derecha (ZeusSidebar).
// Las props de páginas se conservan por compatibilidad con App.

/** Celda de instrumento: etiqueta pequeña, cifra destacada y unidad visible. */
const Cell = ({
  label,
  value,
  unit,
  available = true,
  tone = 'text-white',
  title,
  wide = false,
  source = null,
  unavailableTitle,
}: {
  label: string;
  value: string;
  unit?: string;
  available?: boolean;
  tone?: string;
  title?: string;
  wide?: boolean;
  /** Procedencia del dato; se marcan el respaldo de GAULOSdroid y los datos simulados. */
  source?: 'BOAT' | 'DROID' | 'SIMULATOR' | null;
  unavailableTitle?: string;
}) => (
  <div
    className={cn(
      'flex min-w-0 flex-col justify-center border-l border-white/[0.07] px-2.5 py-1',
      wide ? 'basis-[112px] grow-[2]' : 'basis-[70px] grow',
    )}
    title={available ? title : (unavailableTitle ?? `${label}: sin dato disponible`)}
  >
    <span className="text-[8px] font-bold uppercase leading-none tracking-[0.16em] text-slate-500">
      {label}
      {available && source === 'DROID' && <span className="ml-1 text-fuchsia-400">· Droid</span>}
      {available && source === 'SIMULATOR' && <span className="ml-1 text-amber-400">· SIM</span>}
    </span>
    <span
      title={available ? title : unavailableTitle}
      className={cn(
        'mt-1 truncate font-mono text-[15px] font-black leading-none tabular-nums',
        available ? tone : 'text-slate-600',
      )}
    >
      {available ? value : '--'}
      {unit && <span className="ml-0.5 text-[9px] font-bold text-slate-500">{unit}</span>}
    </span>
  </div>
);

/** Celda alimentada por el estado de navegación compartido (sin valor cuando es UNKNOWN). */
const NavigationCell = ({ cell, wide = false }: { cell: NavigationCellView; wide?: boolean }) => (
  <Cell
    label={cell.label}
    value={cell.value}
    unit={cell.unit || undefined}
    available={cell.available}
    source={cell.source}
    title={cell.title}
    unavailableTitle={cell.title}
    wide={wide}
  />
);

const MODE_LABEL: Record<Zeus3SChartplotterOverlayProps['autopilotMode'], string> = {
  standby: 'STBY',
  auto: 'AUTO',
  wind: 'VIENTO',
  nav: 'NAV',
};

export const Zeus3SChartplotterOverlay: React.FC<Zeus3SChartplotterOverlayProps> = ({
  dtw, btw, eta, xte, depth, waypointName,
  activeChartName, activeChartDetail, autopilotMode, isNavFocusMode,
  depthAvailable = true, className, isNavigating, tripDistanceNm, navigationOverride,
}) => {
  const bandRef = React.useRef<HTMLElement | null>(null);
  const receivedNavigation = useSharedNavigationView();
  const navigation = navigationOverride ? presentSharedNavigation(navigationOverride) : receivedNavigation;

  // Publica el alto real de la banda en --vl-band-h para que los paneles y
  // widgets de la carta se coloquen siempre debajo, también cuando la banda
  // ocupa dos filas en ventanas estrechas.
  React.useLayoutEffect(() => {
    const root = document.documentElement;
    const band = bandRef.current;
    if (isNavFocusMode || !band) {
      root.style.setProperty('--vl-band-h', '0px');
      return;
    }
    const publish = () => root.style.setProperty('--vl-band-h', `${Math.ceil(band.getBoundingClientRect().height)}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(band);
    return () => observer.disconnect();
  }, [isNavFocusMode]);

  const hasWaypoint = Boolean(waypointName && waypointName !== '---');
  const xteTone = Math.abs(xte) > 0.1 ? 'text-amber-300' : 'text-emerald-300';
  const pad3 = (value: number) => Math.round(((value % 360) + 360) % 360).toString().padStart(3, '0');

  return (
    <div className={cn('pointer-events-none absolute inset-0 z-(--vl-z-hud)', className)}>
      {!isNavFocusMode && (
        <header
          ref={bandRef}
          aria-label="GAULOS Command Center"
          className="vl-surface pointer-events-auto absolute flex flex-wrap items-stretch overflow-hidden rounded-xl"
          style={{ top: 'var(--vl-gap)', left: 'var(--vl-gap)', right: 'var(--vl-dock-reserve)', minHeight: 44 }}
        >
          {/* Identidad + carta activa: bloque compacto, sin espacio muerto */}
          <div className="flex shrink-0 items-center gap-2 px-3 py-1.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md border border-cyan-400/40 bg-cyan-400/10 text-cyan-300">
              <Navigation className="h-3.5 w-3.5" aria-hidden="true" />
            </div>
            <div className="leading-none">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white">GAULOS</p>
              <p className="mt-1 text-[7px] font-bold uppercase tracking-[0.2em] text-cyan-400/80">Command Center</p>
            </div>
          </div>

          <div
            className="flex min-w-0 max-w-[220px] shrink items-center gap-2 border-l border-white/[0.07] px-2.5 py-1"
            title={activeChartDetail ?? activeChartName}
          >
            <Layers className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
            <div className="min-w-0 leading-none">
              <span className="text-[8px] font-bold uppercase tracking-[0.16em] text-slate-500">Carta</span>
              <p className="mt-1 truncate text-[11px] font-bold text-slate-200">{activeChartName}</p>
            </div>
          </div>

          {/* Instrumentos: rejilla fluida, se reparte en dos filas si falta ancho */}
          <div className="flex min-w-[280px] flex-1 flex-wrap items-stretch">
            <NavigationCell cell={navigation.position} wide />
            <NavigationCell cell={navigation.sog} />
            <NavigationCell cell={navigation.cog} />
            <NavigationCell cell={navigation.heading} />
            {isNavigating && (
              <Cell label="Navegadas" value={(tripDistanceNm ?? 0).toFixed(2)} unit="NM"
                available={typeof tripDistanceNm === 'number' && Number.isFinite(tripDistanceNm) && tripDistanceNm >= 0}
                title="Millas náuticas acumuladas en la travesía activa según el recorrido GPS" tone="text-cyan-300" />
            )}
            <Cell label="DTW" value={dtw.toFixed(1)} unit="NM" available={hasWaypoint} />
            <Cell label="BTW" value={pad3(btw ?? 0)} unit="°" available={hasWaypoint && Number.isFinite(btw)} />
            <Cell label="ETA" value={eta || '--:--'} available={hasWaypoint && Boolean(eta)} />
            <Cell label="XTE" value={xte.toFixed(2)} unit="NM" tone={xteTone} available={hasWaypoint} title={`Separación lateral respecto al tramo activo: ${Math.abs(xte).toFixed(3)} NM (${(Math.abs(xte) * 1852).toFixed(1)} m)`} />
            <Cell
              label="Prof."
              value={depth.toFixed(1)}
              unit="m"
              available={depthAvailable}
              title="Profundidad bajo el transductor"
            />
            <Cell label="WP" value={waypointName} available={hasWaypoint} title={waypointName} wide />
            <Cell label="Piloto" value={MODE_LABEL[autopilotMode]} tone="text-cyan-300" title="Modo de piloto (indicación visual)" />
          </div>
        </header>
      )}
    </div>
  );
};

export default Zeus3SChartplotterOverlay;
