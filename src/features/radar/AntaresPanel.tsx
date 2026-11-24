import React, { useEffect, useState } from 'react';
import { Radar } from 'lucide-react';
import { ChartPanel } from '../layout/panels/ChartPanel';
import { displayBearing, polarPoint } from './radar';
import type { AntaresSnapshot } from './antares';
const EMPTY: AntaresSnapshot = { source: 'RADAR_SIM', state: 'disconnected', tracks: [], rejected: 0, error: null };

/** ANTARES supplies tracks, not scan intensities. No manufactured sweep or radar video. */
export default function AntaresPanel({ onClose, onBack }: { onClose: () => void; onBack: () => void }): React.ReactElement {
  const [snapshot, setSnapshot] = useState<AntaresSnapshot>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [rangeNm, setRangeNm] = useState(0.75);
  const [heading, setHeading] = useState(0);
  const [northUp, setNorthUp] = useState(true);
  const [ebl, setEbl] = useState(45);
  const [vrm, setVrm] = useState(0.25);
  useEffect(() => {
    const api = window.radarAntares;
    if (!api) return;
    let active = true, pending = false;
    let lastResponse = performance.now();
    const poll = async (): Promise<void> => {
      if (performance.now() - lastResponse > 3000) setSnapshot({ ...EMPTY, state: 'error', error: 'Sin respuesta del receptor local' });
      if (pending) return;
      pending = true;
      try {
        const value = await api.snapshot();
        if (active) { lastResponse = performance.now(); setSnapshot(value); }
      } catch {
        if (active) setSnapshot({ ...EMPTY, state: 'error', error: 'Receptor ANTARES no disponible' });
      } finally { pending = false; }
    };
    void poll();
    const timer = window.setInterval(() => { void poll(); }, 250);
    return () => { active = false; window.clearInterval(timer); void api.disconnect().catch(() => {}); };
  }, []);
  const connect = async (): Promise<void> => {
    if (!window.radarAntares) return;
    setBusy(true);
    try { setSnapshot(await window.radarAntares.connect()); }
    catch { setSnapshot({ ...EMPTY, state: 'error', error: 'No se pudo iniciar el receptor' }); }
    finally { setBusy(false); }
  };
  const disconnect = async (): Promise<void> => {
    setBusy(true);
    try { await window.radarAntares?.disconnect(); setSnapshot(EMPTY); }
    catch { setSnapshot({ ...EMPTY, state: 'error', error: 'No se pudo confirmar la desconexión' }); }
    finally { setBusy(false); }
  };
  const pointAt = (bearing: number, distance: number): { x: number; y: number } => {
    const angle = displayBearing(bearing - heading, northUp ? 'north-up' : 'head-up', heading);
    return polarPoint(angle ?? 0, distance);
  };
  const headingPoint = polarPoint(northUp ? heading : 0, 265);
  const eblPoint = polarPoint(northUp ? (ebl + heading) % 360 : ebl, 265);
  const tracks = snapshot.tracks.filter(t => t.source === 'RADAR_SIM' && t.rangeM <= rangeNm * 1852);
  const labels = { disconnected: 'Desconectado', connecting: 'Conectando', connected: 'TCP conectado', error: 'Error' };
  return <ChartPanel isOpen onClose={onClose} title="ANTARES · SIMULACIÓN" icon={Radar} width={720} ariaLabel="Pistas simuladas ANTARES">
    <div className="radar-lab">
      <strong className="radar-sim">SIMULACIÓN ANTARES · PISTAS CSV · SIN ECOS NI USO OPERATIVO</strong>
      <p role="status">{labels[snapshot.state]} · {snapshot.tracks.length ? `${snapshot.tracks.length} pistas vigentes · ${tracks.length} en escala` : 'SIN DATOS'} · Rechazadas: {snapshot.rejected}</p>
      {snapshot.error && <p role="alert">{snapshot.error}</p>}
      {!window.radarAntares && <p>Disponible en Electron. Reinicia GAULOS para cargar el receptor ANTARES.</p>}
      <svg viewBox="-300 -300 600 600" role="img" aria-label="PPI de símbolos de pistas ANTARES, sin barrido de ecos" style={{ display: 'block', width: '100%', background: '#061525' }}>
        {[1,2,3,4].map(r => <g key={r}><circle r={265*r/4} fill="none" stroke="#355269" /><text x={5} y={-265*r/4+15} fill="#b5cddd" fontSize={12}>{(rangeNm*r/4).toFixed(2)} NM</text></g>)}
        {[0,30,60,90,120,150,180,210,240,270,300,330].map(b => { const p = polarPoint(b, 282); return <text key={b} x={p.x-11} y={p.y+4} fontSize={12} fill="#b5cddd">{String(b).padStart(3,'0')}</text>; })}
        {tracks.map(t => { const p = pointAt(t.bearingDeg, t.rangeM/(rangeNm*1852)*265); return <g key={t.id}><circle cx={p.x} cy={p.y} r={5} stroke="#62ffa3" fill="none" /><text x={p.x+7} y={p.y-5} fontSize={12} fill="#62ffa3">SIM {t.id}</text></g>; })}
        <line x2={headingPoint.x} y2={headingPoint.y} stroke="white" />
        <line x2={eblPoint.x} y2={eblPoint.y} stroke="#fbbf24" />
        <circle r={vrm/rangeNm*265} fill="none" stroke="#fbbf24" strokeDasharray="5 5" />
      </svg>
      <div className="radar-controls">
        <button disabled={!window.radarAntares || busy || snapshot.state === 'connecting' || snapshot.state === 'connected'} onClick={() => { void connect(); }}>Conectar 127.0.0.1:17396</button>
        <button disabled={!window.radarAntares || busy} onClick={() => { void disconnect(); }}>Desconectar y borrar</button>
        <button onClick={onBack}>Simulador interno</button>
        <label>Escala NM<select value={rangeNm} onChange={e => { setRangeNm(Number(e.target.value)); setVrm(v => Math.min(v, Number(e.target.value))); }}>{[0.125,0.25,0.5,0.75,1.5,3,6].map(n => <option key={n}>{n}</option>)}</select></label>
        <label>Orientación<select value={northUp ? 'north' : 'head'} onChange={e => setNorthUp(e.target.value === 'north')}><option value="north">Norte XY ANTARES arriba</option><option value="head">Proa SIM arriba</option></select></label>
        <label>HDG SIM {heading}°<input type="range" min={0} max={359} value={heading} onChange={e => setHeading(Number(e.target.value))} /></label>
        <label>EBL {ebl}° R<input type="range" min={0} max={359} value={ebl} onChange={e => setEbl(Number(e.target.value))} /></label>
        <label>VRM {vrm.toFixed(2)} NM<input type="range" min={0} max={rangeNm} step={0.01} value={vrm} onChange={e => setVrm(Number(e.target.value))} /></label>
      </div>
      <p>Fuente externa de simulación. Pistas caducan a los 3 s. Rumbo manual SIM; no usa posición ni rumbo BOAT. ENC deshabilitada. Sin AIS, CPA ni alarmas.</p>
      <p>17394 es el controlador HTTP; esta vista no envía comandos. Si TCP conecta sin pistas, comprueba que ANTARES tenga barcos dentro del alcance.</p>
    </div>
  </ChartPanel>;
}
