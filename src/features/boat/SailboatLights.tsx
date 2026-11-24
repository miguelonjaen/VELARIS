import React, { useId } from 'react';
import { useBoatLighting } from './useBoatLighting';
import { LIGHT_CIRCUITS, type BoatInstrumentSnapshot, type LightCircuit } from '../../core/instruments/BoatInstrumentStore';
import { currentValue } from './boatVisualModel';
import './sailboatLights.css';

type LampState = 'on' | 'off' | 'unknown';
const SEPARATE: readonly LightCircuit[] = ['LIGHT_PORT_RELAY', 'LIGHT_STARBOARD_RELAY', 'LIGHT_STERN_RELAY'];
const COLORS: Partial<Record<LightCircuit, string>> = { LIGHT_PORT_RELAY: '#ff666f', LIGHT_STARBOARD_RELAY: '#4cffab' };
export function lampState(instruments: BoatInstrumentSnapshot, circuit: LightCircuit): LampState {
  const value = currentValue(instruments.lights?.find(light => light.circuit === circuit)?.relay ?? null);
  return value === 1 ? 'on' : value === 0 ? 'off' : 'unknown';
}
const stateText = (state: LampState) => state === 'on' ? 'Encendida · relé 1' : state === 'off' ? 'Apagada · relé 0' : 'Sin señal';

function Lamp({ x, y, circuit, state, label, color = '#f5f5da' }: { x: number; y: number; circuit: LightCircuit; state: LampState; label: string; color?: string }) {
  return <g transform={`translate(${x} ${y})`} className={`sl-lamp sl-${state}`} role="img" aria-label={`${label}: ${stateText(state)}`} data-circuit={circuit} data-state={state}>
    <title>{label} · {stateText(state)}</title>
    {state === 'on' && <circle r="15" fill={color} opacity=".15"/>}
    <circle r="6" fill={state === 'on' ? color : '#142c3c'} stroke={state === 'on' ? color : '#8294a3'} strokeWidth="2" strokeDasharray={state === 'unknown' ? '2 2' : undefined}/>
    {state === 'unknown' && <text textAnchor="middle" y="3" fill="#e1eaf2" fontSize="8">?</text>}
    <text x="12" y="4" fill="#c9dfe9" fontSize="10">{label}</text>
  </g>;
}

/** The shared navigation switch changes only the local trial model; telemetry stays read-only. */
export function SailboatLights({ vesselId, profile, instruments }: { vesselId: string | null; profile: boolean; instruments: BoatInstrumentSnapshot }) {
  const lighting = useBoatLighting(vesselId);
  const installation = lighting.installation;
  const id = useId();
  const circuits: readonly LightCircuit[] = [...(installation === 'separate' ? SEPARATE : ['LIGHT_TRICOLOR_RELAY'] as const), 'LIGHT_MASTHEAD_RELAY', 'LIGHT_ANCHOR_RELAY'];
  const hidden = installation === 'separate' ? ['LIGHT_TRICOLOR_RELAY'] as const : SEPARATE;
  const hiddenActive = hidden.filter(circuit => lampState(instruments, circuit) === 'on');
  const active = circuits.filter(circuit => lampState(instruments, circuit) === 'on');
  const at = (circuit: LightCircuit, x: number, y: number, label: string) => <Lamp key={circuit} circuit={circuit} x={x} y={y} label={label} state={lampState(instruments, circuit)} color={COLORS[circuit]}/>;
  const change = lighting.setInstallation;
  return <div className="sl-view">
    <div className="sl-controls"><button type="button" role="switch" aria-label="Luces de navegación" aria-checked={lighting.on} disabled={!vesselId} onClick={()=>lighting.toggle()}>Luces de navegación · {lighting.on?'Encendidas':'Apagadas'} · ensayo</button><button type="button" role="switch" aria-label="Luz de niebla" aria-checked={lighting.fogOn} disabled={!vesselId} onClick={()=>lighting.toggleFog()}>Luz de niebla · {lighting.fogOn?'Encendida':'Apagada'} · ensayo</button><label htmlFor={id}>Instalación de navegación</label><select id={id} value={installation} onChange={event => change(event.target.value === 'tricolor' ? 'tricolor' : 'separate')}><option value="separate">Costados y alcance separados</option><option value="tricolor">Tricolor en cabeza de mástil</option></select></div>
    {lighting.error && <p role="status">No se pudo guardar la elección; sigue disponible en esta sesión.</p>}
    <svg viewBox="0 0 600 340" className="sl-silhouette" role="img" aria-label={`Velero ${profile ? 'de perfil' : 'en planta'} · ${installation === 'separate' ? 'luces separadas' : 'tricolor'}`}>
      <path d="M20 285 H580" stroke="#23536a" strokeDasharray="4 6"/>
      {profile ? <g stroke="#65b7cd" strokeWidth="2" strokeLinejoin="round">
        <path d="M90 231 L520 224 Q488 277 421 281 L151 281 Q111 279 90 255 Z" fill="#163348"/>
        <path d="M200 240 L221 217 H340 L371 238" fill="#214257"/>
        <path d="M280 275 L295 318 H324 L338 273 M120 270 L130 300" fill="#17384c"/>
        <path d="M295 42 V242 M295 222 H162" strokeWidth="4"/>
        <path d="M80 240 L295 42 L510 225 M295 62 L191 240 M295 62 L407 236" fill="none" stroke="#456f86" strokeWidth="1"/>
        <path d="M288 66 L288 211 L164 211 Z" fill="#6c9aac" fillOpacity=".09" stroke="#376075"/>
        <text x="78" y="304" stroke="none" fill="#789cab" fontSize="10">← POPA</text>
        <text x="485" y="304" stroke="none" fill="#789cab" fontSize="10">PROA →</text>
      </g> : <g stroke="#65b7cd" strokeWidth="2" fill="#163348">
        <path d="M290 30 Q212 110 225 248 Q290 278 355 248 Q368 110 290 30Z"/>
        <path d="M290 65 Q250 126 250 225 H330 Q330 126 290 65Z" fill="#214257"/>
        <path d="M290 38 V250 M235 137 H345 M290 145 L335 211" fill="none" stroke="#6b9bae"/>
        <circle cx="290" cy="145" r="5"/>
        <text x="270" y="21" fill="#9abfcd" stroke="none" fontSize="10">PROA ↑</text>
      </g>}
      {installation === 'separate' ? <>
        {at('LIGHT_PORT_RELAY', profile ? 420 : 230, profile ? 221 : 110, 'Babor')}
        {at('LIGHT_STARBOARD_RELAY', profile ? 420 : 350, profile ? 247 : 110, 'Estribor')}
        {at('LIGHT_STERN_RELAY', profile ? 92 : 290, profile ? 242 : 255, 'Alcance')}
      </> : <>
        {at('LIGHT_TRICOLOR_RELAY', profile ? 295 : 290, profile ? 50 : 145, 'Tricolor')}
        <g transform={profile ? 'translate(287 32)' : 'translate(282 127)'} opacity={lampState(instruments, 'LIGHT_TRICOLOR_RELAY') === 'on' ? 1 : .15} aria-label="Tricolor: sectores ilustrativos"><rect width="5" height="5" fill="#ff666f"/><rect x="6" width="5" height="5" fill="#4cffab"/><rect x="12" width="5" height="5" fill="#f5f5da"/></g>
      </>}
      {at('LIGHT_MASTHEAD_RELAY', profile ? 295 : 290, profile ? 132 : 80, 'Tope')}
      {at('LIGHT_ANCHOR_RELAY', profile ? 295 : 290, profile ? 17 : 195, 'Fondeo')}
      <g transform={profile?'translate(465 210)':'translate(290 85) rotate(-90)'} role="img" aria-label={`Luz de niebla: ${lighting.fogOn?'encendida':'apagada'} · ensayo`} data-light="fog" data-state={lighting.fogOn?'on':'off'}>
        {lighting.fogOn&&<><path d="M0 0 L58 -15 L58 15 Z" fill="#ffffff" opacity=".2"/><circle r="14" fill="#ffffff" opacity=".18"/></>}
        <circle r="6" fill={lighting.fogOn?'#ffffff':'#142c3c'} stroke={lighting.fogOn?'#ffffff':'#8294a3'} strokeWidth="2"/>
      </g>
      <text x="20" y="334" fill="#779aaa" fontSize="9">ESQUEMA SIN ESCALA · POSICIONES ORIENTATIVAS</text>
    </svg>
    <div className="sl-legend"><span>● Con halo: encendida (1)</span><span>○ Gris, sin halo: apagada (0)</span><span>◌ ?: sin señal vigente</span></div>
    <p role="status">Luz de niebla: {lighting.fogOn?'encendida':'apagada'} · ensayo local independiente.</p>
    <div className="sl-readings">{circuits.map(circuit => {
      const state = lampState(instruments, circuit);
      return <div key={circuit} data-state={state}><span>{LIGHT_CIRCUITS[circuit]}</span><strong>{stateText(state)}</strong><small className="sl-sensor-id">{circuit}</small></div>;
    })}</div>
    <p className="sl-note">Navegación: un único mando para la instalación seleccionada. Fondeo permanece independiente en Electricidad → Navegación.</p>
    <p className="sl-note">Retorno de relé: no confirma emisión luminosa. El botón actúa sobre el ensayo local; no envía órdenes a equipos reales.</p>
    {lampState(instruments, 'LIGHT_NAV_RELAY') !== 'unknown' && <p className="sl-note">Navegación agrupada: {stateText(lampState(instruments, 'LIGHT_NAV_RELAY'))}. No determina el estado de cada luz.</p>}
    {hiddenActive.length > 0 && <p className="sl-warning" role="status">También hay relés cerrados fuera de esta vista: {hiddenActive.map(circuit => LIGHT_CIRCUITS[circuit]).join(', ')}.</p>}
    {installation === 'tricolor' && active.includes('LIGHT_TRICOLOR_RELAY') && active.includes('LIGHT_MASTHEAD_RELAY') && <p className="sl-warning" role="status">Tricolor y tope tienen retorno cerrado simultáneamente. Revise la configuración y el modo de navegación.</p>}
  </div>;
}
