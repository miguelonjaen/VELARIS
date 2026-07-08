import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { AlertTriangle, Gauge, Sailboat, Wind } from 'lucide-react';
import { cn } from '../../../lib/utils';

interface WindInstrumentProps {
  awa: number;
  aws: number;
  twa: number;
  tws: number;
  heading: number;
  boatSpeed?: number;
  compact?: boolean;
  className?: string;
}

type WindMode = 'apparent' | 'true';

const normalize360 = (angle: number): number => ((angle % 360) + 360) % 360;

const normalizeSigned = (angle: number): number => {
  const normalized = normalize360(angle);
  return normalized > 180 ? normalized - 360 : normalized;
};

const absWindAngle = (angle: number): number => Math.abs(normalizeSigned(angle));

const formatSignedAngle = (angle: number): string => {
  const signed = Math.round(normalizeSigned(angle));
  if (signed === 0) return '000';
  return `${signed > 0 ? '+' : '-'}${Math.abs(signed).toString().padStart(3, '0')}`;
};

const getPointOfSail = (angle: number): string => {
  const abs = absWindAngle(angle);
  if (abs < 30) return 'NO GO';
  if (abs < 52) return 'CENIDA';
  if (abs < 80) return 'DESC. CERRADO';
  if (abs < 115) return 'TRAVES';
  if (abs < 150) return 'LARGO';
  return 'EMPOPADA';
};

const getReefAdvice = (tws: number): { label: string; tone: 'ok' | 'warn' | 'critical' } => {
  if (tws >= 32) return { label: 'TRYSail + tormentin', tone: 'critical' };
  if (tws >= 26) return { label: '2 rizos + foque trabajo', tone: 'critical' };
  if (tws >= 20) return { label: '1 rizo recomendado', tone: 'warn' };
  if (tws <= 5) return { label: 'vela ligera / motor apoyo', tone: 'warn' };
  return { label: 'trapo completo', tone: 'ok' };
};

const getTrimCommand = (awa: number): string => {
  const abs = absWindAngle(awa);
  if (abs < 28) return 'ARRIBAR 8-12';
  if (abs <= 42) return 'MANTENER CENIDA';
  if (abs <= 70) return 'CAZAR GENOA';
  if (abs <= 115) return 'ABRIR ESCOTA';
  if (abs <= 155) return 'PREPARAR TANGON';
  return 'VIGILAR TRASLUCHADA';
};

const WindInstrument: React.FC<WindInstrumentProps> = ({
  awa,
  aws,
  twa,
  tws,
  heading,
  boatSpeed = 0,
  compact = false,
  className,
}) => {
  const [mode, setMode] = useState<WindMode>('apparent');

  const displayAngle = mode === 'apparent' ? normalizeSigned(awa) : normalizeSigned(twa);
  const displaySpeed = mode === 'apparent' ? aws : tws;
  const trueWindDir = normalize360(heading + normalizeSigned(twa));
  const reefAdvice = getReefAdvice(tws);

  const metrics = useMemo(() => {
    const twaAbs = absWindAngle(twa);
    const vmg = boatSpeed * Math.cos((twaAbs * Math.PI) / 180);
    const efficiency = tws > 0 ? Math.min(199, Math.max(0, (boatSpeed / tws) * 100)) : 0;

    return {
      pointOfSail: getPointOfSail(awa),
      trim: getTrimCommand(awa),
      vmg,
      efficiency,
      tack: normalizeSigned(awa) >= 0 ? 'ESTRIBOR' : 'BABOR',
    };
  }, [awa, boatSpeed, twa, tws]);

  return (
    <section
      className={cn(
        'relative w-full rounded-[18px] border border-black bg-[#050607] text-white shadow-[0_24px_60px_rgba(0,0,0,0.55)]',
        compact ? 'max-w-[390px] p-2' : 'max-w-[430px] p-3',
        className,
      )}
    >
      <div className="absolute inset-0 rounded-[18px] border border-white/10 pointer-events-none" />
      <div className="absolute inset-[5px] rounded-[14px] border border-black/80 pointer-events-none shadow-[inset_0_0_28px_rgba(0,0,0,0.85)]" />

      <header className="relative z-10 flex items-center justify-between border-b border-white/10 px-2 pb-2">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-cyan-400 text-black">
            <Wind className="h-4 w-4" />
          </div>
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.24em] text-cyan-300">H5000 WIND</p>
            <p className="text-[8px] font-bold uppercase tracking-[0.22em] text-slate-500">VELARIS tactical bus</p>
          </div>
        </div>
        <div className="grid grid-cols-2 overflow-hidden rounded border border-white/10 bg-black text-[9px] font-black uppercase tracking-[0.16em]">
          {(['apparent', 'true'] as WindMode[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setMode(item)}
              className={cn(
                'px-3 py-1.5 transition-colors',
                mode === item ? 'bg-cyan-300 text-black' : 'text-slate-400 hover:text-white',
              )}
            >
              {item === 'apparent' ? 'APP' : 'TRUE'}
            </button>
          ))}
        </div>
      </header>

      <div className="relative z-10 grid gap-3 pt-3">
        <div className="grid gap-3 sm:grid-cols-[1fr_112px]">
          <div className={cn(
            'relative aspect-square overflow-hidden rounded bg-[#d7dde0] text-black shadow-[inset_0_0_20px_rgba(0,0,0,0.35)]',
            compact ? 'min-h-[190px]' : 'min-h-[250px]',
          )}>
            <div className="absolute inset-3 rounded-full border border-black/20 bg-[conic-gradient(from_315deg,_rgba(239,68,68,0.28)_0deg,_rgba(239,68,68,0.28)_45deg,_transparent_45deg,_transparent_315deg,_rgba(34,197,94,0.28)_315deg,_rgba(34,197,94,0.28)_360deg)]" />
            <svg viewBox="0 0 240 240" className="absolute inset-0 h-full w-full">
              <circle cx="120" cy="120" r="104" fill="none" stroke="rgba(0,0,0,0.38)" strokeWidth="1" />
              <circle cx="120" cy="120" r="78" fill="none" stroke="rgba(0,0,0,0.16)" strokeWidth="1" />
              {[...Array(72)].map((_, index) => {
                const angle = index * 5;
                const isMajor = index % 6 === 0;
                const isCardinal = index % 18 === 0;
                const r1 = isMajor ? 96 : 101;
                const r2 = 106;
                const rad = (angle * Math.PI) / 180;
                const x1 = 120 + r1 * Math.sin(rad);
                const y1 = 120 - r1 * Math.cos(rad);
                const x2 = 120 + r2 * Math.sin(rad);
                const y2 = 120 - r2 * Math.cos(rad);
                return (
                  <line
                    key={angle}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="rgba(0,0,0,0.78)"
                    strokeWidth={isCardinal ? 2.4 : isMajor ? 1.6 : 0.8}
                  />
                );
              })}
              {[
                { label: '0', x: 120, y: 31 },
                { label: '45', x: 183, y: 57 },
                { label: '90', x: 210, y: 124 },
                { label: '135', x: 183, y: 193 },
                { label: '180', x: 120, y: 218 },
                { label: '135', x: 57, y: 193 },
                { label: '90', x: 30, y: 124 },
                { label: '45', x: 57, y: 57 },
              ].map((mark) => (
                <text key={`${mark.label}-${mark.x}`} x={mark.x} y={mark.y} textAnchor="middle" fontSize="10" fontWeight="900" fill="#050607">
                  {mark.label}
                </text>
              ))}
              <text x="70" y="35" textAnchor="middle" fontSize="8" fontWeight="900" fill="#b91c1c">PORT</text>
              <text x="170" y="35" textAnchor="middle" fontSize="8" fontWeight="900" fill="#047857">STBD</text>
            </svg>

            <motion.div
              animate={{ rotate: displayAngle }}
              transition={{ type: 'spring', damping: 28, stiffness: 85 }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <div className={cn('absolute top-[18px] w-[5px] rounded-full bg-black shadow-[0_0_0_1px_rgba(255,255,255,0.25)]', compact ? 'h-[78px]' : 'h-[100px]')} />
              <div className="absolute top-[8px] h-0 w-0 border-l-[13px] border-r-[13px] border-b-[30px] border-l-transparent border-r-transparent border-b-black" />
              <div className="absolute bottom-[118px] h-[42px] w-[3px] bg-black/50" />
            </motion.div>

            <div className="absolute left-1/2 top-1/2 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-black/25 bg-[#eef3f5] shadow-[0_8px_20px_rgba(0,0,0,0.25)]">
              <span className="text-[8px] font-black uppercase tracking-[0.18em] text-slate-500">{mode === 'apparent' ? 'AWA' : 'TWA'}</span>
              <span className="font-mono text-2xl font-black leading-none text-black">{formatSignedAngle(displayAngle)}</span>
              <span className="text-[8px] font-black uppercase tracking-[0.18em] text-slate-500">deg</span>
            </div>
          </div>

          <aside className="grid gap-2">
            <div className="rounded border border-white/10 bg-black p-3">
              <p className="text-[8px] font-black uppercase tracking-[0.22em] text-slate-500">{mode === 'apparent' ? 'AWS' : 'TWS'}</p>
              <p className={cn('font-mono font-black leading-none text-white', compact ? 'text-3xl' : 'text-4xl')}>{displaySpeed.toFixed(1)}</p>
              <p className="text-[8px] font-black uppercase tracking-[0.2em] text-cyan-300">knots</p>
            </div>
            <div className="rounded border border-white/10 bg-black p-3">
              <p className="text-[8px] font-black uppercase tracking-[0.22em] text-slate-500">TWD</p>
              <p className="font-mono text-3xl font-black leading-none text-white">{Math.round(trueWindDir).toString().padStart(3, '0')}</p>
              <p className="text-[8px] font-black uppercase tracking-[0.2em] text-amber-300">degrees</p>
            </div>
            <div className="rounded border border-white/10 bg-black p-3">
              <p className="text-[8px] font-black uppercase tracking-[0.22em] text-slate-500">VMG WIND</p>
              <p className={cn('font-mono text-3xl font-black leading-none', metrics.vmg >= 0 ? 'text-white' : 'text-red-300')}>
                {metrics.vmg.toFixed(1)}
              </p>
              <p className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-400">knots</p>
            </div>
          </aside>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded border border-white/10 bg-black p-3">
            <div className="flex items-center gap-2 text-[8px] font-black uppercase tracking-[0.2em] text-slate-500">
              <Sailboat className="h-3.5 w-3.5" />
              Trim
            </div>
            <p className="mt-1 text-sm font-black uppercase text-white">{metrics.trim}</p>
          </div>
          <div className="rounded border border-white/10 bg-black p-3">
            <div className="flex items-center gap-2 text-[8px] font-black uppercase tracking-[0.2em] text-slate-500">
              <Gauge className="h-3.5 w-3.5" />
              Rend.
            </div>
            <p className="mt-1 font-mono text-lg font-black text-cyan-300">{metrics.efficiency.toFixed(0)}%</p>
          </div>
          <div className="rounded border border-white/10 bg-black p-3">
            <p className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-500">Bordo</p>
            <p className="mt-1 text-sm font-black uppercase text-white">{metrics.tack}</p>
          </div>
          <div
            className={cn(
              'rounded border p-3',
              reefAdvice.tone === 'critical'
                ? 'border-red-500/50 bg-red-950/50'
                : reefAdvice.tone === 'warn'
                  ? 'border-amber-500/50 bg-amber-950/30'
                  : 'border-emerald-500/30 bg-black',
            )}
          >
            <div className="flex items-center gap-2 text-[8px] font-black uppercase tracking-[0.2em] text-slate-400">
              {reefAdvice.tone !== 'ok' && <AlertTriangle className="h-3.5 w-3.5" />}
              Config.
            </div>
            <p className="mt-1 text-[11px] font-black uppercase text-white">{reefAdvice.label}</p>
          </div>
        </div>

        <footer className="flex items-center justify-between border-t border-white/10 pt-2 text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">
          <span>{metrics.pointOfSail}</span>
          <span>HDG {Math.round(normalize360(heading)).toString().padStart(3, '0')}</span>
        </footer>
      </div>
    </section>
  );
};

export { WindInstrument };
