import type { TechnicalInventory } from '../model';
import { compatibleTarget, resolveBinding, type ConfirmedConnection, type InstrumentFeed } from '../sensorBindings';
import type { OwnerLink } from './ownerModel';

export type ActivityState='unknown'|'active'|'inactive';
export interface ConnectionActivity { state:ActivityState; origin:'measured'|'manual'|'unknown'; label:string; direction?:'forward'|'reverse' }
export const manualActivityKey=(link:OwnerLink)=>JSON.stringify(link.wires.map(w=>w.id).sort());
/** A common source/net battery reading is never promoted to a branch measurement. */
export function measuredConnectionActivity(inventory:TechnicalInventory,link:OwnerLink,feed:InstrumentFeed|null,confirmation:ConfirmedConnection|null,shipId:string,now:number):ConnectionActivity {
  const legacy=inventory.installation?.links.filter(l=>l.medium==='cable'&&l.from===link.from&&l.to===link.to)??[];
  const graphTargets=new Set(inventory.electrical?.wires.flatMap(w=>w.from.componentId===link.from?[w.to.componentId]:w.to.componentId===link.from?[w.from.componentId]:[])??[]);
  if(legacy.length===1&&graphTargets.size===1&&graphTargets.has(link.to)){
    const binding=inventory.installation?.bindings?.find(b=>b.targetId===legacy[0].id&&b.metric==='current');
    if(binding&&compatibleTarget(inventory,binding.targetId,binding.channel)){
      const reading=resolveBinding(binding,feed,confirmation,shipId,now);
      if(reading?.unit==='A')return {state:reading.reading.value!==0?'active':'inactive',origin:'measured',direction:reading.reading.value<0?'reverse':'forward',label:`${reading.reading.value.toLocaleString('es-ES')} A · medido en este enlace`};
    }
  }
  return {state:'unknown',origin:'unknown',label:'Actividad sin medir'};
}
export function effectiveActivity(measured:ConnectionActivity,manual:ActivityState|undefined):ConnectionActivity{
  if(measured.origin==='measured'||!manual||manual==='unknown')return measured;
  return {state:manual,origin:'manual',label:manual==='active'?'Activa · indicación manual':'Inactiva · indicación manual'};
}

/** Local operator indications are separate from the persistent technical inventory and sensor readings. */
export function parseManualActivity(raw:string|null):Record<string,ActivityState>{
  if(!raw)return {};
  try{const value:unknown=JSON.parse(raw);if(!value||typeof value!=='object'||Array.isArray(value))return {};
    return Object.fromEntries(Object.entries(value).filter(([id,state])=>id.length<=32768&&typeof state==='string'&&['active','inactive'].includes(state)).slice(0,16000)) as Record<string,ActivityState>;
  }catch{return {};}
}
