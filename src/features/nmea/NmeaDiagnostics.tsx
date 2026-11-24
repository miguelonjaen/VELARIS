import { LIGHT_CIRCUITS } from '../../core/instruments/BoatInstrumentStore';
import { relayLabel } from '../boat/boatVisualModel';
import React from 'react';
import { app } from '../../application';
export function NmeaDiagnostics() {
  const now=Date.now(), nav=app.navigationState.snapshot(now), instruments=app.boatInstruments.snapshot(now);
  const rows=app.electronTelemetry.diagnostics();
  const fmt=(n:number|null|undefined,unit='')=>n==null?'Sin datos':`${n.toFixed(2)} ${unit}`;
  return <details className="mt-3 rounded-xl border border-slate-700 p-3 text-xs text-slate-300"><summary>Diagnóstico NMEA · datos recibidos y utilizados</summary>
    <p className="my-2">Posición usada: {nav.position.value?`${nav.position.value.lat.toFixed(6)}, ${nav.position.value.lng.toFixed(6)}`:'Sin posición'} · Fuente {nav.position.source??'ninguna'}</p>
    <p>SOG {fmt(nav.sog.value,'kn')} · COG {fmt(nav.cog.value,'°T')} · STW {fmt(instruments.speedThroughWater?.value,'kn')}</p>
    <p>HDG verdadero {fmt(nav.headingTrue.value,'°T')} · HDG magnético {fmt(nav.headingMagnetic.value,'°M')}</p>
    <p>Profundidad {fmt(instruments.depth?.value.meters,'m')} · referencia {instruments.depth?.value.reference??'desconocida'}</p>
    <p>Viento aparente {fmt(instruments.windApparent?.value.speedKn,'kn')} / {fmt(instruments.windApparent?.value.angleDeg,'° rel.')}</p>
    <p>Viento real {fmt(instruments.windDirectionTrue?.value.speedKn??instruments.windTrue?.value.speedKn,'kn')} · TWD {fmt(instruments.windDirectionTrue?.value.directionDeg,'°T')}</p>
    {instruments.engines.map(e=><p key={e.engine}>Motor {e.engine}: {fmt(e.rpm?.value,'rpm')} · {fmt(e.temperatureC?.value,'°C')} · {fmt(e.oilPressureBar?.value,'bar')}</p>)}
    <p>Solar 0 paneles: {fmt(instruments.solar?.pvVolts?.value,'V')} · {fmt(instruments.solar?.pvAmps?.value,'A')} · salida MPPT: {fmt(instruments.solar?.outputVolts?.value,'V')} · {fmt(instruments.solar?.outputAmps?.value,'A')}</p>
    {instruments.lights?.map(light => <p key={light.circuit}>Luces {LIGHT_CIRCUITS[light.circuit]}: {relayLabel(light.relay)}</p>)}
    <table className="mt-3 w-full text-left"><thead><tr><th>Canal / Tipo</th><th>Recibidos</th><th>Edad</th></tr></thead><tbody>{rows.map(row=><tr key={`${row.channel}:${row.type}:${row.detail}`}><td>{row.channel} · {row.type} {row.detail}</td><td>{row.count}</td><td>{Math.max(0,Math.round((now-row.at)/1000))} s</td></tr>)}</tbody></table>
    <p className="mt-2 text-amber-200">RAW: sentencia recibida todavía no interpretada. NMEA_INVALID: rechazada por validación. Un ensayo de ruta usa su propia posición virtual; «Mostrar GPS NMEA recibido» vuelve al receptor.</p>
  </details>;
}
