import type { ElectricalDevice, Terminal } from './types';

export type ElectricalSection='AC'|'DC'|'bridge'|'unknown';
export function electricalSection(device:{terminals:readonly Terminal[]}):ElectricalSection {
  const ac=device.terminals.some(t=>t.domain==='AC');
  const dc=device.terminals.some(t=>t.domain==='DC'||t.domain==='PV');
  return ac&&dc?'bridge':ac?'AC':dc?'DC':'unknown';
}
export interface SectionPoint { x:number;y:number;section:ElectricalSection }

/** Presentation only: never moves the saved advanced-editor nodes or changes a cable. */
export function sectionLayout(devices:readonly ElectricalDevice[]){
  const ac=devices.filter(d=>electricalSection(d)==='AC');
  const bridges=devices.filter(d=>electricalSection(d)==='bridge');
  const dc=devices.filter(d=>['DC','unknown'].includes(electricalSection(d)));
  const priority=(d:ElectricalDevice)=>{
    const ids=['alternator','bank-starter','acr','distributor','bank-service','bus-positive','dc-distribution','dc-panel','solar','controller'];
    const index=ids.indexOf(d.catalogId);return index<0?ids.length:index;
  };
  const orderedDC=[...dc].sort((a,b)=>priority(a)-priority(b));
  const positions=new Map<string,SectionPoint>();
  const row=(items:readonly ElectricalDevice[],top:number,section?:ElectricalSection)=>items.forEach((device,index)=>{
    const r=Math.floor(index/6),itemsOnRow=Math.min(6,items.length-r*6);
    const spacing=1160/itemsOnRow;
    positions.set(device.componentId,{x:20+spacing*(index%6)+(spacing-180)/2,y:top+r*150,section:section??electricalSection(device)});
  });
  row(ac,68,'AC');
  const acBottom=68+Math.max(1,Math.ceil(ac.length/6))*150;
  row(bridges,acBottom+8,'bridge');
  const divider=acBottom+8+Math.max(0,Math.ceil(bridges.length/6)-1)*150+48;
  row(orderedDC,divider+112);
  const height=divider+112+Math.max(1,Math.ceil(dc.length/6))*150+50;
  return {positions,divider,height,ac,bridges,dc};
}

export function sectionWirePath(a:SectionPoint,b:SectionPoint,offset:number,points:Iterable<SectionPoint>=[]):string{
  const forward=b.x>a.x,x1=a.x+(forward?140:40),x2=b.x+(forward?40:140),y1=a.y+48+offset,y2=b.y+48+offset;
  const blocker=[...points].some(p=>p!==a&&p!==b&&Math.abs(p.y-a.y)<5&&p.x>Math.min(a.x,b.x)&&p.x<Math.max(a.x,b.x));
  if(a.section==='DC'&&b.section==='DC'&&(Math.abs(a.y-b.y)>100||blocker)){
    const sameRow=Math.abs(a.y-b.y)<5;
    const busY=(sameRow?a.y-20:Math.min(a.y,b.y)+141)+offset;
    const out=a.x+(forward?186:-6)+offset/3,into=b.x+(forward?-6:186)+offset/3;
    return `M${x1},${y1} H${out} V${busY} H${into} V${y2} H${x2}`;
  }
  if(Math.abs(b.y-a.y)>110&&Math.abs(b.x-a.x)<200){
    const down=b.y>a.y,x1=a.x+90+offset,x2=b.x+90+offset,y1=a.y+(down?73:12),y2=b.y+(down?12:73),mid=(y1+y2)/2;
    return `M${x1},${y1} C${x1},${mid} ${x2},${mid} ${x2},${y2}`;
  }
  const mid=(x1+x2)/2;
  return `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`;
}
