import type { ElectricalDevice } from './types';
import { ownerColumn } from './ownerModel';

export interface MapPoint { x:number; y:number }
/** Presentation coordinates only. Inventory topology, terminals and saved editor positions remain untouched. */
export function visualMapLayout(devices:readonly ElectricalDevice[]) {
  const positions=new Map<string,MapPoint>();
  let y=30;
  for(const group of [0,1,2,3] as const){
    const priority=['shore','alternator','solar','charger','bank-starter','bank-service'];
    const rank=(d:ElectricalDevice)=>{const index=priority.indexOf(d.catalogId);return index<0?priority.length:index;};
    const items=devices.filter(d=>ownerColumn(d)===group).sort((a,b)=>rank(a)-rank(b));
    items.forEach((d,i)=>positions.set(d.componentId,{x:items.length===1?280:i%2===0?30:530,y:y+Math.floor(i/2)*190}));
    if(items.length)y+=Math.ceil(items.length/2)*190;
  }
  const consumers=devices.filter(d=>ownerColumn(d)===4);
  consumers.forEach((d,i)=>positions.set(d.componentId,{x:940,y:346+i*64}));
  return {positions,height:Math.max(650,y+20,consumers.length*64+370)};
}
/** A single functional route for a group of existing conductors; never creates an inferred edge. */
export function visualMapPath(a:MapPoint,b:MapPoint):string {
  if(b.x>=940){const x=a.x+330,y=a.y+75,end=b.y+36;return `M${x} ${y} C${x+70} ${y} 895 ${end} ${b.x} ${end}`;}
  const down=b.y>a.y,ax=a.x+165,bx=b.x+165,ay=a.y+(down?150:0),by=b.y+(down?0:150);
  if(a.y===b.y)return `M${a.x+330} ${a.y+75} C${a.x+400} ${a.y+75} ${b.x-70} ${b.y+75} ${b.x} ${b.y+75}`;
  const mid=(ay+by)/2;
  // The starboard lane keeps an alternator-to-bank route clear of the central shore charger.
  if(Math.abs(by-ay)>220&&a.x>=500){const lane=900;return `M${ax} ${ay} C${ax} ${ay+25} ${lane} ${ay+25} ${lane} ${ay+55} L${lane} ${by-35} Q${lane} ${by-15} ${bx} ${by-15} L${bx} ${by}`;}
  return `M${ax} ${ay} C${ax} ${mid} ${bx} ${mid} ${bx} ${by}`;
}

import type { OwnerLink } from './ownerModel';
import type { TechnicalInventory } from '../model';
/** Manual declarations are confirmed topology only when all required conductors have known compatible terminals. */
export function mapLinkEvidence(inventory:TechnicalInventory,link:OwnerLink):'confirmed'|'suggested'|'unknown'{
  const endpoints=inventory.electrical?.devices.filter(d=>d.componentId===link.from||d.componentId===link.to)??[];
  if(endpoints.some(d=>d.provenance==='template'))return 'suggested';
  if(endpoints.length!==2||endpoints.some(d=>d.provenance!=='manual'))return 'unknown';
  if(link.wires.some(w=>w.provenance==='template'))return 'suggested';
  if(!link.wires.length||link.wires.some(w=>w.provenance!=='manual'))return 'unknown';
  const poles=new Set<string>();
  for(const w of link.wires){
    const a=inventory.electrical?.devices.find(d=>d.componentId===w.from.componentId)?.terminals.find(t=>t.id===w.from.terminalId);
    const b=inventory.electrical?.devices.find(d=>d.componentId===w.to.componentId)?.terminals.find(t=>t.id===w.to.terminalId);
    if(!a||!b||a.domain==='unknown'||a.domain!==b.domain||a.pole==='unknown'||a.pole!==b.pole)return 'unknown';
    poles.add(`${a.domain}:${a.pole}`);
  }
  const domains=new Set(link.wires.map(w=>w.domain));
  for(const domain of domains){const required=domain==='AC'?['line','neutral','earth']:['positive','negative'];if(!required.every(p=>poles.has(`${domain}:${p}`)))return 'unknown';}
  return 'confirmed';
}
