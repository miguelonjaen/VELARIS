import { switchNavigationLights } from './navigationLights';
import { startBatterySoc } from './chargingPolicy';
import { SolarSettings } from './SolarSettings';
import type { SolarProduction } from './solarProduction';
import React, { useEffect, useId, useRef } from 'react';
import type { ChargeSettings } from './chargingPolicy';
import { resolveConsumers, LOAD_GROUPS, type ConsumerId, type LoadGroup } from './electricalConsumers';
import type { BoatInstrumentSnapshot } from '../../core/instruments/BoatInstrumentStore';
export type ElectricalEditorTarget='regulation'|'solar'|'distribution'|LoadGroup|null;
export function ElectricalEditor({target,onClose,enabled,onEnable,settings,onChange,raw,solarProduction,onSelect}:{target:ElectricalEditorTarget;onClose:()=>void;enabled:boolean;onEnable:()=>void;settings:ChargeSettings;onChange:(settings:ChargeSettings)=>void;raw:BoatInstrumentSnapshot;solarProduction?:SolarProduction;onSelect:(target:ElectricalEditorTarget)=>void}){
 const dialog=useRef<HTMLDialogElement>(null);const heading=useId();
 useEffect(()=>{const element=dialog.current;if(target&&!element?.open)element?.showModal();if(!target&&element?.open)element.close();},[target]);
 const soc=startBatterySoc(raw,settings);
 const consumers=resolveConsumers(raw,settings.consumers).filter(consumer=>consumer.group===target);
 const navigation=resolveConsumers(raw,settings.consumers).filter(c=>['port','starboard','stern','masthead','tricolor'].includes(c.id));
 const installation=settings.navigationInstallation??'separate';
 const navigationOn=installation==='tricolor'?navigation.some(c=>c.id==='tricolor'&&c.on):navigation.filter(c=>c.id!=='tricolor').every(c=>c.on);
 const setNavigation=(on:boolean|null)=>onChange({...settings,consumers:switchNavigationLights(settings.consumers,on,installation)});
 const setConsumer=(id:ConsumerId,on:boolean|null,amps:number)=>onChange({...settings,consumers:{...settings.consumers,[id]:{on,amps}}});
 return <dialog ref={dialog} className="el-editor" aria-labelledby={heading} onCancel={event=>{event.preventDefault();onClose();}} onClose={onClose}>
  <header><h3 id={heading}>{target==='distribution'?'Distribución · consumidores':target==='solar'?'Solar · paneles y MPPT':target==='regulation'?'Regulación · reparto de carga':target}</h3><button type="button" onClick={onClose} aria-label="Cerrar control eléctrico">×</button></header>
  {!enabled?<div><p>Estas acciones controlan el ensayo local. En modo NMEA las lecturas son de solo consulta.</p><button type="button" onClick={onEnable}>Activar modelo de simulación</button></div>:<>
   <p className="el-editor-notice">SIMULACIÓN · cambios inmediatos, guardados por barco. No envía órdenes a equipos reales.</p>
   {target==='distribution'?<div className="el-distribution-menu"><button type="button" onClick={()=>onSelect('regulation')}>Reparto servicios / arranque</button>{LOAD_GROUPS.map(group=><button type="button" key={group} onClick={()=>onSelect(group)}>{group}</button>)}</div>:target==='solar'?<SolarSettings settings={settings} onChange={onChange} production={solarProduction}/>:target==='regulation'?<div className="el-repartition">
    <div className="el-charge-grid">
     <label>SOC de arranque · origen<select aria-label="Origen SOC arranque" value={settings.startSocMode??'nmea'} onChange={event=>onChange({...settings,startSocMode:event.target.value==='manual'?'manual':'nmea'})}><option value="nmea">Seguir SOC NMEA</option><option value="manual">Manual · ensayo</option></select></label>
     {settings.startSocMode==='manual'&&<label>SOC arranque · %<input aria-label="SOC arranque" type="number" min="0" max="100" step="0.1" value={settings.startSocPercent??''} onChange={event=>{const value=event.currentTarget.valueAsNumber;onChange({...settings,startSocPercent:Number.isFinite(value)?Math.min(100,Math.max(0,value)):null});}}/></label>}
    </div>
    <p>SOC de arranque: {soc===null?'sin dato vigente':`${soc.toFixed(1)} %`}. {soc===100?'Cargada: toda la producción se asigna a servicios; arranque recibe 0 A. La preferencia inferior queda guardada.':'Si no hay confirmación de carga completa, se mantiene el reparto preferido.'}</p>
    <button type="button" onClick={()=>onChange({...settings,startSocMode:'manual',startSocPercent:100})}>Marcar cargada · 100 % (ensayo)</button>
    <label>Servicios: {settings.servicePercent.toFixed(1)} %<input aria-label="Reparto hacia servicios" type="range" min="0" max="100" step="1" value={settings.servicePercent} onChange={e=>onChange({...settings,servicePercent:e.currentTarget.valueAsNumber})}/></label>
    <strong>Arranque: {(100-settings.servicePercent).toFixed(1)} %</strong>
    <div>{[0,20,50,80,100].map(value=><button type="button" key={value} onClick={()=>onChange({...settings,servicePercent:value})}>{value}/{100-value}</button>)}</div>
    <p>La suma siempre es 100 %. Con arranque al 100 % de SOC se aplica temporalmente 100/0. Se reparte la corriente de la fuente seleccionada; los consumidores se descuentan después.</p>
   </div>:<div className="el-consumer-list">{target==='Navegación'&&<article data-consumer="navigation"><button type="button" role="switch" aria-label="Luces de navegación" aria-checked={navigationOn} onClick={()=>setNavigation(!navigationOn)}>Luces de navegación · {navigationOn?'Encendidas':'Apagadas'}</button><label>Instalación<select aria-label="Instalación de luces de navegación" value={installation} onChange={e=>{const value=e.target.value==='tricolor'?'tricolor':'separate';onChange({...settings,navigationInstallation:value,consumers:switchNavigationLights(settings.consumers,navigationOn,value)});}}><option value="separate">Tope, alcance y costados</option><option value="tricolor">Tricolor · alternativa a vela</option></select></label><p>{installation==='tricolor'?'El mismo botón actúa sobre la tricolor; apaga los circuitos separados y el tope.':'Un solo botón conmuta tope, alcance, babor y estribor.'}</p><button type="button" onClick={()=>setNavigation(null)}>Seguir NMEA</button></article>}{consumers.filter(c=>!['port','starboard','stern','masthead','tricolor'].includes(c.id)).map(consumer=><article key={consumer.id} data-consumer={consumer.id}>
    <label><input type="checkbox" role="switch" aria-label={consumer.label} checked={consumer.on} onChange={e=>setConsumer(consumer.id,e.target.checked,consumer.amps)}/><span>{consumer.label}<small>{consumer.overridden?'Estado del ensayo':consumer.circuit?consumer.known?'Siguiendo NMEA':'Sin señal NMEA':'Apagado por defecto en el ensayo'}</small></span><strong>{consumer.on?'Encendido':'Apagado'}</strong></label>
    <div><label>Consumo nominal · A<input type="number" aria-label={`Consumo ${consumer.label}`} min="0" max="200" step="0.1" value={consumer.amps} onChange={e=>{const amps=e.currentTarget.valueAsNumber;if(Number.isFinite(amps))setConsumer(consumer.id,settings.consumers?.[consumer.id]?.on??null,Math.min(200,Math.max(0,amps)));}}/></label>{consumer.circuit&&<button type="button" onClick={()=>setConsumer(consumer.id,null,consumer.amps)}>Seguir NMEA</button>}</div>
   </article>)}<p>Corrientes nominales de prueba, ajustables; no son mediciones ni especificaciones de los equipos. Todos estos consumidores se asignan al banco de servicios.</p></div>}
  </>}
 </dialog>;
}
