import React, { useEffect, useRef, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Compass, Maximize2, Minimize2, X, Sun, Moon, Wind, Gauge, Shield, Navigation } from 'lucide-react';
import { buildSailingTacticsModel, type SailingTacticsInput, type SailingTacticsModel } from './sailingTacticsModel';
import './sailingTactics.css';

export type TacticalViewMode = 'tactical' | 'wind' | 'performance' | 'safety';

const value = (n: number | null, digits = 1) =>
  n === null ? '—' : n.toLocaleString('es-ES', { minimumFractionDigits: digits, maximumFractionDigits: digits });

const course = (n: number | null) =>
  n === null ? '—' : `${Math.round(((n % 360) + 360) % 360) % 360}`.padStart(3, '0');

const signed = (angle: number | null) =>
  angle === null ? null : ((angle + 540) % 360) - 180;

const SOURCE = {
  BOAT: 'Instrumentos NMEA',
  DROID: 'GPS Droid',
  SIMULATOR: 'Simulador'
} as const;

interface TileProps {
  label: string;
  reading: string;
  unit?: string;
  detail: string;
  accent?: 'wind' | 'nav' | 'wp';
  highlight?: boolean;
}

function Tile({ label, reading, unit, detail, accent, highlight }: TileProps) {
  const accentClass = accent ? `accent-${accent}` : '';
  const highlightClass = highlight ? 'border-cyan-500/50 shadow-[0_0_12px_rgba(6,182,212,0.15)]' : '';
  return (
    <div className={`st-tile ${accentClass} ${highlightClass}`}>
      <div className="st-tile-header">
        <span className="st-tile-label">{label}</span>
        {unit && <small className="st-tile-unit">{unit}</small>}
      </div>
      <strong>{reading}</strong>
      <p className="st-tile-detail" title={detail}>{detail}</p>
    </div>
  );
}

const xy = (angle: number, radius: number, cx = 270, cy = 270) => ({
  x: cx + radius * Math.sin((angle * Math.PI) / 180),
  y: cy - radius * Math.cos((angle * Math.PI) / 180)
});

/** Constructs SVG path for a circular sector arc (e.g. No-Go zone). */
function describeArc(cx: number, cy: number, rOuter: number, rInner: number, startAngle: number, endAngle: number): string {
  const diff = ((endAngle - startAngle) % 360 + 360) % 360;
  const largeArc = diff > 180 ? 1 : 0;
  const rad1 = (startAngle * Math.PI) / 180;
  const rad2 = (endAngle * Math.PI) / 180;
  const x1o = cx + rOuter * Math.sin(rad1);
  const y1o = cy - rOuter * Math.cos(rad1);
  const x2o = cx + rOuter * Math.sin(rad2);
  const y2o = cy - rOuter * Math.cos(rad2);
  const x1i = cx + rInner * Math.sin(rad2);
  const y1i = cy - rInner * Math.cos(rad2);
  const x2i = cx + rInner * Math.sin(rad1);
  const y2i = cy - rInner * Math.cos(rad1);
  return `M ${x1o} ${y1o} A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${x2o} ${y2o} L ${x1i} ${y1i} A ${rInner} ${rInner} 0 ${largeArc} 0 ${x2i} ${y2i} Z`;
}

interface RoseProps {
  model: SailingTacticsModel;
  mode: TacticalViewMode;
  theme: 'dark' | 'night';
}

function Rose({ model, mode, theme }: RoseProps) {
  const { heading, reference, wind } = model;
  const cx = 270;
  const cy = 270;
  const rBezel = 256;
  const rOuter = 236;
  const rInner = 206;

  // Relative true wind angle to boat bow
  const windAngle = wind.twa ?? (model.headingTrue !== null && wind.twd !== null ? wind.twd - model.headingTrue : null);

  // No-go zone arc (typically ~42° to each side of true wind angle)
  const noGoSector = useMemo(() => {
    if (windAngle === null) return null;
    const noGoSpan = 42;
    const start = windAngle - noGoSpan;
    const end = windAngle + noGoSpan;
    return describeArc(cx, cy, rOuter, rInner, start, end);
  }, [windAngle, cx, cy, rOuter, rInner]);

  const dialRotation = -(heading ?? 0);

  // Night vs Dark colors
  const dialTextColor = theme === 'night' ? '#f87171' : '#cbd5e1';
  const dialMajorColor = theme === 'night' ? '#ef4444' : '#94a3b8';
  const dialMinorColor = theme === 'night' ? '#7f1d1d' : '#334155';
  const trueWindColor = theme === 'night' ? '#ef4444' : '#38bdf8';
  const appWindColor = theme === 'night' ? '#f59e0b' : '#f59e0b';
  const wpColor = theme === 'night' ? '#f43f5e' : '#a855f7';

  return (
    <div className="st-rose-wrapper">
      <svg
        viewBox="0 0 540 540"
        className="st-rose"
        role="img"
        aria-label={`Rosa náutica táctica de vela: ${heading === null ? 'sin rumbo válido' : `${course(heading)} grados ${reference === 'T' ? 'verdaderos' : 'magnéticos'}`}`}
      >
        <defs>
          <radialGradient id="stBezelGrad" cx="50%" cy="50%" r="50%">
            <stop offset="85%" stopColor={theme === 'night' ? '#140505' : '#081322'} />
            <stop offset="96%" stopColor={theme === 'night' ? '#250808' : '#14283d'} />
            <stop offset="100%" stopColor={theme === 'night' ? '#3d0a0a' : '#1e3a5f'} />
          </radialGradient>
          <radialGradient id="stGlassGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={theme === 'night' ? '#1a0505' : '#091829'} stopOpacity="0.8" />
            <stop offset="70%" stopColor={theme === 'night' ? '#0a0202' : '#040a14'} stopOpacity="0.95" />
            <stop offset="100%" stopColor={theme === 'night' ? '#050101' : '#02060c'} />
          </radialGradient>
        </defs>

        {/* Outer Instrument Bezel */}
        <circle cx={cx} cy={cy} r={rBezel} fill="url(#stBezelGrad)" stroke={theme === 'night' ? '#450a0a' : '#22364f'} strokeWidth="4" />
        <circle cx={cx} cy={cy} r={rOuter + 6} fill="none" stroke={theme === 'night' ? '#2b0707' : '#0f1f33'} strokeWidth="12" />

        {/* Dial Face Background */}
        <circle cx={cx} cy={cy} r={rOuter} fill="url(#stGlassGrad)" stroke={theme === 'night' ? '#3b0707' : '#1e334d'} strokeWidth="2" />

        {/* Graduated Rotating Compass Ring (Head-Up) */}
        <g transform={`rotate(${dialRotation} ${cx} ${cy})`}>
          {/* Degree Ticks every 5° */}
          {Array.from({ length: 72 }, (_, i) => {
            const angle = i * 5;
            const isMajor = angle % 30 === 0;
            const isMedium = angle % 10 === 0 && !isMajor;
            const tickLen = isMajor ? 18 : isMedium ? 12 : 7;
            const outerP = xy(angle, rOuter - 1, cx, cy);
            const innerP = xy(angle, rOuter - 1 - tickLen, cx, cy);
            return (
              <line
                key={`tick-${i}`}
                x1={outerP.x}
                y1={outerP.y}
                x2={innerP.x}
                y2={innerP.y}
                stroke={isMajor ? dialMajorColor : isMedium ? dialMajorColor : dialMinorColor}
                strokeWidth={isMajor ? 2.5 : isMedium ? 1.5 : 1}
              />
            );
          })}

          {/* Degree and Cardinal Labels every 30° */}
          {Array.from({ length: 12 }, (_, i) => {
            const angle = i * 30;
            const labelP = xy(angle, rInner + 7, cx, cy);
            const text = angle === 0 ? 'N' : angle === 90 ? 'E' : angle === 180 ? 'S' : angle === 270 ? 'W' : `${angle}`.padStart(3, '0');
            const isCardinal = angle % 90 === 0;
            return (
              <text
                key={`lbl-${i}`}
                x={labelP.x}
                y={labelP.y}
                dy="4"
                transform={`rotate(${angle} ${labelP.x} ${labelP.y})`}
                textAnchor="middle"
                fill={isCardinal ? (theme === 'night' ? '#fca5a5' : '#38bdf8') : dialTextColor}
                fontSize={isCardinal ? '13' : '11'}
                fontWeight={isCardinal ? '800' : '650'}
                fontFamily="ui-monospace, monospace"
              >
                {text}
              </text>
            );
          })}
        </g>

        {/* Inner Guide Ring */}
        <circle cx={cx} cy={cy} r={rInner} fill="none" stroke={theme === 'night' ? '#2b0707' : '#142538'} strokeWidth="1" strokeDasharray="2 4" />

        {/* No-Go Upwind Zone (Ceñida Imposible) */}
        {noGoSector && (
          <g className="st-nogo-sector">
            <title>Zona de ceñida imposible (No-Go Zone) · Viento Real</title>
            <path d={noGoSector} fill={theme === 'night' ? '#7f1d1d' : '#ef4444'} fillOpacity="0.22" stroke={theme === 'night' ? '#ef4444' : '#f87171'} strokeWidth="1.5" strokeDasharray="4 2" />
          </g>
        )}

        {/* Laylines (Port & Starboard) */}
        {model.portRelative !== null && (
          <g transform={`rotate(${model.portRelative} ${cx} ${cy})`}>
            <title>Layline de babor · Estimación polar</title>
            <path d={`M ${cx} ${cy} L ${cx - 16} 45 L ${cx + 16} 45 Z`} fill="#f43f5e" fillOpacity="0.12" />
            <line x1={cx} y1={cy} x2={cx} y2={42} stroke="#f43f5e" strokeWidth="2" strokeDasharray="6 4" />
            <polygon points={`${cx - 5},42 ${cx},34 ${cx + 5},42`} fill="#f43f5e" />
          </g>
        )}
        {model.starboardRelative !== null && (
          <g transform={`rotate(${model.starboardRelative} ${cx} ${cy})`}>
            <title>Layline de estribor · Estimación polar</title>
            <path d={`M ${cx} ${cy} L ${cx - 16} 45 L ${cx + 16} 45 Z`} fill="#10b981" fillOpacity="0.12" />
            <line x1={cx} y1={cy} x2={cx} y2={42} stroke="#10b981" strokeWidth="2" strokeDasharray="6 4" />
            <polygon points={`${cx - 5},42 ${cx},34 ${cx + 5},42`} fill="#10b981" />
          </g>
        )}

        {/* Central Vessel Silhouette (Velero Táctico GAULOS) */}
        <g className="st-vessel">
          {/* Hull Silhouette */}
          <path
            d="M 270 182 C 298 215 310 278 308 340 C 307 358 296 366 270 366 C 244 366 233 358 232 340 C 230 278 242 215 270 182 Z"
            fill={theme === 'night' ? '#140505' : '#081728'}
            stroke={theme === 'night' ? '#7f1d1d' : '#476582'}
            strokeWidth="2"
          />
          {/* Deck Centerline */}
          <line x1="270" y1="182" x2="270" y2="366" stroke={theme === 'night' ? '#3b0707' : '#1e3a5a'} strokeWidth="1.5" strokeDasharray="4 4" />
          {/* Cockpit / Companionway Hatch */}
          <rect x="262" y="308" width="16" height="24" rx="2" fill={theme === 'night' ? '#220808' : '#0c223a'} stroke={theme === 'night' ? '#450a0a' : '#294d6e'} strokeWidth="1" />
          {/* Mast & Boom */}
          <circle cx="270" cy="265" r="5" fill={theme === 'night' ? '#ef4444' : '#38bdf8'} />
          <line x1="270" y1="265" x2="270" y2="328" stroke={theme === 'night' ? '#991b1b' : '#94a3b8'} strokeWidth="3" strokeLinecap="round" />
        </g>

        {/* Central Core (VMG to Waypoint Hub) */}
        <g className="st-core-hub">
          <circle cx={cx} cy={272} r="46" fill={theme === 'night' ? '#1c0505' : '#04111f'} stroke={theme === 'night' ? '#991b1b' : '#0284c7'} strokeWidth="2" />
          <text x={cx} y={258} textAnchor="middle" fontSize="9" fontWeight="800" fill={theme === 'night' ? '#f87171' : '#7dd3fc'} letterSpacing="0.08em">
            VMG A WP
          </text>
          <text x={cx} y={282} textAnchor="middle" fontSize="21" fontWeight="800" fill={theme === 'night' ? '#fecaca' : '#ffffff'} fontFamily="ui-monospace, monospace">
            {value(model.vmg)}
          </text>
          <text x={cx} y={296} textAnchor="middle" fontSize="8.5" fontWeight="600" fill={theme === 'night' ? '#b91c1c' : '#64748b'}>
            KNOTS
          </text>
        </g>

        {/* True Wind Vector (Azul Táctico) */}
        {windAngle !== null && (
          <g transform={`rotate(${windAngle} ${cx} ${cy})`} className="st-wind-true">
            <title>Viento Real (TWD/TWA): {value(model.wind.tws)} kn</title>
            <line x1={cx} y1={36} x2={cx} y2={182} stroke={trueWindColor} strokeWidth="4.5" strokeLinecap="round" />
            <polygon points={`${cx - 8},168 ${cx},192 ${cx + 8},168`} fill={trueWindColor} />
            <circle cx={cx} cy={36} r="14" fill={theme === 'night' ? '#3d0808' : '#0284c7'} stroke={trueWindColor} strokeWidth="2" />
            <text x={cx} y={40} textAnchor="middle" fontSize="11" fontWeight="800" fill="#ffffff">
              T
            </text>
          </g>
        )}

        {/* Apparent Wind Vector (Ámbar Cálido) */}
        {wind.awa !== null && (
          <g transform={`rotate(${wind.awa} ${cx} ${cy})`} className="st-wind-apparent">
            <title>Viento Aparente (AWA/AWS)</title>
            <line x1={cx} y1={56} x2={cx} y2={164} stroke={appWindColor} strokeWidth="3" strokeDasharray="6 3" strokeLinecap="round" />
            <polygon points={`${cx - 6},152 ${cx},172 ${cx + 6},152`} fill={appWindColor} />
            <circle cx={cx} cy={56} r="12" fill={theme === 'night' ? '#3d1a08' : '#b45309'} stroke={appWindColor} strokeWidth="1.5" />
            <text x={cx} y={60} textAnchor="middle" fontSize="9.5" fontWeight="800" fill="#ffffff">
              A
            </text>
          </g>
        )}

        {/* Active Waypoint Marker Bug */}
        {model.waypointRelative !== null && (() => {
          const p = xy(model.waypointRelative, rOuter - 6, cx, cy);
          return (
            <g transform={`translate(${p.x} ${p.y}) rotate(${model.waypointRelative})`} className="st-waypoint-bug">
              <title>{`Waypoint: ${model.waypointName} (${course(model.bearing)}°T)`}</title>
              <line x1="0" y1="0" x2="0" y2="40" stroke={wpColor} strokeWidth="1.5" strokeDasharray="3 3" />
              <polygon points="0,-16 -11,8 11,8" fill={wpColor} stroke="#ffffff" strokeWidth="1.5" />
              <circle cx="0" cy="0" r="3" fill="#ffffff" />
            </g>
          );
        })()}

        {/* Top Digital Heading Bezel */}
        <g className="st-heading-box">
          <rect
            x={cx - 52}
            y={12}
            width={104}
            height={38}
            rx="8"
            fill={theme === 'night' ? '#1c0505' : '#061628'}
            stroke={theme === 'night' ? '#ef4444' : '#0284c7'}
            strokeWidth="2"
          />
          <text
            x={cx}
            y={38}
            textAnchor="middle"
            fontSize="23"
            fontWeight="800"
            fill={theme === 'night' ? '#fecaca' : '#ffffff'}
            fontFamily="ui-monospace, monospace"
          >
            {course(heading)}
            <tspan fontSize="12" fill={theme === 'night' ? '#f87171' : '#38bdf8'}>
              °{reference ?? ''}
            </tspan>
          </text>
          {/* Lubber line bow marker */}
          <polygon points={`${cx - 6},8 ${cx},0 ${cx + 6},8`} fill={theme === 'night' ? '#ef4444' : '#f43f5e'} />
        </g>

        {/* Bottom Orientation Label */}
        <text x={cx} y={498} textAnchor="middle" fontSize="10" fontWeight="700" fill={theme === 'night' ? '#991b1b' : '#64748b'} letterSpacing="0.08em">
          {heading === null ? 'NORTE ARRIBA · SIN HDG' : `PROA ARRIBA · ${reference === 'T' ? 'RUMBO VERDADERO' : 'RUMBO MAGNÉTICO'}`}
        </text>
      </svg>
    </div>
  );
}

export function SailingTacticsDisplay({ model, mode = 'tactical', theme = 'dark' }: { model: SailingTacticsModel; mode?: TacticalViewMode; theme?: 'dark' | 'night' }) {
  const time =
    model.seconds === null
      ? '—'
      : model.seconds >= 360000
      ? '>99 h'
      : `${Math.floor(model.seconds / 3600).toString().padStart(2, '0')}:${Math.floor((model.seconds % 3600) / 60).toString().padStart(2, '0')}`;

  const depthReference =
    model.depthReference === null
      ? 'Referencia no disponible'
      : { keel: 'Bajo quilla', surface: 'Desde superficie', transducer: 'Bajo transductor' }[model.depthReference];

  // TWA format with Port (B) / Starboard (E) indication
  const twaSigned = signed(model.wind.twa);
  const twaDisplay =
    twaSigned === null
      ? '—'
      : `${Math.abs(Math.round(twaSigned))}° ${twaSigned < 0 ? 'Babor' : 'Estribor'}`;

  // AWA format with Port / Starboard indication
  const awaSigned = signed(model.wind.awa);
  const awaDisplay =
    awaSigned === null
      ? '—'
      : `${Math.abs(Math.round(awaSigned))}° ${awaSigned < 0 ? 'B' : 'E'}`;

  return (
    <div className="st-display">
      {/* Simulation Warning Banner */}
      {model.simulated && (
        <div className="st-simulated-banner">
          <span>
            <Compass size={14} className="text-amber-400" />
            SIMULACIÓN / ENSAYO VIRTUAL · Datos simulados en telemetría
          </span>
          <span className="text-[10px] text-amber-300/80">NO USAR PARA NAVEGACIÓN REAL</span>
        </div>
      )}

      {/* 3-Column Marine Grid */}
      <div className="st-instrument-grid">
        {/* Left Column: Speed, Water, and Wind Sensors */}
        <div className="st-column">
          <Tile
            label="BSPD / STW"
            reading={value(model.stw)}
            unit="kn"
            detail={model.stw === null ? 'Sin sensor STW vigente' : 'Corredera NMEA · Velocidad agua'}
            accent="wind"
            highlight={mode === 'performance'}
          />
          <Tile
            label="TWA"
            reading={twaDisplay}
            unit="rel."
            detail="Ángulo de viento real a proa"
            accent="wind"
            highlight={mode === 'wind'}
          />
          <Tile
            label="TWS"
            reading={value(model.wind.tws)}
            unit="kn"
            detail={model.wind.source === 'BOAT' ? 'Sensor de viento a bordo' : 'Previsión meteo'}
            accent="wind"
            highlight={mode === 'wind'}
          />
          <Tile
            label="TWD"
            reading={course(model.wind.twd)}
            unit="°T"
            detail="Dirección verdadera del viento"
            accent="wind"
            highlight={mode === 'wind'}
          />
          <Tile
            label="AWA / AWS"
            reading={awaDisplay}
            unit={model.wind.aws !== null ? `${value(model.wind.aws)} kn` : 'rel.'}
            detail="Viento aparente en el mástil"
            accent="wind"
            highlight={mode === 'wind'}
          />
        </div>

        {/* Center: Tactical 360° Rose */}
        <div className="st-center">
          <Rose model={model} mode={mode} theme={theme} />
          {/* Key / Legend below rose */}
          <div className="st-key">
            <span className="st-key-item">
              <span className="st-key-dot true-wind" /> Viento Real
            </span>
            <span className="st-key-item">
              <span className="st-key-dot app-wind" /> Aparente
            </span>
            <span className="st-key-item">
              <span className="st-key-dot waypoint" /> Waypoint
            </span>
            {model.portRelative !== null && (
              <span className="st-key-item">
                <span className="st-key-dot layline-port" /> Layline Babor
              </span>
            )}
            {model.starboardRelative !== null && (
              <span className="st-key-item">
                <span className="st-key-dot layline-stbd" /> Layline Estribor
              </span>
            )}
          </div>
        </div>

        {/* Right Column: Ground Navigation and Safety */}
        <div className="st-column">
          <Tile
            label="SOG"
            reading={value(model.sog)}
            unit="kn"
            detail={model.sogSource ? `${SOURCE[model.sogSource]} · Fondo` : 'Sin velocidad fondo'}
            accent="nav"
            highlight={mode === 'tactical' || mode === 'performance'}
          />
          <Tile
            label="VMG A WP"
            reading={value(model.vmg)}
            unit="kn"
            detail="Velocidad efectiva de aproximación"
            accent="wp"
            highlight={mode === 'tactical' || mode === 'performance'}
          />
          <Tile
            label="DTW"
            reading={value(model.distance, 2)}
            unit="NM"
            detail={model.waypointName}
            accent="wp"
            highlight={mode === 'tactical'}
          />
          <Tile
            label="BTW"
            reading={course(model.bearing)}
            unit="°T"
            detail="Demora verdadera al waypoint"
            accent="wp"
            highlight={mode === 'tactical'}
          />
          <Tile
            label="PROFUNDIDAD"
            reading={value(model.depth)}
            unit="m"
            detail={depthReference}
            accent="nav"
            highlight={mode === 'safety'}
          />
        </div>
      </div>

      {/* Footer Status Bar: Polar, Heading Source & Notices */}
      <div className="st-footer-bar">
        <div className="st-footer-item">
          <span>Rumbo:</span>
          <strong>
            {model.headingSource ? SOURCE[model.headingSource] : 'Sin datos'} (
            {model.reference === 'T' ? 'Verdadero' : model.reference === 'M' ? 'Magnético' : 'Sin ref.'})
          </strong>
        </div>
        <div className="st-footer-item">
          <span>Polar objetivo:</span>
          <strong>{value(model.targetSpeed)} kn</strong>
          <span className="ml-2">Rendimiento:</span>
          <strong>{model.performancePercent === null ? '—' : `${value(model.performancePercent, 0)} %`}</strong>
        </div>
        <div className="st-footer-item">
          <span>ETA a WP:</span>
          <strong>{time}</strong>
        </div>
      </div>

      {/* Layline & Legal Notices */}
      <p className="st-layline-status">
        <strong>Laylines:</strong> {model.laylineReason}
      </p>
      <p className="st-legal-notice">
        Las referencias verdaderas y magnéticas no se mezclan. Sin rumbo verdadero verificado no se dibujan marcadores absolutos.
        ETA/TTW es una aproximación cinemática directa; no sustituye el plan de derrota con bordos ni las obligaciones del patrón.
      </p>
    </div>
  );
}

export function SailingTacticsPanel({
  getInput,
  onClose
}: {
  getInput: () => SailingTacticsInput;
  onClose: () => void;
}) {
  const [, tick] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'night'>('dark');
  const [activeMode, setActiveMode] = useState<TacticalViewMode>('tactical');

  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // 1 Hz telemetry refresh loop
  useEffect(() => {
    const interval = window.setInterval(() => tick(n => n + 1), 1000);
    return () => window.clearInterval(interval);
  }, []);

  // Accessibility and Escape / Tab key trap
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        event.preventDefault();
        if (expanded) setExpanded(false);
        else closeRef.current();
      }
      if (expanded && event.key === 'Tab') {
        const focusable = panelRef.current?.querySelectorAll<HTMLElement>('button, [href], select, input, [tabindex="0"]');
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('keydown', key, true);
      previous?.focus();
    };
  }, [expanded]);

  const model = buildSailingTacticsModel(getInput());

  const content = (
    <section
      ref={panelRef}
      role="dialog"
      aria-label="GAULOS · Centro Táctico de Vela"
      aria-modal={expanded ? true : undefined}
      className={`st-panel ${expanded ? 'st-expanded' : ''} theme-${theme}`}
    >
      {/* Header */}
      <header className="st-panel-header">
        <div className="st-header-title">
          <h2>
            <Compass size={17} />
            <span className="title-text">Táctica de Vela</span>
          </h2>
          <span className="st-header-badge">Sail Tactical Center</span>
        </div>

        {/* 4 Navigation Modes Selector */}
        <div className="st-mode-selector" role="tablist" aria-label="Modos tácticos de vela">
          <button
            type="button"
            role="tab"
            aria-selected={activeMode === 'tactical'}
            className={`st-mode-btn ${activeMode === 'tactical' ? 'active' : ''}`}
            onClick={() => setActiveMode('tactical')}
            title="Vista Táctica: Rosa 360°, rumbo, viento y laylines"
          >
            <Compass size={13} />
            <span className="mode-label">Táctica</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeMode === 'wind'}
            className={`st-mode-btn ${activeMode === 'wind' ? 'active' : ''}`}
            onClick={() => setActiveMode('wind')}
            title="Vista Viento: Viento real/aparente y roles"
          >
            <Wind size={13} />
            <span className="mode-label">Viento</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeMode === 'performance'}
            className={`st-mode-btn ${activeMode === 'performance' ? 'active' : ''}`}
            onClick={() => setActiveMode('performance')}
            title="Vista Rendimiento: VMG, polar y velocidad objetivo"
          >
            <Gauge size={13} />
            <span className="mode-label">Rendimiento</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeMode === 'safety'}
            className={`st-mode-btn ${activeMode === 'safety' ? 'active' : ''}`}
            onClick={() => setActiveMode('safety')}
            title="Vista Seguridad: Profundidad y estado de sensores"
          >
            <Shield size={13} />
            <span className="mode-label">Seguridad</span>
          </button>
        </div>

        {/* Actions: Theme Toggle, Fullscreen, Close */}
        <div className="st-header-actions">
          <button
            type="button"
            className="st-action-btn"
            onClick={() => setTheme(t => (t === 'dark' ? 'night' : 'dark'))}
            aria-label={theme === 'dark' ? 'Activar modo visión nocturna' : 'Activar modo estándar'}
            title={theme === 'dark' ? 'Modo Visión Nocturna (Rojo táctico)' : 'Modo Estándar'}
          >
            {theme === 'dark' ? <Moon size={16} /> : <Sun size={16} className="text-red-400" />}
          </button>
          <button
            type="button"
            className="st-action-btn"
            onClick={() => setExpanded(v => !v)}
            aria-label={expanded ? 'Restaurar panel' : 'Pantalla completa'}
            title={expanded ? 'Restaurar panel' : 'Pantalla completa'}
          >
            {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          <button
            type="button"
            className="st-action-btn"
            onClick={onClose}
            aria-label="Cerrar Táctica de vela"
            title="Cerrar panel"
          >
            <X size={17} />
          </button>
        </div>
      </header>

      {/* Main Body */}
      <div className="st-panel-body">
        <SailingTacticsDisplay model={model} mode={activeMode} theme={theme} />
      </div>
    </section>
  );

  return expanded ? createPortal(content, document.body) : content;
}
