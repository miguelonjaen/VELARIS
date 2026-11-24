import React, { useId, useState } from 'react';
import { Gauge, Thermometer, Droplets, Waves, BatteryCharging, Clock, Activity, type LucideIcon } from 'lucide-react';
import type { BoatInstrumentSnapshot } from '../../core/instruments/BoatInstrumentStore';
import { currentValue } from './boatVisualModel';
import { engineVisualModel } from './engineVisualModel';
import './engineOverview.css';
const format = (value:number|null,unit:string,digits=1) => value === null ? 'Sin datos' : `${value.toLocaleString('es-ES',{minimumFractionDigits:digits,maximumFractionDigits:digits})} ${unit}`;
function EngineDrawing() {
  const id=useId().replace(/:/g,'');
  return <svg viewBox="0 0 600 400" className="en-drawing" role="img" aria-label="Ilustración técnica genérica de motor marino; no representa un modelo o circuito instalado">
    <defs>
      <linearGradient id={`${id}-block`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#467487"/><stop offset=".5" stopColor="#1b4055"/><stop offset="1" stopColor="#0e2335"/></linearGradient>
      <linearGradient id={`${id}-top`}><stop stopColor="#b7ced8"/><stop offset=".25" stopColor="#50798a"/><stop offset=".7" stopColor="#8eb0bf"/><stop offset="1" stopColor="#2a4f65"/></linearGradient>
      <linearGradient id={`${id}-metal`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#adc8d8"/><stop offset=".4" stopColor="#31566b"/><stop offset="1" stopColor="#102737"/></linearGradient>
      <radialGradient id={`${id}-halo`}><stop stopColor="#10a8ce" stopOpacity=".17"/><stop offset="1" stopColor="#041321" stopOpacity="0"/></radialGradient>
    </defs>
    <ellipse cx="298" cy="222" rx="280" ry="170" fill={`url(#${id}-halo)`}/>
    <g stroke="#1c4056" strokeWidth=".7" fill="none"><path d="M35 335 H565 M300 26 V365" strokeDasharray="4 7"/><ellipse cx="300" cy="337" rx="191" ry="24"/><path d="M44 318 L269 196 L559 304" opacity=".5"/></g>
    <g stroke="#759bad" strokeLinejoin="round" strokeWidth="1.5">
      <path d="M150 307 L343 335 L461 283 L272 259Z" fill="#10283a"/>
      <path d="M155 308 V326 L346 352 V334Z M346 334 V352 L459 299 V283" fill="#092032"/>
      <path d="M170 154 L343 179 V314 L169 286Z" fill={`url(#${id}-block)`}/>
      <path d="M343 179 L436 131 V271 L343 314Z" fill="#16364a"/>
      <path d="M170 154 L263 104 L436 131 L343 179Z" fill={`url(#${id}-top)`}/>
      <path d="M177 141 L261 96 L421 119 L339 165Z" fill="#26495b"/>
      {[0,1,2,3].map(i=><g key={i} transform={`translate(${i*38} ${i*5.5})`}><path d="M182 127 L255 89 L280 94 L207 133Z" fill={`url(#${id}-metal)`}/><path d="M182 127 V141 L207 147 V133Z" fill="#31576a"/><path d="M207 133 L280 94 V108 L207 147Z" fill="#19364b"/></g>)}
      <path d="M188 192 L320 212 V237 L188 217Z" fill="#172e41"/>
      <path d="M197 196 L197 163 M232 201 L232 168 M267 207 L267 174 M302 213 L302 180" stroke="#a1b8c5" strokeWidth="9" fill="none"/>
      <path d="M188 192 L320 212" stroke="#3d687c" strokeWidth="5"/>
      <path d="M328 241 L350 249 L352 301 L327 293Z" fill="#0d2637"/>
      <ellipse cx="364" cy="264" rx="47" ry="63" fill={`url(#${id}-metal)`} transform="rotate(15 364 264)"/>
      <ellipse cx="365" cy="264" rx="33" ry="46" fill="#0c2030" transform="rotate(15 365 264)"/>
      <ellipse cx="365" cy="264" rx="12" ry="18" fill="#6c92a3" transform="rotate(15 365 264)"/>
      <path d="M356 222 L374 306 M337 251 L392 276 M343 286 L385 241" stroke="#3a6073" strokeWidth="3"/>
      <path d="M214 250 V288 Q214 299 226 300 Q239 300 239 290 V254Z" fill={`url(#${id}-metal)`}/>
      <ellipse cx="226" cy="251" rx="12" ry="5" fill="#7ca5b8"/>
      <path d="M253 255 V294 Q253 305 265 306 Q278 306 278 296 V259Z" fill={`url(#${id}-metal)`}/>
      <ellipse cx="265" cy="257" rx="12" ry="5" fill="#7ca5b8"/>
      <path d="M393 191 L423 177 L447 197 L419 213Z M419 213 V244 L447 228 V197" fill={`url(#${id}-metal)`}/>
      <ellipse cx="410" cy="225" rx="19" ry="25" fill="#132e40"/>
      <ellipse cx="410" cy="225" rx="8" ry="12" fill="#739bad"/>
      <path d="M385 182 Q459 141 468 176 V223 Q469 238 450 245" fill="none" stroke="#6893a7" strokeWidth="10"/>
      <path d="M188 247 H146 Q131 247 132 264 V288" fill="none" stroke="#426b80" strokeWidth="11"/>
      <path d="M191 303 L177 319 M315 324 L302 342 M430 284 L443 298" stroke="#a2bdc9" strokeWidth="6"/>
      {[188,222,256,290,324].map((x,i)=><circle key={x} cx={x} cy={230+i*5} r="3" fill="#b3cdd9"/>)}
    </g>
    <g fill="none" stroke="#4f8ba4" strokeWidth="1" opacity=".65"><path d="M218 116 L132 75 H63"/><path d="M228 277 L128 291 H55"/><path d="M429 219 L496 174 H555"/><path d="M365 286 L465 322 H550"/><circle cx="218" cy="116" r="3"/><circle cx="228" cy="277" r="3"/><circle cx="429" cy="219" r="3"/><circle cx="365" cy="286" r="3"/></g>
    <text x="300" y="385" textAnchor="middle" fill="#65869c" fontSize="10" letterSpacing="2">ILUSTRACIÓN GENÉRICA · SIN ESCALA</text>
  </svg>;
}
function Metric({label,value,detail,icon:Icon}:{label:string;value:string;detail:string;icon:LucideIcon}) {
  return <article className="en-metric"><div><Icon size={19}/><h4>{label}</h4></div><strong>{value}</strong><small>{detail}</small></article>;
}
export function EngineOverview({instruments}:{instruments:BoatInstrumentSnapshot}) {
  const [selectedId,setSelectedId]=useState<number|null>(null);
  const engine=instruments.engines.find(item=>item.engine===selectedId) ?? instruments.engines[0] ?? null;
  const model=engineVisualModel(engine);
  return <section className="en-overview" aria-label="Monitor gráfico de motores">
    <header className="en-header"><div><span>PROPULSIÓN / MONITOR DE SENSORES</span><h3>{engine ? `Motor ID ${engine.engine}` : 'Motor · sin identificar'}</h3></div><div className="en-header-controls">{instruments.engines.length>1 && <label>Motor<select value={engine?.engine} onChange={event=>setSelectedId(Number(event.target.value))}>{instruments.engines.map(item=><option key={item.engine} value={item.engine}>ID {item.engine}</option>)}</select></label>}<span className="en-state" data-running={model.rpm!==null && model.rpm!==0}><i/>{model.state}</span></div></header>
    <div className="en-layout">
      <div className="en-metrics"><Metric label="Temperatura" value={format(model.temperature,'°C',0)} detail="Lectura de temperatura del motor" icon={Thermometer}/><Metric label="Presión de aceite" value={format(model.oil,'bar')} detail="Presión medida · sin umbral configurado" icon={Droplets}/><Metric label="Horas de motor" value="Sin datos" detail="Sin contador de horas en la telemetría actual" icon={Clock}/></div>
      <div className="en-center"><div className="en-rpm"><Gauge size={22}/><span>RÉGIMEN DEL MOTOR</span><strong>{format(model.rpm,'rpm',0)}</strong><small>{model.rpm===null ? 'Sin RPM vigentes' : 'Instrumentos del barco · lectura vigente'}</small></div><EngineDrawing/></div>
      <div className="en-metrics"><Metric label="Refrigeración" value="Sin datos" detail="Sin sensor específico de caudal o presión" icon={Waves}/><Metric label="Alternador asociado" value="Sin datos" detail="La lectura común no identifica este motor" icon={BatteryCharging}/><Metric label="Estado medido" value={model.state} detail="Estado obtenido solo de RPM vigentes" icon={Activity}/></div>
    </div>
    <div className="en-bottom"><BatteryCharging size={23}/><div><span>Alternador · lectura común</span><strong>{format(currentValue(instruments.alternatorVolts),'V',2)}</strong></div><p>Tensión sin asociación a un motor concreto. No confirma carga activa.</p></div>
    <p className="en-caption">Solo se muestran mediciones vigentes. La ilustración no identifica marca, modelo ni circuitos instalados; no se deduce refrigeración, lubricación correcta o carga del alternador a partir de las RPM.</p>
  </section>;
}
