import { createPortal } from 'react-dom';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { app } from '../../../application';
import { loadNmeaGatewayConfig, NMEA_GATEWAY_STORAGE_KEY, toConnectionTarget } from '../nmeaGatewayConfig';
import { activeCandidateView } from './diagnosticView';
import type { NmeaServiceStatusView } from '../nmeaGatewayConfig';
import { aisDisplayMotion, aisTargetPosition, type AisPanelTarget } from '../../traffic/aisPanelModel';
import type { DiagnosticApi, DiagnosticReport } from './contracts';

function api(): DiagnosticApi | undefined { return (window as unknown as { startupDiagnostics?: DiagnosticApi }).startupDiagnostics; }

export function StartupDiagnosticsPanel({ host, onConfigure, aisTargets }: { host: HTMLElement | null; onConfigure: () => void; aisTargets: readonly AisPanelTarget[] }) {
  const [hardware, setHardware] = useState<NmeaServiceStatusView | null>(null);
  const [report, setReport] = useState<DiagnosticReport | null>(null);
  const [running, setRunning] = useState(false), [expanded, setExpanded] = useState(false);
  const [error, setError] = useState(''), [now, setNow] = useState(Date.now);
  const [authorized, setAuthorized] = useState<string[]>([]);
  const mounted = useRef(false), busy = useRef(false), generation = useRef(0);
  const auth = useRef(authorized); auth.current = authorized;
  const run = useCallback(async () => {
    if (busy.current || !api()) return;
    busy.current = true; setRunning(true); setError('');
    const id = ++generation.current;
    try {
      let target: unknown;
      try { if (localStorage.getItem(NMEA_GATEWAY_STORAGE_KEY)) target = toConnectionTarget(loadNmeaGatewayConfig(localStorage)); } catch { /* Storage disabled: no default endpoint probing. */ }
      const next = await api()!.run({ target, authorizedInterfaces: auth.current });
      if (mounted.current && id === generation.current) {
        setReport(next);

      }
    } catch { if (mounted.current) setError('No se pudo completar el diagnóstico'); }
    finally { busy.current = false; if (mounted.current) setRunning(false); }
  }, []);
  useEffect(() => {
    mounted.current = true;
    const start = window.setTimeout(() => { void run(); }, 0);
    const refresh = () => {
      setNow(Date.now());
      const hw = (window as unknown as { GAULOSAPI?: { getHardwareStatus?: () => Promise<NmeaServiceStatusView | null> } }).GAULOSAPI;
      void hw?.getHardwareStatus?.().then(status => { if (mounted.current) setHardware(status); }).catch(() => undefined);
    };
    refresh();
    const tick = window.setInterval(refresh, 1000);
    let debounce: ReturnType<typeof setTimeout>;
    const network = () => { auth.current = []; setAuthorized([]); clearTimeout(debounce); debounce = setTimeout(() => { if (!busy.current) void run(); }, 3000); };
    window.addEventListener('online', network); window.addEventListener('offline', network);
    const connection = (navigator as Navigator & { connection?: EventTarget }).connection;
    connection?.addEventListener('change', network);
    return () => { mounted.current = false; ++generation.current; clearTimeout(start); clearTimeout(debounce); clearInterval(tick); window.removeEventListener('online', network); window.removeEventListener('offline', network); connection?.removeEventListener('change', network); void api()?.cancel(); };
  }, [run]);
  if (!api() || !host) return null;
  const nav = app.navigationState.snapshot(now), instruments = app.boatInstruments.snapshot(now);
  const fields = [nav.position, nav.sog, nav.cog, nav.headingTrue, nav.headingMagnetic];
  const realPosition = nav.position.status === 'VALID' && nav.position.source !== 'SIMULATOR';
  return createPortal(<section aria-label="Diagnóstico de embarcación" className="relative z-10 shrink-0 border-b border-slate-700 bg-slate-950 text-xs text-slate-200">
    <div className="flex items-center gap-3 px-3 py-1">
      <button onClick={() => setExpanded(v => !v)} aria-expanded={expanded}>DIAGNÓSTICO DE EMBARCACIÓN · {running ? 'Comprobando conexiones' : realPosition ? 'Posición vigente' : 'Sin posición real vigente'}</button>
      {expanded && <><button disabled={running} onClick={() => void run()}>Repetir</button><button disabled={!running} onClick={() => void api()?.cancel()}>Cancelar</button><button onClick={onConfigure}>Configuración</button><button onClick={() => setExpanded(false)}>Cerrar</button></>}
    </div>
    {expanded && <div className="max-h-44 overflow-y-auto px-3 pb-2" aria-live="polite">
      <p>{error || (report ? `Sesión ${report.sessionId} · ${report.phase}` : 'Comprobando conexiones…')}</p>
      {report?.candidates.length === 0 && <p>NOT_CONFIGURED · Sin gateways configurados o detectados.</p>}
      {report?.candidates.map(raw => activeCandidateView(raw, hardware, nav, instruments, now)).map(c => <p key={c.id}>{c.transport} {c.host ? `${c.host}:${c.port}` : c.path} · {c.state} · {c.protocol} · {c.reason}. {c.instruments.join(', ')} {c.lastValidAt ? `· Última válida ${new Date(c.lastValidAt).toLocaleTimeString()}` : ''}. {c.action}</p>)}
      {report?.issues.map(issue => <p key={issue} className="text-amber-300">{issue}</p>)}
      <p>{fields.map(f => `${f.field}: ${f.status} ${f.source ?? ''} (${Object.entries(f.sources).map(([s, state]) => `${s}:${state}`).join(', ')})`).join(' · ')}</p>
      <p>Profundidad: {instruments.depth ? 'BOAT vigente' : 'Sin datos vigentes'} · Viento: {instruments.windApparent || instruments.windTrue || instruments.windDirectionTrue ? 'BOAT vigente' : 'Sin datos vigentes'} · AIS: {aisTargets.filter(t => aisTargetPosition(t) && aisDisplayMotion(t, now).vectorAvailable).length} blancos con posición y movimiento vigentes (no acredita origen NMEA).</p>
      <p>GAULOS Droid: {fields.some(f => f.sources.DROID === 'VALID') ? 'Telemetría válida' : fields.some(f => f.sources.DROID === 'STALE') ? 'DEGRADED · Datos caducados' : 'Sin telemetría válida'}. Un gateway requiere adaptador; detección no confirma acceso NMEA 2000.</p>
      <div>mDNS Signal K (autorizar red de confianza por sesión; se revoca al cambiar conectividad): {report?.interfaces.filter(i => i.eligible).map(i => <label key={i.address} className="ml-3"><input type="checkbox" checked={authorized.includes(i.address)} onChange={e => { const next = e.target.checked ? [...authorized, i.address].slice(0, 16) : authorized.filter(a => a !== i.address); setAuthorized(next); }} /> {i.name} {i.address}</label>)}. Repetir tras autorizar.</div>
    </div>}
  </section>, host);
}
