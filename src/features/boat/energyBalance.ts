import type { ChargeModel, ChargeSettings } from './chargingPolicy';
import { CHARGE_BUS_VOLTS } from './solarProduction';
export interface EnergyBalance {
 readonly productionWatts:number;
 readonly consumptionWatts:number;
 readonly balanceWatts:number;
 readonly utilization:number|null;
 readonly level:'normal'|'warning'|'critical';
 readonly serviceDeficitAmps:number;
 readonly startDeficitAmps:number;
 readonly generationDeficit:boolean;
}
/** Generation and demand share the model's DC bus; nominal panel Wp is not production. */
export function energyBalance(model:ChargeModel,settings:ChargeSettings):EnergyBalance{
 const serviceLoad=model.consumerAmps+settings.serviceLoad;
 const startLoad=settings.startLoad;
 const productionWatts=model.sourceAmps*CHARGE_BUS_VOLTS;
 const serviceVolts=model.instruments.batteries.find(bank=>bank.role==='service')?.volts?.value??CHARGE_BUS_VOLTS;
 const startVolts=model.instruments.batteries.find(bank=>bank.role==='start')?.volts?.value??CHARGE_BUS_VOLTS;
 const consumptionWatts=serviceLoad*serviceVolts+startLoad*startVolts;
 const utilization=productionWatts>0?consumptionWatts/productionWatts:null;
 const generationDeficit=consumptionWatts>productionWatts+1e-8;
 const serviceDeficitAmps=Math.max(0,serviceLoad-model.serviceCharge);
 const startDeficitAmps=Math.max(0,startLoad-model.startCharge);
 const level=generationDeficit?'critical':(utilization!==null&&utilization>=.8-1e-10)||serviceDeficitAmps>1e-8||startDeficitAmps>1e-8?'warning':'normal';
 return {productionWatts,consumptionWatts,balanceWatts:productionWatts-consumptionWatts,utilization,level,serviceDeficitAmps,startDeficitAmps,generationDeficit};
}
