import React, { useId } from 'react';
import { Droplets, Fuel, Waves, ShowerHead } from 'lucide-react';
import type { BoatInstrumentSnapshot, TankKind } from '../../core/instruments/BoatInstrumentStore';
import { tankVisuals, TANK_NAMES } from './boatVisualModel';
import './tankOverview.css';

const TYPES = ['freshWater', 'fuel', 'blackWater', 'greyWater'] as const;
const COLORS: Record<TankKind, string> = { freshWater: '#00c9ff', fuel: '#f3c516', blackWater: '#3fe36c', greyWater: '#a7becb' };
const ICONS = { freshWater: Droplets, fuel: Fuel, blackWater: Waves, greyWater: ShowerHead } as const;
type VisualTank = ReturnType<typeof tankVisuals>[number];

/** An illustration, not the vessel's measured compartment layout. No pipe/activity inferred. */
function VesselCutaway({ tanks }: { tanks: readonly VisualTank[] }) {
  const id = useId().replace(/:/g, '');
  return <svg viewBox="0 0 520 260" role="img" aria-label="Perfil ilustrativo de un velero; posiciones de depósitos no configuradas" className="tk-vessel-svg">
    <defs>
      <linearGradient id={`${id}-hull`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#f1f8ff"/><stop offset=".2" stopColor="#6b9bb0"/><stop offset=".42" stopColor="#e6f4ff"/><stop offset=".65" stopColor="#16364d"/><stop offset="1" stopColor="#0c2337"/></linearGradient>
      <linearGradient id={`${id}-deck`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#c7e2f1"/><stop offset="1" stopColor="#224154"/></linearGradient>
      <linearGradient id={`${id}-glass`}><stop stopColor="#244f69"/><stop offset=".5" stopColor="#091927"/><stop offset="1" stopColor="#4f99b6"/></linearGradient>
      <radialGradient id={`${id}-glow`}><stop stopColor="#0d8fc4" stopOpacity=".24"/><stop offset="1" stopColor="#001020" stopOpacity="0"/></radialGradient>
    </defs>
    <ellipse cx="270" cy="211" rx="247" ry="44" fill={`url(#${id}-glow)`}/>
    <g stroke="#7fabc4" fill="none" strokeWidth="1" opacity=".75"><path d="M177 4 L141 151 M177 4 L341 157 M178 34 L41 152 M180 9 L450 164"/><path d="M45 154 L26 116 M49 156 L52 122 M91 154 L93 119 M132 151 L134 115 M361 157 L361 120 M405 163 L405 128 M451 169 L451 133 M489 175 L489 141"/><path d="M25 116 Q236 104 491 141 M27 129 Q238 117 490 153"/></g>
    <path d="M175 3 L181 3 L184 143 L177 146Z" fill={`url(#${id}-deck)`}/><path d="M179 48 L364 48 L364 54 L179 54Z" fill={`url(#${id}-deck)`} stroke="#b1d5e9"/>
    <path d="M61 146 L153 135 L247 118 L330 127 L363 147 L469 166 L484 178 L90 176Z" fill={`url(#${id}-deck)`} stroke="#84b9ce" strokeWidth="1.5"/>
    <path d="M149 136 L191 119 L245 113 L297 119 L316 141Z" fill={`url(#${id}-glass)`} stroke="#b5e6fa" strokeWidth="2"/>
    <path d="M166 133 L193 124 L233 120 L231 135Z M242 120 L269 123 L285 138 L242 136Z" fill="#062234" stroke="#65abc3"/>
    <path d="M302 127 L323 128 L345 145 L319 143Z" fill="#32657c" stroke="#a8cce0"/>
    <path d="M18 154 Q143 145 237 154 L492 181 Q469 218 400 229 L109 224 Q56 214 18 154Z" fill={`url(#${id}-hull)`} stroke="#7da8bc" strokeWidth="1.5"/>
    <path d="M32 163 Q177 159 267 170 L480 188" fill="none" stroke="#d7efff" strokeWidth="2"/>
    <path d="M63 201 Q270 229 468 205" fill="none" stroke="#28beee" strokeWidth="1.6" opacity=".7"/>
    <path d="M80 176 Q270 176 456 197 L430 217 Q273 231 104 212Z" fill="#061421" fillOpacity=".85" stroke="#31586d"/>
    <g stroke="#88b4c9" strokeWidth="1" fill="#112c40"><rect x="104" y="168" width="34" height="5" rx="2"/><rect x="155" y="171" width="34" height="5" rx="2"/><rect x="206" y="175" width="34" height="5" rx="2"/><rect x="391" y="188" width="31" height="4" rx="2"/></g>
    {tanks.slice(0, 4).map((tank, index) => {
      const x = 110 + index * 80, y = 185;
      return <g key={`${tank.kind}:${tank.name}`}><rect x={x} y={y} width="62" height="31" rx="5" fill="#0a1928" stroke="#89aebf" strokeWidth="1.4"/>{tank.percent !== null && tank.percent > 0 && <rect x={x+2} y={y+29-tank.percent*.27} width="58" height={tank.percent*.27} rx="3" fill={COLORS[tank.kind]} opacity=".8"/>}<path d={`M${x+23} ${y}v-5h16v5`} stroke="#9abacb" fill="none"/></g>;
    })}
    <path d="M17 238 Q160 244 262 238 T502 239" stroke="#27a9df" strokeWidth=".7" opacity=".35" fill="none"/>
  </svg>;
}
function TankGauge({ percent, kind, name }: { percent: number | null; kind: TankKind; name: string }) {
  const id = useId().replace(/:/g, '');
  const surface = 112 - (percent ?? 0) * .87;
  const outline = 'M29 19 Q16 20 16 32 V109 Q16 119 27 119 H72 Q83 119 83 109 V32 Q83 20 70 19 Q49 15 29 19Z';
  return <svg viewBox="0 0 100 135" role="img" aria-label={`${name}: ${percent === null ? 'sin datos' : `${percent.toFixed(0)} por ciento`}`} className="tk-gauge">
    <defs><clipPath id={`${id}-clip`}><path d={outline}/></clipPath><linearGradient id={`${id}-liquid`} x1="0" y1="0" x2="0" y2="1"><stop stopColor={COLORS[kind]}/><stop offset="1" stopColor={COLORS[kind]} stopOpacity=".35"/></linearGradient><linearGradient id={`${id}-metal`}><stop stopColor="#486376"/><stop offset=".5" stopColor="#d5efff"/><stop offset="1" stopColor="#537487"/></linearGradient></defs>
    <path d="M34 17 V11 Q34 9 38 9 H61 Q65 9 65 11 V17" fill="#122b3b" stroke={`url(#${id}-metal)`} strokeWidth="2"/>
    <path d={outline} fill="#081826" stroke={`url(#${id}-metal)`} strokeWidth="2"/>
    {percent !== null && percent > 0 && <g clipPath={`url(#${id}-clip)`}><path d={`M14 ${surface} Q32 ${surface-4} 49 ${surface} T86 ${surface} V125 H14Z`} fill={`url(#${id}-liquid)`}/><path d={`M14 ${surface} Q32 ${surface-4} 49 ${surface} T86 ${surface}`} stroke={COLORS[kind]} strokeWidth="2"/></g>}
    <path d="M22 34h8 M22 50h8 M22 66h8 M22 82h8 M22 98h8" stroke="#a7c8db" strokeWidth="1.2" opacity=".8"/>
    <path d="M19 28 Q20 22 30 22" fill="none" stroke="#e3f6ff" opacity=".7"/><path d="M79 32 V106" stroke="#c8e9ff" opacity=".15"/>
    {percent === null && <text x="50" y="76" textAnchor="middle" fill="#8ba2b6" fontSize="21">—</text>}
  </svg>;
}
export function TankOverview({ instruments }: { instruments: BoatInstrumentSnapshot }) {
  const tanks = tankVisuals(instruments);
  return <div className="tk-overview">
    <figure className="tk-vessel"><VesselCutaway tanks={tanks}/><figcaption>Perfil ilustrativo · ubicación de depósitos no configurada</figcaption></figure>
    <div className="tk-cards">{TYPES.flatMap(kind => {
      const matching = tanks.filter(tank => tank.kind === kind);
      const entries: readonly (VisualTank | null)[] = matching.length ? matching : [null];
      return entries.map((tank, index) => {const Icon = ICONS[kind]; const percent = tank?.percent ?? null;
        return <article className="tk-card" data-kind={kind} data-identified={Boolean(tank)} key={`${kind}:${tank?.name ?? index}`}>
          <h3><Icon size={20} style={{color:COLORS[kind]}}/>{TANK_NAMES[kind]}</h3>
          {tank && <p className="tk-sensor-name" title={tank.name}>{tank.name}</p>}
          <div className="tk-reading"><TankGauge percent={percent} kind={kind} name={tank?.name ?? TANK_NAMES[kind]}/><div><span className="tk-litres">Sin datos<small>Volumen</small></span><strong>{percent === null ? '—' : percent.toFixed(0)}<span>{percent === null ? '' : ' %'}</span></strong></div></div>
          <p className="tk-capacity">Capacidad: <span>sin configurar</span></p>
          <p className="tk-source">{tank ? 'Instrumentos · lectura vigente' : 'Sin depósito identificado'}</p>
        </article>;
      });
    })}</div>
  </div>;
}
