import type { TechnicalInventory } from '../model';
import { makeWire, putElectrical } from './actions';
import { electricalIssues } from './validation';
import type { ElectricalDevice, ElectricalWire, Terminal } from './types';

export type OwnerColumn = 0 | 1 | 2 | 3 | 4;
export function ownerColumn(device: Pick<ElectricalDevice,'catalogId'>): OwnerColumn {
  if (['shore','solar','alternator','generator','custom-source'].includes(device.catalogId)) return 0;
  if (device.catalogId==='battery'||device.catalogId.startsWith('bank-')) return 2;
  if (['ac-socket','lighting','navigation','pump','fridge','windlass','autopilot','custom-consumer','monitor'].includes(device.catalogId)) return 4;
  if (['dc-distribution','dc-panel','bus-positive','bus-negative'].includes(device.catalogId)) return 3;
  return 1;
}

export interface OwnerLink { id: string; from: string; to: string; wires: ElectricalWire[] }
/** A summary of actual wires only. Internal bank conductors stay in the bank detail. */
export function ownerDiagram(inventory: TechnicalInventory) {
  const system=inventory.electrical;
  if (!system) return {devices:[], links:[] as OwnerLink[]};
  const visible=new Set(system.nodes.map(n=>n.componentId));
  const members=new Map(inventory.components.flatMap(c=>c.kind==='battery'&&c.bankId?[[c.id,c.bankId] as const]:[]));
  for(const bank of system.banks)for(const id of bank.strings.flat())members.set(id,bank.bankId);
  const resolve=(id:string)=>{const bank=members.get(id);return bank&&visible.has(bank)?bank:id;};
  const devices=system.devices.filter(d=>visible.has(d.componentId)&&resolve(d.componentId)===d.componentId);
  const ids=new Set(devices.map(d=>d.componentId));
  const links=new Map<string,OwnerLink>();
  for(const wire of system.wires){const from=resolve(wire.from.componentId),to=resolve(wire.to.componentId);if(from===to||!ids.has(from)||!ids.has(to))continue;
    const id=JSON.stringify([from,to].sort());const link=links.get(id)??{id,from,to,wires:[]};link.wires.push(wire);links.set(id,link);
  }
  return {devices,links:[...links.values()]};
}

interface PortGroup { id:string; ports:Terminal[] }
function groups(device:ElectricalDevice,side:'from'|'to'):PortGroup[]{
  const grouped=new Map<string,Terminal[]>();
  for(const port of device.terminals){if(port.direction===(side==='from'?'in':'out')||port.domain==='unknown'||port.pole==='unknown')continue;
    const id=`${port.domain}:${port.id.replace(/(PE|[LN+−-])$/,'')}`;grouped.set(id,[...(grouped.get(id)??[]),port]);}
  return [...grouped].map(([id,ports])=>({id,ports})).filter(({ports})=>{
    const required=ports[0].domain==='AC'?['line','neutral','earth']:['positive','negative'];return ports.length===required.length&&required.every(pole=>ports.filter(p=>p.pole===pole).length===1);
  });
}
export interface OwnerConnection { id:string; label:string; pairs:{from:string;to:string}[] }
export function ownerConnections(inventory:TechnicalInventory,fromId:string,toId:string):OwnerConnection[]{
  const system=inventory.electrical;if(!system||fromId===toId)return [];
  const from=system.devices.find(d=>d.componentId===fromId),to=system.devices.find(d=>d.componentId===toId);if(!from||!to)return [];
  // Banks are configured explicitly; connecting two storage boxes must not silently parallel them.
  if(ownerColumn(from)===2&&ownerColumn(to)===2)return [];
  if(from.catalogId==='alternator'&&['charger','inverter-charger'].includes(to.catalogId))return [];
  return groups(from,'from').flatMap(a=>groups(to,'to').filter(b=>a.ports[0].domain===b.ports[0].domain).map(b=>({
    id:JSON.stringify([a.id,b.id]),label:`${a.id.split(':')[1]} → ${b.id.split(':')[1]} · ${a.ports[0].domain==='AC'?'Corriente alterna':a.ports[0].domain==='PV'?'Solar':'Corriente continua'}`,
    pairs:a.ports.map(port=>({from:port.id,to:b.ports.find(p=>p.pole===port.pole)!.id})),
  })));
}
/** One explicit user declaration adds all conductors atomically, without duplicate wires. */
export function connectOwnerEquipment(inventory:TechnicalInventory,fromId:string,toId:string,choiceId:string):TechnicalInventory{
  const choice=ownerConnections(inventory,fromId,toId).find(c=>c.id===choiceId);if(!choice||!inventory.electrical)throw new Error('Esta conexión necesita revisión en la edición avanzada.');
  let system=inventory.electrical;
  for(const pair of choice.pairs){const from={componentId:fromId,terminalId:pair.from},to={componentId:toId,terminalId:pair.to};
    const existing=system.wires.some(w=>(w.from.componentId===fromId&&w.from.terminalId===pair.from&&w.to.componentId===toId&&w.to.terminalId===pair.to)||(w.to.componentId===fromId&&w.to.terminalId===pair.from&&w.from.componentId===toId&&w.from.terminalId===pair.to));
    if(!existing)system={...system,wires:[...system.wires,makeWire(system,from,to)]};
  }
  const next=putElectrical(inventory,system),previousIds=new Set(inventory.electrical.wires.map(w=>w.id));
  const fault=electricalIssues(next).find(i=>i.severity==='error'&&i.wireId&&!previousIds.has(i.wireId));if(fault)throw new Error(fault.message);
  return next;
}
