import { useEffect, useState } from 'react';
import { parseGPX } from '../../../../lib/gpxParser';
import { emptyMissionPlan, loadMissionPlans, planFromGpx, saveMissionPlan, validCoordinate, type MissionPlan } from '../../../../core/voyage/missionPlan';

interface Props {
  shipId: string | null;
  plan: MissionPlan;
  underway: boolean;
  onApply: (plan: MissionPlan) => void;
  onStart: () => void;
  onPrepareDispatch: () => void;
  onEditChart: () => void;
}
const button = 'min-h-11 rounded-lg border border-cyan-500/30 px-3 py-2 text-xs text-cyan-100 disabled:opacity-40';
const input = 'w-full rounded-lg border border-white/20 bg-slate-950 p-2 text-sm text-white';
/** Keeps partial decimal/negative edits until blur; invalid text cannot silently save an old coordinate. */
function CoordinateEditor({ value, latitude, label, onCommit, onValidity }: {
  value: number; latitude: boolean; label: string; onCommit: (value: number) => void; onValidity: (valid: boolean) => void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const parsed = Number(text.replace(',', '.'));
  const valid = text.trim() !== '' && Number.isFinite(parsed) && Math.abs(parsed) <= (latitude ? 90 : 180);
  return <label className="text-xs">{label}<input type="text" inputMode="decimal" className={input} value={text} aria-invalid={!valid}
    onChange={e => { const next=e.target.value;setText(next);const n=Number(next.replace(',', '.'));onValidity(next.trim()!=='' && Number.isFinite(n) && Math.abs(n)<=(latitude?90:180)); }}
    onBlur={() => { if (valid && parsed !== value) onCommit(parsed); }} />
    {!valid && <span className="text-rose-300">Coordenada inválida</span>}
  </label>;
}
export default function MissionPlanner({ shipId, plan, underway, onApply, onStart, onPrepareDispatch, onEditChart }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<MissionPlan[]>([]);
  const [notice, setNotice] = useState('');
  const [coordinateErrors, setCoordinateErrors] = useState<Record<string, boolean>>({});
  const coordinatesValid = !plan.waypoints.some(w => coordinateErrors[`${w.id}:lat`] || coordinateErrors[`${w.id}:lng`]);
  const change = (patch: Partial<MissionPlan>) => { onApply({ ...plan, ...patch, reviewed: false, savedAt: 0 }); setNotice('Cambios pendientes de guardar'); };
  const attempt = (work: () => void) => { try { work(); setError(null); } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar el plan'); } };
  return <div className="space-y-3 p-4 text-sm text-slate-300">
    <h2 className="text-lg font-bold text-cyan-200">MISIÓN · Planificación</h2>
    <p>Prepare la derrota y sus alternativas. La revisión cartográfica y el checklist preceden al inicio.</p>
    {underway && <p className="text-amber-300">Travesía activa: el plan está bloqueado. Consulte TRAVESÍA para finalizarla.</p>}
    <fieldset disabled={underway || !shipId} className="space-y-3 disabled:opacity-60">
      <label className="block">Nombre<input className={input} value={plan.name} maxLength={120} onChange={e => change({ name: e.target.value })} /></label>
      <label className="block">Restricciones y alternativas<textarea className={input} rows={3} maxLength={4000}
        placeholder="Calado, margen bajo quilla, resguardos, refugios, límites meteorológicos…" value={plan.constraints} onChange={e => change({ constraints: e.target.value })} /></label>
      <p className="text-xs text-amber-200">Estas notas son criterios del capitán. No acreditan una comprobación automática de seguridad ni cobertura ENC.</p>
      <ol className="space-y-2">
        {plan.waypoints.map((w, i) => <li key={w.id} className="space-y-2 rounded-lg border border-white/10 p-2">
          <label className="block text-xs">WP {i + 1}<input aria-label={`Nombre WP ${i + 1}`} className={input} value={w.name} onChange={e => change({ waypoints: plan.waypoints.map(p => p.id === w.id ? { ...p, name: e.target.value } : p) })} /></label>
          <div className="grid grid-cols-2 gap-2">{(['lat', 'lng'] as const).map(axis => <CoordinateEditor key={axis} latitude={axis==='lat'} label={axis==='lat'?'Latitud °':'Longitud °'} value={w[axis]}
            onValidity={valid => setCoordinateErrors(previous => ({...previous,[`${w.id}:${axis}`]:!valid}))}
            onCommit={n => change({waypoints:plan.waypoints.map(p=>p.id===w.id?{...p,[axis]:n}:p)})} />)}</div>
          <div className="flex gap-2"><button type="button" className={button} disabled={i === 0} onClick={() => { const points = [...plan.waypoints]; [points[i - 1], points[i]] = [points[i], points[i - 1]]; change({ waypoints: points }); }}>Subir</button>
            <button type="button" className={button} onClick={() => change({ waypoints: plan.waypoints.filter(p => p.id !== w.id) })}>Quitar</button></div>
        </li>)}
      </ol>
      <div className="flex flex-wrap gap-2">
        <button className={button} onClick={onEditChart}>Añadir puntos en carta</button>
        <label className={`${button} cursor-pointer`}>Importar GPX<input type="file" accept=".gpx" className="sr-only" onChange={async e => {
          const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
          try { if (file.size > 5_000_000) throw new Error('GPX demasiado grande (máximo 5 MB)');
            const xmlText = await file.text();
            const xml = new DOMParser().parseFromString(xmlText, 'application/xml');
            const points = [...Array.from(xml.getElementsByTagName('rtept')), ...Array.from(xml.getElementsByTagName('trkpt'))];
            if (points.some(p => !p.getAttribute('lat')?.trim() || !p.getAttribute('lon')?.trim() || !validCoordinate(Number(p.getAttribute('lat')), Number(p.getAttribute('lon'))))) throw new Error('GPX con coordenadas ausentes o inválidas');
            const route = parseGPX(xmlText).routes[0]; if (!route) throw new Error('El GPX no contiene una ruta');
            onApply(planFromGpx(route)); setError(null); setNotice('Ruta importada; pendiente de revisión y guardado');
          } catch (cause) { setError(cause instanceof Error ? cause.message : 'GPX inválido'); }
        }} /></label>
        <button className={button} onClick={() => change({ waypoints: [] })}>Vaciar plan</button>
        <button className={button} onClick={() => onApply({ ...plan, id: crypto.randomUUID(), name: `${plan.name} · alternativa`, version: 1, savedAt: 0, reviewed: false })}>Nueva alternativa</button>
      </div>
      <label className="flex items-start gap-2"><input type="checkbox" checked={plan.reviewed} onChange={e => onApply({ ...plan, reviewed: e.target.checked, savedAt: 0 })} />He revisado derrota, cobertura cartográfica y restricciones.</label>
      <button className={button} disabled={!plan.name.trim() || !coordinatesValid} onClick={() => attempt(() => {
        if (!shipId) return; const next = saveMissionPlan(localStorage, shipId, plan); onApply(next); setSaved(loadMissionPlans(localStorage, shipId)); setNotice(`Versión ${next.version} guardada en este equipo`);
      })}>Guardar versión</button>
      <button className={button} onClick={() => attempt(() => { if (shipId) setSaved(loadMissionPlans(localStorage, shipId)); })}>Ver planes guardados</button>
      {saved.length > 0 && <label className="block">Recuperar versión / alternativa<select className={input} value="" onChange={e => { const p = saved.find(v => `${v.id}:${v.version}` === e.target.value); if (p) onApply(structuredClone(p)); }}>
        <option value="">Seleccionar…</option>{saved.map(p => <option key={`${p.id}:${p.version}`} value={`${p.id}:${p.version}`}>{p.name} · v{p.version}</option>)}
      </select></label>}
      <button className={button} onClick={onPrepareDispatch}>Preparar despacho</button>
      <button className={`${button} w-full bg-emerald-500/20`} disabled={plan.waypoints.length < 2 || !plan.reviewed || !plan.savedAt || !coordinatesValid} onClick={onStart}>Continuar al despacho</button>
    </fieldset>
    {!shipId && <p>Seleccione un barco para preparar la misión.</p>}
    {notice && <p role="status" className="text-cyan-300">{notice}</p>}
    {error && <p role="alert" className="text-rose-300">{error}</p>}
  </div>;
}
