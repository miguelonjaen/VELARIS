import type { Bank, Battery, TechnicalInventory } from '../model';
import { catalogItem } from './catalog';
import type { ElectricalSystem, Endpoint } from './types';
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const text=(v:unknown,max=240):v is string=>typeof v==='string'&&v.length<=max;
const number=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const nullablePositive=(v:unknown)=>v===null||number(v)&&v>0;
const keys=(v:Record<string,unknown>,allowed:string[])=>Object.keys(v).every(key=>allowed.includes(key))&&allowed.every(key=>key in v);
const domains=['AC','DC','PV','unknown'];
/** A wire belongs to a bank only when its exact poles match an explicitly declared string. */
export function bankForWire(system:ElectricalSystem,from:Endpoint,to:Endpoint):string|null {
  const terminal=(end:Endpoint)=>system.devices.find(d=>d.componentId===end.componentId)?.terminals.find(t=>t.id===end.terminalId);
  const a=terminal(from),b=terminal(to);if(a?.domain!=='DC'||b?.domain!=='DC')return null;
  const pair=(ai:string,ap:string,bi:string,bp:string)=>(from.componentId===ai&&a.pole===ap&&to.componentId===bi&&b.pole===bp)||(to.componentId===ai&&b.pole===ap&&from.componentId===bi&&a.pole===bp);
  for(const bank of system.banks)for(const string of bank.strings)if(pair(bank.bankId,'positive',string[0],'positive')||pair(string.at(-1)!,'negative',bank.bankId,'negative')||string.some((id,index)=>index>0&&pair(string[index-1],'negative',id,'positive')))return bank.bankId;
  return null;
}
export function validateElectricalSystem(value:unknown,inventory:TechnicalInventory):asserts value is ElectricalSystem {
  if(!object(value)||!keys(value,['version','devices','nodes','wires','banks','viewport','origin'])||value.version!==1||!['custom','template','legacy'].includes(String(value.origin))||!Array.isArray(value.devices)||!Array.isArray(value.nodes)||!Array.isArray(value.wires)||!Array.isArray(value.banks)||value.devices.length>4000||value.wires.length>16000)throw new Error('Documento eléctrico no compatible');
  const master=new Map([...inventory.components,...(inventory.installation?.nodes??[])].map(c=>[c.id,c]));
  const ports=new Map<string,Set<string>>();
  for(const d of value.devices){
    if(!object(d)||!keys(d,['componentId','catalogId','terminals','nominalV','ratedA','ratedW','installedOn','condition','notes','provenance'])||!text(d.componentId)||ports.has(d.componentId)||!master.has(d.componentId)||!text(d.catalogId)||!catalogItem(d.catalogId)||!Array.isArray(d.terminals)||d.terminals.length>256||!nullablePositive(d.nominalV)||!nullablePositive(d.ratedA)||!nullablePositive(d.ratedW)||!text(d.installedOn)||!text(d.condition)||!text(d.notes,4000)||!['manual','template','legacy'].includes(String(d.provenance)))throw new Error('Ficha eléctrica inválida o ajena al inventario');
    if(master.get(d.componentId)?.kind!==catalogItem(d.catalogId)?.masterKind)throw new Error('El tipo de equipo eléctrico no coincide con el inventario');
    const ids=new Set<string>();
    for(const p of d.terminals){if(!object(p)||!keys(p,['id','label','domain','direction','pole','nominalV'])||!text(p.id)||!p.id.trim()||ids.has(p.id)||!text(p.label)||!p.label.trim()||!domains.includes(String(p.domain))||!['in','out','bidirectional'].includes(String(p.direction))||!['positive','negative','line','neutral','earth','unknown'].includes(String(p.pole))||!nullablePositive(p.nominalV))throw new Error('Terminal inválido o duplicado');ids.add(p.id);}
    ports.set(d.componentId,ids);
  }
  const nodeIds=new Set<string>();
  for(const n of value.nodes){if(!object(n)||!keys(n,['componentId','x','y'])||!text(n.componentId)||nodeIds.has(n.componentId)||!ports.has(n.componentId)||!number(n.x)||!number(n.y)||Math.abs(n.x)>1e7||Math.abs(n.y)>1e7)throw new Error('Posición de nodo inválida');nodeIds.add(n.componentId);}
  const wireIds=new Set<string>(),routes=new Set<string>();
  for(const w of value.wires){
    if(!object(w)||!keys(w,['id','from','to','domain','nominalV','cable','sectionMm2','lengthM','protectionId','notes','provenance','bankId'])||!text(w.id)||!w.id.trim()||wireIds.has(w.id)||!domains.includes(String(w.domain))||!nullablePositive(w.nominalV)||!text(w.cable)||!nullablePositive(w.sectionMm2)||!(w.lengthM===null||number(w.lengthM)&&w.lengthM>=0)||!(w.protectionId===null||text(w.protectionId)&&ports.has(w.protectionId))||!text(w.notes,4000)||!['manual','template','legacy'].includes(String(w.provenance))||!(w.bankId===null||inventory.components.some(c=>c.id===w.bankId&&c.kind==='bank')))throw new Error('Características de cable inválidas');
    for(const end of [w.from,w.to])if(!object(end)||!keys(end,['componentId','terminalId'])||!text(end.componentId)||!text(end.terminalId)||!ports.get(end.componentId)?.has(end.terminalId))throw new Error('Extremo eléctrico inexistente');
    const from=w.from as {componentId:string;terminalId:string},to=w.to as typeof from;
    if(from.componentId===to.componentId&&from.terminalId===to.terminalId)throw new Error('Un terminal no puede conectarse consigo mismo');
    const route=[JSON.stringify(from),JSON.stringify(to)].sort().join('|');if(routes.has(route))throw new Error('Cable duplicado');routes.add(route);wireIds.add(w.id);
  }
  const banks=new Set<string>(),members=new Set<string>();
  for(const b of value.banks){if(!object(b)||!keys(b,['bankId','strings'])||!text(b.bankId)||banks.has(b.bankId)||!inventory.components.some(c=>c.kind==='bank'&&c.id===b.bankId)||!Array.isArray(b.strings))throw new Error('Configuración de banco inválida');banks.add(b.bankId);
    for(const string of b.strings){if(!Array.isArray(string)||!string.length)throw new Error('Rama de banco vacía');for(const id of string){if(!text(id)||members.has(id)||!inventory.components.some(c=>c.kind==='battery'&&c.id===id&&c.bankId===b.bankId))throw new Error('Batería duplicada o asignada a otro banco');members.add(id);}}
  }
  if(!object(value.viewport)||!keys(value.viewport,['x','y','zoom'])||!number(value.viewport.x)||!number(value.viewport.y)||!number(value.viewport.zoom)||value.viewport.zoom<0.05||value.viewport.zoom>4)throw new Error('Vista eléctrica inválida');
}

/** Series strings in parallel. Equivalent ratings, never available energy or SOC. */
export function electricalBankNominal(bank:Bank,inventory:TechnicalInventory):{volts:number|null;ah:number|null;wh:number|null;reason:string}|null {
  const unknown=(reason:string)=>({volts:null,ah:null,wh:null,reason});
  if(!inventory.electrical)return null;
  const configuration=inventory.electrical.banks.find(b=>b.bankId===bank.id);if(!configuration)return unknown('Conexiones del banco pendientes');
  const assigned=inventory.components.filter((c):c is Battery=>c.kind==='battery'&&c.bankId===bank.id);
  const ids=configuration.strings.flat();if(!ids.length)return unknown('Conexiones del banco pendientes');
  if(ids.length!==assigned.length||assigned.some(c=>!ids.includes(c.id)))return unknown('Hay baterías del banco sin configurar');
  const map=new Map(assigned.map(c=>[c.id,c]));
  const system=inventory.electrical!;
  const terminal=(id:string,pole:string)=>system.devices.find(d=>d.componentId===id)?.terminals.find(t=>t.pole===pole&&t.domain==='DC')?.id;
  const connected=(a:string,ap:string,b:string,bp:string)=>{const at=terminal(a,ap),bt=terminal(b,bp);return !!at&&!!bt&&system.wires.some(w=>(w.from.componentId===a&&w.from.terminalId===at&&w.to.componentId===b&&w.to.terminalId===bt)||(w.to.componentId===a&&w.to.terminalId===at&&w.from.componentId===b&&w.from.terminalId===bt));};
  for(const string of configuration.strings){if(!connected(bank.id,'positive',string[0],'positive')||!connected(string.at(-1)!,'negative',bank.id,'negative')||string.some((id,index)=>index>0&&!connected(string[index-1],'negative',id,'positive')))return unknown('Faltan conexiones de terminales del banco');}
  if(assigned.some(c=>c.nominalV===null||c.capacityAh===null||['unknown','other'].includes(c.chemistry)))return unknown('Características nominales incompletas');
  if(new Set(assigned.map(c=>c.chemistry)).size!==1)return unknown('Tecnologías de batería incompatibles');
  const strings=configuration.strings.map(ids=>ids.map(id=>map.get(id)!));
  const volts=strings.map(cells=>cells.reduce((sum,c)=>sum+c.nominalV!,0));
  if(volts.some(v=>Math.abs(v-volts[0])>0.001))return unknown('Ramas en paralelo con tensiones diferentes');
  const ah=strings.reduce((sum,cells)=>sum+Math.min(...cells.map(c=>c.capacityAh!)),0);
  if(!Number.isFinite(volts[0]*ah))return unknown('Nominal fuera de rango');
  return {volts:volts[0],ah,wh:volts[0]*ah,reason:'Calculado según ramas declaradas · nominal, no capacidad útil'};
}
