import batteryCase from './assets/battery-case-marine.png';
import React, { useId, useState } from 'react';
import type { Bank, Battery, Component, Tank } from './model';

interface Props {
  equipment: readonly (Battery | Tank)[];
  topology?: Bank['topology'];
  disabled: boolean;
  onEdit: (component: Component) => void;
}

const short = (value: string, limit = 24) => value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
const nominal = (value: number | null, unit: string) => value === null ? `— ${unit}` : `${value.toLocaleString('es-ES')} ${unit}`;

/** Fixed equipment drawing: every body, terminal and declared connection is live SVG. */
export function EquipmentSchematic({ equipment, topology, disabled, onEdit }: Props) {
  const id = useId().replace(/:/g, '');
  const [artworkReady,setArtworkReady] = useState(false);
  const columns = Math.min(3, Math.max(1, equipment.length));
  const rows = Math.ceil(equipment.length / columns);
  const hasTanks = equipment.some(item => item.kind === 'tank');
  const position = (index: number) => ({ x: 24 + index % columns * 250, y: 14 + Math.floor(index / columns) * 260 });
  return <svg className="iv-hardware" viewBox={`0 0 ${columns * 250 + 48} ${Math.max(hasTanks ? 275 : 250, rows * 260 + (hasTanks ? 15 : -10))}`} role="group" data-artwork-ready={artworkReady} aria-label="Equipos y conexiones declaradas" style={{ minHeight: rows > 2 ? rows * 180 : undefined }}>
    <defs>
      <linearGradient id={`${id}-case`} x2="0" y2="1"><stop stopColor="#334b60"/><stop offset=".15" stopColor="#122b40"/><stop offset=".8" stopColor="#071625"/><stop offset="1" stopColor="#30475a"/></linearGradient>
      <linearGradient id={`${id}-metal`} x2="0" y2="1"><stop stopColor="#d7e5e9"/><stop offset=".15" stopColor="#526e7e"/><stop offset=".5" stopColor="#9bb1bd"/><stop offset="1" stopColor="#244456"/></linearGradient>
      <linearGradient id={`${id}-water`} x2="0" y2="1"><stop stopColor="#43d8f5"/><stop offset="1" stopColor="#08728f"/></linearGradient>
      <linearGradient id={`${id}-red-wire`} x2="0" y2="1"><stop stopColor="#a12c27"/><stop offset=".45" stopColor="#ff9580"/><stop offset=".7" stopColor="#f35240"/><stop offset="1" stopColor="#7c241f"/></linearGradient>
      <linearGradient id={`${id}-blue-wire`} x2="0" y2="1"><stop stopColor="#0d5377"/><stop offset=".45" stopColor="#80e8ff"/><stop offset=".7" stopColor="#21abd9"/><stop offset="1" stopColor="#0b4668"/></linearGradient>
      <pattern id={`${id}-unknown`} width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="10" fill="#547283" opacity=".25"/></pattern>
    </defs>
    {(topology === 'series' || topology === 'parallel') && equipment.slice(1).map((item, index) => {
      const a = position(index), b = position(index + 1);
      return <g key={`wire-${item.id}`} aria-label={topology === 'series' ? 'Unión serie declarada: negativo a positivo' : 'Unión paralelo declarada: bornes de igual polaridad'}>
        {(topology === 'series' ? [0] : [0, 1]).map(polarity => {
          const startX = a.x + (topology === 'series' || polarity === 1 ? 180 : 50);
          const endX = b.x + (polarity === 1 ? 180 : 50);
          const routeY = Math.min(a.y, b.y) + (polarity ? 9 : -7);
          const direction = endX >= startX ? 1 : -1;
          return <path key={polarity} d={`M${startX} ${a.y + 42} V${routeY+10} Q${startX} ${routeY} ${startX+direction*10} ${routeY} H${endX-direction*10} Q${endX} ${routeY} ${endX} ${routeY+10} V${b.y + 42}`} fill="none" stroke={`url(#${id}-${polarity || topology==='series' ? 'blue' : 'red'}-wire)`} strokeWidth="7" strokeLinejoin="round"/>;
        })}
      </g>;
    })}
    {equipment.map((item, index) => {
      const p = position(index);
      const percentage = item.kind === 'tank' ? item.level.value : item.soc.value;
      return <g key={item.id} transform={`translate(${p.x} ${p.y})`} role="button" tabIndex={disabled ? -1 : 0} aria-disabled={disabled} aria-label={`Editar ${item.name}`} className="iv-hardware-item"
        onClick={() => { if (!disabled) onEdit(item); }} onKeyDown={event => { if (!disabled && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onEdit(item); } }}>
        <title>{item.name} · pulsar para editar</title>
        <ellipse cx="120" cy="222" rx="113" ry="13" fill="#000" opacity=".55"/>
        {item.kind === 'battery' ? <>
          <g opacity={artworkReady ? 0 : 1}><path d="M7 213H222L235 225H0Z" fill="#506a7b" stroke="#7993a2"/>
          <path d="M210 62L225 43V191L210 205Z" fill="#3b5367" stroke="#8ca4b0"/>
          <path d="M12 62L30 43H225L210 62Z" fill={`url(#${id}-metal)`} stroke="#a7bdc9"/>
          <rect x="12" y="62" width="198" height="144" rx="8" fill={`url(#${id}-case)`} stroke="#7e9aaa" strokeWidth="2"/>
          <rect x="23" y="72" width="10" height="123" rx="3" fill="#526d7d"/><rect x="191" y="72" width="10" height="123" rx="3" fill="#526d7d"/>
          <path d="M42 80H181M42 182H181" stroke="#36b6d4" opacity=".5"/>
          </g><image href={batteryCase} x="-4" y="0" width="240" height="240" preserveAspectRatio="xMidYMid meet" aria-hidden="true" onLoad={()=>setArtworkReady(true)} onError={()=>setArtworkReady(false)}/>
          {[50, 180].map((x, terminal) => <g key={x}><rect x={x - 14} y="38" width="28" height="24" rx="5" fill={`url(#${id}-metal)`}/><circle cx={x} cy="35" r="16" fill={terminal ? '#19354d' : '#b62d35'} stroke={terminal ? '#89bce1' : '#ff9d9e'} strokeWidth="2"/><text x={x} y="41" textAnchor="middle" fill="white" fontSize="23" fontWeight="700">{terminal ? '−' : '+'}</text></g>)}
          <text x="112" y="109" textAnchor="middle" fill="#f1f8ff" fontSize="17" fontWeight="700">{short(item.name, 20)}</text>
          <text x="112" y="136" textAnchor="middle" fill="#d6e8f1" fontSize="16">{nominal(item.nominalV, 'V')} · {nominal(item.capacityAh, 'Ah')}</text>
          <rect x="75" y="150" width="74" height="24" rx="5" fill="#04374a" stroke="#2589a1"/>
          <text x="112" y="167" textAnchor="middle" fill="#78e6f5" fontSize="13">{item.chemistry === 'unknown' ? 'Sin definir' : item.chemistry}</text>
          <text x="112" y="196" textAnchor="middle" fill="#b5cddc" fontSize="11">{percentage === null ? 'SOC · sin datos' : `${percentage} % · ${item.soc.origin === 'manual' ? 'manual' : 'medido'}`}</text>
        </> : <>
          <defs><clipPath id={`${id}-tank-${index}`}><rect x="20" y="62" width="194" height="143" rx="22"/></clipPath></defs>
          <path d="M20 75Q18 48 45 43H194Q222 47 222 72V190L205 211H39Q20 211 20 190Z" fill={`url(#${id}-metal)`} stroke="#a4c2d0"/>
          <rect x="20" y="62" width="194" height="143" rx="22" fill="#0a2437" stroke="#7eafc2" strokeWidth="2"/>
          <g clipPath={`url(#${id}-tank-${index})`}>{percentage === null ? <rect x="20" y="62" width="194" height="143" fill={`url(#${id}-unknown)`}/> : <rect x="20" y={205 - percentage * 1.43} width="194" height={percentage * 1.43} fill={`url(#${id}-water)`}/>}</g>
          <ellipse cx="116" cy="49" rx="24" ry="8" fill="#123247" stroke="#9ebfca" strokeWidth="3"/>
          <text x="117" y="119" textAnchor="middle" fill="#f2fbff" stroke="#061827" strokeWidth=".6" fontSize="31" fontWeight="700">{percentage === null ? '—' : `${percentage} %`}</text>
          <text x="117" y="147" textAnchor="middle" fill="#e1f5ff" fontSize="14">{nominal(item.capacityL, 'L')} nominales</text>
          <text x="117" y="181" textAnchor="middle" fill="#d5ebf5" fontSize="12">{percentage === null ? 'Nivel desconocido' : item.level.origin === 'manual' ? 'Nivel manual' : 'Nivel medido'}</text>
          <text x="117" y="244" textAnchor="middle" fill="#deeff8" fontSize="16" fontWeight="600">{short(item.name)}</text>
        </>}
      </g>;
    })}
  </svg>;
}
