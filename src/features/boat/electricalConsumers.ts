import type { BoatInstrumentSnapshot, LightCircuit } from '../../core/instruments/BoatInstrumentStore';
import { currentValue } from './boatVisualModel';
export const LOAD_GROUPS = ['Iluminación','Electrónica','Navegación','Refrigeración','Bomba de agua','Otros consumidores'] as const;
export type LoadGroup = typeof LOAD_GROUPS[number];
interface ConsumerDefinition {readonly id:string;readonly group:LoadGroup;readonly label:string;readonly amps:number;readonly circuit?:LightCircuit}
/** Nominal currents are editable test parameters, not equipment specifications. */
export const CONSUMERS = [
 {id:'cabin',group:'Iluminación',label:'Interior',amps:1,circuit:'LIGHT_CABIN_RELAY'},
 // Independent local accessory: no NMEA relay identifier or unverified hardware current.
 {id:'fog',group:'Iluminación',label:'Luz de niebla',amps:0},
 {id:'deck',group:'Iluminación',label:'Cubierta',amps:2,circuit:'LIGHT_DECK_RELAY'},
 {id:'plotter',group:'Electrónica',label:'Plotter',amps:1.5},
 {id:'radio',group:'Electrónica',label:'Radio VHF',amps:1},
 {id:'ais',group:'Electrónica',label:'AIS',amps:.5},
 {id:'instruments',group:'Electrónica',label:'Instrumentación',amps:.5},
 {id:'port',group:'Navegación',label:'Costado babor',amps:.3,circuit:'LIGHT_PORT_RELAY'},
 {id:'starboard',group:'Navegación',label:'Costado estribor',amps:.3,circuit:'LIGHT_STARBOARD_RELAY'},
 {id:'stern',group:'Navegación',label:'Alcance',amps:.3,circuit:'LIGHT_STERN_RELAY'},
 {id:'masthead',group:'Navegación',label:'Tope',amps:.3,circuit:'LIGHT_MASTHEAD_RELAY'},
 {id:'tricolor',group:'Navegación',label:'Tricolor',amps:.5,circuit:'LIGHT_TRICOLOR_RELAY'},
 {id:'anchor',group:'Navegación',label:'Fondeo',amps:.3,circuit:'LIGHT_ANCHOR_RELAY'},
 {id:'fridge',group:'Refrigeración',label:'Nevera',amps:4},
 {id:'freezer',group:'Refrigeración',label:'Congelador',amps:5},
 {id:'freshPump',group:'Bomba de agua',label:'Agua dulce',amps:4},
 {id:'bilgePump',group:'Bomba de agua',label:'Achique',amps:5},
 {id:'inverter',group:'Otros consumidores',label:'Inversor',amps:8},
 {id:'outlets',group:'Otros consumidores',label:'Tomas DC',amps:2},
 {id:'usb',group:'Otros consumidores',label:'USB',amps:1}
] as const satisfies readonly ConsumerDefinition[];
export type ConsumerId = typeof CONSUMERS[number]['id'];
export interface ConsumerSetting {readonly on:boolean|null;readonly amps:number}
export type ConsumerSettings = Partial<Record<ConsumerId,ConsumerSetting>>;
export interface ResolvedConsumer {readonly id:ConsumerId;readonly group:LoadGroup;readonly label:string;readonly circuit?:LightCircuit;readonly on:boolean;readonly known:boolean;readonly amps:number;readonly overridden:boolean}
export function sanitizeConsumers(value:unknown):ConsumerSettings {
 const result:ConsumerSettings={};if(!value||typeof value!=='object')return result;
 const record=value as Record<string,unknown>;
 for(const definition of CONSUMERS){const entry=record[definition.id];if(!entry||typeof entry!=='object')continue;const candidate=entry as Record<string,unknown>;
 result[definition.id]={on:typeof candidate.on==='boolean'?candidate.on:null,amps:typeof candidate.amps==='number'&&Number.isFinite(candidate.amps)?Math.min(200,Math.max(0,candidate.amps)):definition.amps};}
 return result;
}
export function resolveConsumers(raw:BoatInstrumentSnapshot,settings:ConsumerSettings|undefined):ResolvedConsumer[]{
 return CONSUMERS.map(definition=>{
  const circuit='circuit' in definition?definition.circuit:undefined;
  const reading=circuit?currentValue(raw.lights?.find(light=>light.circuit===circuit)?.relay??null):null;
  const setting=settings?.[definition.id];const overridden=setting?.on!==undefined&&setting.on!==null;
  return {...definition,circuit,on:overridden?setting.on===true:reading===1,known:overridden||reading!==null||!circuit,amps:setting?.amps??definition.amps,overridden};
 });
}
