import React, { useEffect, useState } from 'react';
import type { SensorBinding, TechnicalInventory } from './model';
import { compatibleTarget, connectionFingerprint, resolveBinding, sensorOptions, type ConfirmedConnection, type InstrumentFeed, type InstrumentProvider } from './sensorBindings';

export function useLiveSensors(shipId: string | undefined, provider: InstrumentProvider | undefined) {
  const [feed,setFeed] = useState<InstrumentFeed | null>(null);
  const [confirmation,setConfirmation] = useState<ConfirmedConnection | null>(null);
  const [now,setNow] = useState(Date.now());
  useEffect(() => {
    let active=true, pending=false;
    setFeed(null); setConfirmation(null);
    if (!provider || !shipId) return;
    const poll = async () => {
      setNow(Date.now());
      if (pending) return;
      pending=true;
      try {
        const next=await provider();
        if (!active) return;
        setNow(Date.now()); setFeed(next?.vesselId === shipId ? next : null);
        setConfirmation(old => old && next?.vesselId === old.vesselId && connectionFingerprint(next.connection) === old.connection ? old : null);
      } catch { if (active) { setFeed(null); setConfirmation(null); } }
      finally { pending=false; }
    };
    void poll();
    const timer=window.setInterval(() => void poll(),1000);
    return () => { active=false; window.clearInterval(timer); };
  },[provider,shipId]);
  const current=feed && feed.vesselId === shipId && now >= feed.capturedAt && now-feed.capturedAt <= 2500 ? feed : null;
  useEffect(() => { if (!current) setConfirmation(null); },[current]);
  return {feed:current,confirmation,now,confirm:() => {
    const connection=current && connectionFingerprint(current.connection);
    if (connection && shipId) setConfirmation({vesselId:shipId,connection,at:Date.now()});
  },revoke:() => setConfirmation(null)};
}
export type LiveSensorsState = ReturnType<typeof useLiveSensors>;

export function SensorBindingsPanel({inventory,shipId,live,disabled,onApply}:{inventory:TechnicalInventory;shipId?:string;live:LiveSensorsState;disabled:boolean;onApply:(i:TechnicalInventory)=>Promise<void>}) {
  const [choice,setChoice]=useState(''),[target,setTarget]=useState(''),[error,setError]=useState('');
  const options=live.feed ? sensorOptions(live.feed.instruments) : [];
  const sensor=options.find(s => JSON.stringify([s.channel,s.sensor]) === choice);
  const installation=inventory.installation ?? {nodes:[],links:[]};
  const bindings=installation.bindings ?? [];
  const targets=[...inventory.components.map(c=>({id:c.id,name:c.name})),...(inventory.installation?.nodes??[]).filter(c=>inventory.electrical?.devices.some(d=>d.componentId===c.id)).map(c=>({id:c.id,name:`Equipo: ${c.name} · salida común`})),...installation.links.map(l=>({id:l.id,name:`Conexión: ${l.name}`}))];
  const connection=live.feed && connectionFingerprint(live.feed.connection);
  const apply=async (next:SensorBinding[]) => {
    try { setError(''); await onApply({...inventory,installation:{...installation,bindings:next}}); setChoice('');setTarget(''); }
    catch(e:unknown) {setError(e instanceof Error?e.message:'No se pudo guardar el vínculo');}
  };
  return <details className="ti-editor iv-sensors"><summary>Sensores · asignación explícita por embarcación</summary>
    <p>Conexión: {connection ?? 'sin conexión BOAT vigente de esta embarcación'}. La procedencia BOAT es declarada por el operador; comprueba el equipo físico antes de confirmar.</p>
    {!live.confirmation ? <button type="button" disabled={!connection || disabled} onClick={live.confirm}>Confirmar que esta conexión pertenece a la embarcación activa</button> : <><p>Conexión confirmada para esta sesión. Solo se admiten lecturas recibidas después de confirmar.</p><button type="button" onClick={live.revoke}>Suspender lecturas en el visor</button></>}
    <p>La corriente neta de una batería no se atribuye a ramales. En el editor, la salida común puede vincularse al regulador solar o al alternador confirmado. No se reparte su corriente entre cables. Los vínculos antiguos a ramales requieren una salida dedicada única. No se calcula caudal a partir del nivel.</p>
    <form onSubmit={e=>{e.preventDefault();if(!sensor || !target || !connection || !live.confirmation)return;void apply([...bindings.filter(b=>b.targetId!==target || b.metric!==sensor.metric),{targetId:target,metric:sensor.metric,channel:sensor.channel,sensor:sensor.sensor,connection}]);}}>
      <div className="ti-fields"><label>Canal recibido<select value={choice} disabled={disabled || !live.confirmation} required onChange={e=>{setChoice(e.target.value);setTarget('');}}><option value="">Seleccionar lectura vigente</option>{options.map(s=><option key={JSON.stringify([s.channel,s.sensor])} value={JSON.stringify([s.channel,s.sensor])}>{s.label} · {s.reading.value} {s.unit}</option>)}</select></label><label>Equipo o conexión medidos<select value={target} required disabled={!sensor || disabled} onChange={e=>setTarget(e.target.value)}><option value="">Seleccionar destino</option>{targets.filter(t=>sensor && compatibleTarget(inventory,t.id,sensor.channel)).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label></div>
      <div className="ti-actions"><button type="submit" disabled={disabled || !target || !live.confirmation}>Guardar asignación en Supabase</button></div>
    </form>
    {bindings.map(b=>{const value=shipId?resolveBinding(b,live.feed,live.confirmation,shipId,live.now):null;return <div key={JSON.stringify([b.targetId,b.metric])} className="iv-sensor-row"><span>{targets.find(t=>t.id===b.targetId)?.name} · {b.metric} · {b.sensor}: <strong>{value?`${value.reading.value} ${value.unit} · medido`:'sin lectura vigente confirmada'}</strong></span><button type="button" disabled={disabled} onClick={()=>void apply(bindings.filter(x=>x!==b))}>Desvincular sensor</button></div>;})}
    {error && <p role="alert">{error}</p>}
  </details>;
}
