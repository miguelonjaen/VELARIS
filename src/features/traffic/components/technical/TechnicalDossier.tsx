import { VesselSystemPanel } from '../VesselSystemPanel';
import type { ShipData } from '../../../../shared/types';
import { SYSTEM_SECTIONS, type SystemSection } from './systemEquipment';
import { ElectricalSession } from './electrical/session';
import { ElectricalEditor } from './electrical/ElectricalEditor';
import { TechnicalEditDialog } from './TechnicalEditDialog';
import type { InstrumentProvider } from './sensorBindings';
import { TankWorkspace } from './tanks/TankWorkspace';
import React, { useEffect, useRef, useState } from 'react';
import { BatteryCharging, Droplets, Plus, Save, Settings2 } from 'lucide-react';
import { type Bank, type Component, type ComponentKind, type Reading, type Tank, type TechnicalInventory, newComponent, removeComponent, replaceComponent, tankTotals, unknownReading } from './model';
import { loadTechnicalInventory, saveTechnicalInventory } from './repository';
import { draftKey, DraftStorageUnavailableError, recoverDraft, parseDraft, type DraftStorage, type InventorySnapshot } from './drafts';
import './technicalDossier.css';
// Preserve the shared dialog theme previously loaded through InstallationView.
import './bankWorkspace.css';

// Access is deferred so a local-storage outage cannot prevent a remote save.
const recoveryStorage: DraftStorage = {
  getItem: key => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
  removeItem: key => localStorage.removeItem(key)
};

export type TechnicalTab = 'general' | 'configuration' | 'tanks' | 'electricity' | SystemSection;
const fluids: Record<Tank['fluid'], string> = { diesel: 'Gasóleo', petrol: 'Gasolina', freshwater: 'Agua dulce', greywater: 'Aguas grises', blackwater: 'Aguas negras', other: 'Otro fluido' };
const kinds: Record<ComponentKind, string> = { tank: 'Depósito', battery: 'Batería', bank: 'Banco eléctrico' };
const purposes: Record<Bank['purpose'], string> = { service: 'Servicio', starter: 'Arranque', auxiliary: 'Auxiliar', other: 'Otro' };
const origins = { manual: 'Manual', measured: 'Medido', unknown: 'Desconocido' };
const display = (value: number | null, unit: string): string => value === null ? 'Desconocido' : `${value} ${unit}`;
function ReadingLabel({ reading, unit }: { reading: Reading; unit: string }) {
  return <span className={`ti-reading ti-${reading.origin}`}>{display(reading.value, unit)} · {origins[reading.origin]}{reading.at && <small>{new Date(reading.at).toLocaleString()}{reading.sensor ? ` · ${reading.sensor}` : ''}</small>}</span>;
}
function Numeric({ label, value, onChange, max }: { label: string; value: number | null; onChange: (value: number | null) => void; max?: number }) {
  return <label>{label}<input type="number" step="any" min="0" max={max} placeholder="Desconocido" value={value ?? ''} onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))} /></label>;
}
function ManualReading({ label, value, onChange, max }: { label: string; value: Reading; onChange: (value: Reading) => void; max: number }) {
  return <div className="ti-manual-reading" role="group" aria-label={label}>
    <Numeric label={`${label} · entrada manual`} value={value.value} max={max} onChange={v => onChange(v === null ? unknownReading() : { value: v, origin: 'manual', at: new Date().toISOString(), sensor: null })} />
    <ReadingLabel reading={value} unit={max === 100 ? '%' : 'V'} />
    <button type="button" disabled={value.value === null} aria-label={`Marcar ${label} como desconocido`} onClick={() => onChange(unknownReading())}>Borrar lectura guardada</button>
  </div>;
}
function ComponentEditor({ component, inventory, onSave, onCancel, disabled }: { disabled: boolean; component: Component; inventory: TechnicalInventory; onSave: (c: Component) => Promise<void>; onCancel: () => void }) {
  const [draft, setDraft] = useState<Component>(component);
  const [error, setError] = useState('');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (disabled) return;
    try { setError(''); replaceComponent(inventory, draft); await onSave(draft); }
    catch (cause: unknown) { setError(cause instanceof Error ? cause.message : 'Datos inválidos'); }
  };
  return <form className="ti-editor" onSubmit={event => void submit(event)}>
    <h4>{kinds[draft.kind]} · características declaradas manualmente</h4>
    <fieldset disabled={disabled} className="ti-fields">{(['name', 'location', 'manufacturer', 'model'] as const).map((field, i) => <label key={field}>{['Nombre', 'Ubicación', 'Fabricante', 'Modelo'][i]}<input required={field === 'name'} maxLength={240} value={draft[field]} onChange={e => setDraft({ ...draft, [field]: e.target.value })} /></label>)}
    {draft.kind === 'tank' && <>
      <label>Fluido<select value={draft.fluid} onChange={e => setDraft({ ...draft, fluid: e.target.value as Tank['fluid'] })}>{Object.entries(fluids).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <Numeric label="Capacidad nominal (L)" value={draft.capacityL} onChange={capacityL => setDraft({ ...draft, capacityL })} />
      <ManualReading label="Nivel (%)" value={draft.level} max={100} onChange={level => setDraft({ ...draft, level })} />
    </>}
    {draft.kind === 'bank' && <>
      <label>Función<select value={draft.purpose} onChange={e => setDraft({ ...draft, purpose: e.target.value as Bank['purpose'] })}>{Object.entries(purposes).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label>Conexión declarada<select disabled={!!inventory.electrical} value={draft.topology} onChange={e => setDraft({ ...draft, topology: e.target.value as Bank['topology'] })}><option value="unknown">Desconocida</option><option value="parallel">Paralelo</option><option value="series">Serie</option><option value="series-parallel" disabled>Serie-paralelo · configurar en editor</option></select></label>
    </>}
    {draft.kind === 'battery' && <>
      <label>Banco<select disabled={!!inventory.electrical} value={draft.bankId ?? ''} onChange={e => setDraft({ ...draft, bankId: e.target.value || null })}><option value="">Sin asignar</option>{inventory.components.filter((c): c is Bank => c.kind === 'bank').map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      <label>Tecnología<select value={draft.chemistry} onChange={e => setDraft({ ...draft, chemistry: e.target.value as typeof draft.chemistry })}>{['unknown', 'AGM', 'GEL', 'flooded', 'LiFePO4', 'other'].map(c => <option key={c} value={c}>{c === 'unknown' ? 'Desconocida' : c === 'flooded' ? 'Plomo abierto' : c === 'other' ? 'Otra' : c}</option>)}</select></label>
      <Numeric label="Capacidad nominal (Ah)" value={draft.capacityAh} onChange={capacityAh => setDraft({ ...draft, capacityAh })} />
      <Numeric label="Tensión nominal (V)" value={draft.nominalV} onChange={nominalV => setDraft({ ...draft, nominalV })} />
      <ManualReading label="Tensión (V)" value={draft.voltage} max={1000} onChange={voltage => setDraft({ ...draft, voltage })} />
      <ManualReading label="Carga SOC (%)" value={draft.soc} max={100} onChange={soc => setDraft({ ...draft, soc })} />
    </>}
    </fieldset>{error && <p role="alert">{error}</p>}<div className="ti-actions"><button disabled={disabled} type="submit">{disabled ? 'Guardando…' : 'Guardar componente'}</button><button disabled={disabled} type="button" onClick={onCancel}>Cancelar</button></div>
  </form>;
}

export function TechnicalDossier({ shipId, userId, tab, getInstrumentFeed, onContextChange, onNavigate, ship, presentation = 'standard' }: { ship?:ShipData;onNavigate?:(section:'mantenimiento'|'history'|'documents'|'datos')=>void; onContextChange?: (label:string|null)=>void; presentation?: 'standard' | 'workspace'; getInstrumentFeed?: InstrumentProvider; shipId: string; userId: string; tab: TechnicalTab }) {
  const isSystem=SYSTEM_SECTIONS.includes(tab as SystemSection);
  const isMap=tab==='electricity'||tab==='tanks'||isSystem;
  const [snapshot, setSnapshot] = useState<InventorySnapshot | null>(null);
  const [session, setSession] = useState<ElectricalSession | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const savingRef = useRef(false);
  const [message, setMessage] = useState('Cargando configuración técnica…');
  const [conflict, setConflict] = useState(false);
  const [editing, setEditing] = useState<Component | null>(null);
  const [retry, setRetry] = useState(0);
  const key = draftKey(userId, shipId);
  useEffect(() => {
    let current = true;
    const aborter = new AbortController();
    setSession(null); setSnapshot(null); setEditing(null); setDirty(false); setConflict(false); setMessage('Cargando configuración técnica…');
    const activate = (next: InventorySnapshot, pending = false, clash = false, notice = '') => {
      if (!current) return;
      const controller = new ElectricalSession(next,recoveryStorage,key,(value,signal)=>saveTechnicalInventory(shipId,value,signal),pending,clash);
      if (notice) controller.notice(notice);
      setSnapshot(next);setDirty(pending);setConflict(clash);setSession(controller);
    };
    void loadTechnicalInventory(shipId,aborter.signal).then(remote => {
      if (!current) return;
      try {
        const restored = recoverDraft(recoveryStorage,key,remote);
        activate(restored.snapshot,restored.dirty,restored.conflict,restored.conflict ? 'Conflicto de revisión: el borrador local se conserva.' : restored.dirty ? 'Borrador local recuperado, pendiente de sincronizar.' : 'Inventario cargado; sin cambios pendientes.');
      } catch (cause: unknown) {
        if (cause instanceof DraftStorageUnavailableError) activate(remote,false,false,'Inventario cargado. La copia local de recuperación no está disponible.');
        else activate(remote,false,true,`Borrador local ilegible; se conserva sin sobrescribir. ${cause instanceof Error ? cause.message : ''}`);
      }
    }).catch(cause => {
      if (!current) return;
      try { const raw = recoveryStorage.getItem(key); if (raw) { activate(parseDraft(raw),true,false,'Copia local recuperada sin conexión al servidor.'); return; } } catch { /* Keep corrupt recovery untouched. */ }
      setMessage(cause instanceof Error ? cause.message : 'Error de carga');
    });
    return () => { current = false; aborter.abort(); };
  },[shipId,key,retry]);
  useEffect(() => {
    if (!session) return;
    const update = () => {const state=session.getState();setSnapshot(state.snapshot);setDirty(state.dirty);setBusy(state.saving);savingRef.current=state.saving;setConflict(state.conflict);setMessage(state.message);};
    const unsubscribe=session.subscribe(update);const online=()=>session.reconnect();
    session.resume();update();window.addEventListener('online',online);
    return()=>{unsubscribe();window.removeEventListener('online',online);session.dispose();};
  },[session]);
  const commit = async (): Promise<boolean> => {
    if (!session) return false;
    await session.flush();const state=session.getState();return !state.dirty&&!state.saving;
  };
  const apply = async (inventory:TechnicalInventory,requireConfirmation=false):Promise<void> => {
    if (!session||savingRef.current||conflict) {if(requireConfirmation)throw new Error('Espera al guardado o resuelve el conflicto de revisión.');return;}
    session.externalChange(inventory);const confirmed=await commit();
    if(confirmed)setEditing(null);
    else if(requireConfirmation)throw new Error('No se confirmó el guardado. El borrador se conserva; puedes reintentar sin duplicar equipos.');
  };
  const save=async():Promise<void>=>{await commit();};
  const discard=()=>{
    if(!session||!window.confirm('¿Descartar el borrador local y cargar la configuración del servidor?'))return;
    void session.discardAndReload(signal=>loadTechnicalInventory(shipId,signal)).catch((cause:unknown)=>session.notice(cause instanceof Error?cause.message:'No se pudo recargar'));
  };
  const components = snapshot?.inventory.components ?? [];
  const tanks = components.filter((c): c is Tank => c.kind === 'tank');
  const banks = components.filter((c): c is Bank => c.kind === 'bank');
  const batteries = components.filter(c => c.kind === 'battery');
  const edit = (c: Component) => { if (!busy && !conflict) setEditing(c); };
  const card = (c: Component) => <button type="button" disabled={busy || conflict} key={c.id} className="ti-card" onClick={() => edit(c)}>
    <div className="ti-card-title">{c.kind === 'tank' ? <Droplets /> : <BatteryCharging />}<strong>{c.name}</strong></div><span>{c.location || 'Ubicación desconocida'}</span>
    {c.kind === 'tank' && <><span>{fluids[c.fluid]} · {display(c.capacityL, 'L')} · Manual</span><div className={`ti-tank ${c.level.value === null ? 'ti-empty' : ''}`}><div style={{ height: `${c.level.value ?? 0}%` }} /></div><ReadingLabel reading={c.level} unit="%" /></>}
    {c.kind === 'battery' && <><span>{c.chemistry === 'unknown' ? 'Tecnología desconocida' : c.chemistry} · {display(c.capacityAh, 'Ah')} · {display(c.nominalV, 'V')} · Manual</span><div className={`ti-battery ${c.soc.value === null ? 'ti-empty' : ''}`} aria-label={c.soc.value === null ? 'Carga desconocida' : `Carga ${c.soc.value}% · ${origins[c.soc.origin]}`}><div style={{ width: `${c.soc.value ?? 0}%` }} /></div><ReadingLabel reading={c.voltage} unit="V" /><ReadingLabel reading={c.soc} unit="%" /></>}
    {c.kind === 'bank' && <span>{purposes[c.purpose]} · {c.topology === 'unknown' ? 'Conexión desconocida' : c.topology === 'series-parallel' ? 'Serie-paralelo declarada' : c.topology === 'series' ? 'Serie declarada' : 'Paralelo declarado'}</span>}
    <small>Seleccionar para editar</small>
  </button>;
  return <section className={`technical-dossier ${presentation === 'workspace' ? 'ti-workspace' : ''}`} aria-label="Inventario técnico de la embarcación">
    {!isMap && <header><div><h3><Settings2 size={20} /> {tab === 'general' ? 'Resumen técnico' : 'Inventario maestro'}</h3><p>Componentes registrados una sola vez · características manuales · lecturas con procedencia y fecha</p></div><button type="button" onClick={() => void save()} disabled={!snapshot || !dirty || busy || conflict || !!editing}><Save size={16} />{busy ? 'Guardando…' : 'Reintentar guardado en Supabase'}</button></header>}
    <p role="status" hidden={!!snapshot && (isMap || presentation === 'workspace' && !dirty && !conflict)} className={presentation === 'workspace' ? 'ti-shell-status' : 'ti-status'}>{message}</p>{!isMap && presentation === 'workspace' && dirty && <button type="button" disabled={busy || conflict} onClick={() => void save()}>Reintentar guardado</button>}
    {!snapshot && <button type="button" onClick={() => setRetry(n => n + 1)}>Reintentar carga</button>}
    {!isMap && (dirty || conflict) && <button type="button" disabled={busy} onClick={discard}>Descartar borrador y recargar servidor</button>}
    {snapshot && <>
      {isSystem&&session&&ship&&<VesselSystemPanel key={`${shipId}:${tab}`} ship={ship} section={tab as SystemSection} session={session} onSection={section=>{if(section==='datos'||section==='documents'||section==='mantenimiento'||section==='history')onNavigate?.(section);}}/>}
      {tab === 'electricity' && session && <ElectricalEditor key={shipId} session={session} shipId={shipId} getInstrumentFeed={getInstrumentFeed} onNavigate={onNavigate}/>}
      {tab === 'tanks' && session && <TankWorkspace key={shipId} session={session} shipId={shipId} getInstrumentFeed={getInstrumentFeed} onNavigate={onNavigate} onContextChange={onContextChange}/> }
      {tab === 'general' && <><div className="ti-summary">{(['tank', 'battery', 'bank'] as const).map(kind => <article key={kind}><strong>{components.filter(c => c.kind === kind).length}</strong><span>{kinds[kind]} · registrados</span></article>)}{(['diesel', 'freshwater'] as const).map(fluid => { const t = tankTotals(snapshot.inventory, fluid); return <article key={fluid}><strong>{t.count === 0 ? '—' : t.unknown === t.count ? 'Desconocida' : `${t.knownL} L`}</strong><span>{fluids[fluid]} · capacidad nominal manual{t.unknown > 0 ? ` · parcial: ${t.unknown} sin capacidad` : ''}</span></article>; })}</div><p>Sin componentes registrados no se presupone equipamiento. El inventario de existencias heredado se conserva aparte. Los niveles antiguos agregados no se atribuyen a depósitos individuales.</p><p>Estado operativo, autonomía y capacidad útil del banco: desconocidos. Electricidad muestra únicamente equivalentes nominales cuando la conexión y las características son compatibles.</p></>}
      {tab === 'configuration' && <><div className="ti-actions">{(['tank', 'bank', 'battery'] as const).map(kind => <button type="button" disabled={busy || conflict || !!editing} key={kind} onClick={() => edit(newComponent(kind, crypto.randomUUID()))}><Plus size={16} />Añadir {kinds[kind].toLowerCase()}</button>)}</div><div className="ti-grid">{components.map(card)}</div>{!components.length && <p>Añade los equipos realmente instalados a bordo.</p>}</>}
      {tab === 'tanks' && <details className="ti-records"><summary>Fichas y datos de los equipos</summary><div className="ti-grid">{tanks.map(card)}</div>{!tanks.length && <p>No hay depósitos registrados. Registra los equipos instalados con el botón Añadir.</p>}<p>Un nivel desconocido se representa sin relleno. Los colores identifican el gráfico; no indican alarmas ni aptitud operativa.</p></details>}
      {tab === 'electricity' && !snapshot.inventory.electrical && <details className="ti-records"><summary>Fichas y datos de los equipos</summary><div className="ti-grid">{banks.map(bank => <article className="ti-bank" key={bank.id}>{card(bank)}<div className="ti-members" aria-label={`Baterías asignadas a ${bank.name}`}>{batteries.filter(c => c.bankId === bank.id).map(card)}</div>{!batteries.some(c => c.bankId === bank.id) && <p>Sin baterías asignadas.</p>}</article>)}</div><h4>Baterías sin banco asignado</h4><div className="ti-grid">{batteries.filter(c => c.bankId === null).map(card)}</div>{!banks.length && !batteries.length && <p>No hay equipos eléctricos registrados. Registra los equipos instalados con el botón Añadir.</p>}<p>Las líneas representan pertenencia al banco declarada manualmente. No representan cableado verificado, corriente ni flujo de energía.</p></details>}
      {editing && !conflict && <TechnicalEditDialog title={`Editar ${editing.name || kinds[editing.kind]}`} onClose={() => {if (!busy) setEditing(null);}}><ComponentEditor disabled={busy} key={editing.id} component={editing} inventory={snapshot.inventory} onSave={c => apply(replaceComponent(snapshot.inventory, c), true)} onCancel={() => setEditing(null)} />{components.some(c => c.id === editing.id) && <button disabled={busy} type="button" className="ti-remove" onClick={() => { if (!window.confirm(`¿Retirar ${editing.name} del inventario técnico?`)) return; try { void apply(removeComponent(snapshot.inventory, editing.id)); } catch (err) { setMessage(err instanceof Error ? err.message : 'No se pudo retirar el componente'); } }}>Retirar componente</button>}</TechnicalEditDialog>}
    </>}
  </section>;
}
