import React from 'react';
import type { ChargeModel, ChargeSettings } from './chargingPolicy';
export function ChargingControls({enabled,onEnabled,settings,onChange,model}:{enabled:boolean;onEnabled:(enabled:boolean)=>void;settings:ChargeSettings;onChange:(settings:ChargeSettings)=>void;model:ChargeModel|null}) {
  const patch=(value:Partial<ChargeSettings>)=>onChange({...settings,...value});
  const number=(key:'solarAmps'|'alternatorAmps'|'acAmps'|'servicePercent'|'serviceLoad'|'startLoad',label:string,max=500)=><label>{label}<input type="number" min="0" max={max} step="0.1" value={settings[key]} onChange={e=>{const value=e.currentTarget.valueAsNumber;if(Number.isFinite(value))patch({[key]:Math.min(max,Math.max(0,value))});}}/></label>;
  return <section className="el-charge-controls" aria-label="Gestión de carga del ensayo">
    <label><input type="checkbox" checked={enabled} onChange={e=>onEnabled(e.target.checked)}/> Modelo de carga · SIMULACIÓN</label>
    {enabled && <>
      <p>AC → solar → alternador. Modelo DC de ensayo; los valores siguientes son parámetros de ensayo. No acciona equipos ni sustituye las lecturas NMEA originales.</p>
      <div className="el-charge-grid">
        <label><input type="checkbox" checked={settings.ac} onChange={e=>patch({ac:e.target.checked})}/> Puerto AC conectado</label>
        <label><input type="checkbox" checked={settings.solar} onChange={e=>patch({solar:e.target.checked})}/> Solar habilitado (supeditado a AC y noche)</label>
        <label>Día/noche<select value={settings.daylight} onChange={e=>patch({daylight:e.target.value as ChargeSettings['daylight']})}><option value="auto">Automático · posición/hora</option><option value="day">Forzar día · ensayo</option><option value="night">Forzar noche · ensayo</option></select></label>
        <label>Motor del modelo<select value={settings.engine} onChange={e=>patch({engine:e.target.value as ChargeSettings['engine']})}><option value="nmea">Seguir RPM NMEA</option><option value="on">Encendido · ensayo</option><option value="off">Apagado · ensayo</option></select></label>
        <label>Fecha/hora local del escenario<input type="datetime-local" value={settings.scenarioTime} onChange={e=>patch({scenarioTime:e.target.value})}/><small>Vacío: reloj actual. No lee el reloj interno de Simulator X.</small></label>
        {number('solarAmps','Límite MPPT · A DC')}{number('alternatorAmps','Alternador disponible · A DC')}{number('acAmps','Cargador AC disponible · A DC')}
        {number('servicePercent','Reparto hacia servicios · %',100)}{number('serviceLoad','Consumo servicios · A')}{number('startLoad','Consumo arranque · A')}
      </div>
      {model && <p role="status">SIMULACIÓN · Fuente: <strong>{{ac:'AC',solar:'Solar',alternator:'Alternador',none:'Ninguna'}[model.source]}</strong> · {model.daylight===null?'Día/noche sin posición o fecha válida':model.daylight?'Día':'Noche'} · Motor del modelo: {model.engine===null?'sin RPM vigentes':model.engine?'encendido':'apagado'}{settings.ac?' (AC fuerza motor apagado y solar a cero)':''}. {model.startBatteryFull?'Arranque cargada: reparto efectivo 100/0. ':''}Reparto bruto: servicios {model.serviceCharge.toFixed(2)} A + arranque {model.startCharge.toFixed(2)} A = {model.sourceAmps.toFixed(2)} A.</p>}
    </>}
  </section>;
}
