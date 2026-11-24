import { ConsumerConnectionDialog } from './ConsumerConnectionDialog';
import { ChargeRouteDialog } from './ChargeRouteDialog';
import { chargePaths, compatibleEndpoints, electricalNodeLabels } from './electricalTopology';
import type { SourceKind } from './chargeRoute';
import { TechnicalEditDialog } from './TechnicalEditDialog';
import { chargeContributions } from './chargeContributions';
import React, { useEffect, useState } from 'react';
import { BatteryCharging, Cable, Cog, Droplets, Settings2, Sun, Zap, ShieldCheck, SlidersHorizontal, Circle, Clock } from 'lucide-react';
import { EquipmentSchematic } from './EquipmentSchematic';
import { SensorBindingsPanel, useLiveSensors } from './LiveSensors';
import { resolveBinding, type InstrumentProvider } from './sensorBindings';
import type { Bank, Battery, Component, Installation, InstallationLink, InstallationNode, Tank, TechnicalInventory } from './model';
import { newComponent, parseInventory } from './model';
import { bankNominal } from './installationModel';
import './installation3d.css';
import './bankWorkspace.css';

const labels = { tank: 'Depósito', battery: 'Batería', bank: 'Banco', ...electricalNodeLabels };
const fluids: Record<Tank['fluid'], string> = { diesel:'Gasóleo',petrol:'Gasolina',freshwater:'Agua dulce',greywater:'Aguas grises',blackwater:'Aguas negras',other:'Otro fluido' };
const format = (value: number | null, unit: string) => value === null ? 'Sin datos' : `${value.toLocaleString('es-ES', {maximumFractionDigits:2})} ${unit}`;
const topologyName = (bank: Bank | undefined) => !bank || bank.topology === 'unknown' ? 'Conexión sin definir' : bank.topology === 'series-parallel' ? 'Conexión serie-paralelo' : bank.topology === 'series' ? 'Conexión en serie' : 'Conexión en paralelo';

export function InstallationView({ inventory, mode, disabled, onEdit, onApply, shipId, getInstrumentFeed, onContextChange, onApplyConfirmed }: {
  onApplyConfirmed?: (inventory: TechnicalInventory) => Promise<void>;
  onContextChange?: (label:string|null)=>void;
  shipId?: string;
  getInstrumentFeed?: InstrumentProvider;
  inventory: TechnicalInventory;
  mode: 'tanks' | 'electricity';
  disabled: boolean;
  onEdit: (component: Component) => void;
  onApply: (inventory: TechnicalInventory) => Promise<void>;
}) {
  const live = useLiveSensors(shipId, getInstrumentFeed);
  const [bankChoice, setBankChoice] = useState('');
  const [bankTab,setBankTab] = useState<'scheme'|'detail'|'batteries'|'chargers'|'consumers'|'protections'>('scheme');
  const [connectingConsumer, setConnectingConsumer] = useState(false);
  const [routeKind, setRouteKind] = useState<SourceKind | 'distributor' | null>(null);
  const [node, setNode] = useState<InstallationNode | null>(null);
  const [link, setLink] = useState<InstallationLink | null>(null);
  const [error, setError] = useState('');
  const installation = inventory.installation ?? { nodes: [], links: [] };
  const banks = inventory.components.filter((c): c is Bank => c.kind === 'bank');
  const bank = bankChoice === '__unassigned__' ? undefined : banks.find(c => c.id === bankChoice) ?? banks[0];
  useEffect(() => { onContextChange?.(mode === 'electricity' ? bank?.name ?? null : null); },[mode,bank?.name,onContextChange]);
  const tanks = inventory.components.filter((c): c is Tank => c.kind === 'tank');
  const batteries = inventory.components.filter((c): c is Battery => c.kind === 'battery' && c.bankId === (bank?.id ?? null));
  const unassigned = inventory.components.filter(c => c.kind === 'battery' && c.bankId === null).length;
  const readings = new Map((installation.bindings ?? []).flatMap(binding => {
    const value = shipId ? resolveBinding(binding, live.feed, live.confirmation, shipId, live.now) : null;
    return value ? [[`${binding.targetId}:${binding.metric}`, value] as const] : [];
  }));
  const visualItem = <T extends Battery | Tank>(item: T): T => {
    const reading = (metric: 'level' | 'voltage' | 'soc') => {
      const value = readings.get(`${item.id}:${metric}`);
      return value && live.feed ? { value:value.reading.value,origin:'measured' as const,at:new Date(live.feed.capturedAt-value.reading.ageMs).toISOString(),sensor:value.sensor } : null;
    };
    return item.kind === 'tank' ? {...item,level:reading('level') ?? item.level} : {...item,voltage:reading('voltage') ?? item.voltage,soc:reading('soc') ?? item.soc};
  };
  const all = [...inventory.components, ...installation.nodes];
  const links = installation.links.filter(l => mode === 'tanks' ? l.medium === 'pipe' : l.medium === 'cable' && (l.from === bank?.id || l.to === bank?.id));
  const paths = bank ? chargePaths(installation, inventory.components, bank.id) : [];
  const sources = [...new Map(paths.map(path => [path.source.id, path.source])).values()];
  // Source readings only describe this bank when there is one direct route, not a shared input.
  const sourceOutput = (sourceId: string) => {
    const routes = paths.filter(path => path.source.id === sourceId);
    return routes.length === 1 && routes[0].links.length === 1 ? routes[0].links[0] : undefined;
  };
  const consumers = installation.nodes.filter(n => n.kind === 'consumer' && links.some(l => l.to === n.id));
  const nominal = bank ? bankNominal(bank, inventory) : null;
  const bankCurrent = bank ? readings.get(`${bank.id}:current`) ?? null : null;
  const contributions = chargeContributions(sources.map(source => {
    const output=sourceOutput(source.id);
    const current=output ? readings.get(`${output.id}:current`) : null;
    return {id:source.id,name:source.name,amps:current?.reading.value ?? null,ageMs:current?.reading.ageMs ?? null};
  }));
  const tabs=[{id:'scheme' as const,label:'Esquema',icon:Cable},{id:'detail' as const,label:'Detalle del banco',icon:BatteryCharging},{id:'batteries' as const,label:`Baterías (${batteries.length})`,icon:BatteryCharging},{id:'chargers' as const,label:'Cargadores',icon:Zap},{id:'consumers' as const,label:'Consumos',icon:SlidersHorizontal},{id:'protections' as const,label:'Protecciones',icon:ShieldCheck}];
  const first=batteries[0];
  const matched=first && first.nominalV!==null && first.capacityAh!==null && batteries.every(c=>c.nominalV===first.nominalV && c.capacityAh===first.capacityAh && c.chemistry===first.chemistry);
  const bankDescription=matched ? `${batteries.length} ${first.chemistry==='unknown'?'baterías':first.chemistry} de ${format(first.nominalV,'V')} y ${format(first.capacityAh,'Ah')} · ${topologyName(bank)}` : `${batteries.length} baterías · ${topologyName(bank)}`;
  const knownCapacity = tanks.reduce((sum,t) => sum+(t.capacityL ?? 0),0);
  const unknownCapacity = tanks.filter(t => t.capacityL === null).length;
  const save = async (next: Installation) => {
    try { const updated = parseInventory({ ...inventory, installation: next }); setError(''); await (onApplyConfirmed ?? onApply)(updated); setNode(null); setLink(null); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : 'Instalación inválida'); }
  };
  // Edits always receive the master record, never a transient telemetry overlay.
  const editEquipment = (component: Component) => {
    const original = inventory.components.find(c => c.id === component.id);
    if (original && !disabled) onEdit(original);
  };
  const metric = (title: string, value: string, detail: string) => <article className="iv-metric" title={detail}><div className="iv-metric-icon">{title.includes('Energía') ? <Zap size={31}/> : title.includes('SOC') ? <BatteryCharging size={31}/> : <BatteryCharging size={31}/>}</div><div><span>{title}</span><strong>{value}</strong><small>{detail}</small></div></article>;
  return <section className="iv iv-dashboard" aria-label={mode === 'electricity' ? 'Estado de la instalación eléctrica' : 'Estado de los depósitos'}>
    <div className="iv-heading">
      <div className="iv-heading-icon">{mode === 'electricity' ? <Zap size={30}/> : <Droplets size={30}/>}</div>
      <div><h3>{mode === 'electricity' ? bank?.name ?? 'Baterías sin banco' : 'Depósitos de a bordo'}</h3><p>{mode === 'electricity' ? bankDescription : `${tanks.length} depósitos registrados · capacidades y niveles individuales`}</p></div>
      <span className="iv-config-state">{mode === 'electricity' ? nominal?.volts !== null && nominal?.volts !== undefined ? 'Nominales configurados' : 'Pendiente de configurar' : 'Inventario declarado'}</span>{bank && mode === 'electricity' && <button type="button" disabled={disabled} onClick={() => onEdit(bank)}><Settings2 size={16}/>Editar banco</button>}
    </div>
    {mode === 'electricity' && <div className="iv-setup-actions" aria-label="Añadir equipos de carga">
      <button type="button" disabled={disabled} onClick={() => setRouteKind('solar')}><Sun size={18}/>Añadir solar</button>
      <button type="button" disabled={disabled} onClick={() => setRouteKind('shore')}><Zap size={18}/>Añadir puerto AC</button>
      <button type="button" disabled={disabled} onClick={() => setRouteKind('alternator')}><Cog size={18}/>Añadir alternador</button>
      <button type="button" disabled={disabled} onClick={() => setRouteKind('distributor')}><Cable size={18}/>Añadir repartidor</button>
      {(['bank','battery'] as const).map(kind => <button type="button" key={kind} disabled={disabled} onClick={() => {const component = newComponent(kind, crypto.randomUUID()); onEdit(component.kind === 'battery' ? {...component, bankId:bank?.id ?? null} : component);}}>+ {labels[kind]}</button>)}
    </div>}
    {mode === 'tanks' && <div className="iv-setup-actions" aria-label="Gestionar depósitos y salidas"><button type="button" disabled={disabled} onClick={()=>onEdit(newComponent('tank',crypto.randomUUID()))}><Droplets size={18}/>Añadir depósito</button><button type="button" disabled={disabled} onClick={()=>setConnectingConsumer(true)}><Cable size={18}/>Vincular consumidor / salida</button></div>}
    {mode === 'electricity' && (banks.length > 1 || unassigned > 0) && <nav className="iv-bank-picker" aria-label="Elegir banco">{banks.map(b => <button type="button" key={b.id} aria-pressed={bank?.id === b.id} onClick={() => setBankChoice(b.id)}>{b.name}</button>)}{unassigned > 0 && <button type="button" aria-pressed={!bank} onClick={() => setBankChoice('__unassigned__')}>Sin banco ({unassigned})</button>}</nav>}
    {mode==='electricity' && <nav className="iv-bank-tabs" aria-label="Vistas del banco">{tabs.map(({id,label,icon:Icon})=><button type="button" key={id} aria-pressed={bankTab===id} onClick={()=>setBankTab(id)}><Icon size={21}/>{label}</button>)}</nav>}
    {(mode === 'tanks' || bankTab==='scheme') && <>
    <div className="iv-metrics">{mode === 'electricity' ? <>
      {metric('Tensión nominal', format(nominal?.volts ?? null,'V'),'Calculada según la conexión declarada')}
      {metric('Capacidad nominal',format(nominal?.ah ?? null,'Ah'),'Características declaradas')}
      {metric('Energía nominal',format(nominal?.wh === null || nominal?.wh === undefined ? null : nominal.wh/1000,'kWh'),'No equivale a energía disponible')}
      {metric('SOC (estado de carga)','Sin datos','Sin sensor de SOC vinculado al banco')}
    </> : <>
      {metric('Depósitos',String(tanks.length),'Equipos registrados')}
      {metric('Capacidad conocida',tanks.length && unknownCapacity < tanks.length ? format(knownCapacity,'L') : 'Sin datos',unknownCapacity ? `${unknownCapacity} depósitos sin capacidad definida` : 'Capacidad nominal declarada')}
      {metric('Niveles conocidos',String(tanks.filter(t => visualItem(t).level.value !== null).length),'Manuales o medidos, según cada depósito')}
      {metric('Salidas declaradas',String(links.length),'Sin caudal inferido')}
    </>}</div>
    <div className="iv-operation">
      <aside className="iv-side"><h4>{mode === 'electricity' ? 'Fuentes de carga' : 'Tipos de depósito'}</h4>
        {mode === 'electricity' ? sources.length ? sources.map(source => {
          const output = sourceOutput(source.id);
          const amps = output ? readings.get(`${output.id}:current`) : null;
          const Icon = source.kind === 'solar' ? Sun : Cog;
          return <button type="button" className="iv-source" key={source.id} disabled={disabled} onClick={() => setNode(source)}><span className={`iv-source-icon iv-source-${source.kind}`}><Icon size={34}/></span><span><strong>{source.name}</strong><small>{amps ? amps.reading.value > 0 ? 'Aporte medido' : 'Sin aporte neto medido' : 'Conexión declarada · sin lectura'}</small><small>{[...new Set(paths.filter(path=>path.source.id===source.id).flatMap(path=>path.via.map(device=>device.name)))].join(' → ') || 'Salida directa al banco'}</small><b>{format(amps?.reading.value ?? null,'A')}</b></span><svg className={amps && amps.reading.value>0?'iv-source-outlet iv-source-measured':'iv-source-outlet'} viewBox="0 0 40 24" aria-label="Conexión declarada con el banco"><path d="M0 12H35M28 5L35 12L28 19"/></svg></button>;
        }) : <p className="iv-empty">No hay fuentes vinculadas a este banco.</p> : Object.entries(fluids).filter(([kind]) => tanks.some(t => t.fluid === kind)).map(([kind,label]) => <div className="iv-fluid" key={kind}><Droplets size={24}/><span>{label}<strong>{tanks.filter(t => t.fluid === kind).length} depósitos</strong></span></div>)}
      </aside>
      <div className="iv-equipment-panel">
        <div className="iv-scene-heading"><span>{mode === 'electricity' ? topologyName(bank) : 'Capacidad y nivel'}</span><small>Pulsa un equipo para editar</small></div>
        {(mode === 'electricity' ? batteries.length : tanks.length) ? <div className="iv-equipment"><EquipmentSchematic equipment={mode === 'electricity' ? batteries.map(visualItem) : tanks.map(visualItem)} topology={mode === 'electricity' ? bank?.topology : undefined} disabled={disabled} onEdit={editEquipment}/></div> : <div className="iv-scene-empty"><BatteryCharging size={48}/><p>{mode === 'electricity' ? 'Añade las baterías instaladas y asígnalas a un banco.' : 'Añade los depósitos instalados a bordo.'}</p></div>}
        <div className="iv-scene-caption">{mode === 'electricity' ? 'Bornes y topología declarados · no se deduce el estado de carga.' : 'Nivel desconocido: rayado · las posiciones son esquemáticas.'}</div>
      </div>
      <aside className="iv-side iv-status"><h4>{mode === 'electricity' ? 'Estado de carga' : 'Consumos asociados'}</h4>
        {mode === 'electricity' ? <><div className="iv-soc-ring"><svg viewBox="0 0 160 160" aria-hidden="true"><path d="M32 126 A62 62 0 1 1 128 126" fill="none" stroke="#345c75" strokeWidth="15" strokeLinecap="round"/></svg><span>—<small>SOC del banco</small></span></div><p>Sin sensor de SOC asignado al banco</p><dl><div><dt>Tensión del banco</dt><dd>Sin datos</dd></div><div><dt>Corriente neta</dt><dd>{format(bankCurrent?.reading.value ?? null,'A')}</dd></div><div><dt>Potencia medida</dt><dd>Sin datos</dd></div></dl></> : consumers.length ? consumers.map(consumer => <button type="button" key={consumer.id} disabled={disabled} onClick={() => setNode(consumer)}><Cable size={20}/>{consumer.name}</button>) : <p className="iv-empty">No hay consumidores vinculados.</p>}
      </aside>
    </div>
    {mode==='electricity' && <div className="iv-charge-overview">
      <section className="iv-origin"><h4>Origen de la carga (actual)</h4><div className="iv-origin-icons">{sources.map(source=>source.kind==='solar'?<Sun key={source.id} size={46}/>:<Cog key={source.id} size={46}/>)}</div><strong>{contributions.activeNames.length ? contributions.activeNames.join(' + ') : contributions.complete ? 'Sin aporte medido' : 'Sin datos'}</strong><p>{contributions.complete ? 'Lecturas de fuentes sincronizadas' : 'Origen completo no confirmado'}</p></section>
      <section className="iv-contributions"><h4>Aportes en tiempo real</h4>{contributions.rows.length ? contributions.rows.map(source=><div className="iv-contribution" key={source.id}><span>{source.name}</span><div className="iv-contribution-track" data-known={source.percent!==null}>{source.percent!==null && <i style={{width:`${source.percent}%`}}/>}</div><b>{format(source.amps,'A')}</b><small>{source.percent===null?'—':`${source.percent.toFixed(0)} %`}</small></div>) : <p>Sin fuentes vinculadas.</p>}</section>
      <section className="iv-topology"><h4>Topología del banco</h4>{batteries.length ? <svg viewBox={`0 0 ${Math.min(3,batteries.length)*96+16} 90`} aria-label={`${topologyName(bank)} · ${batteries.length} baterías`}>
        {batteries.slice(0,3).map((battery,index)=><g key={battery.id}><rect x={index*96+8} y="38" width="76" height="42" rx="4" fill="#062a3e" stroke="#9bd2e8" strokeWidth="3"/><text x={index*96+18} y="66" fill="#c9f0ff" fontSize="20" fontWeight="700">+</text><text x={index*96+62} y="66" fill="#c9f0ff" fontSize="20" fontWeight="700">−</text>{index>0&&bank?.topology==='series'&&<path d={`M${(index-1)*96+70} 38V20H${index*96+20}V38`} fill="none" stroke="#ed6a5c" strokeWidth="4"/>}{index>0&&bank?.topology==='parallel'&&<g fill="none" strokeWidth="4"><path d={`M${(index-1)*96+20} 38V12H${index*96+20}V38`} stroke="#ed6a5c"/><path d={`M${(index-1)*96+70} 38V25H${index*96+70}V38`} stroke="#6db4de"/></g>}</g>)}
      </svg>:<p>Sin baterías asignadas</p>}<strong>{topologyName(bank)}{bank?.topology==='series'?` (${batteries.length}S)`:bank?.topology==='parallel'?` (${batteries.length}P)`:''}</strong><small>{format(nominal?.volts ?? null,'V')} · {format(nominal?.ah ?? null,'Ah')}</small>{batteries.length>3&&<small>Esquema reducido · {batteries.length} baterías</small>}</section>
    </div>}
    <footer className="iv-operational-footer"><span><Circle size={15}/>{readings.size?'Lecturas vigentes confirmadas':'Estado operativo sin verificar'}</span><span>{mode==='electricity'?`Fuentes vinculadas: ${sources.map(source=>source.name).join(', ') || 'ninguna'}`:`Depósitos registrados: ${tanks.length}`}</span><span><Clock size={15}/>{contributions.latestAgeMs===null?'Sin actualización medida':`Lectura: hace ${(contributions.latestAgeMs/1000).toFixed(0)} s`}</span></footer>
    </>}
    {mode==='electricity' && bankTab!=='scheme' && <section className="iv-bank-detail-panel"><h4>{tabs.find(tab=>tab.id===bankTab)?.label}</h4>
      {bankTab==='detail' && <><dl><div><dt>Banco</dt><dd>{bank?.name ?? 'Sin asignar'}</dd></div><div><dt>Ubicación</dt><dd>{bank?.location || 'Sin especificar'}</dd></div><div><dt>Topología</dt><dd>{topologyName(bank)}</dd></div><div><dt>Equivalente nominal</dt><dd>{format(nominal?.volts ?? null,'V')} · {format(nominal?.ah ?? null,'Ah')}</dd></div></dl>{bank&&<button type="button" disabled={disabled} onClick={()=>onEdit(bank)}>Editar banco</button>}</>}
      {bankTab==='batteries' && <div className="iv-device-list">{batteries.map(battery=><button type="button" key={battery.id} disabled={disabled} onClick={()=>onEdit(battery)}><BatteryCharging size={30}/><strong>{battery.name}</strong><span>{format(battery.nominalV,'V')} · {format(battery.capacityAh,'Ah')}</span><small>{battery.chemistry==='unknown'?'Tecnología desconocida':battery.chemistry}</small></button>)}{!batteries.length&&<p>Sin baterías asignadas a este banco.</p>}</div>}
      {bankTab==='chargers' && <><p>Equipos de carga de toda la embarcación. Pulsa un equipo para editar su ficha.</p><div className="iv-device-list">{installation.nodes.filter(item=>item.kind!=='consumer').map(item=><button type="button" key={item.id} disabled={disabled} onClick={()=>setNode(item)}><Zap size={25}/><strong>{item.name}</strong><small>{labels[item.kind]}</small></button>)}</div><h4>Recorridos hacia este banco</h4><div className="iv-route-list">{paths.map(path=><article key={path.links.map(l=>l.id).join(':')}><strong>{path.source.name} → {[...path.via.map(item=>item.name),path.bank.name].join(' → ')}</strong><div>{path.links.map(connection=><button type="button" key={connection.id} disabled={disabled} onClick={()=>setLink(connection)}>Editar {connection.name}</button>)}</div></article>)}{!paths.length&&<p>No hay recorridos de carga declarados hacia este banco. Usa «Añadir solar», «Añadir puerto AC» o «Añadir repartidor».</p>}</div></>}
      {bankTab==='consumers' && <><button type="button" className="iv-add-consumer" disabled={disabled} onClick={()=>setConnectingConsumer(true)}>Vincular consumidor a este banco</button><div className="iv-device-list">{consumers.map(item=><button type="button" key={item.id} disabled={disabled} onClick={()=>setNode(item)}><Zap size={28}/><strong>{item.name}</strong><small>{item.location||'Ubicación sin especificar'}</small></button>)}{!consumers.length&&<p>No hay consumidores vinculados a este banco.</p>}</div></>}
      {bankTab==='protections'&&<p>No hay protecciones registradas en el modelo actual. Su presencia y dimensionamiento requieren verificación a bordo; no se deducen de las baterías ni de la corriente.</p>}
    </section>}
    <details className="iv-link-details" open={mode==='tanks'?true:undefined}><summary>{mode==='electricity'?'Conexiones declaradas del banco':'Tuberías y salidas declaradas'}</summary>
    <div className="iv-connections"><h4>{mode === 'electricity' ? 'Conexiones del banco' : 'Tuberías y salidas'}</h4>{links.length ? links.map(l => {
      const current = readings.get(`${l.id}:current`);
      return <button type="button" disabled={disabled} key={l.id} onClick={() => setLink(l)} className={current && current.reading.value > 0 ? 'iv-current-active' : ''}><Cable size={17}/><span><strong>{l.name}</strong><small>{all.find(c => c.id === l.from)?.name} → {all.find(c => c.id === l.to)?.name}</small></span><b>{current ? format(current.reading.value,'A') : 'Sin lectura'}</b></button>;
    }) : <p>Sin conexiones declaradas.</p>}</div>
    </details>
    {mode === 'electricity' && consumers.length > 0 && <p className="iv-footnote">Consumos vinculados: {consumers.map(c => c.name).join(' · ')}</p>}
    <details className="iv-settings"><summary><Settings2 size={17}/>Sensores y conexiones avanzadas</summary>
      <SensorBindingsPanel inventory={inventory} shipId={shipId} live={live} disabled={disabled} onApply={onApply}/>
      <div className="ti-actions">{(mode === 'tanks' ? ['tank'] as const : ['bank','battery'] as const).map(kind => <button type="button" disabled={disabled} key={kind} onClick={() => onEdit(newComponent(kind,crypto.randomUUID()))}>Añadir {labels[kind]}</button>)}{(mode === 'tanks' ? ['consumer'] as const : ['alternator','solar','consumer'] as const).map(kind => <button type="button" disabled={disabled} key={kind} onClick={() => {setLink(null);setNode({id:crypto.randomUUID(),kind,name:'',location:'',manufacturer:'',model:''});}}>Añadir {labels[kind]}</button>)}<button type="button" disabled={disabled} onClick={() => {setNode(null);setLink({id:crypto.randomUUID(),from:'',to:'',medium:mode === 'tanks' ? 'pipe' : 'cable',name:''});}}>Añadir {mode === 'tanks' ? 'tubería / salida' : 'conexión'}</button></div>
      <p>Solo se representan relaciones declaradas. Las lecturas manuales no acreditan actividad actual.</p>
    </details>

    {connectingConsumer && <ConsumerConnectionDialog inventory={inventory} medium={mode==='tanks'?'pipe':'cable'} selectedBankId={bank?.id} disabled={disabled} onApply={onApplyConfirmed ?? onApply} onClose={()=>setConnectingConsumer(false)}/> }
    {routeKind && <ChargeRouteDialog key={routeKind} inventory={inventory} kind={routeKind} selectedBankId={bank?.id} disabled={disabled} onApply={onApplyConfirmed ?? onApply} onClose={()=>setRouteKind(null)}/> }
    {node && <TechnicalEditDialog title={`Editar ${node.name || labels[node.kind]}`} onClose={() => {setNode(null);setError('');}}><form className="ti-editor" onSubmit={e => { e.preventDefault(); void save({ ...installation, nodes: [...installation.nodes.filter(n => n.id !== node.id), node] }); }}><h4>{labels[node.kind]}</h4><div className="ti-fields">{(['name', 'location', 'manufacturer', 'model'] as const).map((f,i) => <label key={f}>{['Nombre','Ubicación','Fabricante','Modelo'][i]}<input required={f === 'name'} maxLength={240} value={node[f]} onChange={e => setNode({ ...node, [f]:e.target.value })}/></label>)}</div><div className="ti-actions"><button disabled={disabled} type="submit">Guardar equipo</button><button type="button" onClick={() => setNode(null)}>Cancelar</button>{installation.nodes.some(n => n.id === node.id) && <button disabled={disabled} type="button" onClick={() => void save({ ...installation, nodes:installation.nodes.filter(n => n.id !== node.id) })}>Retirar equipo</button>}</div><p>Retira primero sus conexiones. Un consumidor puede vincularse tanto a un banco como a un depósito.</p></form>{error && <p role="alert">{error}</p>}</TechnicalEditDialog>}
    {link && <TechnicalEditDialog title={`Editar ${link.name || 'conexión'}`} onClose={() => {setLink(null);setError('');}}><form className="ti-editor" onSubmit={e => { e.preventDefault(); void save({ ...installation, links:[...installation.links.filter(l => l.id !== link.id),link] }); }}><h4>Conexión declarada · sin flujo inferido</h4><div className="ti-fields"><label>Nombre / salida<input required maxLength={240} value={link.name} onChange={e => setLink({ ...link,name:e.target.value })}/></label>{(['from','to'] as const).map(f => <label key={f}>{f === 'from' ? 'Origen' : 'Destino'}<select required value={link[f]} onChange={e => setLink({ ...link,[f]:e.target.value,...(f==='from'?{to:''}:{}) })}><option value="">Seleccionar equipo</option>{all.filter(c => f === 'to' ? compatibleEndpoints(all.find(item=>item.id===link.from)?.kind,c.kind,link.medium) : all.some(target=>compatibleEndpoints(c.kind,target.kind,link.medium))).map(c => <option key={c.id} value={c.id}>{c.name} · {labels[c.kind]}</option>)}</select></label>)}</div><div className="ti-actions"><button disabled={disabled} type="submit">Guardar conexión</button><button type="button" onClick={() => setLink(null)}>Cancelar</button>{installation.links.some(l => l.id === link.id) && <button disabled={disabled} type="button" onClick={() => void save({ ...installation,links:installation.links.filter(l => l.id !== link.id) })}>Retirar conexión</button>}</div></form>{error && <p role="alert">{error}</p>}</TechnicalEditDialog>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
