import React, { useState } from 'react';
import type { SensorBinding, TechnicalInventory } from '../model';
import type { LiveSensorsState } from '../LiveSensors';
import { connectionFingerprint, resolveBinding, sensorOptions } from '../sensorBindings';
import { tankList } from './tankModel';

/** Tank-only controls keep electrical bindings intact while the owner tests electricity. */
export function TankSensors({inventory,shipId,live,onApply}:{inventory:TechnicalInventory;shipId:string;live:LiveSensorsState;onApply:(next:TechnicalInventory)=>Promise<void>}){
  const [sensor,setSensor]=useState(''),[target,setTarget]=useState(''),[error,setError]=useState('');
  const installation=inventory.installation??{nodes:[],links:[]},bindings=installation.bindings??[];
  const options=live.feed?sensorOptions(live.feed.instruments).filter(s=>s.channel==='tank-level'):[];
  const connection=live.feed&&connectionFingerprint(live.feed.connection);
  const apply=async(next:SensorBinding[])=>{try{setError('');await onApply({...inventory,installation:{...installation,bindings:next}});setSensor('');setTarget('');}catch(cause:unknown){setError(cause instanceof Error?cause.message:'No se pudo guardar el sensor.');}};
  return <details className="tw-sensors"><summary>Sensores de nivel · opcional</summary><p>Solo se muestran sensores de esta embarcación. No se deduce caudal a partir de un nivel.</p>
    {!live.confirmation?<button type="button" disabled={!connection} onClick={live.confirm}>Confirmar que la conexión pertenece a este barco</button>:<button type="button" onClick={live.revoke}>Suspender lecturas en esta vista</button>}
    <form className="tw-form" onSubmit={event=>{event.preventDefault();if(!connection||!live.confirmation||!target||!options.some(o=>o.sensor===sensor))return;void apply([...bindings.filter(b=>!(b.targetId===target&&b.metric==='level')),{targetId:target,metric:'level',channel:'tank-level',sensor,connection}]);}}>
      <div className="tw-fields"><label>Sensor de nivel<select aria-label="Sensor de nivel" required disabled={!live.confirmation} value={sensor} onChange={event=>setSensor(event.target.value)}><option value="">Elegir lectura recibida</option>{options.map(o=><option key={o.sensor} value={o.sensor}>{o.label} · {o.reading.value} %</option>)}</select></label><label>Depósito medido<select aria-label="Depósito medido" required disabled={!live.confirmation} value={target} onChange={event=>setTarget(event.target.value)}><option value="">Elegir depósito</option>{tankList(inventory).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label></div><button type="submit" disabled={!sensor||!target||!live.confirmation}>Vincular sensor</button>
    </form>{bindings.filter(b=>b.channel==='tank-level').map(binding=>{const measured=resolveBinding(binding,live.feed,live.confirmation,shipId,live.now);return <div key={binding.targetId} className="tw-binding"><span>{tankList(inventory).find(t=>t.id===binding.targetId)?.name} · {binding.sensor} · {measured?`${measured.reading.value} % medido`:'Sin lectura vigente confirmada'}</span><button type="button" onClick={()=>void apply(bindings.filter(b=>b!==binding))}>Desvincular nivel</button></div>;})}{!connection&&<p>Sin conexión BOAT vigente. Puedes registrar los niveles manualmente.</p>}{error&&<p role="alert">{error}</p>}
  </details>;
}
