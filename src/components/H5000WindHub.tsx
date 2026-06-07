import React, { useMemo, useState } from 'react';
import { Activity, Compass, Gauge, LineChart, Settings, Wind } from 'lucide-react';
import { cn } from '../lib/utils';
import { WindInstrument } from './WindInstrument';

type H5000PageId = 'wind' | 'steer' | 'perf' | 'plot' | 'data' | 'setup';

interface H5000WindHubProps {
  sog: number;
  hdg: number;
  twd: number;
  tws: number;
  twa: number;
  awa: number;
  aws: number;
  vmg: number;
  depth: number;
  voltage: number;
  xte: number;
  btw: number;
  dtw: number;
  waypointName: string;
  eta?: string;
}

const normalize360 = (angle: number): number => ((angle % 360) + 360) % 360;

const normalizeSigned = (angle: number): number => {
  const normalized = normalize360(angle);
  return normalized > 180 ? normalized - 360 : normalized;
};

const absAngle = (angle: number): number => Math.abs(normalizeSigned(angle));

const formatDegrees = (value: number): string => `${Math.round(normalize360(value)).toString().padStart(3, '0')}°`;

const formatSignedDegrees = (value: number): string => {
  const signed = Math.round(normalizeSigned(value));
  if (signed === 0) return '000°';
  return `${signed > 0 ? '+' : '-'}${Math.abs(signed).toString().padStart(3, '0')}°`;
};

const getTargetTwa = (tws: number): number => {
  if (tws < 6) return 42;
  if (tws < 14) return 38;
  if (tws < 22) return 34;
  return 32;
};

const getPolarTargetSpeed = (tws: number, twa: number): number => {
  const abs = absAngle(twa);
  if (tws <= 0 || abs < 28) return 0;
  const reachBoost = Math.sin((Math.min(abs, 150) / 180) * Math.PI);
  const base = tws * (0.32 + reachBoost * 0.28);
  const heavyAirPenalty = tws > 24 ? (tws - 24) * 0.08 : 0;
  return Math.max(0, base - heavyAirPenalty);
};

const getReefPlan = (tws: number): string => {
  if (tws >= 32) return 'TRYSail / tormentin';
  if (tws >= 26) return '2 rizos / foque trabajo';
  if (tws >= 20) return '1 rizo preventivo';
  if (tws <= 5) return 'vela ligera / apoyo motor';
  return 'full main / genoa';
};

const H5000Tile = ({
  label,
  value,
  unit,
  tone = 'default',
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: 'default' | 'cyan' | 'amber' | 'red' | 'green';
}) => (
  <div
    className={cn(
      'min-h-[76px] border border-white/10 bg-black px-3 py-2.5',
      tone === 'cyan' && 'border-cyan-400/30',
      tone === 'amber' && 'border-amber-400/30',
      tone === 'red' && 'border-red-400/40 bg-red-950/20',
      tone === 'green' && 'border-emerald-400/30',
    )}
  >
    <p className="text-[8px] font-black uppercase tracking-[0.24em] text-slate-500">{label}</p>
    <div className="mt-2 flex items-end gap-1">
      <p className="font-mono text-2xl font-black leading-none text-white">{value}</p>
      {unit && <p className="mb-1 text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">{unit}</p>}
    </div>
  </div>
);

export const H5000WindHub: React.FC<H5000WindHubProps> = ({
  sog,
  hdg,
  twd,
  tws,
  twa,
  awa,
  aws,
  vmg,
  depth,
  voltage,
  xte,
  btw,
  dtw,
  waypointName,
  eta,
}) => {
  const [pageId, setPageId] = useState<H5000PageId>('wind');

  const targetTwa = getTargetTwa(tws);
  const targetSpeed = getPolarTargetSpeed(tws, twa);
  const performance = targetSpeed > 0 ? Math.min(199, Math.max(0, (sog / targetSpeed) * 100)) : 0;
  const targetVmg = targetSpeed * Math.cos((targetTwa * Math.PI) / 180);
  const steerDelta = normalizeSigned(twa) >= 0 ? normalizeSigned(twa - targetTwa) : normalizeSigned(twa + targetTwa);
  const laylinePort = normalize360(twd + targetTwa);
  const laylineStarboard = normalize360(twd - targetTwa);

  const plot = useMemo(
    () =>
      Array.from({ length: 24 }, (_, index) => {
        const phase = index / 4;
        const speed = Math.max(0, tws + Math.sin(phase) * 1.4 + Math.cos(phase * 0.7) * 0.7);
        const angle = normalizeSigned(twa + Math.sin(phase * 0.8) * 8);
        return { index, speed, angle };
      }),
    [twa, tws],
  );

  const pages: Array<{ id: H5000PageId; label: string; icon: React.ReactNode }> = [
    { id: 'wind', label: 'WIND', icon: <Wind className="h-4 w-4" /> },
    { id: 'steer', label: 'STEER', icon: <Compass className="h-4 w-4" /> },
    { id: 'perf', label: 'PERF', icon: <Gauge className="h-4 w-4" /> },
    { id: 'plot', label: 'PLOT', icon: <LineChart className="h-4 w-4" /> },
    { id: 'data', label: 'DATA', icon: <Activity className="h-4 w-4" /> },
    { id: 'setup', label: 'SETUP', icon: <Settings className="h-4 w-4" /> },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#050607] text-white">
      <div className="flex-none border-b border-white/10 bg-black px-3 py-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.28em] text-cyan-300">B&G H5000</p>
            <p className="text-[8px] font-bold uppercase tracking-[0.22em] text-slate-500">
              WIND PILOT / {waypointName || 'NO WAYPOINT'}
            </p>
          </div>
          <div className="text-right font-mono text-[10px] font-black text-slate-300">
            <p>HDG {formatDegrees(hdg)}</p>
            <p className="text-cyan-300">TWD {formatDegrees(twd)}</p>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-6 gap-1">
          {pages.map((page) => (
            <button
              key={page.id}
              type="button"
              onClick={() => setPageId(page.id)}
              className={cn(
                'flex h-9 items-center justify-center gap-1 border border-white/10 bg-[#101316] text-[8px] font-black uppercase tracking-[0.14em] text-slate-400 transition-colors',
                pageId === page.id && 'border-cyan-300 bg-cyan-300 text-black',
              )}
              title={page.label}
            >
              {page.icon}
              <span className="hidden sm:inline">{page.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
        {pageId === 'wind' && (
          <div className="flex justify-center">
            <WindInstrument awa={awa} aws={aws} twa={twa} tws={tws} heading={hdg} boatSpeed={sog} compact className="max-w-full" />
          </div>
        )}

        {pageId === 'steer' && (
          <div className="grid gap-3">
            <div className="border border-white/10 bg-[#d9dee0] p-4 text-black">
              <p className="text-[9px] font-black uppercase tracking-[0.28em] text-slate-700">SAIL STEER</p>
              <div className="mt-4 flex items-center justify-center">
                <div className="relative h-48 w-48 rounded-full border border-black/30 bg-white shadow-[inset_0_0_28px_rgba(0,0,0,0.15)]">
                  <div className="absolute inset-4 rounded-full border border-black/10" />
                  <div className="absolute left-1/2 top-3 h-[100px] w-1 -translate-x-1/2 rounded bg-black" />
                  <div
                    className="absolute inset-0"
                    style={{ transform: `rotate(${steerDelta}deg)` }}
                  >
                    <div className="absolute left-1/2 top-5 h-24 w-1 -translate-x-1/2 rounded bg-cyan-600" />
                    <div className="absolute left-1/2 top-2 h-0 w-0 -translate-x-1/2 border-l-[10px] border-r-[10px] border-b-[24px] border-l-transparent border-r-transparent border-b-cyan-600" />
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="border border-black/20 bg-slate-100 px-4 py-3 text-center">
                      <p className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-600">STEER</p>
                      <p className="font-mono text-4xl font-black leading-none">{formatSignedDegrees(steerDelta)}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <H5000Tile label="Target TWA" value={Math.round(targetTwa).toString()} unit="deg" tone="cyan" />
              <H5000Tile label="Target VMG" value={targetVmg.toFixed(1)} unit="kt" tone="green" />
              <H5000Tile label="Port layline" value={formatDegrees(laylinePort)} />
              <H5000Tile label="Stbd layline" value={formatDegrees(laylineStarboard)} />
            </div>
          </div>
        )}

        {pageId === 'perf' && (
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-2">
              <H5000Tile label="BSPD" value={sog.toFixed(1)} unit="kt" tone="cyan" />
              <H5000Tile label="Polar target" value={targetSpeed.toFixed(1)} unit="kt" />
              <H5000Tile label="Performance" value={performance.toFixed(0)} unit="%" tone={performance >= 90 ? 'green' : 'amber'} />
              <H5000Tile label="VMG" value={vmg.toFixed(1)} unit="kt" tone="green" />
            </div>
            <div className="border border-white/10 bg-black p-4">
              <div className="mb-2 flex justify-between text-[9px] font-black uppercase tracking-[0.22em] text-slate-500">
                <span>POLAR EFFICIENCY</span>
                <span>{performance.toFixed(0)}%</span>
              </div>
              <div className="h-3 overflow-hidden bg-slate-900">
                <div
                  className={cn('h-full', performance >= 90 ? 'bg-emerald-400' : performance >= 70 ? 'bg-amber-400' : 'bg-red-400')}
                  style={{ width: `${Math.min(100, performance)}%` }}
                />
              </div>
              <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                Reef plan: <span className="text-white">{getReefPlan(tws)}</span>
              </p>
            </div>
          </div>
        )}

        {pageId === 'plot' && (
          <div className="grid gap-3">
            <div className="relative h-44 border border-white/10 bg-black p-3">
              <svg viewBox="0 0 240 120" className="h-full w-full" preserveAspectRatio="none">
                {[0, 30, 60, 90, 120].map((y) => (
                  <line key={y} x1="0" x2="240" y1={y} y2={y} stroke="rgba(255,255,255,0.08)" />
                ))}
                <polyline
                  fill="none"
                  stroke="#22d3ee"
                  strokeWidth="2.5"
                  points={plot.map((point) => `${point.index * 10},${110 - point.speed * 3}`).join(' ')}
                />
                <polyline
                  fill="none"
                  stroke="#facc15"
                  strokeWidth="1.6"
                  points={plot.map((point) => `${point.index * 10},${60 - point.angle * 0.25}`).join(' ')}
                />
              </svg>
              <div className="absolute right-3 top-3 text-right">
                <p className="text-[8px] font-black uppercase tracking-[0.2em] text-cyan-300">TWS trend</p>
                <p className="font-mono text-2xl font-black">{tws.toFixed(1)} kt</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <H5000Tile label="Avg TWS" value={(plot.reduce((sum, p) => sum + p.speed, 0) / plot.length).toFixed(1)} unit="kt" />
              <H5000Tile label="TWA swing" value={(Math.max(...plot.map((p) => p.angle)) - Math.min(...plot.map((p) => p.angle))).toFixed(0)} unit="deg" />
            </div>
          </div>
        )}

        {pageId === 'data' && (
          <div className="grid grid-cols-2 gap-2">
            <H5000Tile label="AWA" value={formatSignedDegrees(awa)} tone="cyan" />
            <H5000Tile label="AWS" value={aws.toFixed(1)} unit="kt" tone="cyan" />
            <H5000Tile label="TWA" value={formatSignedDegrees(twa)} tone="amber" />
            <H5000Tile label="TWS" value={tws.toFixed(1)} unit="kt" tone="amber" />
            <H5000Tile label="Depth" value={depth.toFixed(1)} unit="m" tone={depth < 5 ? 'red' : 'default'} />
            <H5000Tile label="Battery" value={voltage.toFixed(1)} unit="v" />
            <H5000Tile label="BTW" value={formatDegrees(btw)} />
            <H5000Tile label="DTW" value={dtw.toFixed(1)} unit="nm" />
            <H5000Tile label="XTE" value={xte.toFixed(2)} unit="nm" tone={Math.abs(xte) > 0.1 ? 'amber' : 'green'} />
            <H5000Tile label="ETA" value={eta || '--:--'} />
          </div>
        )}

        {pageId === 'setup' && (
          <div className="grid gap-3">
            <div className="border border-white/10 bg-black p-4">
              <p className="text-[9px] font-black uppercase tracking-[0.28em] text-cyan-300">H5000 setup</p>
              <div className="mt-4 grid gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                <div className="flex justify-between border-b border-white/10 pb-2">
                  <span>Wind reference</span>
                  <span className="text-white">APP / TRUE</span>
                </div>
                <div className="flex justify-between border-b border-white/10 pb-2">
                  <span>Target TWA</span>
                  <span className="text-white">{targetTwa} deg</span>
                </div>
                <div className="flex justify-between border-b border-white/10 pb-2">
                  <span>Polar model</span>
                  <span className="text-white">SmartShip base</span>
                </div>
                <div className="flex justify-between">
                  <span>Alarm profile</span>
                  <span className="text-white">Bridge watch</span>
                </div>
              </div>
            </div>
            <div className="border border-amber-500/30 bg-amber-950/20 p-3 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-200">
              Calibracion pendiente: offset de veleta, damping NMEA y tabla polar real del buque.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default H5000WindHub;
