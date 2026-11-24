import React, { useId } from 'react';
import type { Tank } from '../model';
import { fluidColors } from './tankModel';

export function TankGlyph({tank,percent}:{tank:Tank;percent:number|null}){
  const key=useId().replace(/:/g,''),color=fluidColors[tank.fluid],height=percent===null?0:94*percent/100;
  return <svg className="tw-tank-glyph" viewBox="0 0 180 158" aria-hidden="true"><defs><clipPath id={`tank-clip-${key}`}><rect x="25" y="29" width="128" height="98" rx="8"/></clipPath><pattern id={`tank-unknown-${key}`} width="9" height="9" patternUnits="userSpaceOnUse"><path d="M0 9 9 0" stroke="#507182" strokeWidth="1"/></pattern><linearGradient id={`tank-face-${key}`}><stop stopColor="#133444"/><stop offset=".5" stopColor="#0b2634"/><stop offset="1" stopColor="#071c27"/></linearGradient></defs>
    <path d="M24 29Q24 12 89 12T154 29V127Q154 145 89 145T24 127Z" fill={`url(#tank-face-${key})`} stroke={color} strokeWidth="1.7"/>
    <g clipPath={`url(#tank-clip-${key})`}>{percent===null?<rect x="25" y="29" width="128" height="98" fill={`url(#tank-unknown-${key})`}/>:<rect x="25" y={127-height} width="128" height={height} fill={color} opacity=".4"/>}</g>
    <ellipse cx="89" cy="29" rx="65" ry="17" fill="#102b38" stroke={color} strokeWidth="1.5"/><path d="M24 127q65 25 130 0M154 82h22" fill="none" stroke={color} strokeWidth="1.7"/>
    <path d="M72 12V6h34v6M36 55h9m-9 20h9m-9 20h9m-9 20h9" stroke="#6e9bae" fill="none"/>
    <text x="93" y="91" textAnchor="middle" fill="#e8f5fa" fontSize="23" fontWeight="600">{percent===null?'?':`${percent.toLocaleString('es-ES',{maximumFractionDigits:1})} %`}</text>
  </svg>;
}
