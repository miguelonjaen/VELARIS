import React, { useState } from 'react';
import { TechnicalEditDialog } from './TechnicalEditDialog';
import { addChargeRoute, type DeviceChoice, type SourceKind } from './chargeRoute';
import { electricalNodeLabels } from './electricalTopology';
import type { Bank, InstallationNode, TechnicalInventory } from './model';

const fresh = (name: string): DeviceChoice => ({ existingId: null, name });
export function ChargeRouteDialog({ inventory, kind, selectedBankId, disabled, onApply, onClose }: {
  inventory: TechnicalInventory; kind: SourceKind | 'distributor'; selectedBankId?: string; disabled: boolean;
  onApply: (inventory: TechnicalInventory) => Promise<void>; onClose: () => void;
}) {
  const [source, setSource] = useState(fresh(electricalNodeLabels[kind]));
  const converterKind = kind === 'shore' ? 'charger' : 'controller';
  const [converter, setConverter] = useState(fresh(electricalNodeLabels[converterKind]));
  const [distributor, setDistributor] = useState(fresh(electricalNodeLabels.distributor));
  const [withDistributor, setWithDistributor] = useState(kind === 'distributor');
  const [inputId, setInputId] = useState('');
  const [bankIds, setBankIds] = useState<string[]>(selectedBankId ? [selectedBankId] : []);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<TechnicalInventory | null>(null);
  const nodes = inventory.installation?.nodes ?? [];
  const banks = inventory.components.filter((c): c is Bank => c.kind === 'bank');
  const label = (choice: DeviceChoice) => choice.existingId ? nodes.find(n => n.id === choice.existingId)?.name ?? 'Equipo no disponible' : choice.name || 'Equipo nuevo';
  const device = (nodeKind: InstallationNode['kind'], choice: DeviceChoice, change: (value: DeviceChoice) => void) => <fieldset className="iv-route-device"><legend>{electricalNodeLabels[nodeKind]}</legend>{nodes.some(n => n.kind === nodeKind) && <label>Equipo<select value={choice.existingId ?? ''} onChange={e => change({ ...choice, existingId: e.target.value || null })}><option value="">Registrar equipo instalado</option>{nodes.filter(n => n.kind === nodeKind).map(n => <option key={n.id} value={n.id}>{n.name}</option>)}</select></label>}{!choice.existingId && <label>Nombre<input required maxLength={240} value={choice.name} onChange={e => change({ ...choice, name: e.target.value })}/></label>}</fieldset>;
  const sequence = kind === 'distributor' ? [nodes.find(n => n.id === inputId)?.name ?? 'Elegir entrada CC', label(distributor)] : [label(source), ...(['solar','shore'].includes(kind) ? [label(converter)] : []), ...(withDistributor ? [label(distributor)] : [])];
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (saving || disabled) return;
    setError(''); setSaving(true);
    try {
      const next = pending ?? addChargeRoute(inventory, kind === 'distributor' ? {kind, inputId, distributor, bankIds} : {kind, source, converter: kind === 'alternator' ? null : converter, distributor: withDistributor ? distributor : null, bankIds});
      setPending(next);
      await onApply(next); onClose();
    } catch (cause: unknown) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar el recorrido.'); }
    finally { setSaving(false); }
  };
  return <TechnicalEditDialog title={`Añadir ${kind === 'shore' ? 'puerto AC' : kind === 'distributor' ? 'repartidor de carga CC' : electricalNodeLabels[kind].toLowerCase()}`} onClose={() => { if (!saving) onClose(); }}><form className="ti-editor iv-route-editor" onSubmit={event => void submit(event)}>
    <p>Selecciona los equipos realmente instalados y los bancos a los que llega su carga. Se guardan juntos.</p>
    <fieldset disabled={disabled || saving || !!pending}>
      {kind === 'distributor' ? <label>1. Entrada de carga CC<select required value={inputId} onChange={e => setInputId(e.target.value)}><option value="">Seleccionar alternador, regulador o cargador</option>{nodes.filter(n => ['alternator','controller','charger'].includes(n.kind)).map(n => <option key={n.id} value={n.id}>{n.name} · {electricalNodeLabels[n.kind]}</option>)}</select></label> : device(kind, source, setSource)}
      {(kind === 'solar' || kind === 'shore') && <><p>{kind === 'shore' ? 'La toma de puerto es AC. Selecciona el cargador que convierte su salida a CC.' : 'Selecciona el regulador MPPT/PWM que alimenta los bancos.'}</p>{device(converterKind, converter, setConverter)}</>}
      {kind !== 'distributor' && <label className="iv-route-check"><input type="checkbox" checked={withDistributor} onChange={e => setWithDistributor(e.target.checked)}/>La salida pasa por un repartidor de carga CC instalado</label>}
      {(withDistributor || kind === 'distributor') && device('distributor', distributor, setDistributor)}
      <fieldset className="iv-route-banks"><legend>Bancos que reciben carga</legend>{banks.map(bank => <label className="iv-route-check" key={bank.id}><input type="checkbox" value={bank.id} checked={bankIds.includes(bank.id)} onChange={e => setBankIds(e.target.checked ? [...bankIds, bank.id] : bankIds.filter(id => id !== bank.id))}/>{bank.name}<small>{bank.purpose === 'starter' ? 'Arranque' : bank.purpose === 'service' ? 'Servicios' : 'Otro uso'}</small></label>)}{!banks.length && <p>Primero añade los bancos de servicio y arranque desde Electricidad.</p>}</fieldset>
      <div className="iv-route-summary"><strong>Recorrido que vas a guardar</strong><p>{sequence.join(' → ')} → {bankIds.map(id => banks.find(bank => bank.id === id)?.name).join(' + ') || 'Elegir bancos'}</p></div>
      <p>Seleccionar varios bancos declara salidas independientes del equipo. No pone los bancos en paralelo ni asigna porcentajes de carga.</p>
      {kind === 'distributor' && <p>Las conexiones directas existentes se conservan. Si estás corrigiendo el cableado, retíralas desde «Conexiones declaradas» después de verificar el recorrido.</p>}
    </fieldset>
    {error && <p role="alert">{error}</p>}
    <div className="ti-actions"><button type="submit" disabled={disabled || saving || !bankIds.length || !banks.length}>{saving ? 'Guardando…' : pending ? 'Reintentar guardado' : 'Guardar fuente y conexiones'}</button><button type="button" disabled={saving} onClick={onClose}>{pending ? 'Cerrar' : 'Cancelar'}</button></div>
  </form></TechnicalEditDialog>;
}
