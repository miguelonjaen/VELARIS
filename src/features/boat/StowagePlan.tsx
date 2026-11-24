import React from 'react';
import type { InventoryItem } from '../../shared/types';
import { stowageGroups } from './stowageModel';

export function StowagePlan({ items, selected, onSelect }: { items: readonly InventoryItem[]; selected: string | null; onSelect: (location: string | null) => void }) {
  const groups = stowageGroups(items);
  return <section className="rounded-3xl border border-cyan-900/60 bg-[#091a2b] p-5" aria-label="Plano de estiba">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] tracking-widest text-cyan-300 uppercase">Estiba a bordo</p><h3 className="text-lg text-white font-semibold">Compartimentos registrados</h3></div><button type="button" onClick={() => onSelect(null)} className="min-h-11 rounded-xl border border-cyan-800 px-4 text-cyan-200" aria-pressed={selected === null}>Todo el inventario</button></div>
    <p className="my-3 text-xs text-slate-400">Distribución esquemática por ubicación declarada; no representa posiciones físicas ni un plano a escala.</p>
    {groups.length ? <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 rounded-[2rem] border-2 border-cyan-900 p-4">
      {groups.map(group => <button type="button" key={group.location} onClick={() => onSelect(selected === group.location ? null : group.location)} aria-pressed={selected === group.location} className={`min-h-24 text-left rounded-xl border p-4 ${selected === group.location ? 'border-cyan-300 bg-cyan-950' : 'border-slate-700 bg-slate-900/60'}`}><span className="block font-semibold text-cyan-100 break-words">{group.location || 'Sin ubicación'}</span><span className="block text-xs text-slate-300 mt-2">{group.items.length} artículos registrados</span><span className="block text-xs text-amber-200 mt-1">{group.lowStock} bajo mínimo</span></button>)}
    </div> : <p className="py-6 text-slate-400 text-sm">Sin artículos registrados para esta embarcación.</p>}
    {selected !== null && <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">{groups.find(group => group.location === selected)?.items.map(item => <article key={item.id} className="rounded-xl border border-slate-700 bg-slate-950 p-4"><h4 className="text-white font-semibold">{item.nombre}</h4><p className="text-cyan-200 mt-2">{item.cantidad_actual} {item.unidad || 'unidades'} · mínimo {item.cantidad_minima}</p><p className="text-xs text-slate-400 mt-2">Caducidad: {item.fecha_caducidad || 'Sin fecha registrada'}</p></article>)}</div>}
  </section>;
}
