import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CircleMarker, useMap } from 'react-leaflet';
import type { MarineWeatherData } from '../../../lib/useMarineWeather';
import { mountFlowCanvas } from '../../weather/windflow/WindFlowCanvas';
import { marineRequest, openMeteoMarine, type MarineForecast } from '../../weather/marineflow/openMeteoMarine';
import { levelExtrema, levelSeries, marineColor, MARINE_LABELS, sampleMarine, type LevelPoint, type MarineFamily, type MarineMode } from '../../weather/marineflow/marineField';

interface MarineLayerProps {
  /** Kept for callers; forecast fields never replicate this point observation. */
  shipPosition: { lat: number; lng: number } | null;
  marineWeather: MarineWeatherData | null;
  showWaves: boolean;
  showCurrent: boolean;
  controlsHost?: HTMLElement | null;
}

const utc = (time: number): string => new Date(time).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
const spacing = (axis: number[]): string => {
  const deltas = axis.slice(1).map((value, index) => value - axis[index]);
  return `${Math.min(...deltas).toFixed(3)}–${Math.max(...deltas).toFixed(3)}°`;
};
const buttonStyle: React.CSSProperties = { background: '#20384a', color: '#e6f5ff', border: '1px solid #587487', borderRadius: 4, padding: '4px 7px', cursor: 'pointer' };

function LevelCurve({ series, selectedTime }: { series: LevelPoint[]; selectedTime: number }): React.ReactNode {
  const valid = series.filter((point): point is { time: number; value: number } => point.value !== null);
  if (!valid.length) return <div>Sin nivel modelado en este punto; seleccione un punto marino.</div>;
  const min = Math.min(...valid.map(point => point.value));
  const max = Math.max(...valid.map(point => point.value));
  const first = series[0].time;
  const duration = Math.max(1, series[series.length - 1].time - first);
  const x = (time: number) => 8 + (time - first) / duration * 284;
  const y = (value: number) => 66 - (value - min) / Math.max(0.1, max - min) * 48;
  let path = '';
  let previous: LevelPoint | null = null;
  for (const point of series) {
    if (point.value === null) { previous = null; continue; }
    path += `${previous && point.time - previous.time <= 3600000 ? 'L' : 'M'}${x(point.time).toFixed(1)},${y(point.value).toFixed(1)} `;
    previous = point;
  }
  return <>
    <svg role="img" aria-label="Curva horaria de nivel modelado sobre nivel medio del mar" viewBox="0 0 300 82" style={{ width: '100%', height: 90, display: 'block' }}>
      <title>Nivel total modelado; no tabla oficial de mareas</title>
      <text x={8} y={11} fill="#d4e8f5" fontSize={9}>{max.toFixed(2)} m MSL</text>
      <path d={path} fill="none" stroke="#67e8f9" strokeWidth={1.7} />
      <line x1={x(selectedTime)} x2={x(selectedTime)} y1={16} y2={68} stroke="#fbbf24" strokeDasharray="3 3" />
      <text x={8} y={79} fill="#d4e8f5" fontSize={9}>{min.toFixed(2)} m MSL</text>
    </svg>
    <div style={{ fontSize: 10 }}>{utc(first)} → {utc(series[series.length - 1].time)}</div>
  </>;
}

function MarineFlow({ showWaves, showCurrent, controlsHost }: Pick<MarineLayerProps, 'showWaves' | 'showCurrent' | 'controlsHost'>): React.ReactNode {
  const map = useMap();
  const modes: MarineMode[] = [...(showWaves ? ['waves' as const] : []), ...(showCurrent ? ['currents' as const, 'level' as const] : [])];
  const [selection, setSelection] = useState<MarineMode>(showWaves ? 'waves' : 'currents');
  const mode = modes.includes(selection) ? selection : modes[0];
  const family: MarineFamily = mode === 'waves' ? 'waves' : 'ocean';
  const [enabled, setEnabled] = useState(false);
  const [forecast, setForecast] = useState<MarineForecast | null>(null);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedTime, setSelectedTime] = useState<number | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [opacity, setOpacity] = useState(0.2);
  const [night, setNight] = useState(false);
  const [animate, setAnimate] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [coverage, setCoverage] = useState(false);
  const [point, setPoint] = useState(() => { const center = map.getCenter(); return { lat: center.lat, lon: center.lng }; });
  const onCoverage = useCallback((available: boolean) => setCoverage(available), []);
  const field = forecast?.[mode];
  const frames = field?.frames ?? [];
  const index = Math.max(0, frames.findIndex(frame => frame.time === selectedTime));
  const frame = frames[index];
  const series = useMemo(() => field?.mode === 'level' ? levelSeries(field, point.lat, point.lon) : [], [field, point]);
  const extrema = useMemo(() => levelExtrema(series), [series]);
  const sampled = field && frame ? sampleMarine(field, frame, point.lat, point.lon) : null;
  const bearing = sampled && mode !== 'level' && Math.hypot(sampled.east, sampled.north) > 1e-6
    ? ((Math.atan2(sampled.east, sampled.north) * 180 / Math.PI + (mode === 'waves' ? 180 : 0)) % 360 + 360) % 360 : null;

  useEffect(() => {
    if (!enabled) return;
    let controller: AbortController | null = null;
    let debounce: ReturnType<typeof setTimeout>;
    let disposed = false;
    const load = async () => {
      controller?.abort();
      const current = new AbortController(); controller = current;
      const timeout = window.setTimeout(() => current.abort(), 25000);
      setForecast(null); setCoverage(false); setLoading(true); setStatus('Cargando pronóstico marino…');
      try {
        const bounds = map.getBounds();
        const request = marineRequest({ south: bounds.getSouth(), north: bounds.getNorth(), west: bounds.getWest(), east: bounds.getEast() });
        const next = await openMeteoMarine.load(family, request, current.signal);
        if (!disposed && controller === current && !current.signal.aborted) { setForecast(next); setStatus(''); }
      } catch (error: unknown) {
        if (!disposed && controller === current) setStatus(current.signal.aborted ? 'Tiempo de espera agotado; reintente' : error instanceof Error ? error.message : 'Error de pronóstico marino');
      } finally {
        window.clearTimeout(timeout);
        if (!disposed && controller === current) setLoading(false);
      }
    };
    const stop = () => { controller?.abort(); controller = null; clearTimeout(debounce); };
    const schedule = () => {
      stop(); setForecast(null); setCoverage(false);
      debounce = setTimeout(() => { void load(); }, 650);
    };
    map.on('movestart', stop); map.on('moveend', schedule);
    const interval = window.setInterval(schedule, 30 * 60000);
    void load();
    return () => { disposed = true; stop(); window.clearInterval(interval); map.off('movestart', stop); map.off('moveend', schedule); };
  }, [map, enabled, family, refresh]);

  useEffect(() => {
    setCoverage(false);
    if (!field || !frame) return;
    return mountFlowCanvas(map, (lat, lon) => sampleMarine(field, frame, lat, lon), {
      opacity, night, animate: animate && mode !== 'level', onCoverage,
      paneName: 'marineFlowPane', color: value => marineColor(mode, value),
      motion: mode === 'waves' ? 'crests' : mode === 'currents' ? 'particles' : 'none',
      speedMultiplier: mode === 'waves' ? 8 : 12
    });
  }, [map, field, frame, mode, opacity, night, animate, onCoverage]);

  const ticks = mode === 'waves' ? [0, 1, 2, 3, 4, 5, 6] : mode === 'currents' ? [0, 0.5, 1, 1.5, 2, 2.5, 3] : [-2, -1, 0, 1, 2];
  const units = mode === 'currents' ? 'kn' : mode === 'waves' ? 'm Hs' : 'm MSL';
  const panel = <section aria-label="MarineFlow · oleaje, nivel y corrientes" style={{ padding: 10, background: night ? '#110f19' : '#102b3a', color: '#e4f2fa', font: '12px/1.5 system-ui', borderRadius: 8, width: '100%', boxSizing: 'border-box' }}>
    <strong>MarineFlow</strong>
    <label style={{ display: 'block', margin: '6px 0' }}>Magnitud marina
      <select aria-label="Magnitud marina" value={mode} onChange={event => setSelection(event.target.value as MarineMode)} style={{ display: 'block', width: '100%', background: '#17394a', color: '#edf8ff', padding: 5 }}>
        {modes.map(value => <option value={value} key={value}>{MARINE_LABELS[value]}</option>)}
      </select>
    </label>
    {!enabled ? <>
      <div>Pronóstico multipunto Open-Meteo / Copernicus Marine. Acceso público solo para uso no comercial.</div>
      <button style={buttonStyle} onClick={() => setEnabled(true)}>Activar pronóstico marino no comercial</button>
    </> : <>
      <div role="status" aria-live="polite">{status || (!frame ? 'Sin pasos con celdas marinas válidas' : !coverage ? 'Sin datos marinos en esta vista' : MARINE_LABELS[mode])}</div>
      <button style={buttonStyle} disabled={loading} onClick={() => setRefresh(value => value + 1)}>Reintentar consulta marina</button>
      {frame && <>
        <div>{utc(frame.time)}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button style={buttonStyle} disabled={index === 0} aria-label="Paso marino anterior" onClick={() => setSelectedTime(frames[index - 1].time)}>‹</button>
          <input style={{ flex: 1, minWidth: 0 }} type="range" aria-label="Paso de pronóstico marino disponible" min={0} max={frames.length - 1} step={1} value={index} onChange={event => setSelectedTime(frames[Number(event.target.value)].time)} />
          <button style={buttonStyle} disabled={index === frames.length - 1} aria-label="Paso marino siguiente" onClick={() => setSelectedTime(frames[index + 1].time)}>›</button>
        </div>
        <div>Paso {index + 1}/{frames.length}</div>
      </>}
    </>}
    <div style={{ height: 7, marginTop: 8, background: `linear-gradient(to right, ${ticks.map(value => `rgb(${marineColor(mode, value).join(',')})`).join(',')})` }} />
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>{ticks.map(value => <span key={value}>{mode === 'level' ? (value === -2 ? '≤−2' : value === 2 ? '≥2' : value) : value === ticks[ticks.length - 1] ? value + '+' : value}</span>)}<span>{units}</span></div>
    <label style={{ display: 'flex', gap: 5, alignItems: 'center' }}>Opacidad
      <input style={{ flex: 1, minWidth: 0 }} aria-label="Opacidad marina" type="range" min={0} max={0.35} step={0.01} value={opacity} onChange={event => setOpacity(Number(event.target.value))} />
    </label>
    {mode !== 'level' && <label><input type="checkbox" checked={animate} onChange={event => setAnimate(event.target.checked)} /> Animación marina</label>}{' '}
    <label><input type="checkbox" checked={night} onChange={event => setNight(event.target.checked)} /> Noche marina</label>
    {frame && field && <>
      <div style={{ marginTop: 6 }}>Punto {point.lat.toFixed(3)}°, {point.lon.toFixed(3)}°</div>
      <button style={buttonStyle} onClick={() => { const center = map.getCenter(); setPoint({ lat: center.lat, lon: center.lng }); }}>Consultar centro del mapa</button>
      <div>{sampled ? `${sampled.value.toFixed(2)} ${units}${sampled.period ? ` · T ${sampled.period.toFixed(1)} s` : ''}${bearing !== null ? ` · ${Math.round(bearing) % 360}°T ${mode === 'waves' ? 'de' : 'hacia'}` : ''}` : 'Sin datos en el punto seleccionado'}</div>
      {mode === 'level' && <>
        <LevelCurve series={series} selectedTime={frame.time} />
        <div style={{ fontSize: 10 }}>Próximos extremos horarios del nivel modelado:</div>
        {extrema.filter(value => value.time >= frame.time).slice(0, 4).map(value => <div key={value.time} style={{ fontSize: 10 }}>{value.kind === 'max' ? 'Máximo' : 'Mínimo'} {utc(value.time)} · {value.value.toFixed(2)} m MSL</div>)}
        <div style={{ color: '#fde68a', fontSize: 10 }}>No son pleamares/bajamares oficiales. Resolución horaria; no usar para calado o UKC.</div>
      </>}
      <details style={{ marginTop: 6 }}><summary>Fuente y cobertura marina</summary>
        <div>{field.model} · {field.source}</div>
        <div>Recibido {utc(field.fetchedAt)} · ciclo no suministrado</div>
        <div>{field.latitudes.length}×{field.longitudes.length} muestras · interpolación espacial solo con cuatro celdas válidas</div>
        <div>Δ real: {spacing(field.latitudes)} lat / {spacing(field.longitudes)} lon</div>
        <div>Lat {field.latitudes[0].toFixed(3)}…{field.latitudes[field.latitudes.length - 1].toFixed(3)}° · Lon {field.longitudes[0].toFixed(3)}…{field.longitudes[field.longitudes.length - 1].toFixed(3)}°</div>
        <div>Pasos solicitados desde 0,125°; muestreo más grueso en vistas amplias. Pasos horarios del proveedor, sin interpolación temporal añadida.</div>
      </details>
    </>}
    <p style={{ margin: '6px 0', fontSize: 10, color: '#fde68a' }}>{mode === 'level' ? 'Nivel total sobre MSL: incluye marea y otros efectos. No es altura sobre cero de carta/LAT.' : mode === 'currents' ? 'Corriente superficial total: incluye marea, circulación y oleaje. No es corriente de marea aislada.' : 'Frentes simbólicos a partir de dirección media y periodo. No representan fase ni crestas reales.'}</p>
    <div style={{ fontSize: 10 }}>Resolución limitada cerca de costa; no apto para navegación costera. Pronóstico, no medición de a bordo. Movimiento acelerado ilustrativo.</div>
    <a style={{ color: '#8ed4ff' }} href="https://open-meteo.com/" target="_blank" rel="noreferrer">Weather data by Open-Meteo.com</a>{' · '}
    <a style={{ color: '#8ed4ff' }} href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>
    <div style={{ fontSize: 10 }}>Datos convertidos e interpolados espacialmente. Acceso comercial requiere servicio autorizado.</div>
  </section>;
  return <>
    {controlsHost ? createPortal(panel, controlsHost) : null}
    {field && frame && <CircleMarker center={[point.lat, point.lon]} radius={4} interactive={false} pathOptions={{ color: '#fbbf24', weight: 1, fillOpacity: 0.2 }} />}
  </>;
}

/** A modeled field replaces both old single-point arrow grids. */
export default function MarineLayer(props: MarineLayerProps): React.ReactNode {
  return props.showWaves || props.showCurrent ? <MarineFlow showWaves={props.showWaves} showCurrent={props.showCurrent} controlsHost={props.controlsHost} /> : null;
}
