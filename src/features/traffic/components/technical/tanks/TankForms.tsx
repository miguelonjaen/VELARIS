import React, { useState } from 'react';
import type { InstallationLink, Tank, TechnicalInventory } from '../model';
import { connectTankConsumer, fluidLabels, savePipe, saveTank, tankList, type LevelEdit } from './tankModel';

const numeric=(value:string)=>value.trim()===''?null:Number(value);
export function TankEditor({tank,inventory,onSave}:{tank:Tank;inventory:TechnicalInventory;onSave:(next:TechnicalInventory)=>void}){
  const [draft,setDraft]=useState(tank),[mode,setMode]=useState<LevelEdit['mode']>('keep'),[amount,setAmount]=useState(''),[error,setError]=useState('');
  return <form className="tw-form" onSubmit={event=>{event.preventDefault();try{if((mode==='percent'||mode==='litres')&&amount.trim()==='')throw new Error('Introduce el nivel o déjalo como desconocido.');onSave(saveTank(inventory,draft,mode==='percent'||mode==='litres'?{mode,value:Number(amount)}:{mode}));}catch(cause:unknown){setError(cause instanceof Error?cause.message:'Revisa los datos.');}}}>
    <label>Nombre<input name="name" required maxLength={240} value={draft.name} onChange={event=>setDraft({...draft,name:event.target.value})}/></label>
    <div className="tw-fields"><label>Contenido<select aria-label="Fluido del depósito" value={draft.fluid} onChange={event=>setDraft({...draft,fluid:event.target.value as Tank['fluid']})}>{Object.entries(fluidLabels).map(([fluid,label])=><option key={fluid} value={fluid}>{label}</option>)}</select></label><label>Capacidad nominal (L)<input aria-label="Capacidad nominal (L)" type="number" min="0.01" step="any" placeholder="Desconocida" value={draft.capacityL??''} onChange={event=>setDraft({...draft,capacityL:numeric(event.target.value)})}/></label></div>
    <label>Nivel<select aria-label="Cómo registrar el nivel" value={mode} onChange={event=>{setMode(event.target.value as LevelEdit['mode']);setAmount('');}}><option value="keep">No cambiar la lectura guardada</option><option value="unknown">Nivel desconocido</option><option value="percent">Registrar porcentaje manual</option><option value="litres" disabled={draft.capacityL===null}>Registrar litros manuales</option></select></label>
    {(mode==='percent'||mode==='litres')&&<label>{mode==='percent'?'Nivel manual (%)':'Cantidad manual (L)'}<input required aria-label="Nivel manual" type="number" min="0" max={mode==='percent'?100:draft.capacityL??undefined} step="any" value={amount} onChange={event=>setAmount(event.target.value)}/></label>}
    <small>La lectura manual se guarda con fecha. Cero significa vacío; desconocido no significa vacío. Los litros calculados a partir de un porcentaje son una estimación.</small>
    <details><summary>Más datos · opcionales</summary>{(['location','manufacturer','model'] as const).map((field,index)=><label key={field}>{['Ubicación','Fabricante','Modelo'][index]}<input maxLength={240} value={draft[field]} onChange={event=>setDraft({...draft,[field]:event.target.value})}/></label>)}</details>
    <button type="submit">Guardar depósito</button>{error&&<p role="alert">{error}</p>}
  </form>;
}

const suggestions=(fluid:Tank['fluid'])=>fluid==='freshwater'?['Bomba de agua','Grifo','Ducha']:fluid==='diesel'||fluid==='petrol'?['Motor principal','Generador']:['Inodoro','Bomba de vaciado','Entrada de cubierta','Salida de descarga'];
export function TankConnectionForm({inventory,sourceId,onSave}:{inventory:TechnicalInventory;sourceId:string;onSave:(next:TechnicalInventory)=>void}){
  const tanks=tankList(inventory),[source,setSource]=useState(sourceId||tanks[0]?.id||''),[direction,setDirection]=useState<'outlet'|'inlet'>('outlet'),[existing,setExisting]=useState(false),[target,setTarget]=useState(''),[name,setName]=useState(''),[output,setOutput]=useState(''),[error,setError]=useState('');
  const tank=tanks.find(t=>t.id===source),consumers=inventory.installation?.nodes.filter(n=>n.kind==='consumer')??[];
  return <form className="tw-form" onSubmit={event=>{event.preventDefault();try{if(existing&&!target)throw new Error('Selecciona el equipo existente.');onSave(connectTankConsumer(inventory,{sourceId:source,consumerId:existing?target:null,name,connectionName:output,direction}));}catch(cause:unknown){setError(cause instanceof Error?cause.message:'Revisa la conexión.');}}}>
    <label>Sentido declarado<select aria-label="Sentido de tubería" value={direction} onChange={event=>setDirection(event.target.value as typeof direction)}><option value="outlet">Salida · depósito → equipo</option><option value="inlet">Entrada · equipo → depósito</option></select></label><label>Depósito<select required aria-label="Depósito de origen" value={source} onChange={event=>setSource(event.target.value)}><option value="">Elegir depósito</option>{tanks.map(t=><option key={t.id} value={t.id}>{t.name} · {fluidLabels[t.fluid]}</option>)}</select></label>
    <div className="tw-choice"><button type="button" aria-pressed={!existing} onClick={()=>setExisting(false)}>Consumidor nuevo</button><button type="button" aria-pressed={existing} onClick={()=>setExisting(true)}>Equipo ya registrado</button></div>
    {existing?<label>Equipo del inventario<select aria-label="Consumidor existente" required value={target} onChange={event=>setTarget(event.target.value)}><option value="">Elegir equipo</option>{consumers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>:<><label>Nombre del consumidor o salida<input aria-label="Nombre del consumidor" required maxLength={240} value={name} onChange={event=>setName(event.target.value)}/></label>{tank&&<div className="tw-suggestions">{suggestions(tank.fluid).map(label=><button type="button" key={label} onClick={()=>setName(label)}>{label}</button>)}</div>}</>}
    <label>Nombre de la tubería · opcional<input aria-label="Nombre de la tubería" maxLength={240} placeholder="Por ejemplo: salida de servicio" value={output} onChange={event=>setOutput(event.target.value)}/></label>
    <small>Se registra únicamente la entrada o salida seleccionada por el usuario. No se deducen bombas, válvulas, otras tuberías ni caudal. Un equipo eléctrico existente puede tener también esta conexión de fluido.</small>
    <button type="submit" disabled={!tank}>Guardar conexión</button>{error&&<p role="alert">{error}</p>}
  </form>;
}

export function PipeEditor({inventory,pipe,onSave,onRemove}:{inventory:TechnicalInventory;pipe:InstallationLink;onSave:(next:TechnicalInventory)=>void;onRemove:()=>void}){
  const [draft,setDraft]=useState(pipe),[error,setError]=useState('');
  const fromTank=tankList(inventory).some(t=>t.id===draft.from);
  return <form className="tw-form" onSubmit={event=>{event.preventDefault();try{onSave(savePipe(inventory,draft));}catch(cause:unknown){setError(cause instanceof Error?cause.message:'Revisa la tubería.');}}}>
    <label>Nombre de la tubería<input required maxLength={240} value={draft.name} onChange={event=>setDraft({...draft,name:event.target.value})}/></label>
    <label>Depósito<select required value={fromTank?draft.from:draft.to} onChange={event=>setDraft(fromTank?{...draft,from:event.target.value}:{...draft,to:event.target.value})}>{tankList(inventory).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label>Equipo / entrada / salida<select required value={fromTank?draft.to:draft.from} onChange={event=>setDraft(fromTank?{...draft,to:event.target.value}:{...draft,from:event.target.value})}>{inventory.installation?.nodes.filter(n=>n.kind==='consumer').map(n=><option key={n.id} value={n.id}>{n.name}</option>)}</select></label>
    <button type="button" onClick={()=>setDraft({...draft,from:draft.to,to:draft.from})}>Invertir sentido declarado</button><p>{fromTank?'Salida del depósito':'Entrada al depósito'} · Caudal desconocido. El nivel del depósito no acredita circulación por esta tubería.</p><button type="submit">Guardar tubería</button><button type="button" onClick={onRemove}>Desconectar · conservar equipo</button>{error&&<p role="alert">{error}</p>}
  </form>;
}
