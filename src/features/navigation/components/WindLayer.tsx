import type { WindObservation } from '../../../core/instruments/resolveWind';
import { fromMeteorological, KNOTS_PER_MS } from '../../weather/windflow/windField';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMap } from 'react-leaflet';
import { openWeatherWind, openWeatherWindRequest } from '../../weather/windflow/openWeatherWind';
import { windColor, selectWindFrameIndex, type WindField } from '../../weather/windflow/windField';
import { mountFlowCanvas, mountWindFlow } from '../../weather/windflow/WindFlowCanvas';

function WindFlow({ controlsHost }: { controlsHost: HTMLElement | null }): React.ReactNode {
  const map = useMap();
  const host = controlsHost;
  const [enabled, setEnabled] = useState(true);
  const [field, setField] = useState<WindField | null>(null);
  const [status, setStatus] = useState('Fuente pendiente de activación');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [opacity, setOpacity] = useState(0.18);
  const [night, setNight] = useState(false);
  const [animate, setAnimate] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [coverage, setCoverage] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const selectedTime = useRef<number | null>(null);
  const onCoverage = useCallback((available: boolean) => setCoverage(available), []);
  useEffect(() => {
    const frame = field?.frames[step];
    if (frame) selectedTime.current = frame.time;
  }, [field, step]);



  useEffect(() => {
    if (!enabled) return;
    let controller: AbortController | null = null;
    let debounce: ReturnType<typeof setTimeout>;
    let disposed = false;
    const load = async () => {
      controller?.abort();
      controller = new AbortController();
      const current = controller;
      const timeout = window.setTimeout(() => current.abort(), 25000);
      setField(null); setCoverage(false); setLoading(true); setStatus('Cargando pronóstico multipunto…');
      try {
        const bounds = map.getBounds();
        const request = openWeatherWindRequest({ south: bounds.getSouth(), north: bounds.getNorth(), west: bounds.getWest(), east: bounds.getEast() });
        const next = await openWeatherWind.load(request, current.signal);
        if (disposed || current !== controller || current.signal.aborted) return;
        const index = selectWindFrameIndex(next.frames, selectedTime.current, Date.now());
        setField(next); setStep(index); setStatus('');
      } catch (error: unknown) {
        if (disposed || current !== controller) return;
        setStatus(current.signal.aborted ? 'Tiempo de espera agotado; pulse Reintentar' : error instanceof Error ? error.message : 'No se pudo obtener el pronóstico');
      } finally {
        window.clearTimeout(timeout);
        if (!disposed && current === controller) setLoading(false);
      }
    };
    // Debounce map movements, cancel obsolete responses immediately.
    const schedule = () => {
      controller?.abort(); controller = null;
      clearTimeout(debounce); setField(null); setCoverage(false);
      debounce = setTimeout(() => { void load(); }, 650);
    };
    const beginMove = () => { controller?.abort(); controller = null; clearTimeout(debounce); };
    map.on('movestart', beginMove);
    map.on('moveend', schedule);
    const interval = window.setInterval(schedule, 30 * 60 * 1000);
    void load();
    return () => {
      disposed = true; controller?.abort(); clearTimeout(debounce); window.clearInterval(interval);
      map.off('movestart', beginMove); map.off('moveend', schedule);
    };
  }, [map, enabled, refresh]);

  useEffect(() => {
    const frame = field?.frames[step];
    if (!field || !frame) return;
    return mountWindFlow(map, field, frame, { opacity, night, animate, onCoverage });
  }, [map, field, step, opacity, night, animate, onCoverage]);

  if (!host) return null;
  const frame = field?.frames[step];
  const utc = (time: number) => new Date(time).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  const spacing = (axis: number[]): string => {
    const deltas = axis.slice(1).map((value, index) => value - axis[index]);
    return `${Math.min(...deltas).toFixed(3)}–${Math.max(...deltas).toFixed(3)}°`;
  };
  const button: React.CSSProperties = { background: '#24374b', color: '#edf4fa', border: '1px solid #60758a', borderRadius: 4, padding: '3px 8px', cursor: 'pointer' };
  return createPortal(<div style={{ width: '100%', boxSizing: 'border-box', padding: 10, background: night ? '#100f16ee' : '#102030ee', color: '#e4edf5', borderRadius: 8, font: '12px/1.5 system-ui', boxShadow: '0 2px 8px #0008' }}>
    <strong>WindFlow · OpenWeather</strong>
    <div style={{ color: "#fbbf24", marginTop: 4 }}>Pronóstico OpenWeather · independiente del viento NMEA / Simulator X</div>
    {!enabled ? <>
      <p style={{ margin: '6px 0' }}>Utiliza el servicio meteorológico seguro de GAULOS. Hasta 9 consultas por zona; caché de 30 min y límite local de 24 consultas/min. El acceso depende de su cuenta y cuota compartida.</p>
      <button style={button} onClick={() => setEnabled(true)}>Activar pronóstico</button>
    </> : <>
      <div role="status" aria-live="polite">{loading ? status : status || (!coverage ? 'Sin datos en esta vista' : field?.model)}</div>
      <button style={button} disabled={loading} onClick={() => setRefresh(value => value + 1)}>Reintentar</button>
      {field && frame && <>
        <div>{utc(frame.time)}</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button style={button} aria-label="Paso anterior" disabled={step === 0} onClick={() => setStep(value => value - 1)}>‹</button>
          <input aria-label="Paso de pronóstico disponible" type="range" min={0} max={field.frames.length - 1} step={1} value={step} onChange={event => setStep(Number(event.target.value))} style={{ flex: 1, minWidth: 0 }} />
          <button style={button} aria-label="Paso siguiente" disabled={step === field.frames.length - 1} onClick={() => setStep(value => value + 1)}>›</button>
        </div>
        <div>Paso {step + 1}/{field.frames.length} · {field.model}</div>
        <details>
          <summary>Fuente, cobertura y resolución</summary>
          <div>{field.source} · Recibido {utc(field.fetchedAt)}</div>
          <div>Muestreo {field.latitudes.length} × {field.longitudes.length} puntos consultados</div>
          <div>{field.latitudes[0].toFixed(2)}…{field.latitudes[field.latitudes.length - 1].toFixed(2)}° N · {field.longitudes[0].toFixed(2)}…{field.longitudes[field.longitudes.length - 1].toFixed(2)}° E</div>
          <div>Δ muestra: {spacing(field.latitudes)} lat / {spacing(field.longitudes)} lon</div>
          <div>Coordenadas de consulta, no celdas nativas del modelo. Sin extrapolación ni detalle costero. Modelo/ciclo no suministrados por esta API.</div>
        </details>
      </>}
      <button style={button} onClick={() => { setEnabled(false); setField(null); setCoverage(false); }}>Desactivar pronóstico</button>
    </>}
    <div style={{ height: 6, marginTop: 8, background: `linear-gradient(to right, ${[0, 10, 20, 30, 40, 50].map(value => `rgb(${windColor(value).join(',')})`).join(',')})` }} />
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>{[0, 10, 20, 30, 40, 50].map(value => <span key={value}>{value === 50 ? '50+' : value}</span>)}<span>kn</span></div>
    <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>Opacidad
      <input aria-label="Opacidad del gradiente" type="range" min={0} max={0.35} step={0.01} value={opacity} onChange={event => setOpacity(Number(event.target.value))} style={{ minWidth: 0, flex: 1 }} />
    </label>
    <label><input type="checkbox" checked={animate} onChange={event => setAnimate(event.target.checked)} /> Partículas</label>{' '}
    <label><input type="checkbox" checked={night} onChange={event => setNight(event.target.checked)} /> Noche</label>
    <div style={{ fontSize: 10 }}>Movimiento acelerado ilustrativo · no es viento NMEA</div>
    <a href="https://openweathermap.org/api/forecast5" target="_blank" rel="noreferrer" style={{ color: '#8ed4ff' }}>Datos de pronóstico por OpenWeather</a>
    <div style={{ fontSize: 10 }}>Velocidad/dirección en U/V con interpolación espacial; solo pasos devueltos por el proveedor (3 h). El panel meteorológico muestra condiciones actuales: puede diferir de la previsión seleccionada.</div>
  </div>, host);
}

function InstrumentWindFlow({ wind, controlsHost }: { wind: WindObservation; controlsHost: HTMLElement | null }) {
  const map = useMap();
  const [animate,setAnimate] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const windRef=useRef(wind);windRef.current=wind;
  const active=wind.source==='BOAT' && wind.tws!==null && wind.twd!==null;
  useEffect(() => {
    if(!active) return;
    return mountFlowCanvas(map, () => {
      const current=windRef.current;
      if(current.source!=='BOAT' || current.tws===null || current.twd===null) return null;
      const vector=fromMeteorological(current.tws/KNOTS_PER_MS,current.twd);
      return {east:vector.u,north:vector.v,value:current.tws};
    }, {opacity:.12,night:false,animate,onCoverage:()=>{},color:windColor});
  }, [map,active,animate]);
  if(!controlsHost) return null;
  return createPortal(<div className="space-y-2 rounded-lg bg-slate-950 p-3 text-xs text-slate-200">
    <strong>WindFlow · Instrumentos NMEA</strong>
    <p>TWS {wind.tws===null?'Sin datos':`${wind.tws.toFixed(1)} kn`} · TWD {wind.twd===null?'Sin datos':`${wind.twd.toFixed(0)}° T FROM`}</p>
    <p>AWS {wind.aws===null?'Sin datos':`${wind.aws.toFixed(1)} kn`} · AWA {wind.awa===null?'Sin datos':`${wind.awa.toFixed(0)}° relativa`}</p>
    <p className="text-cyan-300">Misma lectura que el panel meteorológico. Sin consultas a OpenWeather en este modo.</p>
    {wind.tws!==null && wind.twd!==null ? <label><input type="checkbox" checked={animate} onChange={e=>setAnimate(e.target.checked)}/> Partículas</label> : <p className="text-amber-200">Sin TWS y dirección verdadera vigentes no se dibujan partículas; el viento aparente no se convierte en real.</p>}
    <p className="text-slate-400">Lectura puntual de instrumentos, extendida uniformemente solo como ilustración. No representa un campo meteorológico medido ni una previsión espacial.</p>
  </div>,controlsHost);
}

export default function WindLayer({ visible, controlsHost = null, instrumentWind }: { visible: boolean; controlsHost?: HTMLElement | null; instrumentWind?: WindObservation }): React.ReactNode {
  if(!visible) return null;
  return instrumentWind && (instrumentWind.source==='BOAT' && instrumentWind.tws!==null && instrumentWind.twd!==null && Number.isFinite(instrumentWind.tws) && Number.isFinite(instrumentWind.twd)) ? <InstrumentWindFlow wind={instrumentWind} controlsHost={controlsHost}/> : <WindFlow controlsHost={controlsHost}/>;
}
