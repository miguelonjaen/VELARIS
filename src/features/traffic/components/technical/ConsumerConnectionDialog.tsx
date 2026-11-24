import React, { useState } from 'react';
import { TechnicalEditDialog } from './TechnicalEditDialog';
import { connectConsumer } from './consumerConnection';
import type { TechnicalInventory } from './model';

export function ConsumerConnectionDialog({ inventory, medium, selectedBankId, disabled, onApply, onClose }: {
  inventory: TechnicalInventory; medium: 'cable' | 'pipe'; selectedBankId?: string; disabled: boolean;
  onApply: (inventory: TechnicalInventory) => Promise<void>; onClose: () => void;
}) {
  const origins = inventory.components.filter(component => component.kind === (medium === 'pipe' ? 'tank' : 'bank'));
  const consumers = inventory.installation?.nodes.filter(node => node.kind === 'consumer') ?? [];
  const [sourceId, setSourceId] = useState(medium === 'cable' ? selectedBankId ?? '' : '');
  const [consumerId, setConsumerId] = useState('');
  const [name, setName] = useState('');
  const [connectionName, setConnectionName] = useState('');
  const [pending, setPending] = useState<TechnicalInventory | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const source = origins.find(component => component.id === sourceId);
  const targetName = consumerId ? consumers.find(consumer => consumer.id === consumerId)?.name : name;
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (saving || disabled) return;
    setError(''); setSaving(true);
    try {
      const next = pending ?? connectConsumer(inventory, {sourceId, medium, consumerId:consumerId || null, name, connectionName});
      setPending(next); await onApply(next); onClose();
    } catch (cause: unknown) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar la salida.'); }
    finally { setSaving(false); }
  };
  return <TechnicalEditDialog title={medium === 'pipe' ? 'Vincular consumidor a un depósito' : 'Vincular consumidor a un banco'} onClose={() => {if (!saving) onClose();}}>
    <form className="ti-editor iv-route-editor iv-consumer-editor" onSubmit={event => void save(event)}>
      <p>Registra el consumidor instalado o reutiliza su ficha. Se guardarán juntos el equipo y su conexión.</p>
      <fieldset disabled={disabled || saving || !!pending}>
        <label>{medium === 'pipe' ? 'Depósito de origen' : 'Banco de alimentación'}<select required value={sourceId} onChange={event => setSourceId(event.target.value)}><option value="">Seleccionar origen</option>{origins.map(component => <option key={component.id} value={component.id}>{component.name}</option>)}</select></label>
        {!origins.length && <p>Añade primero {medium === 'pipe' ? 'el depósito' : 'el banco'} desde la vista principal.</p>}
        {consumers.length > 0 && <label>Consumidor<select value={consumerId} onChange={event => setConsumerId(event.target.value)}><option value="">Registrar consumidor instalado</option>{consumers.map(consumer => <option key={consumer.id} value={consumer.id}>{consumer.name}</option>)}</select></label>}
        {!consumerId && <label>Nombre del consumidor<input required maxLength={240} value={name} placeholder="Por ejemplo, bomba de agua" onChange={event => setName(event.target.value)}/></label>}
        <label>{medium === 'pipe' ? 'Nombre de la tubería o salida (opcional)' : 'Nombre del circuito (opcional)'}<input maxLength={240} value={connectionName} onChange={event => setConnectionName(event.target.value)}/></label>
        <div className="iv-route-summary"><strong>Conexión que vas a guardar</strong><p>{source?.name || 'Elegir origen'} → {targetName || 'Elegir consumidor'}</p></div>
        <p>{medium === 'pipe' ? 'Esta salida no acredita caudal ni consumo actual. Puedes reutilizar el mismo consumidor en Electricidad para declarar su alimentación.' : 'Este circuito no acredita que el consumidor esté encendido ni mide su corriente.'}</p>
      </fieldset>
      {error && <p role="alert">{error}</p>}
      <div className="ti-actions"><button type="submit" disabled={disabled || saving || !sourceId || !origins.length}>{saving ? 'Guardando…' : pending ? 'Reintentar guardado' : 'Guardar consumidor y conexión'}</button><button type="button" disabled={saving} onClick={onClose}>{pending ? 'Cerrar' : 'Cancelar'}</button></div>
    </form>
  </TechnicalEditDialog>;
}
