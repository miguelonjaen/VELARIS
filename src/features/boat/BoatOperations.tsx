import React, { useEffect, useRef, useState } from 'react';
import type { LogEntry } from '../../shared/types';
import type { BoatPanelInput } from './boatPanelModel';
import { measuredEngineRunning, LIGHT_CIRCUITS } from '../../core/instruments/BoatInstrumentStore';
import { currentValue, relayLabel } from './boatVisualModel';
import { loadTechnicalInventory } from '../traffic/components/technical/repository';
import type { TechnicalInventory } from '../traffic/components/technical/model';
import { conditionLabels } from '../traffic/components/technical/systemEquipment';
import { manualBoatState, type ManualBoatEvent } from './boatOperationsModel';
import { configureCrewWatch, confirmWatchRelief, createCrewWatchState, crewWatchNotice, loadCrewWatch, moveCrewInRotation, nextWatchkeeper, reconcileCrewWatch, reliefDueAt, saveCrewWatch, type CrewWatchState, type WatchCrewMember } from '../copilot/crewWatch';
import { WATCH_THRESHOLD_KEYS, type ThresholdOrigin, type VesselWatchThresholds, type WatchThresholdKey } from '../copilot/watchThresholds';
interface Props {
  input: BoatPanelInput;
  entries: readonly LogEntry[];
  onRecord: (event: ManualBoatEvent) => Promise<void>;
  onLogbook: () => void;
  onFleet: () => void;
  anchorWatch?: React.ReactNode;
  crew?: readonly WatchCrewMember[];
  reliefLeadMinutes?: number | null;
  watchThresholds?: VesselWatchThresholds | null;
  onWatchThresholdChange?: (key: WatchThresholdKey, value: number | null, origin: ThresholdOrigin) => void;
}
const EMPTY_CREW: readonly WatchCrewMember[] = [];
const THRESHOLD_LABELS: Record<WatchThresholdKey, string> = {
  batteryStartVolts: 'Batería arranque mínima (V)', batteryServiceVolts: 'Batería servicio mínima (V)',
  engineTemperatureC: 'Temperatura motor máxima (°C)', oilPressureBar: 'Presión aceite mínima (bar)',
  fuelPercent: 'Combustible mínimo (%)', waterPercent: 'Agua mínima (%)', minimumDepthMeters: 'Sonda mínima (m)',
  anchorRadiusMeters: 'Radio fondeo (m)', aisCpaNm: 'CPA AIS mínimo (NM)', xteNm: 'XTE máximo (NM)',
  windChangeKn: 'Cambio de viento (kn)', maxDataAgeSeconds: 'Edad máxima de datos (s)',
  documentLeadDays: 'Preaviso documental (días)', reliefLeadMinutes: 'Preaviso de relevo (min)',
  restrictedVisibilityMeters: 'Visibilidad restringida (m)', adverseWindKn: 'Viento adverso (kn)'
};
export function BoatOperations({ input, entries, onRecord, onLogbook, onFleet, anchorWatch, crew = EMPTY_CREW,
  reliefLeadMinutes = null, watchThresholds = null, onWatchThresholdChange }: Props) {
  const vesselId = input.vesselId ?? null;
  const [inventory, setInventory] = useState<TechnicalInventory | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [crewWatch, setCrewWatch] = useState<CrewWatchState | null>(null);
  useEffect(() => {
    setInventory(null); setMessage('');
    if (!vesselId) return;
    const aborter = new AbortController();
    void loadTechnicalInventory(vesselId, aborter.signal).then(snapshot => {
      if (!aborter.signal.aborted) setInventory(snapshot.inventory);
    }).catch((cause: unknown) => { if (!aborter.signal.aborted) setMessage(cause instanceof Error ? cause.message : 'Inventario no disponible'); });
    return () => aborter.abort();
  }, [vesselId]);
  useEffect(() => {
    if (!vesselId) { setCrewWatch(null); return; }
    const stored = typeof localStorage === 'undefined' ? null : loadCrewWatch(localStorage, vesselId);
    const next = reconcileCrewWatch(stored ?? createCrewWatchState(vesselId, crew), crew);
    if (typeof localStorage !== 'undefined') saveCrewWatch(localStorage, next);
    setCrewWatch(next);
  }, [vesselId, crew]);
  const state = manualBoatState(entries, vesselId ?? '');
  const equipment = inventory?.systems?.equipment.filter(e => !e.archived) ?? [];
  const record = async (id: string, label: string, value: boolean) => {
    if (!vesselId || locked.current || state.get(id)?.value === value) return;
    locked.current = true; setBusy(true); setMessage('');
    try {
      await onRecord({ version: 1, vesselId, equipmentId: id, label, at: new Date().toISOString(), origin: 'desktop.manual', result: 'declared', previous: state.get(id)?.value ?? null, value });
      setMessage('Declaración guardada en la Bitácora local. Copia en nube gestionada por la cola existente. Sin orden física.');
    } catch (cause: unknown) { setMessage(cause instanceof Error ? cause.message : 'No se confirmó el registro'); }
    finally { locked.current = false; setBusy(false); }
  };
  const controls = (id: string, label: string, measured: boolean | null = null) => {
    const manual = state.get(id);
    return <div className="mb-3 rounded-lg border border-white/10 p-2" key={id}><strong>{label}</strong>
      <p>{measured !== null ? `${measured ? 'Activo' : 'Inactivo'} · retorno real vigente` : manual ? `${manual.value ? 'Activo' : 'Inactivo'} · declaración manual · ${new Date(manual.at).toLocaleString()}` : 'Sin conexión / estado desconocido'}</p>
      <div className="flex gap-2">{[true, false].map(value => <button className="min-h-11 rounded border border-cyan-700 px-2 disabled:opacity-40" type="button" key={String(value)} disabled={busy || measured !== null || manual?.value === value} onClick={() => void record(id, label, value)}>Declarar {value ? 'activo' : 'inactivo'}</button>)}</div>
    </div>;
  };
  const lights = input.instruments.lights ?? [];
  const consumers = inventory?.electrical?.devices.filter(d => ['lighting','pump','fridge','windlass','custom-consumer'].includes(d.catalogId)).map(d => ({ id: d.componentId, catalogId: d.catalogId, name: inventory.components.find(c => c.id === d.componentId)?.name ?? inventory.installation?.nodes.find(n => n.id === d.componentId)?.name ?? d.catalogId })) ?? [];
  const uniqueEntries = new Map(entries.filter(e => String(e.barco_id) === vesselId).map(e => [`${e.barco_id}|${e.created_at}|${e.titulo}`, e]));
  const recent = [...uniqueEntries.values()].sort((a,b) => Date.parse(b.created_at ?? b.fecha) - Date.parse(a.created_at ?? a.fecha)).slice(0,4);
  const declareOperation = (equipmentId: string, label: string, value: boolean) => void record(equipmentId, label, value);
  const confirmRelief = async (nextId: string): Promise<void> => {
    if (!vesselId || !crewWatch || locked.current) return;
    const member = crew.find(value => value.id === nextId); if (!member) return;
    locked.current = true; setBusy(true); setMessage('');
    try {
      const next = confirmWatchRelief(crewWatch, nextId, Date.now(), crew);
      await onRecord({ version: 1, vesselId, equipmentId: `watch:${nextId}`, label: `Relevo de guardia · ${member.nombre}`, at: new Date().toISOString(), origin: 'desktop.manual', result: 'declared', previous: false, value: true });
      if (typeof localStorage !== 'undefined') saveCrewWatch(localStorage, next);
      setCrewWatch(next); setMessage('Relevo confirmado y registrado. No se realizan relevos automáticos.');
    } catch (cause: unknown) { setMessage(cause instanceof Error ? cause.message : 'No se confirmó el relevo'); }
    finally { locked.current = false; setBusy(false); }
  };
  const updateCrewConfiguration = (next: CrewWatchState): void => {
    if (typeof localStorage !== 'undefined') saveCrewWatch(localStorage, next);
    setCrewWatch(next);
  };
  return <div className="p-3 text-xs text-slate-200">
    <p className="mb-2 text-slate-400">Embarcación: {vesselId ?? 'sin seleccionar'}</p>
    <p className="mb-3 text-amber-200">Declaraciones manuales del patrón. No accionan equipos ni confirman ejecución física. La telemetría vigente prevalece.</p>
    {!vesselId && <p>Selecciona una embarcación.</p>}
    {message && <p role="status" className="mb-3 text-amber-200">{message}</p>}
    <details className="bs-details" open><summary className="min-h-11 cursor-pointer p-3">Situación operativa · declaraciones</summary>
      <p className="mb-2 text-slate-400">Cada confirmación queda asociada al UUID seleccionado y a la posición válida disponible. Una declaración no sustituye telemetría ni autoriza maniobras.</p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="min-h-11 rounded border border-cyan-700 px-2 disabled:opacity-40" disabled={busy || !vesselId} onClick={() => declareOperation('operation:berth', 'Atraque confirmado', true)}>Confirmar atraque</button>
        <button type="button" className="min-h-11 rounded border border-cyan-700 px-2 disabled:opacity-40" disabled={busy || !vesselId} onClick={() => declareOperation('operation:predeparture', 'Preparación de salida', true)}>Iniciar pre-salida</button>
        <button type="button" className="min-h-11 rounded border border-cyan-700 px-2 disabled:opacity-40" disabled={busy || !vesselId} onClick={() => declareOperation('operation:berth', 'Desatraque confirmado', false)}>Confirmar desatraque</button>
        <button type="button" className="min-h-11 rounded border border-cyan-700 px-2 disabled:opacity-40" disabled={busy || !vesselId} onClick={() => declareOperation('operation:anchor', 'Fondeo confirmado', true)}>Confirmar fondeo</button>
        <button type="button" className="min-h-11 rounded border border-cyan-700 px-2 disabled:opacity-40" disabled={busy || !vesselId} onClick={() => declareOperation('operation:anchor', 'Ancla a pique / levantada', false)}>Confirmar ancla arriba</button>
        <button type="button" className="min-h-11 rounded border border-cyan-700 px-2 disabled:opacity-40" disabled={busy || !vesselId} onClick={() => declareOperation('operation:arrival', 'Arribada confirmada', true)}>Confirmar arribada</button>
      </div>
    </details>
    <details className="bs-details"><summary className="min-h-11 cursor-pointer p-3">Guardia de tripulación</summary>
      {!crew.length && <p>Sin tripulación asociada a la travesía activa. No se asigna guardia por defecto.</p>}
      {crewWatch && crew.length > 0 && <>
        <p>Guardia actual: <strong>{crew.find(member => member.id === crewWatch.currentWatchkeeperId)?.nombre ?? 'sin confirmar'}</strong></p>
        <p>Próximo relevo: {reliefDueAt(crewWatch) ? new Date(reliefDueAt(crewWatch)!).toLocaleString() : 'sin programar'} · {crewWatchNotice(crewWatch, Date.now(), reliefLeadMinutes ?? 0) === 'OVERDUE' ? 'VENCIDO' : crewWatchNotice(crewWatch, Date.now(), reliefLeadMinutes ?? 0) === 'DUE_SOON' ? 'próximo' : 'sin aviso'}</p>
        <p>Siguiente en rotación: {crew.find(member => member.id === nextWatchkeeper(crewWatch))?.nombre ?? 'sin definir'}</p>
        <div className="mt-2 flex flex-wrap gap-2">{crew.map(member => <button type="button" key={member.id} className="min-h-11 rounded border border-cyan-700 px-2 disabled:opacity-40" disabled={busy || crewWatch.currentWatchkeeperId === member.id} onClick={() => void confirmRelief(member.id)}>Confirmar relevo · {member.nombre}</button>)}</div>
        <label className="mt-3 block">Duración prevista (min)
          <input key={crewWatch.plannedDurationMinutes} className="ml-2 w-20 rounded border border-slate-600 bg-slate-950 p-1" type="number" min="15" max="720" defaultValue={crewWatch.plannedDurationMinutes}
            onBlur={event => { const duration = Number(event.target.value); try { updateCrewConfiguration(configureCrewWatch(crewWatch, crewWatch.rotation, duration, crew)); } catch (cause: unknown) { setMessage(cause instanceof Error ? cause.message : 'Duración no válida'); event.target.value = String(crewWatch.plannedDurationMinutes); } }} />
        </label>
        <div className="mt-2 space-y-1">{crewWatch.rotation.map((memberId, index) => <div className="flex items-center justify-between rounded border border-white/10 p-1" key={memberId}>
          <span>{index + 1}. {crew.find(member => member.id === memberId)?.nombre ?? memberId}</span>
          <span><button type="button" disabled={index === 0} onClick={() => updateCrewConfiguration(moveCrewInRotation(crewWatch, memberId, -1))}>↑</button><button type="button" className="ml-2" disabled={index === crewWatch.rotation.length - 1} onClick={() => updateCrewConfiguration(moveCrewInRotation(crewWatch, memberId, 1))}>↓</button></span>
        </div>)}</div>
        <p className="mt-2 text-slate-400">Historial local: {crewWatch.history.length} relevo(s). La edición de rotación no confirma el relevo.</p>
      </>}
    </details>
    <details className="bs-details"><summary className="min-h-11 cursor-pointer p-3">Umbrales del Oficial · por embarcación</summary>
      {!watchThresholds && <p>Configuración no disponible.</p>}
      {watchThresholds && <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{WATCH_THRESHOLD_KEYS.map(key => {
        const threshold = watchThresholds[key];
        return <label className="rounded border border-white/10 p-2" key={key}>{THRESHOLD_LABELS[key]}
          <div className="mt-1 flex gap-1"><input key={`${key}:${threshold?.value ?? 'none'}`} className="min-w-0 flex-1 rounded border border-slate-600 bg-slate-950 p-1" type="number" step="any" defaultValue={threshold?.value ?? ''}
            placeholder="Sin configurar" onBlur={event => onWatchThresholdChange?.(key, event.target.value === '' ? null : Number(event.target.value), threshold?.origin ?? 'user')} />
            <select className="rounded border border-slate-600 bg-slate-950 p-1" value={threshold?.origin ?? 'user'} disabled={!threshold}
              onChange={event => onWatchThresholdChange?.(key, threshold?.value ?? null, event.target.value as ThresholdOrigin)}><option value="user">Usuario</option><option value="manufacturer">Fabricante</option></select></div>
        </label>;
      })}</div>}
      <p className="mt-2 text-amber-200">Un campo vacío significa no configurado. Ningún valor se interpreta como certificación de seguridad.</p>
    </details>
    <details className="bs-details" open><summary className="min-h-11 cursor-pointer p-3">Propulsión · declaraciones</summary>
      {equipment.some(e => e.catalogId === 'engine') && controls('propulsion', 'Propulsion a motor', measuredEngineRunning(input.instruments.engines))}
      {!equipment.some(e => e.catalogId === 'engine') && <p>Sin motor identificado en el inventario técnico. Lecturas disponibles en Motores.</p>}
      {input.propulsion && <p>Estado compartido: {input.propulsion.mode} · {input.propulsion.source === 'RPM' ? 'RPM vigentes' : 'manual'}</p>}
    </details>
    <details className="bs-details"><summary className="min-h-11 cursor-pointer p-3">Iluminación</summary>
      {!lights.length && <p>Sin circuitos identificados / sin conexión. No se presuponen luces instaladas.</p>}
      {lights.map(light => <div key={light.circuit}><p>{LIGHT_CIRCUITS[light.circuit]} · {relayLabel(light.relay)}</p>{controls(light.circuit, LIGHT_CIRCUITS[light.circuit], currentValue(light.relay) === null ? null : currentValue(light.relay) === 1)}</div>)}
      {consumers.filter(d => d.catalogId === 'lighting').map(d => controls(d.id, d.name))}
      <p>El retorno de relé no confirma emisión luminosa.</p>
    </details>
    <details className="bs-details"><summary className="min-h-11 cursor-pointer p-3">Energía y depósitos · inventario declarado</summary>
      {!inventory && <p>Inventario no disponible; no se presuponen bancos ni depósitos.</p>}
      {inventory?.components.map(c => <p key={c.id}>{c.name} · {c.kind === 'tank' ? `Capacidad nominal: ${c.capacityL ?? 'desconocida'} L · nivel ${c.level.value ?? 'desconocido'} % · ${c.level.origin} · ${c.level.at ?? 'sin fecha'}` : c.kind === 'battery' ? `Capacidad nominal: ${c.capacityAh ?? 'desconocida'} Ah · tensión ${c.voltage.value ?? 'desconocida'} V · ${c.voltage.origin} · ${c.voltage.at ?? 'sin fecha'}` : 'Banco declarado'}</p>)}
      <p>Fichas del inventario; no constituyen telemetría vigente. Lecturas instrumentales en Electricidad y Depósitos.</p>
    </details>
    <details className="bs-details"><summary className="min-h-11 cursor-pointer p-3">Sentinas y sistemas auxiliares</summary>
      {equipment.filter(e => e.catalogId === 'bilgepump' || e.catalogId === 'other').map(e => <React.Fragment key={e.id}><p>{conditionLabels[e.condition]}</p>{controls(e.id,e.name)}</React.Fragment>)}
      {consumers.filter(d => d.catalogId !== 'lighting' && d.catalogId !== 'windlass').map(d => controls(d.id, d.name))}
      {!equipment.some(e => e.catalogId === 'bilgepump' || e.catalogId === 'other') && <p>Sin equipos auxiliares identificados en el inventario. Sensores de sentina no disponibles.</p>}
    </details>
    <details className="bs-details"><summary className="min-h-11 cursor-pointer p-3">Fondeo</summary>{anchorWatch}{consumers.filter(d => d.catalogId === 'windlass').map(d => controls(d.id, d.name))}<p>Sin sensor de ancla ni confirmación de molinete. El estado de la luz de fondeo, si está disponible, se consulta en Iluminación; no confirma ancla largada.</p></details>
    <details className="bs-details"><summary className="min-h-11 cursor-pointer p-3">Últimas actividades</summary>
      {!recent.length && <p>Sin registros cargados para esta embarcación.</p>}
      {recent.map(e => <p key={e.id}><time>{new Date(e.created_at ?? e.fecha).toLocaleString()}</time> · {e.titulo} · {e.is_auto ? 'automático' : 'manual'}</p>)}
      <button type="button" className="min-h-11" onClick={onLogbook}>Consultar historial completo ↗</button>
    </details>
    <button type="button" className="min-h-11" onClick={onFleet}>Operaciones de Flota · inventario, mantenimiento e instalaciones ↗</button>
  </div>;
}
