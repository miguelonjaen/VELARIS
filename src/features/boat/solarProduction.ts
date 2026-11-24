import type { ChargeSettings } from './chargingPolicy';
export const CHARGE_BUS_VOLTS = 14.1;
export interface SolarProduction {
 readonly irradiance:number;
 readonly panelVolts:number;
 readonly availablePanelWatts:number;
 readonly inputWatts:number;
 readonly inputAmps:number;
 readonly outputWatts:number;
 readonly outputAmps:number;
 readonly limited:boolean;
 readonly voltageCompatible:boolean;
}
/** Approximate DC model at the specified panel-plane irradiance; no weather inference. */
export function calculateSolar(settings:ChargeSettings,available:boolean):SolarProduction {
 const wp=settings.solarPanelWatts??200;
 const volts=settings.solarPanelVolts??38;
 const irradiance=available?(settings.solarIrradiance??1000):0;
 const temperature=settings.solarTemperature??25;
 const coefficient=(settings.solarTemperatureCoefficient??-.4)/100;
 const losses=(settings.solarLossPercent??0)/100;
 const efficiency=(settings.solarEfficiency??95)/100;
 const availablePanelWatts=Math.max(0,wp*irradiance/1000*Math.max(0,1+coefficient*(temperature-25))*(1-losses));
 const voltageCompatible=volts>CHARGE_BUS_VOLTS;
 const potential=voltageCompatible?availablePanelWatts*efficiency:0;
 const outputWatts=Math.min(potential,settings.solarAmps*CHARGE_BUS_VOLTS);
 const inputWatts=efficiency>0?outputWatts/efficiency:0;
 return {irradiance,panelVolts:irradiance>0?volts:0,availablePanelWatts,inputWatts,inputAmps:volts>0?inputWatts/volts:0,
  outputWatts,outputAmps:outputWatts/CHARGE_BUS_VOLTS,limited:potential>outputWatts+1e-9,voltageCompatible};
}
