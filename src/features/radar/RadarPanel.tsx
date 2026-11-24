import React, { useEffect, useRef, useState } from 'react';
import { Radar } from 'lucide-react';
import { ChartPanel } from '../layout/panels/ChartPanel';
import { displayBearing, polarPoint, RadarChannel, SyntheticRadar, type RadarSpoke } from './radar';
import './radar.css';
import AntaresPanel from './AntaresPanel';

/** Mounted only while open: closing disposes all timers and simulated data. */
export default function RadarPanel({ onClose }: { onClose: () => void }): React.ReactElement {
  const [external, setExternal] = useState(false);
  return external ? <AntaresPanel onClose={onClose} onBack={() => setExternal(false)} /> : <SyntheticRadarPanel onClose={onClose} onAntares={() => setExternal(true)} />;
}
function SyntheticRadarPanel({ onClose, onAntares }: { onClose: () => void; onAntares: () => void }): React.ReactElement {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [running, setRunning] = useState(false);
  const [rangeNm, setRangeNm] = useState(1.5);
  const [heading, setHeading] = useState(0);
  const [northUp, setNorthUp] = useState(false);
  const [ebl, setEbl] = useState(45);
  const [vrm, setVrm] = useState(0.5);
  const controls = useRef({ heading, northUp, ebl, vrm });
  controls.current = { heading, northUp, ebl, vrm };
  useEffect(() => {
    const adapter = new SyntheticRadar();
    const bus = new RadarChannel('RADAR_SIM');
    const spokes = new Map<number, RadarSpoke>();
    const start = performance.now();
    const draw = (): void => {
      const ctx = canvas.current?.getContext('2d');
      if (!ctx) return;
      const { heading, northUp, ebl, vrm } = controls.current;
      const elapsed = performance.now() - start;
      if (running) for (const spoke of adapter.advance(elapsed, rangeNm * 1852)) {
        if (bus.accept(spoke)) spokes.set(spoke.bearingDeg, spoke);
      }
      ctx.fillStyle = '#061525'; ctx.fillRect(0, 0, 600, 600);
      ctx.save(); ctx.translate(300, 300);
      const radius = 265;
      let sweep: number | null = null;
      for (const spoke of spokes.values()) {
        // Synthetic world heading = 0; convert through relative bearing before display.
        const angle = displayBearing(spoke.bearingDeg - heading, northUp ? 'north-up' : 'head-up', heading);
        if (angle === null) continue;
        for (let i = 0; i < spoke.samples.length; i++) {
          const strength = spoke.samples[i];
          if (strength < 17) continue;
          const point = polarPoint(angle, (i + 0.5) / spoke.samples.length * radius);
          ctx.fillStyle = `rgba(70,255,145,${strength / 255 * Math.max(0, 1 - (elapsed - spoke.timeMs) / 3000)})`;
          ctx.fillRect(point.x - 1, point.y - 1, strength > 100 ? 3 : 1, strength > 100 ? 3 : 1);
        }
      }
      const latest = bus.snapshot(elapsed);
      if (latest) sweep = displayBearing(latest.bearingDeg - heading, northUp ? 'north-up' : 'head-up', heading);
      const line = (angle: number, color: string): void => {
        const pt = polarPoint(angle, radius); ctx.strokeStyle = color; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(pt.x, pt.y); ctx.stroke();
      };
      ctx.strokeStyle = '#355269'; ctx.fillStyle = '#b5cddd'; ctx.font = '13px monospace';
      for (let ring = 1; ring <= 4; ring++) {
        ctx.beginPath(); ctx.arc(0, 0, radius * ring / 4, 0, 2 * Math.PI); ctx.stroke();
        ctx.fillText(`${(rangeNm * ring / 4).toFixed(2)} NM`, 5, -radius * ring / 4 + 15);
      }
      for (let b = 0; b < 360; b += 30) {
        const pt = polarPoint(b, radius + 18); ctx.fillText(String(b).padStart(3, '0'), pt.x - 12, pt.y + 4);
      }
      if (sweep !== null) line(sweep, '#40b884');
      line(northUp ? heading : 0, '#f1f5f9');
      line(northUp ? (ebl + heading) % 360 : ebl, '#fbbf24');
      ctx.strokeStyle = '#fbbf24'; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.arc(0, 0, vrm / rangeNm * radius, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    };
    draw();
    const timer = window.setInterval(draw, 80);
    return () => { window.clearInterval(timer); bus.reset(); spokes.clear(); };
  }, [running, rangeNm]);
  return <ChartPanel isOpen onClose={onClose} title="RADAR · SIMULACIÓN" icon={Radar} width={720} ariaLabel="Laboratorio radar simulado">
    <div className="radar-lab">
      <strong className="radar-sim">SIMULACIÓN · ESCENARIO SINTÉTICO · SIN USO OPERATIVO</strong>
      <p role="status">{running ? 'Barrido SIM activo · 24 rpm' : 'SIN DATOS · simulador detenido'} · {northUp ? 'NORTE ARRIBA' : 'PROA ARRIBA'} · HDG SIM {heading}° T</p>
      <canvas ref={canvas} width={600} height={600} aria-label="PPI de ecos simulados con anillos, línea de proa, EBL y VRM" />
      <div className="radar-controls">
        <button onClick={onAntares}>ANTARES · pistas TCP</button>
        <button onClick={() => setRunning(v => !v)}>{running ? 'Detener y borrar' : 'Iniciar SIM'}</button>
        <label>Escala NM<select value={rangeNm} onChange={e => { setRangeNm(Number(e.target.value)); setVrm(v => Math.min(v, Number(e.target.value))); }}>{[0.25, 0.5, 0.75, 1.5, 3, 6].map(n => <option key={n}>{n}</option>)}</select></label>
        <label>Orientación<select value={northUp ? 'north' : 'head'} onChange={e => setNorthUp(e.target.value === 'north')}><option value="head">Proa arriba</option><option value="north">Norte arriba SIM</option></select></label>
        <label>HDG SIM °T<input type="range" min={0} max={359} value={heading} onChange={e => setHeading(Number(e.target.value))} /></label>
        <label>EBL {ebl}° R<input type="range" min={0} max={359} value={ebl} onChange={e => setEbl(Number(e.target.value))} /></label>
        <label>VRM {vrm.toFixed(2)} NM<input type="range" min={0} max={rangeNm} step={0.01} value={vrm} onChange={e => setVrm(Number(e.target.value))} /></label>
      </div>
      <p>Costa ficticia, barco con AIS simulado, barco sin AIS, boya y ruido. Los ecos no identifican objetivos. Sin seguimiento ni alarmas.</p>
      <button disabled title="Sin georreferenciación del escenario ni posición/heading real validados">Superposición ENC no disponible</button>
      <p>Radar físico: sin adaptador conectado. Ningún dato SIM alimenta BOAT, AIS ni alarmas.</p>
    </div>
  </ChartPanel>;
}
