import { BOAT_LIGHTING_CHANGED, saveChargeScenario } from './useBoatLighting';
import { readChargeScenario } from './chargingPolicy';
import { switchFogLight } from './navigationLights';
import { energyBalance } from './energyBalance';
import { EnergyAlerts } from './EnergyAlerts';
import { ElectricalEditor, type ElectricalEditorTarget } from './ElectricalEditor';
import { LOAD_GROUPS, type ResolvedConsumer } from './electricalConsumers';
import React, { useEffect, useState } from 'react';
import { buildChargeModel, chargeSettings, DEFAULT_CHARGE_SETTINGS, type ChargeSettings } from './chargingPolicy';
import { ChargingControls } from './ChargingControls';
import { Sun, Plug, Battery, Lightbulb, Monitor, Navigation, Snowflake, Waves, MoreHorizontal, Gauge, Zap, Clock, Cable, SlidersHorizontal, type LucideIcon } from 'lucide-react';
import { measuredEngineRunning, LIGHT_CIRCUITS, type BatteryReadings, type BoatInstrumentSnapshot, type LightCircuit } from '../../core/instruments/BoatInstrumentStore';
import { batteryPower, currentValue, relayLabel } from './boatVisualModel';
import './electricalOverview.css';

const format = (value: number | null, unit: string, digits = 1) => value === null ? 'Sin datos' : `${value.toLocaleString('es-ES', {minimumFractionDigits:digits, maximumFractionDigits:digits})} ${unit}`;
const batteryTitle = (battery: BatteryReadings) => battery.role === 'service' ? 'Batería servicios' : battery.role === 'start' ? 'Batería arranque' : 'Batería · función desconocida';
const LOADS: readonly { label: string; icon: LucideIcon }[] = [
  {label:'Iluminación',icon:Lightbulb}, {label:'Electrónica',icon:Monitor},
  {label:'Navegación',icon:Navigation}, {label:'Refrigeración',icon:Snowflake},
  {label:'Bomba de agua',icon:Waves}, {label:'Otros consumidores',icon:MoreHorizontal},
];
interface NodeProps { x:number; y:number; width:number; height:number; title:string; detail:string; icon:LucideIcon; subtitle?:string; identified?:boolean; active?:boolean; onActivate?:()=>void }
function Node({x,y,width,height,title,detail,icon:Icon,subtitle,identified=false,active=false,onActivate}:NodeProps) {
  return <g role={onActivate?'button':undefined} tabIndex={onActivate?0:undefined} aria-label={onActivate?`Controlar ${title}`:undefined} onClick={onActivate} onKeyDown={event=>{if(onActivate&&(event.key==='Enter'||event.key===' ')){event.preventDefault();onActivate();}}} transform={`translate(${x} ${y})`} className={`el-node${identified ? ' el-identified' : ''}${active ? ' el-active-node' : ''}`}>
    <rect width={width} height={height} rx="10"/>
    <Icon x={12} y={height/2-14} width={28} height={28} strokeWidth={1.4} className="el-node-icon"/>
    <text x={50} y={subtitle ? 20 : height/2-5} className="el-node-title">{title}</text>
    <text x={50} y={subtitle ? 40 : height/2+13} className="el-node-value">{detail}</text>
    {subtitle && <text x={50} y={59} className="el-node-subtitle">{subtitle}</text>}
  </g>;
}
type FlowDirection = 'forward' | 'reverse' | 'none';
function Wire({ d, direction = 'none', energized = false, name }: { d: string; direction?: FlowDirection; energized?: boolean; name: string }) {
  const active = direction !== 'none';
  return <g data-wire={name} data-direction={direction}>
    <path d={d} className={active || energized ? 'el-wire-base el-wire-lit' : 'el-wire-base'}/>
    {active && <path d={d} className={`el-wire-motion${direction === 'reverse' ? ' el-wire-reverse' : ''}`}/>}
  </g>;
}
interface BusFlows {
  readonly serviceDemand: number;
  readonly engineDemand: number;
  readonly serviceCharge: number;
  readonly startCharge: number;
  readonly engineRunning: boolean | null;
}
/** Functional routes, not an assertion of the vessel's physical wiring. */
function ReferenceDiagram({instruments,shoreAmps=null,consumers,onOpen,flows}:{instruments:BoatInstrumentSnapshot;shoreAmps?:number|null;consumers?:readonly ResolvedConsumer[];onOpen:(target:ElectricalEditorTarget)=>void;flows?:BusFlows}) {
  const solar = instruments.solar;
  const solarWatts = batteryPower(solar?.outputVolts ?? null, solar?.outputAmps ?? null);
  const solarActive = solarWatts !== null && solarWatts > 0;
  const alternatorAmps = currentValue(instruments.alternatorAmps ?? null);
  const alternatorActive = alternatorAmps !== null && alternatorAmps > 0;
  const alternatorVolts = currentValue(instruments.alternatorVolts);
  const alternatorLit = alternatorActive || (instruments.alternatorCurrentSource !== 'simulated-from-rpm' && alternatorVolts !== null && alternatorVolts > 0);
  const batteries = [...instruments.batteries].sort((a,b)=>({service:0,start:1,unknown:2}[a.role])-({service:0,start:1,unknown:2}[b.role]) || a.name.localeCompare(b.name));
  const slots: readonly (BatteryReadings|null)[] = batteries.length ? batteries : [null,null];
  const current = (battery: BatteryReadings | null) => currentValue(battery?.amps ?? null);
  const charging = slots.some(b => (current(b) ?? 0) > 0);
  const serviceDischarging = slots.some(b => b?.role==='service' && (current(b) ?? 0)<0);
  const serviceDemand = flows?.serviceDemand ?? null;
  const engineDemand = flows?.engineDemand ?? null;
  const engineRunning = flows ? flows.engineRunning : measuredEngineRunning(instruments.engines);
  const hasStartBank = slots.some(battery=>battery?.role==='start');
  const lightCount = (circuits: readonly LightCircuit[]) => circuits.filter(circuit => currentValue(instruments.lights?.find(light => light.circuit === circuit)?.relay ?? null) === 1).length;
  const lightStatus = (circuits: readonly LightCircuit[]) => {
    const known = circuits.filter(circuit => currentValue(instruments.lights?.find(light => light.circuit === circuit)?.relay ?? null) !== null).length;
    return known ? `${lightCount(circuits)} cerrados · ${known} recibidos` : 'Sin datos de relés';
  };
  const cabinCount = lightCount(['LIGHT_CABIN_RELAY','LIGHT_DECK_RELAY']);
  const navigationCount = lightCount(['LIGHT_NAV_RELAY','LIGHT_PORT_RELAY','LIGHT_STARBOARD_RELAY','LIGHT_STERN_RELAY','LIGHT_MASTHEAD_RELAY','LIGHT_TRICOLOR_RELAY','LIGHT_ANCHOR_RELAY']);
  const groupConsumers=(i:number)=>consumers?.filter(consumer=>consumer.group===LOAD_GROUPS[i]);
  const loadActive = (i: number) => consumers ? groupConsumers(i)!.some(consumer=>consumer.on&&consumer.amps>0) : i === 0 ? cabinCount > 0 : i === 2 ? navigationCount > 0 : false;
  const groupLit = (i:number) => consumers ? groupConsumers(i)!.some(consumer=>consumer.on) : loadActive(i);
  const groupDetail = (i:number) => {
    const group=groupConsumers(i);
    if(group)return `${group.filter(consumer=>consumer.on).length}/${group.length} activos · ${group.reduce((sum,consumer)=>sum+(consumer.on?consumer.amps:0),0).toFixed(1)} A`;
    return i===0?lightStatus(['LIGHT_CABIN_RELAY','LIGHT_DECK_RELAY']):i===2?lightStatus(['LIGHT_NAV_RELAY','LIGHT_PORT_RELAY','LIGHT_STARBOARD_RELAY','LIGHT_STERN_RELAY','LIGHT_MASTHEAD_RELAY','LIGHT_TRICOLOR_RELAY','LIGHT_ANCHOR_RELAY']):'Sin datos · no identificado';
  };
  const baseHeight = Math.max(282, slots.length*96+62);
  const height=baseHeight+84;
  const mid=baseHeight/2;
  const engineY=baseHeight-5;
  return <svg viewBox={`0 0 1040 ${height}`} className="el-diagram" role="img" aria-label="Esquema eléctrico funcional con líneas luminosas y flujo animado">
    <defs><linearGradient id="el-node-fill" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#18374b"/><stop offset=".4" stopColor="#0b2031"/><stop offset="1" stopColor="#061320"/></linearGradient></defs>
    <g fill="none">
      {[mid-84,mid,mid+84].map((y,i)=><Wire key={`source-${i}`} name={`source-${i}`} direction={(i === 0 && solarActive || i === 1 && alternatorActive || i === 2 && shoreAmps !== null && shoreAmps > 0) ? 'forward' : 'none'} d={`M164 ${y}H181 Q201 ${y} 201 ${y<mid?y+20:y>mid?y-20:y}V${mid}H222`}/>)}
      {slots.map((battery,i)=>{
        const y=36+i*96+38, amps=current(battery);
        const charge=flows ? battery?.role==='service'?flows.serviceCharge:battery?.role==='start'?flows.startCharge:null : amps;
        const serviceFlow=serviceDemand!==null?serviceDemand>0:amps!==null&&amps<0;
        const motorFlow=engineDemand!==null?engineDemand>0:amps!==null&&amps<0;
        return <g key={`battery-${i}`}>
          <Wire name={`charge-${battery?.name ?? i}`} direction={charge!==null&&charge>0?'forward':'none'} d={`M309 ${mid}H328 Q347 ${mid} 347 ${y<mid?mid-18:mid+18}V${y}H369`}/>
          {battery?.role==='service'&&<Wire name={`bank-${battery.name}`} direction={serviceFlow?'forward':'none'} d={`M584 ${y}H604 Q623 ${y} 623 ${y<mid?y+18:y-18}V${mid}H648`}/>}
          {battery?.role==='start'&&<Wire name={`engine-${battery.name}`} direction={motorFlow?'forward':'none'} d={`M584 ${y}H606 Q626 ${y} 626 ${y+20}V${engineY+28}H648`}/>}
        </g>;
      })}
      {LOADS.map((_,i)=>{const y=30+i*43;return <Wire key={`load-${i}`} name={`load-${i}`} direction={loadActive(i) ? 'forward' : 'none'} d={`M734 ${mid}H751 Q767 ${mid} 767 ${y<mid?mid-18:mid+18}V${y}H786`}/>;})}
    </g>
    <Node x={8} y={mid-112} width={156} height={56} title="Solar · salida" detail={format(solarWatts,'W',0)} icon={Sun} identified={solarWatts!==null} active={solarActive} onActivate={()=>onOpen('solar')}/>
    <Node x={8} y={mid-28} width={156} height={56} title="Alternador" detail={`${format(alternatorVolts,'V',1)} · ${format(alternatorAmps,'A',0)}${instruments.alternatorCurrentSource === 'simulated-from-rpm' ? ' sim.' : ''}`} icon={Gauge} identified={alternatorVolts!==null || alternatorAmps!==null} active={alternatorLit}/>
    <Node x={8} y={mid+56} width={156} height={56} title="Puerto (AC)" detail={shoreAmps===null ? 'Sin fuente identificada' : `${format(shoreAmps,'A',1)} DC · sim.`} icon={Plug} active={shoreAmps!==null && shoreAmps>0}/>
    <g role="button" tabIndex={0} aria-label="Controlar Regulación" onClick={()=>onOpen('regulation')} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onOpen('regulation');}}} className={`el-node${solarActive || alternatorActive || (shoreAmps !== null && shoreAmps > 0) || charging ? ' el-active-node' : ''}`} transform={`translate(222 ${mid-44})`}><rect width="87" height="88" rx="10"/><SlidersHorizontal x={30} y={13} width={27} height={27} className="el-node-icon"/><text x="43" y="56" textAnchor="middle" className="el-node-title">Regulación</text><text x="43" y="73" textAnchor="middle" className="el-node-subtitle">Funcional</text></g>
    {slots.map((battery,i)=><Node key={battery?.name ?? `placeholder-${i}`} x={369} y={36+i*96} width={215} height={76} title={battery ? batteryTitle(battery) : i===0?'Batería servicios':'Batería arranque'} detail={battery ? `${format(currentValue(battery.volts),'V',2)} · ${format(currentValue(battery.amps),'A')}` : 'Sin datos'} subtitle={battery ? `${battery.name} · ${currentValue(battery.socPercent??null)===100&&current(battery)===0?'Cargada (100%)':current(battery) === null ? 'Sin corriente' : current(battery)! > 0 ? 'Cargando' : current(battery)! < 0 ? 'Descargando' : 'Neta cero'}` : 'Banco no identificado'} icon={Battery} identified={Boolean(battery && (currentValue(battery.volts)!==null || current(battery)!==null))} active={current(battery) !== null && current(battery) !== 0}/>)}
    <g role="button" tabIndex={0} aria-label="Controlar Distribución" onClick={()=>onOpen('distribution')} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onOpen('distribution');}}} className={`el-node${(serviceDemand!==null?serviceDemand>0:serviceDischarging) || LOAD_GROUPS.some((_,i)=>groupLit(i)) ? ' el-active-node' : ''}`} transform={`translate(648 ${mid-44})`}><rect width="86" height="88" rx="10"/><Cable x={30} y={12} width={27} height={27} className="el-node-icon"/><text x="43" y="56" textAnchor="middle" className="el-node-title">Distribución</text><text x="43" y="73" textAnchor="middle" className="el-node-subtitle">Funcional</text></g>
    {LOADS.map((load,i)=><Node key={load.label} x={786} y={10+i*43} width={246} height={38} title={load.label} detail={groupDetail(i)} icon={load.icon} active={groupLit(i)} onActivate={()=>onOpen(LOAD_GROUPS[i])}/>)}
    <Node x={648} y={engineY} width={178} height={56} title="Motor" detail={!hasStartBank?'Sin banco de arranque':`${engineRunning===null?'Sin RPM':engineRunning?'En marcha':'Parado'} · ${engineDemand===null?'demanda sin medir':format(engineDemand,'A',1)}`} icon={Gauge} identified={hasStartBank} active={hasStartBank&&(engineRunning===true||(engineDemand??0)>0)}/>

  </svg>;
}
export function ElectricalOverview({instruments:raw,vesselId=null,position=null,now=Date.now()}:{instruments:BoatInstrumentSnapshot;vesselId?:string|null;position?:{lat:number;lng:number}|null;now?:number}) {
  const storageKey=vesselId ? `velaris:charge-scenario:${vesselId}` : null;
  const [saved] = useState((): {enabled:boolean|null;settings:ChargeSettings} => {
    try {
      const value: unknown=storageKey ? JSON.parse(localStorage.getItem(storageKey) ?? 'null') : null;
      if (value && typeof value==='object') {
        const entry=value as {enabled?:unknown;settings?:unknown};
        return {enabled:typeof entry.enabled==='boolean' ? entry.enabled : null,settings:readChargeScenario(vesselId,raw).settings};
      }
    } catch { /* Session controls remain available. */ }
    return {enabled:null,settings:DEFAULT_CHARGE_SETTINGS};
  });
  const [choice,setChoice]=useState<boolean|null>(saved.enabled);
  const [settings,setSettings]=useState<ChargeSettings>(saved.settings);
  const [editor,setEditor]=useState<ElectricalEditorTarget>(null);
  const [saveError,setSaveError]=useState(false);
  const enabled=choice ?? raw.alternatorCurrentSource==='simulated-from-rpm';
  const persist=(mode:boolean,next:ChargeSettings)=>{
    try { setSaveError(!saveChargeScenario(vesselId,mode,next)); }
    catch { setSaveError(true); }
  };
  useEffect(()=>{
    const refresh=()=>{const next=readChargeScenario(vesselId,raw);setChoice(next.enabled);setSettings(next.settings);};
    window.addEventListener(BOAT_LIGHTING_CHANGED,refresh);window.addEventListener('storage',refresh);
    return ()=>{window.removeEventListener(BOAT_LIGHTING_CHANGED,refresh);window.removeEventListener('storage',refresh);};
  },[vesselId,raw]);
  const model=enabled ? buildChargeModel(raw,settings,position,now) : null;
  const fogOn=model?.consumers.some(consumer=>consumer.id==='fog'&&consumer.on)??false;
  const balance=model?energyBalance(model,settings):null;
  const instruments=model?.instruments ?? raw;
  const shoreAmps=model?.shoreAmps ?? null;
  const service=instruments.batteries.filter(b=>b.role==='service');
  const start=instruments.batteries.filter(b=>b.role==='start');
  const bankValue=(bank:readonly BatteryReadings[])=>bank.length===1?format(currentValue(bank[0].volts),'V',2):bank.length>1?`${bank.length} baterías`:'Sin datos';
  const solar = instruments.solar;
  const pvWatts = batteryPower(solar?.pvVolts ?? null, solar?.pvAmps ?? null);
  const solarWatts = batteryPower(solar?.outputVolts ?? null, solar?.outputAmps ?? null);
  const solarLive = solar ? Object.values(solar).some(reading => currentValue(reading) !== null) : false;
  const lightLive = instruments.lights?.some(light => currentValue(light.relay) !== null) ?? false;
  const live = solarLive || lightLive || instruments.batteries.some(b=>currentValue(b.volts)!==null || currentValue(b.amps)!==null) || currentValue(instruments.alternatorVolts)!==null;
  return <section className="el-overview" aria-label="Producción, baterías y distribución eléctrica">
    <ChargingControls enabled={enabled} settings={settings} model={model} onEnabled={value=>{setChoice(value);persist(value,settings);}} onChange={next=>{const clean=chargeSettings(next);setSettings(clean);persist(enabled,clean);}}/>
    <div className="el-consumer-list"><article data-consumer="fog"><label><input type="checkbox" role="switch" aria-label="Luz de niebla" checked={fogOn} disabled={!enabled||!vesselId} onChange={event=>{const next=chargeSettings({...settings,consumers:switchFogLight(settings.consumers,event.target.checked)});setSettings(next);persist(enabled,next);}}/><span>Luz de niebla<small>Ensayo local · independiente de navegación</small></span><strong>{fogOn?'Encendida':'Apagada'}</strong></label><button type="button" onClick={()=>setEditor('Iluminación')}>Ajustar consumo nominal</button>{!enabled&&<small>Activa el modelo de simulación para utilizar el interruptor.</small>}</article></div>
    {saveError && <p role="status">No se pudo guardar el escenario; sigue funcionando en esta sesión.</p>}
    {model?.startBatteryFull&&<p role="status" className="bs-notice">Arranque cargada (SOC 100 %): Regulación asigna el 100 % de la producción a servicios. Carga de arranque: 0 A.</p>}
    {balance&&<EnergyAlerts balance={balance} onRepartition={()=>setEditor('regulation')} onConsumers={()=>setEditor('distribution')}/>}
    <div className="el-main"><aside className="el-status-panel"><h3>Estado del sistema</h3><p className="el-coverage"><span/>{live?'Telemetría parcial':'Sin telemetría'}</p><h4>Producción</h4><dl><div><dt><Sun size={13}/>Solar · salida MPPT</dt><dd>{format(solarWatts,'W',0)}</dd></div><div><dt><Gauge size={13}/>Alternador</dt><dd>{format(currentValue(instruments.alternatorAmps ?? null),'A',1)}{instruments.alternatorCurrentSource === 'simulated-from-rpm' ? ' · simulado' : ''}</dd></div><div><dt><Plug size={13}/>Puerto</dt><dd>{shoreAmps===null ? 'Sin datos' : `${format(shoreAmps,'A',1)} DC · simulado`}</dd></div></dl><div className="el-status-total"><span>Consumo total</span><strong>{balance ? format(balance.consumptionWatts,'W',1) : 'Sin datos'}</strong></div><div className="el-status-total"><span>Balance</span><strong>{balance?format(balance.balanceWatts,'W',1):'Sin datos'}</strong></div></aside>
    <div className="el-graph-scroll" tabIndex={0} role="region" aria-label="Diagrama eléctrico; desliza horizontalmente en pantallas pequeñas"><ReferenceDiagram instruments={instruments} shoreAmps={shoreAmps} consumers={model?.consumers} onOpen={setEditor} flows={model?{serviceDemand:model.consumerAmps+settings.serviceLoad,engineDemand:settings.startLoad,serviceCharge:model.serviceCharge,startCharge:model.startCharge,engineRunning:model.engine}:undefined}/></div></div>
    <ElectricalEditor target={editor} onClose={()=>setEditor(null)} enabled={enabled} onEnable={()=>{setChoice(true);persist(true,settings);}} settings={settings} raw={raw} onSelect={setEditor} solarProduction={model?.solarProduction} onChange={next=>{const clean=chargeSettings(next);setSettings(clean);persist(enabled,clean);}}/>
    <div className="el-summary">{[
      {label:'Servicios',value:bankValue(service),icon:Battery}, {label:'Arranque',value:bankValue(start),icon:Battery},
      {label:'Consumo total',value:balance?format(balance.consumptionWatts,'W',1):'Sin datos',icon:Gauge}, {label:'Solar · salida MPPT',value:format(solarWatts,'W',0),icon:Sun},
      {label:'Balance',value:balance?format(balance.balanceWatts,'W',1):'Sin datos',icon:Zap}, {label:'Autonomía',value:'Sin datos',icon:Clock},
    ].map(stat=><div key={stat.label}><stat.icon size={28}/><div><span>{stat.label}</span><strong>{stat.value}</strong></div></div>)}</div>
    {instruments.batteries.length>0 && <div className="el-measurements">{instruments.batteries.map(b=><div key={b.name}><span>{b.name}</span><strong>{format(currentValue(b.volts),'V',2)} · {format(currentValue(b.amps),'A')} · {format(batteryPower(b.volts,b.amps),'W',0)}</strong><small>Potencia neta V × A del mismo sensor; no equivale a consumo total.</small></div>)}</div>}
    <div className="el-measurements"><div><span>Alternador · {instruments.alternatorCurrentSource === 'simulated-from-rpm' ? enabled ? 'corriente del modelo de carga' : 'corriente simulada según RPM motor 1' : 'corriente medida'}</span><strong>{format(currentValue(instruments.alternatorVolts),'V',1)} · {format(currentValue(instruments.alternatorAmps ?? null),'A',1)} · {format(batteryPower(instruments.alternatorVolts, instruments.alternatorAmps ?? null),'W',1)}</strong><small>{instruments.alternatorCurrentSource === 'simulated-from-rpm' ? enabled ? 'Fuente seleccionada por prioridad AC → solar → alternador.' : 'Nominal de ensayo: cero con RPM cero; sin RPM vigentes, sin datos.' : 'Sin corriente recibida no se confirma producción.'}</small></div></div>
    <div className="el-measurements" aria-label="Mediciones solares y retorno de luces">
      <div><span>Solar 0 · paneles</span><strong>{format(currentValue(solar?.pvVolts ?? null),'V')} · {format(currentValue(solar?.pvAmps ?? null),'A')} · {format(pvWatts,'W',1)}</strong><small>Entrada al MPPT · potencia derivada de V × A sincronizados.</small></div>
      <div><span>Solar 0 · salida MPPT</span><strong>{format(currentValue(solar?.outputVolts ?? null),'V')} · {format(currentValue(solar?.outputAmps ?? null),'A')} · {format(solarWatts,'W',1)}</strong><small>Hacia bus DC · no sumar a potencia de paneles.</small></div>
      {(Object.keys(LIGHT_CIRCUITS) as LightCircuit[]).map(circuit => <div key={circuit}><span>Luces · {LIGHT_CIRCUITS[circuit]}</span><strong>{relayLabel(instruments.lights?.find(light => light.circuit === circuit)?.relay)}</strong><small>Retorno de relé · no confirma emisión luminosa.</small></div>)}
    </div>
    <p className="el-caption">{enabled ? 'SIMULACIÓN: corrientes calculadas, dos bancos y reparto configurable. ' : ''}Servicios → Distribución representa la demanda del bus, independiente de la corriente neta de batería; puede haber alimentación de consumidores y carga simultáneas. Arranque → Motor es un ramal exclusivo. Líneas luminosas animadas: solar y baterías según medidas vigentes; en luces, activación por retorno de relé (flujo ilustrativo, corriente no medida). Gris: sin flujo confirmado. Rutas funcionales orientativas, sin atribuir qué fuente carga cada banco. La tensión del alternador no confirma producción.</p>
  </section>;
}
