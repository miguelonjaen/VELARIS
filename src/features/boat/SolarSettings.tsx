import React from 'react';
import type { ChargeSettings } from './chargingPolicy';
import { CHARGE_BUS_VOLTS, type SolarProduction } from './solarProduction';
export function SolarSettings({settings,onChange,production}:{settings:ChargeSettings;onChange:(settings:ChargeSettings)=>void;production?:SolarProduction}){
 const number=(key:'solarPanelWatts'|'solarPanelVolts'|'solarIrradiance'|'solarTemperature'|'solarTemperatureCoefficient'|'solarLossPercent'|'solarEfficiency'|'solarAmps',label:string,fallback:number,min:number,max:number,step=1)=><label>{label}<input aria-label={label} type="number" min={min} max={max} step={step} value={settings[key]??fallback} onChange={event=>{const value=event.currentTarget.valueAsNumber;if(Number.isFinite(value))onChange({...settings,[key]:Math.min(max,Math.max(min,value))});}}/></label>;
 return <div className="el-solar-settings">
  <label><input type="checkbox" checked={settings.solar} onChange={event=>onChange({...settings,solar:event.target.checked})}/> Campo solar habilitado</label>
  <div className="el-charge-grid">
   {number('solarPanelWatts','Potencia total instalada · Wp',200,0,20000)}
   {number('solarPanelVolts','Tensión de trabajo del campo · Vmp',38,0,250,.1)}
   {number('solarIrradiance','Irradiancia sobre el panel · W/m²',1000,0,1500)}
   {number('solarTemperature','Temperatura de célula · °C',25,-40,120,.1)}
   {number('solarTemperatureCoefficient','Coeficiente térmico de potencia · %/°C',-.4,-1,0,.01)}
   {number('solarLossPercent','Pérdidas por sombra/suciedad/cableado · %',0,0,100,.1)}
   {number('solarEfficiency','Rendimiento del MPPT · %',95,0,100,.1)}
   {number('solarAmps','Límite de corriente del MPPT · A DC',30,0,500,.1)}
  </div>
  <p>Introduzca la suma de Wp si tiene varios paneles. Vmp corresponde al campo según su conexión serie/paralelo. Copie los parámetros de las fichas de sus equipos; los valores iniciales son ejemplos de ensayo.</p>
  {production&&<>
   <dl className="el-solar-results"><div><dt>Irradiancia aplicada</dt><dd>{production.irradiance.toFixed(0)} W/m²</dd></div><div><dt>Potencia disponible en paneles</dt><dd>{production.availablePanelWatts.toFixed(1)} W</dd></div><div><dt>Potencia captada en paneles</dt><dd>{production.inputWatts.toFixed(1)} W</dd></div><div><dt>Salida MPPT hacia bus DC</dt><dd>{production.outputWatts.toFixed(1)} W · {production.outputAmps.toFixed(2)} A</dd></div></dl>
   {production.limited&&<p role="status">MPPT limitado por su corriente máxima. La potencia adicional disponible no se capta.</p>}
   {!production.voltageCompatible&&<p role="status">Vmp no supera los {CHARGE_BUS_VOLTS} V del bus de carga. Este modelo de MPPT reductor no produce carga.</p>}
  </>}
  <p>Potencia aproximada: Wp × irradiancia/1000 × corrección térmica × pérdidas. Después se aplica el rendimiento del MPPT y su límite de corriente; I = P / {CHARGE_BUS_VOLTS} V.</p>
  <p>De noche, con solar deshabilitado o AC conectado, la producción es cero. Irradiancia, temperatura y sombras son entradas de ensayo, no meteorología medida. El modelo no reproduce curvas I–V, etapas de carga ni aceptación por SOC.</p>
 </div>;
}
