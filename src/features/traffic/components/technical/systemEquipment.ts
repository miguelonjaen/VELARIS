import type { TechnicalInventory } from './model';
import { calendarDay } from '../documentDashboardModel';

export const SYSTEM_SECTIONS=['propulsion','electronics','rigging','safety'] as const;
export type SystemSection=typeof SYSTEM_SECTIONS[number];
export type EquipmentCondition='unknown'|'declared-operational'|'needs-service'|'out-of-service';
export interface SystemEquipment {
 id:string;section:SystemSection;catalogId:string;name:string;manufacturer:string;model:string;serial:string;location:string;
 specification:string;condition:EquipmentCondition;lastService:string;nextService:string;notes:string;archived:boolean;
}
export interface SystemRelationship {id:string;from:string;to:string;label:string}
export interface OnboardSystems {version:1;equipment:SystemEquipment[];links:SystemRelationship[]}
export const SYSTEM_CATALOG=[
 {id:'engine',section:'propulsion',label:'Motor',column:0},{id:'gearbox',section:'propulsion',label:'Transmisión / inversora',column:1},{id:'shaft',section:'propulsion',label:'Línea de ejes',column:1},{id:'propeller',section:'propulsion',label:'Hélice',column:2},{id:'saildrive',section:'propulsion',label:'Saildrive / cola',column:1},{id:'cooling',section:'propulsion',label:'Refrigeración',column:2},
 {id:'gps',section:'electronics',label:'GPS / GNSS',column:0},{id:'ais',section:'electronics',label:'AIS',column:0},{id:'vhf',section:'electronics',label:'VHF / comunicaciones',column:2},{id:'plotter',section:'electronics',label:'Plotter',column:1},{id:'radar',section:'electronics',label:'Radar',column:0},{id:'sounder',section:'electronics',label:'Sonda',column:0},{id:'network',section:'electronics',label:'Red / pasarela',column:1},{id:'autopilot',section:'electronics',label:'Piloto automático',column:2},
 {id:'mast',section:'rigging',label:'Mástil',column:0},{id:'standing',section:'rigging',label:'Jarcia firme',column:1},{id:'running',section:'rigging',label:'Jarcia de labor',column:1},{id:'boom',section:'rigging',label:'Botavara',column:1},{id:'mainsail',section:'rigging',label:'Vela mayor',column:2},{id:'headsail',section:'rigging',label:'Vela de proa',column:2},{id:'winch',section:'rigging',label:'Winche',column:2},
 {id:'liferaft',section:'safety',label:'Balsa salvavidas',column:0},{id:'lifejacket',section:'safety',label:'Chaleco salvavidas',column:0},{id:'extinguisher',section:'safety',label:'Extintor',column:1},{id:'epirb',section:'safety',label:'Radiobaliza EPIRB',column:1},{id:'lifebuoy',section:'safety',label:'Aro salvavidas',column:0},{id:'flares',section:'safety',label:'Señales pirotécnicas',column:2},{id:'firstaid',section:'safety',label:'Botiquín',column:2},{id:'bilgepump',section:'safety',label:'Bomba de achique',column:1},
 {id:'custom-propulsion',section:'propulsion',label:'Otro equipo de propulsión',column:2},{id:'custom-electronics',section:'electronics',label:'Otro equipo electrónico',column:2},{id:'custom-rigging',section:'rigging',label:'Otro elemento de aparejo',column:2},{id:'custom-safety',section:'safety',label:'Otro equipo de seguridad',column:2},
] as const satisfies readonly {id:string;section:SystemSection;label:string;column:0|1|2}[];
export const conditionLabels:Record<EquipmentCondition,string>={unknown:'Estado desconocido','declared-operational':'Operativo · declaración manual','needs-service':'Revisión necesaria · manual','out-of-service':'Fuera de servicio · manual'};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const text=(v:unknown,max=240):v is string=>typeof v==='string'&&v.length<=max;
const required=(v:unknown):v is string=>text(v)&&!!v.trim();
const date=(v:unknown)=>v===''||typeof v==='string'&&calendarDay(v)!==null;
export function validateSystems(value:unknown,externalIds:readonly string[]):asserts value is OnboardSystems {
 if(!object(value)||value.version!==1||Object.keys(value).some(k=>!['version','equipment','links'].includes(k))||!Array.isArray(value.equipment)||!Array.isArray(value.links)||value.equipment.length>2000||value.links.length>4000)throw new Error('Formato de sistemas no compatible');
 const ids=new Set(externalIds),equipment=new Map<string,SystemEquipment>();
 const fields=['id','section','catalogId','name','manufacturer','model','serial','location','specification','condition','lastService','nextService','notes','archived'];
 for(const item of value.equipment){
  if(!object(item)||Object.keys(item).length!==fields.length||Object.keys(item).some(k=>!fields.includes(k))||!required(item.id)||ids.has(item.id)||!required(item.name)||!SYSTEM_SECTIONS.includes(item.section as SystemSection)||!SYSTEM_CATALOG.some(c=>c.id===item.catalogId&&c.section===item.section)||typeof item.archived!=='boolean'||!text(item.condition)||!Object.hasOwn(conditionLabels,item.condition)||!date(item.lastService)||!date(item.nextService)||!['manufacturer','model','serial','location','specification'].every(k=>text(item[k]))||!text(item.notes,4000))throw new Error('Ficha de equipo inválida, incompatible o duplicada');
  ids.add(item.id);equipment.set(item.id,item as unknown as SystemEquipment);
 }
 const routes=new Set<string>();
 for(const link of value.links){
  if(!object(link)||Object.keys(link).length!==4||Object.keys(link).some(k=>!['id','from','to','label'].includes(k))||!required(link.id)||ids.has(link.id)||!required(link.from)||!required(link.to)||!required(link.label))throw new Error('Relación inválida o duplicada');
  const a=equipment.get(link.from),b=equipment.get(link.to),key=JSON.stringify([link.from,link.to]);
  if(!a||!b||a.id===b.id||a.section!==b.section||routes.has(key))throw new Error('Los equipos deben pertenecer al mismo sistema y embarcación');
  ids.add(link.id);routes.add(key);
 }
}
export const systemExternalIds=(inventory:TechnicalInventory)=>[...inventory.components.map(c=>c.id),...(inventory.installation?.nodes.map(n=>n.id)??[]),...(inventory.installation?.links.map(l=>l.id)??[]),...(inventory.electrical?.wires.map(w=>w.id)??[])];
export function putSystemEquipment(inventory:TechnicalInventory,equipment:SystemEquipment):TechnicalInventory {
 const systems=inventory.systems??{version:1 as const,equipment:[],links:[]};
 const next={...systems,equipment:systems.equipment.some(e=>e.id===equipment.id)?systems.equipment.map(e=>e.id===equipment.id?equipment:e):[...systems.equipment,equipment]};
 validateSystems(next,systemExternalIds(inventory));return {...inventory,systems:next};
}
export function createSystemEquipment(section:SystemSection,catalogId:string,id:string=crypto.randomUUID()):SystemEquipment {
 const item=SYSTEM_CATALOG.find(c=>c.id===catalogId&&c.section===section);if(!item)throw new Error('Equipo no disponible para este sistema');
 return {id,section,catalogId,name:item.label,manufacturer:'',model:'',serial:'',location:'',specification:'',condition:'unknown',lastService:'',nextService:'',notes:'',archived:false};
}
export function putSystemLink(inventory:TechnicalInventory,link:SystemRelationship):TechnicalInventory {
 const systems=inventory.systems??{version:1 as const,equipment:[],links:[]};const next={...systems,links:[...systems.links.filter(l=>l.id!==link.id),link]};
 validateSystems(next,systemExternalIds(inventory));return {...inventory,systems:next};
}
export function systemLayout(equipment:readonly SystemEquipment[]){
 const positions=new Map<string,{x:number;y:number}>();let maxRows=1;
 for(const column of [0,1,2]){const group=equipment.filter(e=>(SYSTEM_CATALOG.find(c=>c.id===e.catalogId)?.column??2)===column);maxRows=Math.max(maxRows,group.length);group.forEach((e,i)=>positions.set(e.id,{x:35+column*400,y:65+i*205}));}
 return {positions,height:Math.max(360,maxRows*205+75)};
}

/** Route through the gaps in the fixed column layout, without visually joining intervening equipment. */
export function systemRelationshipPath(a:{x:number;y:number},b:{x:number;y:number}):string {
 const ay=a.y+75,by=b.y+75;
 if(a.x===b.x){const edge=a.x+330,lane=edge+25;return `M${edge} ${ay} C${lane} ${ay} ${lane} ${ay} ${lane} ${ay} L${lane} ${by} Q${lane} ${by} ${edge} ${by}`;}
 const forward=b.x>a.x,ax=a.x+(forward?330:0),bx=b.x+(forward?0:330);
 if(a.y===b.y&&Math.abs(a.x-b.x)===400){const mid=(ax+bx)/2;return `M${ax} ${ay} C${mid} ${ay} ${mid} ${by} ${bx} ${by}`;}
 const out=ax+(forward?20:-20),into=bx+(forward?-20:20),bus=Math.min(a.y,b.y)-22;
 return `M${ax} ${ay} Q${out} ${ay} ${out} ${ay-20} V${bus+10} Q${out} ${bus} ${out+(forward?10:-10)} ${bus} H${into+(forward?-10:10)} Q${into} ${bus} ${into} ${bus+10} V${by-20} Q${into} ${by} ${bx} ${by}`;
}
