import { repairDisplayText } from '../../../../lib/textEncoding';
import { voyageGuidance } from '../../../../core/voyage/voyageGuidance';
import { useEffect, useState } from 'react';
import type { TripSession } from '../../../../lib/tripLogger';
import { getTripLogger } from '../../../../lib/tripLogger';
import type { BoatPanelInput } from '../../../boat/boatPanelModel';
interface Props {
  shipId: string | null;
  getInput: () => BoatPanelInput;
  onStart: () => void;
  onEnd: () => Promise<void>;
  onSync: () => Promise<void>;
  onLogbook: () => void;
  onNextWaypoint: () => Promise<void>;
}
const button = 'min-h-11 rounded-lg border border-cyan-500/30 px-3 py-2 text-xs text-cyan-100 disabled:opacity-40';
export default function VoyagePanel({ shipId, getInput, onStart, onEnd, onSync, onLogbook, onNextWaypoint }: Props) {
  const [session, setSession] = useState<TripSession | null>(null);
  const [tick, setTick] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try { const logger = getTripLogger();
        const active = logger.getCurrentSession() ?? logger.getPendingSession();
        const data = active?.shipId === shipId ? active : shipId ? (await logger.getSessionsForShip(shipId)).sort((a,b) => b.startTime-a.startTime)[0] ?? null : null;
        if (!cancelled) { setSession(data); setTick(Date.now()); }
      } catch (cause) { if (!cancelled) setError(cause instanceof Error ? cause.message : 'No se pudo leer el historial'); }
    };
    void refresh(); const timer = window.setInterval(() => { void refresh(); }, 1000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [shipId]);
  const recording = Boolean(session?.isActive && getTripLogger().getCurrentSession()?.id === session.id);
  const pending = Boolean(session?.isActive && !recording);
  const paused = recording && session?.pausedAt !== undefined;
  const input = getInput();
  const nav = input.navigation;
  const metric = (f: {status: string; source: string | null; value: number | null}, unit: string) => f.status === 'VALID' && f.source !== 'SIMULATOR' && f.value !== null ? `${f.value.toFixed(1)} ${unit}` : 'Sin dato vigente';
  const run = async (action: () => Promise<void>) => { setBusy(true); try { await action(); setError(null); } catch(e) { setError(e instanceof Error ? e.message : 'Operación fallida'); } finally { setBusy(false); } };
  const guidance = recording && session ? voyageGuidance(session.plan, session.waypointIndex ?? 0, nav) : null;
  const seconds = session ? Math.max(0, Math.floor(((session.endTime ?? tick) - session.startTime) / 1000)) : 0;
  const elapsed = `${Math.floor(seconds/3600)}:${String(Math.floor(seconds/60)%60).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
  return <div className="space-y-3 p-4 text-sm text-slate-300">
    <h2 className="text-lg font-bold text-cyan-200">TRAVESÍA · Seguimiento</h2>
    <p className="font-semibold">{pending ? 'Pendiente de recuperación · sin grabar (controles en la barra superior)' : paused ? 'Grabación pausada · travesía abierta' : recording ? input.voyage.status === 'no_signal' ? 'En curso · sin señal' : 'En curso' : session ? 'Finalizada' : 'Sin iniciar'}</p>
    {session && <>
      <p>{session.plan ? `${repairDisplayText(session.plan.name)} · v${session.plan.version}` : repairDisplayText(session.destination || 'Navegación libre')}</p>
      <dl className="grid grid-cols-2 gap-2"><dt>Salida</dt><dd>{new Date(session.startTime).toLocaleString()}</dd>
        <dt>Duración</dt><dd>{elapsed}</dd><dt>Distancia GPS</dt><dd>{(session.distanceNm ?? 0).toFixed(2)} NM</dd>
        <dt>Guardia inicial</dt><dd>{repairDisplayText(session.officer || 'No registrada')}</dd><dt>Modo</dt><dd>{session.mode || 'Sin registrar'}</dd>
        <dt>SOG</dt><dd>{metric(nav.sog, 'kn')}</dd><dt>COG verdadero</dt><dd>{metric(nav.cog, '°')}</dd>
        <dt>HDG verdadero</dt><dd>{metric(nav.headingTrue, '°')}</dd><dt>Track</dt><dd>{session.track?.segments.length ?? 0} segmentos</dd></dl>
      {session.plan && <div className="rounded-lg border border-cyan-500/20 p-3">
        <p>WP {(session.waypointIndex ?? 0) + 1}/{session.plan.waypoints.length} · {guidance?.waypoint ?? session.plan.waypoints[session.waypointIndex ?? 0]?.name}</p>
        <p>DTW {guidance ? `${guidance.dtw.toFixed(2)} NM` : 'Sin posición vigente'} · BTW {guidance ? `${guidance.bearing.toFixed(0)}° V` : '—'}</p>
        <p>XTE aprox. {guidance?.xte !== null && guidance?.xte !== undefined ? `${guidance.xte.toFixed(3)} NM` : '—'} · ETA al WP {guidance?.etaSeconds !== null && guidance?.etaSeconds !== undefined ? new Date(tick + guidance.etaSeconds * 1000).toLocaleTimeString() : 'Sin SOG vigente'}</p>
        {session.routeArrivedAt && <p>Ruta completada · último waypoint alcanzado</p>}
        <p className="text-xs">ETA a SOG constante. Avance automático por llegada o sobrepaso válido; confirmación manual disponible.</p>
        {recording && <button className={button} disabled={busy || (session.waypointIndex ?? 0) >= session.plan.waypoints.length - 1} onClick={() => void run(onNextWaypoint)}>Confirmar paso al siguiente WP</button>}
      </div>}
      <p className="text-xs">Sesión {session.id}. El plan queda congelado al zarpar. Los cortes de señal separan segmentos del track.</p>
      <h3 className="font-semibold">Bitácora local</h3>
      <ul className="max-h-48 space-y-2 overflow-y-auto">{(session.journal ?? []).slice(-40).reverse().map(e => <li key={e.id} className="border-b border-white/10 pb-2">
        <strong>{new Date(e.at).toLocaleTimeString()} · {repairDisplayText(e.title)}</strong><p>{repairDisplayText(e.text)}</p><small>{e.cloudSaved ? 'Copia en nube confirmada' : e.payload ? 'Pendiente de copia en nube' : 'Registro local'}</small>
      </li>)}</ul>
    </>}
    <fieldset disabled={busy} className="space-y-2">
      {!recording && !pending && <button className={button} disabled={!shipId} onClick={onStart}>Preparar travesía libre / por ruta</button>}
      {recording && <><textarea aria-label="Nota de bitácora" value={note} onChange={e => setNote(e.target.value)} maxLength={4000} placeholder="Nota de guardia…" className="w-full rounded-lg bg-slate-950 p-2" />
        <button className={button} disabled={!note.trim()} onClick={() => void run(async () => { await getTripLogger().addJournalEntry('Nota de guardia', note.trim()); setNote(''); })}>Guardar nota local</button>
        <label className="flex gap-2"><input type="checkbox" checked={confirmEnd} onChange={e => setConfirmEnd(e.target.checked)} />Confirmo finalizar esta travesía.</label>
        <button className={`${button} border-rose-400/40 text-rose-200`} disabled={!confirmEnd} onClick={() => void run(onEnd)}>Finalizar travesía</button></>}
      <div className="flex flex-wrap gap-2"><button className={button} onClick={onLogbook}>Abrir bitácora completa</button>
        <button className={button} disabled={!shipId} onClick={() => void run(onSync)}>Sincronizar bitácora</button>
        <button className={button} disabled={!session} onClick={() => { if (!session) return; const url = URL.createObjectURL(new Blob([JSON.stringify(session,null,2)],{type:'application/json'})); const a=document.createElement('a'); a.href=url;a.download=`${session.id}.json`;a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); }}>Exportar sesión JSON</button></div>
    </fieldset>
    <p className="text-xs">Plan, track y notas se conservan en este equipo. Sincronizar copia los eventos pendientes con datos de envío; las notas locales se incluyen en la exportación.</p>
    {(error || getTripLogger().getPersistenceError()) && <p role="alert" className="text-rose-300">{error || getTripLogger().getPersistenceError()}</p>}
  </div>;
}
