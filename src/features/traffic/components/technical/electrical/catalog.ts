import type { ElectricalDomain, ElectricalDevice, Pole, Terminal } from './types';
export interface CatalogItem { id: string; label: string; category: string; masterKind: 'battery' | 'bank' | 'alternator' | 'solar' | 'shore' | 'charger' | 'controller' | 'distributor' | 'consumer' | 'electrical'; ports: Terminal[] }
const port=(id:string,label:string,domain:ElectricalDomain,direction:Terminal['direction'],pole:Pole):Terminal=>({id,label,domain,direction,pole,nominalV:null});
const dc=(prefix:string,direction:Terminal['direction'],domain:ElectricalDomain='DC')=>[port(`${prefix}+`,`${prefix} +`,domain,direction,'positive'),port(`${prefix}-`,`${prefix} −`,domain,direction,'negative')];
const ac=(prefix:string,direction:Terminal['direction'])=>[port(`${prefix}L`,`${prefix} L`,'AC',direction,'line'),port(`${prefix}N`,`${prefix} N`,'AC',direction,'neutral'),port(`${prefix}PE`,`${prefix} PE`,'AC','bidirectional','earth')];
const passive=[port('in','Entrada','unknown','in','unknown'),port('out','Salida','unknown','out','unknown')];
const item=(id:string,label:string,category:string,masterKind:CatalogItem['masterKind'],ports:Terminal[]):CatalogItem=>({id,label,category,masterKind,ports});
export const electricalCatalog: readonly CatalogItem[] = [
  item('shore','Toma de puerto 230 V AC','Fuentes','shore',ac('AC','out')),
  item('alternator','Alternador','Fuentes','alternator',dc('DC','out')),
  item('solar','Panel solar','Fuentes','solar',dc('PV','out','PV')),
  item('generator','Generador AC','Fuentes','electrical',ac('AC','out')),
  item('custom-source','Fuente personalizada','Fuentes','electrical',[port('out','Salida','unknown','out','unknown')]),
  item('charger','Cargador AC/DC','Conversión y gestión','charger',[...ac('AC','in'),...dc('DC','out')]),
  item('dc-charger','Cargador DC/DC','Conversión y gestión','electrical',[...dc('IN','in'),...dc('OUT','out')]),
  item('inverter','Inversor DC/AC','Conversión y gestión','electrical',[...dc('DC','in'),...ac('AC','out')]),
  item('inverter-charger','Inversor/cargador','Conversión y gestión','electrical',[...ac('IN','in'),...ac('OUT','out'),...dc('BAT','bidirectional')]),
  item('controller','Regulador PWM/MPPT','Conversión y gestión','controller',[...dc('PV','in','PV'),...dc('BAT','out')]),
  item('acr','Relé ACR/VSR','Conversión y gestión','electrical',[...dc('A','bidirectional'),...dc('B','bidirectional')]),
  item('distributor','Aislador / repartidor','Conversión y gestión','distributor',[...dc('IN','in'),...dc('OUT1','out'),...dc('OUT2','out')]),
  item('dc-distribution','Distribuidor CC','Conversión y gestión','electrical',[...dc('IN','in'),...dc('OUT','out')]),
  item('ac-transfer','Conmutador de fuentes AC','Conversión y gestión','electrical',[...ac('IN1','in'),...ac('IN2','in'),...ac('OUT','out')]),
  item('bus-positive','Barra positiva','Distribución','electrical',[port('bus1','Positivo 1','DC','bidirectional','positive'),port('bus2','Positivo 2','DC','bidirectional','positive')]),
  item('bus-negative','Barra negativa','Distribución','electrical',[port('bus1','Negativo 1','DC','bidirectional','negative'),port('bus2','Negativo 2','DC','bidirectional','negative')]),
  item('battery','Batería','Almacenamiento','battery',dc('BAT','bidirectional')),
  ...['starter','service','auxiliary','custom'].map(purpose=>item(`bank-${purpose}`,`Banco de ${purpose==='starter'?'arranque':purpose==='service'?'servicio':purpose==='auxiliary'?'auxiliares':'uso personalizado'}`,'Almacenamiento','bank',dc('BANK','bidirectional'))),
  ...[['fuse','Fusible'],['breaker','Magnetotérmico'],['rcd','Diferencial'],['switch','Interruptor / seccionador'],['shunt','Shunt'],['terminal','Borne / punto de conexión']].map(([id,label])=>item(id,label,'Protección y control','electrical',passive)),
  item('ac-panel','Cuadro AC','Protección y control','electrical',[...ac('IN','in'),...ac('OUT','out')]),
  item('dc-panel','Cuadro DC','Protección y control','electrical',[...dc('IN','in'),...dc('OUT','out')]),
  item('monitor','Monitor de baterías','Protección y control','electrical',dc('DC','in')),
  item('ac-socket','Toma de corriente 230 V','Consumos','consumer',ac('AC','in')),
  ...[['lighting','Iluminación'],['navigation','Electrónica de navegación'],['pump','Bomba'],['fridge','Nevera'],['windlass','Molinete'],['autopilot','Piloto automático'],['custom-consumer','Consumidor personalizado']].map(([id,label])=>item(id,label,'Consumos','consumer',dc('DC','in'))),
];
export const catalogItem=(id:string)=>electricalCatalog.find(item=>item.id===id);
export function deviceDefaults(componentId:string,catalogId:string,provenance:ElectricalDevice['provenance']='manual'):ElectricalDevice {
  const item=catalogItem(catalogId);if(!item)throw new Error('Equipo de catálogo no compatible');
  return {componentId,catalogId,terminals:item.ports.map(port=>({...port})),nominalV:null,ratedA:null,ratedW:null,installedOn:'',condition:'Sin comprobar',notes:'',provenance};
}
