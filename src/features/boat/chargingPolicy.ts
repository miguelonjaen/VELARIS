import { currentValue } from './boatVisualModel';
import { calculateSolar, type SolarProduction } from './solarProduction';
import { resolveConsumers, sanitizeConsumers, type ConsumerSettings, type ResolvedConsumer } from './electricalConsumers';
import SunCalc from 'suncalc';
import { measuredEngineRunning, type BoatInstrumentSnapshot, type AgedValue } from '../../core/instruments/BoatInstrumentStore';
export interface ChargeSettings {
  readonly navigationInstallation?: 'separate' | 'tricolor';
  readonly startSocMode?: 'nmea'|'manual';
  readonly startSocPercent?: number|null;
  readonly consumers?: ConsumerSettings;
  readonly solarPanelWatts?:number;
  readonly solarPanelVolts?:number;
  readonly solarIrradiance?:number;
  readonly solarTemperature?:number;
  readonly solarTemperatureCoefficient?:number;
  readonly solarLossPercent?:number;
  readonly solarEfficiency?:number;
  readonly ac: boolean;
  readonly solar: boolean;
  readonly daylight: 'auto' | 'day' | 'night';
  readonly engine: 'nmea' | 'on' | 'off';
  readonly scenarioTime: string;
  readonly solarAmps: number;
  readonly alternatorAmps: number;
  readonly acAmps: number;
  readonly servicePercent: number;
  readonly serviceLoad: number;
  readonly startLoad: number;
}
export const DEFAULT_CHARGE_SETTINGS: ChargeSettings = {
  ac:false, solar:true, daylight:'auto', engine:'nmea', scenarioTime:'',
  solarAmps:30,solarPanelWatts:200,solarPanelVolts:38,solarIrradiance:1000,solarTemperature:25,solarTemperatureCoefficient:-.4,solarLossPercent:0,solarEfficiency:95, alternatorAmps:35, acAmps:25, servicePercent:80, serviceLoad:0, startLoad:0
};
export function chargeSettings(value: unknown): ChargeSettings {
  if (!value || typeof value !== 'object') return DEFAULT_CHARGE_SETTINGS;
  const v = value as Record<string, unknown>;
  const number = (key: keyof ChargeSettings, fallback: number, max = 500, min = 0) =>
    typeof v[key] === 'number' && Number.isFinite(v[key]) ? Math.min(max,Math.max(min,v[key] as number)) : fallback;
  return { navigationInstallation:v.navigationInstallation==='tricolor'?'tricolor':'separate',startSocMode:v.startSocMode==='manual'?'manual':'nmea',startSocPercent:typeof v.startSocPercent==='number'&&Number.isFinite(v.startSocPercent)?Math.min(100,Math.max(0,v.startSocPercent)):null, consumers:sanitizeConsumers(v.consumers), ac:typeof v.ac === 'boolean' ? v.ac : false, solar:typeof v.solar === 'boolean' ? v.solar : true,
    daylight:v.daylight === 'day' || v.daylight === 'night' ? v.daylight : 'auto',
    engine:v.engine === 'on' || v.engine === 'off' ? v.engine : 'nmea',
    scenarioTime:typeof v.scenarioTime === 'string' ? v.scenarioTime : '',
    // Older profiles stored a fixed solar output current. Preserve it on migration as a cap and equivalent Wp.
    solarPanelWatts:number('solarPanelWatts',typeof v.solarAmps==='number'?number('solarAmps',11.3)*14.1/.95:200,20000),
    solarPanelVolts:number('solarPanelVolts',38,250),solarIrradiance:number('solarIrradiance',1000,1500),
    solarTemperature:number('solarTemperature',25,120,-40),solarTemperatureCoefficient:number('solarTemperatureCoefficient',-.4,0,-1),
    solarLossPercent:number('solarLossPercent',0,100),solarEfficiency:number('solarEfficiency',95,100),
    solarAmps:number('solarAmps',30), alternatorAmps:number('alternatorAmps',35), acAmps:number('acAmps',25),
    servicePercent:number('servicePercent',80,100), serviceLoad:number('serviceLoad',0), startLoad:number('startLoad',0) };
}
export function startBatterySoc(raw:BoatInstrumentSnapshot,settings:ChargeSettings):number|null{
 if(settings.startSocMode==='manual')return settings.startSocPercent??null;
 const banks=raw.batteries.filter(bank=>bank.role==='start');
 return banks.length===1?currentValue(banks[0].socPercent??null):null;
}
export interface ChargeModel {
  readonly startSocPercent:number|null;
  readonly startBatteryFull:boolean;
  readonly effectiveServicePercent:number;
  readonly consumers: readonly ResolvedConsumer[];
  readonly consumerAmps: number;
  readonly solarProduction: SolarProduction;
  readonly source: 'ac' | 'solar' | 'alternator' | 'none';
  readonly daylight: boolean | null;
  readonly engine: boolean | null;
  readonly sourceAmps: number;
  readonly serviceCharge: number;
  readonly startCharge: number;
  readonly shoreAmps: number;
  readonly instruments: BoatInstrumentSnapshot;
}
/** Local ideal DC model, never writes into the BOAT store or sends switching commands. */
export function buildChargeModel(raw: BoatInstrumentSnapshot, config: ChargeSettings, position: {lat:number;lng:number}|null, now: number): ChargeModel {
  const settings=chargeSettings(config);
  const consumers=resolveConsumers(raw,settings.consumers);
  const consumerAmps=consumers.reduce((sum,consumer)=>sum+(consumer.on?consumer.amps:0),0);
  const overridden=new Map(consumers.filter(consumer=>consumer.overridden&&consumer.circuit).map(consumer=>[consumer.circuit!,consumer]));
  const navigationOverride=consumers.some(consumer=>consumer.group==='Navegación'&&consumer.id!=='anchor'&&consumer.overridden);
  const lights=[...(raw.lights??[]).filter(light=>!overridden.has(light.circuit)&&!(navigationOverride&&light.circuit==='LIGHT_NAV_RELAY')),...Array.from(overridden.values(),consumer=>({circuit:consumer.circuit!,relay:{value:(consumer.on?1:0) as 0|1,ageMs:0}}))];
  if(navigationOverride)lights.push({circuit:'LIGHT_NAV_RELAY',relay:{value:consumers.some(consumer=>consumer.group==='Navegación'&&consumer.id!=='anchor'&&consumer.on)?1:0,ageMs:0}});
  const date = settings.scenarioTime ? new Date(settings.scenarioTime).getTime() : now;
  const validPosition=position && Number.isFinite(position.lat) && Math.abs(position.lat)<=90 && Number.isFinite(position.lng) && Math.abs(position.lng)<=180;
  const daylight=settings.daylight==='day' ? true : settings.daylight==='night' ? false
    : validPosition && Number.isFinite(date) ? SunCalc.getPosition(new Date(date),position.lat,position.lng).altitude>0 : null;
  const engine=settings.ac ? false : settings.engine==='on' ? true : settings.engine==='off' ? false : measuredEngineRunning(raw.engines);
  const solarProduction=calculateSolar(settings,settings.solar&&daylight===true&&!settings.ac);
  const source = settings.ac ? 'ac' : solarProduction.outputAmps>0 ? 'solar'
    : engine===true && settings.alternatorAmps>0 ? 'alternator' : 'none';
  const sourceAmps=source==='ac' ? settings.acAmps : source==='solar' ? solarProduction.outputAmps : source==='alternator' ? settings.alternatorAmps : 0;
  const startSocPercent=startBatterySoc(raw,settings);
  const startBatteryFull=startSocPercent!==null&&startSocPercent>=100;
  const effectiveServicePercent=startBatteryFull?100:settings.servicePercent;
  const serviceCharge=sourceAmps*effectiveServicePercent/100, startCharge=sourceAmps-serviceCharge;
  const measured=<T,>(value:T):AgedValue<T>=>({value,ageMs:0});
  const volts=sourceAmps>0 ? 14.1 : 12.6;
  const solarCurrent=source==='solar' ? sourceAmps : 0;
  return {startSocPercent,startBatteryFull,effectiveServicePercent,solarProduction,consumers,consumerAmps,source,daylight,engine,sourceAmps,serviceCharge,startCharge,shoreAmps:source==='ac' ? sourceAmps : 0,
    instruments:{...raw,lights,
      alternatorCurrentSource:'simulated-from-rpm',alternatorVolts:measured(source==='alternator' ? 14.1 : 0),alternatorAmps:measured(source==='alternator' ? sourceAmps : 0),
      solar:{pvVolts:measured(solarProduction.panelVolts),pvAmps:measured(source==='solar'?solarProduction.inputAmps:0),outputVolts:measured(14.1),outputAmps:measured(solarCurrent)},
      batteries:[
        {name:'BAT_HOUSE',role:'service',volts:measured(volts),amps:measured(serviceCharge-settings.serviceLoad-consumerAmps)},
        {name:'BAT_START',role:'start',socPercent:startSocPercent===null?null:measured(startSocPercent),volts:measured(volts),amps:measured(startCharge-settings.startLoad)}
      ]
    }
  };
}

export function readChargeScenario(vesselId:string|null|undefined,raw:BoatInstrumentSnapshot):{enabled:boolean;settings:ChargeSettings}{
 try{const value:unknown=vesselId?JSON.parse(localStorage.getItem(`velaris:charge-scenario:${vesselId}`)??'null'):null;
  if(value&&typeof value==='object'){const entry=value as {enabled?:unknown;settings?:unknown};return {enabled:typeof entry.enabled==='boolean'?entry.enabled:raw.alternatorCurrentSource==='simulated-from-rpm',settings:chargeSettings({...((entry.settings&&typeof entry.settings==='object')?entry.settings:{}),navigationInstallation:(entry.settings&&typeof entry.settings==='object'&&'navigationInstallation' in entry.settings)?(entry.settings as Record<string,unknown>).navigationInstallation:localStorage.getItem(`velaris:boat-light-installation:${vesselId}`)})};}
 }catch{/* Local model remains independent of storage availability. */}
 return {enabled:raw.alternatorCurrentSource==='simulated-from-rpm',settings:DEFAULT_CHARGE_SETTINGS};
}
