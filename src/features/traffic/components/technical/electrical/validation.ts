import type { TechnicalInventory } from '../model';
import { bankForWire, electricalBankNominal } from './model';
import type { ElectricalIssue, ElectricalSystem, ElectricalWire } from './types';
const protective=['fuse','breaker','rcd'];
export function connectionIssues(system:ElectricalSystem,wire:ElectricalWire):ElectricalIssue[] {
  const issues:ElectricalIssue[]=[];
  const device=(id:string)=>system.devices.find(d=>d.componentId===id);
  const a=device(wire.from.componentId)?.terminals.find(t=>t.id===wire.from.terminalId),b=device(wire.to.componentId)?.terminals.find(t=>t.id===wire.to.terminalId);
  const add=(severity:ElectricalIssue['severity'],code:string,message:string)=>issues.push({severity,code,message,wireId:wire.id});
  if(!a||!b){add('error','endpoint','Terminal inexistente');return issues;}
  const fromDevice=device(wire.from.componentId),toDevice=device(wire.to.componentId);
  if(fromDevice?.catalogId==='alternator'&&['charger','inverter-charger'].includes(toDevice?.catalogId??''))add('error','alternator-shore-charger','El alternador no debe conectarse al cargador de puerto; revisar su ruta DC independiente.');
  const associatedBank=bankForWire(system,wire.from,wire.to);
  if(wire.bankId&&wire.bankId!==associatedBank)add('warning','bank-wire-association','La asociación del cable al banco no coincide con sus terminales y ramas declaradas');
  if(a.domain==='unknown'||b.domain==='unknown')add('pending','domain-unknown','Tipo de corriente del terminal pendiente');
  else if(a.domain!==b.domain)add('error','domain','No se pueden unir directamente terminales AC, DC o fotovoltaicos de distinto tipo');
  if(a.direction==='in'||b.direction==='out')add('error','direction','Conecta una salida a una entrada, o usa los terminales bidireccionales correspondientes');
  if(a.pole==='unknown'||b.pole==='unknown')add('pending','pole-unknown','Conductor o polaridad pendiente');
  else if(a.pole!==b.pole){
    const bank=associatedBank?system.banks.find(bank=>bank.bankId===associatedBank):undefined;
    const series=bank?.strings.some(string=>string.some((id,index)=>index>0&&((string[index-1]===wire.from.componentId&&id===wire.to.componentId&&a.pole==='negative'&&b.pole==='positive')||(string[index-1]===wire.to.componentId&&id===wire.from.componentId&&b.pole==='negative'&&a.pole==='positive'))));
    if(!series)add('error','polarity','Polaridades o conductores incompatibles');
  }
  const inherited=(id:string)=>{const d=device(id);return d&&new Set(d.terminals.filter(t=>t.domain!=='unknown').map(t=>t.domain)).size===1?d.nominalV:null;};
  const av=a.nominalV??inherited(wire.from.componentId),bv=b.nominalV??inherited(wire.to.componentId);
  if(av!==null&&av!==undefined&&bv!==null&&bv!==undefined&&Math.abs(av-bv)>0.01&&!associatedBank)add('error','voltage','Tensiones nominales de los terminales incompatibles');
  if(!av||!bv)add('pending','voltage-unknown','Tensión de terminal pendiente de verificar');
  if(wire.nominalV!==null&&[av,bv].some(v=>v!==null&&v!==undefined&&Math.abs(v-wire.nominalV!)>0.01)&&!associatedBank)add('error','cable-voltage','La tensión declarada del cable no coincide con el terminal');
  if(wire.domain!=='unknown'&&[a.domain,b.domain].some(d=>d!=='unknown'&&d!==wire.domain))add('error','wire-domain','El tipo de corriente del cable no coincide con los terminales');
  if(wire.protectionId&&!protective.includes(device(wire.protectionId)?.catalogId??''))add('error','protection-type','El equipo referenciado como protección no es un fusible, magnetotérmico o diferencial');
  return issues;
}
export function electricalIssues(inventory:TechnicalInventory):ElectricalIssue[] {
  const original=inventory.electrical;if(!original)return [];
  const system={...original,devices:original.devices.map(d=>{const c=inventory.components.find(c=>c.id===d.componentId);return c?.kind==='battery'?{...d,nominalV:c.nominalV}:c?.kind==='bank'?{...d,nominalV:electricalBankNominal(c,inventory)?.volts??d.nominalV}:d;})};
  const issues=system.wires.flatMap(wire=>connectionIssues(system,wire));
  for(const wire of system.wires)if(wire.sectionMm2===null)issues.push({severity:'pending',code:'wire-section',wireId:wire.id,message:'Sección del conductor pendiente; no se verifica su dimensionamiento'});
  const upstream=new Map<string,Set<string>>();
  for(const wire of system.wires){const a=system.devices.find(d=>d.componentId===wire.from.componentId)?.terminals.find(t=>t.id===wire.from.terminalId),b=system.devices.find(d=>d.componentId===wire.to.componentId)?.terminals.find(t=>t.id===wire.to.terminalId);if(a?.domain==='AC'&&b?.domain==='AC'&&a.pole==='line'&&b.pole==='line')upstream.set(wire.to.componentId,new Set([...(upstream.get(wire.to.componentId)??[]),wire.from.componentId]));}
  const passive=['fuse','breaker','rcd','switch','ac-panel','terminal'];
  for(const device of system.devices.filter(d=>passive.includes(d.catalogId))){
    const sources=new Set<string>(),visited=new Set<string>();const queue=[...(upstream.get(device.componentId)??[])];
    while(queue.length){const id=queue.pop()!;if(visited.has(id))continue;visited.add(id);const candidate=system.devices.find(d=>d.componentId===id);if(!candidate)continue;if(['shore','generator','inverter','inverter-charger'].includes(candidate.catalogId))sources.add(id);else if(passive.includes(candidate.catalogId))queue.push(...(upstream.get(id)??[]));}
    if(sources.size>1)issues.push({severity:'warning',code:'multiple-ac-sources',componentId:device.componentId,message:'Varias fuentes AC llegan a un mismo recorrido sin conmutador identificado. Verificar interbloqueo o sincronización según fabricante; no se presume el estado de los interruptores.'});
  }
  for(const d of system.devices){
    const master=inventory.components.find(c=>c.id===d.componentId)??inventory.installation?.nodes.find(c=>c.id===d.componentId);const name=master?.name??d.componentId;
    const add=(severity:ElectricalIssue['severity'],code:string,message:string)=>issues.push({severity,code,message:`${name}: ${message}`,componentId:d.componentId});
    if(d.provenance==='template')add('pending','template','plantilla orientativa; comprobar equipo y terminales a bordo');
    if(d.provenance==='legacy')add('pending','legacy','equipo heredado: confirmar tipo y terminales del fabricante');
    if((master?.kind==='battery'||master?.kind==='bank')&&d.nominalV!==null&&d.terminals.some(t=>t.nominalV!==null&&Math.abs(t.nominalV-d.nominalV!)>0.01))add('error','terminal-rating','la tensión nominal del terminal no coincide con la del almacenamiento');
    if(d.nominalV===null&&master?.kind!=='battery')add('pending','rating','faltan características nominales para verificar compatibilidad');
    if(!system.wires.some(w=>w.from.componentId===d.componentId||w.to.componentId===d.componentId))add('pending','unconnected','sin conexiones declaradas');
    if(d.terminals.some(t=>t.direction==='in'&&!system.wires.some(w=>w.to.componentId===d.componentId&&w.to.terminalId===t.id||w.from.componentId===d.componentId&&w.from.terminalId===t.id)))add('pending','incomplete','hay entradas sin conectar');
    const connected=(id:string)=>system.wires.some(w=>w.from.componentId===d.componentId&&w.from.terminalId===id||w.to.componentId===d.componentId&&w.to.terminalId===id);
    if(d.terminals.some(t=>(t.pole==='positive'||t.pole==='line')&&connected(t.id))&&d.terminals.some(t=>['negative','neutral','earth'].includes(t.pole)&&!connected(t.id)))add('pending','return-path','hay polos o conductores de retorno/tierra sin conexión declarada; comprobar las salidas compartidas del fabricante');
    if(protective.includes(d.catalogId)&&d.ratedA===null)add('pending','protective-rating','corriente nominal de la protección pendiente');
    if(['shore','generator','battery','bank-starter','bank-service','bank-auxiliary','bank-custom','solar','alternator'].includes(d.catalogId)){
      const outgoing=system.wires.filter(w=>w.from.componentId===d.componentId||w.to.componentId===d.componentId);
      if(outgoing.some(w=>!w.protectionId&&!protective.includes(system.devices.find(x=>x.componentId===(w.from.componentId===d.componentId?w.to.componentId:w.from.componentId))?.catalogId??'')))add('warning','protection','hay una salida sin protección declarada en el cable o equipo adyacente; revisar el recorrido completo');
    }
  }
  for(const bank of inventory.components.filter(c=>c.kind==='bank'))if(bank.kind==='bank'){
    const nominal=electricalBankNominal(bank,inventory);if(nominal&&nominal.wh===null)issues.push({severity:nominal.reason.includes('tensiones diferentes')?'error':'pending',code:'bank-incomplete',message:`${bank.name}: ${nominal.reason}`,componentId:bank.id});
    const declared=original.devices.find(d=>d.componentId===bank.id)?.nominalV;
    if(declared!==null&&declared!==undefined&&nominal?.volts!==null&&nominal?.volts!==undefined&&Math.abs(declared-nominal.volts)>0.01)issues.push({severity:'error',code:'bank-rating',message:`${bank.name}: el nominal declarado no coincide con el calculado a partir de las ramas`,componentId:bank.id});
    const cells=inventory.components.filter(c=>c.kind==='battery'&&c.bankId===bank.id);
    if(new Set(cells.flatMap(c=>c.kind==='battery'&&!['unknown','other'].includes(c.chemistry)?[c.chemistry]:[])).size>1)issues.push({severity:'error',code:'chemistry',message:`${bank.name}: mezcla de tecnologías de baterías`,componentId:bank.id});
    if(new Set(cells.flatMap(c=>c.kind==='battery'&&c.capacityAh!==null?[c.capacityAh]:[])).size>1)issues.push({severity:'warning',code:'capacity',message:`${bank.name}: capacidades diferentes; revisar compatibilidad y regulación`,componentId:bank.id});
  }
  return issues;
}
