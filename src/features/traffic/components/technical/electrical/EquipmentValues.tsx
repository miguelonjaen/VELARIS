import React, { useState } from 'react';
import { parseInventory, type TechnicalInventory } from '../model';

interface Values { name:string;nominalV:number|null;capacityAh:number|null;ratedA:number|null;ratedW:number|null }
export function saveEquipmentValues(inventory:TechnicalInventory,id:string,values:Values):TechnicalInventory{
  if(!inventory.electrical?.devices.some(d=>d.componentId===id))throw new Error('Equipo inexistente');
  return parseInventory({...inventory,components:inventory.components.map(c=>c.id!==id?c:c.kind==='battery'?{...c,name:values.name,nominalV:values.nominalV,capacityAh:values.capacityAh}:{...c,name:values.name}),
    installation:inventory.installation?{...inventory.installation,nodes:inventory.installation.nodes.map(c=>c.id===id?{...c,name:values.name}:c)}:undefined,
    electrical:{...inventory.electrical,devices:inventory.electrical.devices.map(d=>d.componentId===id?{...d,nominalV:values.nominalV,ratedA:values.ratedA,ratedW:values.ratedW,provenance:'manual' as const}:d)}});
}
export function EquipmentValues({inventory,componentId,onSave}:{inventory:TechnicalInventory;componentId:string;onSave:(next:TechnicalInventory)=>void}){
  const master=inventory.components.find(c=>c.id===componentId)??inventory.installation?.nodes.find(c=>c.id===componentId);
  const device=inventory.electrical!.devices.find(d=>d.componentId===componentId)!;
  const [values,setValues]=useState<Values>({name:master?.name??'',nominalV:master?.kind==='battery'?master.nominalV:device.nominalV,capacityAh:master?.kind==='battery'?master.capacityAh:null,ratedA:device.ratedA,ratedW:device.ratedW}),[error,setError]=useState(''),[saved,setSaved]=useState(false);
  return <form className="ee-form eo-values" onSubmit={event=>{event.preventDefault();try{onSave(saveEquipmentValues(inventory,componentId,values));setError('');setSaved(true);}catch(cause:unknown){setError(cause instanceof Error?cause.message:'Revisa los valores.');}}}>
    <label>Nombre<input name="name" required maxLength={240} value={values.name} onChange={event=>{setValues({...values,name:event.target.value});setSaved(false);}}/></label>
    <p>Valores de la placa o ficha del equipo. Puedes dejar en blanco lo que no conozcas.</p>
    <div className="eo-value-grid">{(['nominalV',...(master?.kind==='battery'?['capacityAh' as const]:[]),'ratedA','ratedW'] as const).map(field=><label key={field}>{field==='nominalV'?'Tensión nominal (V)':field==='capacityAh'?'Capacidad (Ah)':field==='ratedA'?'Corriente nominal (A)':'Potencia nominal (W)'}<input aria-label={field} type="number" min="0" step="any" placeholder="Desconocido" value={values[field]??''} onChange={event=>{setValues({...values,[field]:event.target.value.trim()===''?null:Number(event.target.value)});setSaved(false);}}/></label>)}</div>
    <small>Datos manuales nominales. No son medidas en tiempo real y no activan las conexiones.</small>
    <button type="submit">Guardar valores</button>{saved&&<small role="status">Valores incorporados al inventario · {values.name}</small>}{error&&<p role="alert">{error}</p>}
  </form>;
}
