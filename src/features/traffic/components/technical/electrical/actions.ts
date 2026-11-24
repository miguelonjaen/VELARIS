import { newComponent, parseInventory, type Bank, type Battery, type TechnicalInventory } from '../model';
import { catalogItem, deviceDefaults } from './catalog';
import { bankForWire } from './model';
import type { ElectricalSystem, ElectricalWire, Endpoint, Terminal } from './types';

export const emptyElectrical=():ElectricalSystem=>({version:1,devices:[],nodes:[],wires:[],banks:[],viewport:{x:0,y:0,zoom:0.8},origin:'custom'});
export function initializeElectrical(inventory:TechnicalInventory):TechnicalInventory {
  if(inventory.electrical)return inventory;
  const system=emptyElectrical();system.origin='legacy';
  const equipment=[...inventory.components.filter(c=>c.kind!=='tank'),...(inventory.installation?.nodes.filter(n=>n.kind!=='consumer'||!inventory.installation?.links.some(l=>l.medium==='pipe'&&(l.from===n.id||l.to===n.id))||inventory.installation?.links.some(l=>l.medium==='cable'&&(l.from===n.id||l.to===n.id)))??[])];
  for(const [index,c]of equipment.entries()){
    const catalogId=c.kind==='bank'?`bank-${c.purpose==='other'?'custom':c.purpose}`:c.kind==='consumer'?'custom-consumer':c.kind==='electrical'?'custom-source':c.kind;
    system.devices.push(deviceDefaults(c.id,catalogId,'legacy'));system.nodes.push({componentId:c.id,x:(index%4)*320,y:Math.floor(index/4)*350});
  }
  for(const link of inventory.installation?.links.filter(link=>link.medium==='cable')??[]){
    const from=system.devices.find(d=>d.componentId===link.from),to=system.devices.find(d=>d.componentId===link.to);if(!from||!to)continue;
    const unknown=(id:string,label:string):Terminal=>({id,label,domain:'unknown',direction:'bidirectional',pole:'unknown',nominalV:null});
    from.terminals.push(unknown(`legacy-${link.id}-from`,'Conexión antigua · asignar terminal'));to.terminals.push(unknown(`legacy-${link.id}-to`,'Conexión antigua · asignar terminal'));
    system.wires.push({id:link.id,from:{componentId:from.componentId,terminalId:`legacy-${link.id}-from`},to:{componentId:to.componentId,terminalId:`legacy-${link.id}-to`},domain:'unknown',nominalV:null,cable:'',sectionMm2:null,lengthM:null,protectionId:null,notes:link.name,provenance:'legacy',bankId:null});
  }
  for(const bank of inventory.components.filter((c):c is Bank=>c.kind==='bank')){
    const ids=inventory.components.filter(c=>c.kind==='battery'&&c.bankId===bank.id).map(c=>c.id);
    system.banks.push({bankId:bank.id,strings:bank.topology==='series'&&ids.length?[ids]:bank.topology==='parallel'?ids.map(id=>[id]):[]});
  }
  return parseInventory({...inventory,electrical:system});
}
export function addElectricalEquipment(inventory:TechnicalInventory,catalogId:string,position={x:80,y:80},id:string=crypto.randomUUID()):TechnicalInventory {
  const item=catalogItem(catalogId);if(!item)throw new Error('Equipo no disponible');
  const next=initializeElectrical(inventory),system=structuredClone(next.electrical!);
  const components=[...next.components];const installation=next.installation??{nodes:[],links:[]};const nodes=[...installation.nodes];
  const names=new Set([...components,...nodes].map(c=>c.name));let name=item.label,sequence=2;while(names.has(name))name=`${item.label} ${sequence++}`;
  if(item.masterKind==='battery'||item.masterKind==='bank'){
    const component={...newComponent(item.masterKind,id),name};
    if(component.kind==='bank')component.purpose=catalogId==='bank-starter'?'starter':catalogId==='bank-service'?'service':catalogId==='bank-auxiliary'?'auxiliary':'other';
    components.push(component);if(component.kind==='bank')system.banks.push({bankId:id,strings:[]});
  }else nodes.push({id,kind:item.masterKind,name,location:'',manufacturer:'',model:''});
  system.devices.push(deviceDefaults(id,catalogId));system.nodes.push({componentId:id,...position});
  return parseInventory({...next,components,installation:{...installation,nodes},electrical:system});
}
export function makeWire(system:ElectricalSystem,from:Endpoint,to:Endpoint,id:string=crypto.randomUUID()):ElectricalWire {
  const terminal=(end:Endpoint)=>system.devices.find(d=>d.componentId===end.componentId)?.terminals.find(t=>t.id===end.terminalId);
  const a=terminal(from),b=terminal(to);if(!a||!b)throw new Error('Selecciona dos terminales existentes');
  return {id,from,to,domain:a.domain===b.domain?a.domain:'unknown',nominalV:null,cable:'',sectionMm2:null,lengthM:null,protectionId:null,notes:'',provenance:'manual',bankId:bankForWire(system,from,to)};
}
export function putElectrical(inventory:TechnicalInventory,system:ElectricalSystem):TechnicalInventory {return parseInventory({...inventory,electrical:system});}
export function removeElectricalEquipment(inventory:TechnicalInventory,componentId:string):TechnicalInventory {
  const system=inventory.electrical;if(!system)throw new Error('Esquema eléctrico no disponible');
  if(inventory.components.some(c=>c.kind==='battery'&&c.bankId===componentId))throw new Error('Retira o reasigna primero las baterías del banco desde el panel Bancos');
  const installation=inventory.installation,removedLinks=installation?.links.filter(l=>l.from===componentId||l.to===componentId).map(l=>l.id)??[];
  return parseInventory({...inventory,components:inventory.components.filter(c=>c.id!==componentId),
    installation:installation?{...installation,nodes:installation.nodes.filter(c=>c.id!==componentId),links:installation.links.filter(l=>!removedLinks.includes(l.id)),...(installation.bindings?{bindings:installation.bindings.filter(b=>b.targetId!==componentId&&!removedLinks.includes(b.targetId))}:{})}:undefined,
    electrical:{...system,devices:system.devices.filter(d=>d.componentId!==componentId),nodes:system.nodes.filter(n=>n.componentId!==componentId),wires:system.wires.filter(w=>w.from.componentId!==componentId&&w.to.componentId!==componentId).map(w=>({...w,protectionId:w.protectionId===componentId?null:w.protectionId})),banks:system.banks.filter(b=>b.bankId!==componentId).map(b=>({...b,strings:b.strings.map(s=>s.filter(id=>id!==componentId)).filter(s=>s.length)}))}});
}

/** Explicit user operation: generate both poles and series jumpers for the selected strings. */
export function configureBank(inventory:TechnicalInventory,bankId:string,strings:string[][]):TechnicalInventory {
  const next=initializeElectrical(inventory),system=structuredClone(next.electrical!);
  const bank=next.components.find((c):c is Bank=>c.id===bankId&&c.kind==='bank');if(!bank)throw new Error('Banco inexistente');
  const members=strings.flat();if(new Set(members).size!==members.length)throw new Error('Una batería no puede repetirse en las ramas');
  if(members.some(id=>!next.components.some(c=>c.id===id&&c.kind==='battery')))throw new Error('Selecciona baterías del inventario');
  const bankDevice=system.devices.find(d=>d.componentId===bankId);if(!bankDevice)throw new Error('Añade el banco al editor');
  const bankPosition=system.nodes.find(n=>n.componentId===bankId)??{componentId:bankId,x:100,y:100};
  if(!system.nodes.some(n=>n.componentId===bankId))system.nodes.push(bankPosition);
  for(const[index,id]of members.entries())if(!system.nodes.some(n=>n.componentId===id))system.nodes.push({componentId:id,x:bankPosition.x+340,y:bankPosition.y+index*300});
  const pole=(componentId:string,polarity:'positive'|'negative')=>{
    const terminal=system.devices.find(d=>d.componentId===componentId)?.terminals.find(t=>t.domain==='DC'&&t.pole===polarity);
    if(!terminal)throw new Error('El banco y sus baterías necesitan terminales DC positivo y negativo');return {componentId,terminalId:terminal.id};
  };
  system.wires=system.wires.filter(w=>w.bankId!==bankId);
  const add=(from:Endpoint,to:Endpoint)=>{if(!system.wires.some(w=>JSON.stringify(w.from)===JSON.stringify(from)&&JSON.stringify(w.to)===JSON.stringify(to)||JSON.stringify(w.from)===JSON.stringify(to)&&JSON.stringify(w.to)===JSON.stringify(from)))system.wires.push({...makeWire(system,from,to),bankId});};
  for(const string of strings){if(!string.length)throw new Error('Las ramas no pueden estar vacías');add(pole(bankId,'positive'),pole(string[0],'positive'));for(let n=1;n<string.length;n++)add(pole(string[n-1],'negative'),pole(string[n],'positive'));add(pole(string[string.length-1],'negative'),pole(bankId,'negative'));}
  system.banks=system.banks.filter(b=>b.bankId!==bankId);system.banks.push({bankId,strings});
  const components=next.components.map(c=>c.kind==='battery'?(members.includes(c.id)?{...c,bankId}:c.bankId===bankId?{...c,bankId:null}:c):c.kind==='bank'&&c.id===bankId?{...c,topology:!strings.length?'unknown' as const:strings.length===1?'series' as const:strings.every(s=>s.length===1)?'parallel' as const:'series-parallel' as const}:c);
  // Never silently move a battery out of another configured bank.
  if(next.components.some(c=>c.kind==='battery'&&members.includes(c.id)&&c.bankId!==null&&c.bankId!==bankId))throw new Error('Retira primero la batería de su banco anterior');
  return parseInventory({...next,components,electrical:system});
}
export function autoArrange(system:ElectricalSystem):ElectricalSystem {
  const incoming=new Map(system.nodes.map(n=>[n.componentId,new Set<string>()]));
  for(const w of system.wires)if(w.from.componentId!==w.to.componentId)incoming.get(w.to.componentId)?.add(w.from.componentId);
  const remaining=new Set(system.nodes.map(n=>n.componentId)),levels=new Map<string,number>();let level=0;
  while(remaining.size){const ready=[...remaining].filter(id=>![...(incoming.get(id)??[])].some(source=>remaining.has(source)));const batch=ready.length?ready:[...remaining].sort();batch.forEach(id=>{levels.set(id,level);remaining.delete(id);});level++;}
  const rows=new Map<number,number>();return {...system,nodes:system.nodes.map(n=>{const x=levels.get(n.componentId)??0,y=rows.get(x)??0;rows.set(x,y+Math.max(280,(system.devices.find(d=>d.componentId===n.componentId)?.terminals.length??0)*26+140));return {...n,x:x*340,y};})};
}
export function applyExampleTemplate(inventory:TechnicalInventory):TechnicalInventory {
  let next=initializeElectrical(inventory);if(next.electrical!.nodes.length||next.electrical!.wires.length)throw new Error('La plantilla se añade únicamente a un lienzo vacío para no alterar un esquema existente');
  const sequence=['shore','breaker','ac-panel','charger','bank-service'];const ids:string[]=[];
  sequence.forEach((catalogId,index)=>{const id=crypto.randomUUID();ids.push(id);next=addElectricalEquipment(next,catalogId,{x:index*340,y:80},id);});
  const system=structuredClone(next.electrical!);system.origin='template';system.devices=system.devices.map(d=>ids.includes(d.componentId)?{...d,provenance:'template'}:d);
  next={...next,components:next.components.map(c=>ids.includes(c.id)?{...c,name:`Ejemplo · ${c.name}`}:c),installation:next.installation?{...next.installation,nodes:next.installation.nodes.map(c=>ids.includes(c.id)?{...c,name:`Ejemplo · ${c.name}`}:c)}:undefined};
  const breaker=system.devices.find(d=>d.componentId===ids[1])!;
  breaker.terminals=breaker.terminals.map(t=>({...t,domain:'AC',pole:'line',nominalV:230}));
  const wire=(from:number,fromPort:string,to:number,toPort:string)=>system.wires.push({...makeWire(system,{componentId:ids[from],terminalId:fromPort},{componentId:ids[to],terminalId:toPort}),provenance:'template'});
  wire(0,'ACL',1,'in');wire(1,'out',2,'INL');wire(0,'ACN',2,'INN');wire(0,'ACPE',2,'INPE');
  for(const pole of ['L','N','PE'])wire(2,`OUT${pole}`,3,`AC${pole}`);
  wire(3,'DC+',4,'BANK+');wire(3,'DC-',4,'BANK-');
  // Editable example only; its terminals and protective scheme require verification.
  return putElectrical(next,system);
}
