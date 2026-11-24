import { parseInventory, unknownReading, type InstallationLink, type Reading, type Tank, type TechnicalInventory } from '../model';
import { connectConsumer, type ConsumerConnectionRequest } from '../consumerConnection';
import { resolveBinding, type ConfirmedConnection, type InstrumentFeed } from '../sensorBindings';

export const fluidLabels:Record<Tank['fluid'],string>={freshwater:'Agua dulce',diesel:'Gasóleo',petrol:'Gasolina',greywater:'Aguas grises',blackwater:'Aguas negras',other:'Otro fluido'};
export const fluidColors:Record<Tank['fluid'],string>={freshwater:'#58c9e6',diesel:'#e2b85d',petrol:'#dc9770',greywater:'#a7b4c7',blackwater:'#b3a4ca',other:'#75c4ad'};
export const tankList=(inventory:TechnicalInventory)=>inventory.components.filter((c):c is Tank=>c.kind==='tank');
export function addTank(inventory:TechnicalInventory,fluid:Tank['fluid'],id:string=crypto.randomUUID()):TechnicalInventory{
  const names=new Set(inventory.components.map(c=>c.name));let n=1,name=fluidLabels[fluid];while(names.has(name))name=`${fluidLabels[fluid]} ${++n}`;
  return parseInventory({...inventory,components:[...inventory.components,{id,kind:'tank',name,fluid,capacityL:null,level:unknownReading(),location:'',manufacturer:'',model:''}]});
}
export type LevelEdit={mode:'keep'|'unknown'}|{mode:'percent'|'litres';value:number};
export function saveTank(inventory:TechnicalInventory,tank:Tank,level:LevelEdit,now=new Date().toISOString()):TechnicalInventory{
  const original=tankList(inventory).find(t=>t.id===tank.id);if(!original)throw new Error('El depósito ya no está disponible.');
  let reading=original.level;
  if(level.mode==='unknown')reading=unknownReading();
  if(level.mode==='percent'||level.mode==='litres'){
    if(!Number.isFinite(level.value)||level.value<0)throw new Error('Introduce un nivel válido.');
    if(level.mode==='litres'&&(tank.capacityL===null||tank.capacityL<=0))throw new Error('Indica la capacidad para registrar litros.');
    const percent=level.mode==='litres'?level.value/tank.capacityL!*100:level.value;
    if(percent>100)throw new Error('El nivel no puede superar la capacidad del depósito.');
    reading={value:percent,origin:'manual',at:now,sensor:null};
  }
  const next=parseInventory({...inventory,components:inventory.components.map(c=>c.id===tank.id?{...tank,level:reading}:c)});
  for(const pipe of next.installation?.links.filter(l=>l.medium==='pipe'&&(l.from===tank.id||l.to===tank.id))??[])assertFluid(next,tank.id,pipe.from===tank.id?pipe.to:pipe.from,pipe.id);
  return next;
}
export interface TankObservation { reading:Reading; live:boolean; estimatedL:number|null }
/** Live readings are a presentation overlay; saving a name or capacity never writes this overlay. */
export function tankObservation(inventory:TechnicalInventory,tank:Tank,feed:InstrumentFeed|null,confirmation:ConfirmedConnection|null,shipId:string,now:number):TankObservation{
  const binding=inventory.installation?.bindings?.find(b=>b.targetId===tank.id&&b.channel==='tank-level');
  const measured=binding?resolveBinding(binding,feed,confirmation,shipId,now):null;
  const reading:Reading=measured&&feed?{value:measured.reading.value,origin:'measured',at:new Date(feed.capturedAt-measured.reading.ageMs).toISOString(),sensor:measured.sensor}:tank.level;
  return {reading,live:!!measured,estimatedL:reading.value!==null&&tank.capacityL!==null?tank.capacityL*(reading.value/100):null};
}
export function fluidSummary(tanks:readonly Tank[],observations:Map<string,TankObservation>,fluid:Tank['fluid']){
  const selected=tanks.filter(t=>t.fluid===fluid);
  return {count:selected.length,capacityL:selected.reduce((sum,t)=>sum+(t.capacityL??0),0),unknownCapacity:selected.filter(t=>t.capacityL===null).length,
    estimatedL:selected.reduce((sum,t)=>sum+(observations.get(t.id)?.estimatedL??0),0),unknownVolume:selected.filter(t=>observations.get(t.id)?.estimatedL==null).length};
}
function assertFluid(inventory:TechnicalInventory,sourceId:string,consumerId:string|null,excludeId?:string){
  const source=tankList(inventory).find(t=>t.id===sourceId);if(!source)throw new Error('Selecciona un depósito de esta embarcación.');
  if(!consumerId)return;
  const otherSources=inventory.installation?.links.filter(l=>l.medium==='pipe'&&(l.to===consumerId||l.from===consumerId)&&l.id!==excludeId).map(l=>tankList(inventory).find(t=>t.id===(l.to===consumerId?l.from:l.to)&&t.id!==sourceId)).filter((t):t is Tank=>!!t)??[];
  if(otherSources.some(t=>t.fluid!==source.fluid||t.fluid==='other'))throw new Error('Este consumidor está asociado a otro fluido o a un fluido sin identificar. Usa un equipo independiente o revisa las conexiones.');
}
export function connectTankConsumer(inventory:TechnicalInventory,request:Omit<ConsumerConnectionRequest,'medium'>&{direction?:'outlet'|'inlet'},id:()=>string=()=>crypto.randomUUID()):TechnicalInventory{
  assertFluid(inventory,request.sourceId,request.consumerId);
  const next=connectConsumer(inventory,{...request,medium:'pipe'},id);
  if(request.direction!=='inlet')return next;
  const installation=next.installation!;
  return parseInventory({...next,installation:{...installation,links:installation.links.map((link,index)=>index===installation.links.length-1?{...link,from:link.to,to:link.from}:link)}});
}
export function savePipe(inventory:TechnicalInventory,pipe:InstallationLink):TechnicalInventory{
  const installation=inventory.installation;
  if(!installation?.links.some(l=>l.id===pipe.id&&l.medium==='pipe')||pipe.medium!=='pipe')throw new Error('La tubería ya no está disponible.');
  const fromTank=tankList(inventory).some(t=>t.id===pipe.from);
  assertFluid(inventory,fromTank?pipe.from:pipe.to,fromTank?pipe.to:pipe.from,pipe.id);
  return parseInventory({...inventory,installation:{...installation,links:installation.links.map(l=>l.id===pipe.id?pipe:l)}});
}
export function removePipe(inventory:TechnicalInventory,id:string):TechnicalInventory{
  const installation=inventory.installation;if(!installation?.links.some(l=>l.id===id&&l.medium==='pipe'))throw new Error('Tubería inexistente.');
  return parseInventory({...inventory,installation:{...installation,links:installation.links.filter(l=>l.id!==id),...(installation.bindings?{bindings:installation.bindings.filter(b=>b.targetId!==id)}:{})}});
}
export function removeTank(inventory:TechnicalInventory,id:string):TechnicalInventory{
  if(!tankList(inventory).some(t=>t.id===id))throw new Error('Depósito inexistente.');
  const installation=inventory.installation,removed=new Set([id,...(installation?.links.filter(l=>l.medium==='pipe'&&(l.from===id||l.to===id)).map(l=>l.id)??[])]);
  return parseInventory({...inventory,components:inventory.components.filter(c=>c.id!==id),...(installation?{installation:{...installation,links:installation.links.filter(l=>!removed.has(l.id)),...(installation.bindings?{bindings:installation.bindings.filter(b=>!removed.has(b.targetId))}:{})}}:{})});
}
export function saveFluidConsumer(inventory:TechnicalInventory,id:string,name:string):TechnicalInventory{
  const installation=inventory.installation;if(!installation?.nodes.some(n=>n.id===id&&n.kind==='consumer'))throw new Error('Consumidor inexistente.');
  return parseInventory({...inventory,installation:{...installation,nodes:installation.nodes.map(n=>n.id===id?{...n,name:name.trim()}:n)}});
}
