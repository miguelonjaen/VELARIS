import React from 'react';
import type { EnergyBalance } from './energyBalance';
export function EnergyAlerts({balance,onRepartition,onConsumers}:{balance:EnergyBalance;onRepartition:()=>void;onConsumers:()=>void}){
 const format=(value:number)=>value.toLocaleString('es-ES',{maximumFractionDigits:1});
 const percent=balance.utilization===null?null:balance.utilization*100;
 return <section className={`el-energy-alert el-energy-${balance.level}`} data-energy-level={balance.level} role={balance.level==='normal'?'status':'alert'} aria-label="Balance y alertas de energía del ensayo">
  <h3>{balance.generationDeficit?'Consumo superior a la producción':percent!==null&&percent>=80-1e-8?'Margen de producción reducido':balance.level==='warning'?'Reparto insuficiente para un banco':'Balance de energía'}</h3>
  <p>ENSAYO · Producción <strong>{format(balance.productionWatts)} W</strong> · Consumo <strong>{format(balance.consumptionWatts)} W</strong> · Balance <strong>{balance.balanceWatts>0?'+':''}{format(balance.balanceWatts)} W</strong> · {percent===null?'Sin generación disponible':`${format(percent)} % de la producción en uso`}</p>
  {balance.generationDeficit?<p>Las baterías cubren el déficit. Cambiar el reparto no aumenta la producción total: revise también las fuentes o los consumidores.</p>:percent!==null&&percent>=80-1e-8?<p>Aviso desde el 80 % de utilización. Revise el margen antes de añadir más consumidores.</p>:null}
  {balance.serviceDeficitAmps>1e-8&&<p>Servicios descarga {format(balance.serviceDeficitAmps)} A por encima de su carga asignada.</p>}
  {balance.startDeficitAmps>1e-8&&<p>Arranque descarga {format(balance.startDeficitAmps)} A por encima de su carga asignada.</p>}
  {balance.level!=='normal'&&<div><button type="button" onClick={onRepartition}>Ajustar reparto</button><button type="button" onClick={onConsumers}>Gestionar consumidores</button></div>}
 </section>;
}
