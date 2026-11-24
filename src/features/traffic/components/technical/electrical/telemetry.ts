import { INSTRUMENT_MAX_AGE_MS, type AgedValue } from '../../../../../core/instruments/BoatInstrumentStore';
import type { TechnicalInventory } from '../model';
import { compatibleTarget, resolveBinding, type ConfirmedConnection, type InstrumentFeed } from '../sensorBindings';
export function electricalTelemetry(inventory:TechnicalInventory,feed:InstrumentFeed|null,confirmation:ConfirmedConnection|null,vesselId:string,now:number):Map<string,string[]> {
  const labels=new Map<string,string[]>(),values=new Map<string,{volts?:AgedValue<number>;amps?:AgedValue<number>}>();
  const add=(id:string,label:string)=>labels.set(id,[...(labels.get(id)??[]),label]);
  for(const binding of inventory.installation?.bindings??[]){
    if(!compatibleTarget(inventory,binding.targetId,binding.channel))continue;
    const resolved=resolveBinding(binding,feed,confirmation,vesselId,now);if(!resolved||!feed||!confirmation)continue;
    const legacy=inventory.installation?.links.find(link=>link.id===binding.targetId),id=legacy?.from??binding.targetId;
    const common=binding.channel.startsWith('solar-')||binding.channel.startsWith('alternator-');
    add(id,`${common?'Salida común · ':''}${resolved.reading.value.toLocaleString('es-ES')} ${resolved.unit} · medido`);
    const pair=values.get(id)??{};
    if(resolved.unit==='V')pair.volts=resolved.reading;
    if(resolved.unit==='A')pair.amps=resolved.reading;
    if((binding.channel==='solar-current'||binding.channel==='alternator-current')&&!inventory.installation?.bindings?.some(b=>b.targetId===id&&b.metric==='voltage')){
      const voltage=binding.channel==='solar-current'?feed.instruments.solar?.outputVolts:feed.instruments.alternatorVolts;
      if(voltage&&Number.isFinite(voltage.value)&&voltage.value>=0&&voltage.value<=1000&&voltage.ageMs>=0&&feed.capturedAt-voltage.ageMs>=confirmation.at&&now-feed.capturedAt+voltage.ageMs<=INSTRUMENT_MAX_AGE_MS.transducer){pair.volts=voltage;add(id,`${voltage.value.toLocaleString('es-ES')} V · medido`);}
    }
    values.set(id,pair);
  }
  for(const[id,pair]of values)if(pair.volts&&pair.amps&&Math.abs(pair.volts.ageMs-pair.amps.ageMs)<=2000&&Number.isFinite(pair.volts.value*pair.amps.value))add(id,`${(pair.volts.value*pair.amps.value).toLocaleString('es-ES',{maximumFractionDigits:1})} W · calculado con V/I medidos`);
  return labels;
}
