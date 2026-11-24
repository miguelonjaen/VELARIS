import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Radar } from 'lucide-react';
import { cn } from '@lib/utils';
import { ChartPanel } from './features/layout/panels/ChartPanel';
import { DEFAULT_AIS_ALARM_OPTIONS } from './core/navigation/AisCollisionAlarm';
import { sortTargetsByDistance, finite, formatCpa, formatTcpa, targetRank, targetStatus,
  type AisPanelTarget, type CpaOptions, type AisReferencePosition } from './features/traffic/aisPanelModel';

import type { AISConnectionControls } from './features/traffic/useAISConnections';

interface Props {
  connections?: AISConnectionControls;
  targetsVisible?: boolean;
  onToggleTargets?: () => void;
  isOpen: boolean;
  targets: AisPanelTarget[];
  onClose: () => void;
  mode?: 'all' | 'risk';
  options?: CpaOptions;
  onOptionsChange?: (options: CpaOptions) => void;
  onLocate?: (target: AisPanelTarget) => void;
  ownPosition?: AisReferencePosition | null;
  referenceLabel?: string;
}
const PAGE_SIZE = 60;
const colors: Record<number, string> = { '-1': 'text-slate-400', 1: 'text-emerald-400', 2: 'text-amber-400', 3: 'text-orange-400', 4: 'text-red-400' };

export const AISTacticalDrawer: React.FC<Props> = ({ isOpen, targets, onClose, mode = 'all',
  options = DEFAULT_AIS_ALARM_OPTIONS, onOptionsChange, onLocate, ownPosition = null, referenceLabel, connections, targetsVisible, onToggleTargets }) => {
  const [selected, setSelected] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [onlyRisk, setOnlyRisk] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const sorted = useMemo(() => !isOpen ? [] : sortTargetsByDistance(targets.filter(t => !onlyRisk || targetRank(t, options) >= 2), ownPosition, options), [isOpen, targets, options, onlyRisk, ownPosition]);
  useEffect(() => { if (isOpen) setVisibleCount(PAGE_SIZE); }, [isOpen, mode, onlyRisk]);
  const hasMore = visibleCount < sorted.length;
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!isOpen || !hasMore || !sentinel || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) setVisibleCount(n => n + PAGE_SIZE);
    }, { root: sentinel.closest('.overflow-y-auto'), rootMargin: '0px 0px 300px 0px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [isOpen, hasMore, visibleCount]);
  const update = (key: keyof CpaOptions, value: number) => {
    if (!finite(value)) return;
    const limit = key === 'minCpaNm' ? 10 : 120;
    if (value <= 0 || value > limit) return;
    onOptionsChange?.({ ...options, [key]: value });
  };
  return <ChartPanel isOpen={isOpen} onClose={onClose} title={mode === 'risk' ? 'Análisis CPA/TCPA' : 'Objetivos AIS'}
    meta={`(${targets.length})`} icon={Radar} width={360}>
    <div className="p-3 space-y-3 text-xs text-slate-300">
      {connections && <section className="space-y-2 border-b border-white/10 pb-3" aria-label="Conexiones AIS">
        <p className="font-bold">Recepcion AIS</p>
        <div className="rounded border border-white/10 p-2 space-y-2">
          <p className="font-bold">Credencial personal AISStream</p>
          <p className={connections.credentialConfigured ? 'text-emerald-400' : 'text-amber-300'}>
            {connections.credentialConfigured
              ? 'Credencial guardada y cifrada'
              : 'Sin credencial configurada'}
          </p>
          <button
            type="button"
            disabled={connections.busy || !connections.encryptionAvailable}
            onClick={() => void connections.importCredential()}
            className="w-full rounded border border-cyan-500/40 p-2 disabled:opacity-40">
            {connections.credentialConfigured ? 'Cambiar credencial' : 'Importar credencial'}
          </button>
          {connections.credentialConfigured && <button
            type="button"
            disabled={connections.busy}
            onClick={() => void connections.removeCredential()}
            className="w-full rounded border border-red-500/40 p-2 disabled:opacity-40">
            Eliminar credencial
          </button>}
          {!connections.encryptionAvailable && <p className="text-amber-300">
            El cifrado seguro no esta disponible en este equipo.
          </p>}
          <p className="text-slate-400">
            Importe un archivo local con AISSTREAM_API_KEY.
            La clave se guarda cifrada en este equipo.
            AIS NMEA no necesita credencial.
          </p>
        </div>
        {(['stream', 'nmea'] as const).map(source => {
          const enabled = source === 'stream' ? connections.state?.streamEnabled : connections.state?.nmeaEnabled;
          return <button key={source} type="button" disabled={!connections.state || connections.busy}
            className="w-full rounded border border-cyan-500/40 p-2 disabled:opacity-40"
            onClick={() => void connections.toggle(source)}>
            {source === 'stream' ? 'AISStream' : 'AIS NMEA'} · {enabled ? 'Desconectar' : 'Conectar'}
          </button>;
        })}
        <p role="status">AISStream: {connections.state ? ({ disconnected: 'Desconectado', connecting: 'Conectando', connected: 'Conectado', 'missing-key': 'Sin clave API', error: 'Error de conexión' })[connections.state.streamStatus] : 'No disponible'}</p>
        <p>AIS NMEA: {connections.state?.nmeaEnabled ? 'Recepción habilitada; requiere enlace NMEA activo.' : 'Recepción deshabilitada.'}</p>
        <p className="text-amber-200">Desconectar detiene las actualizaciones de esa fuente; los blancos recibidos envejecen según su última posición. GPS, viento y sonda mantienen su conexión.</p>
        {connections.error && <p role="alert" className="text-red-300">{connections.error}</p>}
        {onToggleTargets && <label className="flex gap-2"><input type="checkbox" checked={targetsVisible ?? false} onChange={onToggleTargets} />Mostrar objetivos AIS en carta</label>}
      </section>}
      <p className="text-cyan-200">{ownPosition ? `Por cercanía al GPS recibido · ${ownPosition.lat.toFixed(5)}, ${ownPosition.lng.toFixed(5)}` : 'Sin posición propia vigente: distancia no disponible; orden por riesgo.'}</p>
      {referenceLabel && <p className="text-[10px] text-slate-400">{referenceLabel}</p>}
      {mode === 'risk' && <div className="space-y-2 border-b border-white/10 pb-3">
        <p>Anillo de seguridad compartido con SmartShield. Los niveles fijos del motor siguen activos.</p>
        <label className="flex justify-between">CPA del anillo (nm)
          <input aria-label="CPA del anillo en millas náuticas" className="w-20 bg-slate-900 p-1" type="number" min="0.01" max="10" step="0.01"
            disabled={!onOptionsChange} value={options.minCpaNm} onChange={e => update('minCpaNm', e.currentTarget.valueAsNumber)} />
        </label>
        <label className="flex justify-between">Horizonte TCPA (min)
          <input aria-label="Horizonte TCPA en minutos" className="w-20 bg-slate-900 p-1" type="number" min="1" max="120" step="1"
            disabled={!onOptionsChange} value={options.maxTcpaMinutes} onChange={e => update('maxTcpaMinutes', e.currentTarget.valueAsNumber)} />
        </label>
        <p className="text-slate-400">Vigilancia automática: travesía activa, motor encendido o SOG ≥ 1 kn. Registro por transiciones en bitácora.</p>
      </div>}
      <label className="flex gap-2"><input type="checkbox" checked={onlyRisk} onChange={e => setOnlyRisk(e.target.checked)} />Solo riesgos evaluables</label>
      {sorted.length === 0 && <p className="p-5 text-center">Sin objetivos para este filtro.</p>}
      {sorted.slice(0, visibleCount).map(({target: t, distanceNm: distance}) => {
        const id = String(t.mmsi ?? t.id);
        const rank = targetRank(t, options);
        const lng = t.lng ?? t.lon;
        const locatable = finite(t.lat) && Math.abs(t.lat) <= 90 && finite(lng) && Math.abs(lng) <= 180;
        return <article key={id} className={cn('rounded-xl border bg-black/40 p-3', selected === id ? 'border-cyan-400' : 'border-white/10')}>
          <button type="button" aria-pressed={selected === id} onClick={() => setSelected(id)} className="w-full text-left">
            <div className={cn('font-bold truncate', colors[rank])}>{t.nombre || t.name || t.shipName || t.vesselName || 'AIS TARGET'}</div>
            <div className="text-slate-400 text-[10px]">MMSI {id} · {rank < 0 ? 'SIN DATOS' : rank === 4 ? 'CRITICAL' : rank === 3 ? 'WARNING' : t.riskLevel}</div>
            <div className="font-mono mt-2 text-cyan-200">Distancia {distance === null ? '—' : `${distance.toFixed(2)} nm`}</div>
            <div className="font-mono mt-2">COG {finite(t.cog) && t.cog >= 0 && t.cog < 360 ? `${t.cog.toFixed(0)}°` : '—'} · SOG {finite(t.sog) && t.sog >= 0 && t.sog < 102.3 ? `${t.sog.toFixed(1)} kn` : '—'}</div>
            <div className={cn('flex justify-between font-mono mt-2', colors[rank])}><span>{finite(t.tcpaMinutes) && t.tcpaMinutes < 0 ? 'DIST' : 'CPA'} {formatCpa(t)}</span><span>TCPA {formatTcpa(t)}</span></div>
            <p className="text-[10px] text-slate-400 mt-2">{targetStatus(t)}</p>
          </button>
          {selected === id && <button type="button" disabled={!locatable || !onLocate} onClick={() => onLocate?.(t)}
            className="mt-2 rounded border border-cyan-500/40 p-2 disabled:opacity-40">Localizar en carta{t.dataStatus === 'STALE_TARGET' ? ' (última posición)' : ''}</button>}
        </article>;
      })}
      {hasMore && <div ref={sentinelRef}><button type="button" onClick={() => setVisibleCount(n => n + PAGE_SIZE)}>Mostrar más ({sorted.length - visibleCount})</button></div>}
    </div>
  </ChartPanel>;
};
