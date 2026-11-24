import React, { useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { InventoryItem } from '../shared/types';

type Equipment = Pick<InventoryItem, 'id' | 'categoria' | 'nombre' | 'cantidad_actual' | 'unidad' | 'ubicacion' | 'fecha_caducidad'> & { barco_id: string };

export default function SafetyInventoryLinks({ supabase, shipId, initiallyExpanded = false }: { supabase: SupabaseClient; shipId: string; initiallyExpanded?: boolean }) {
  const [items, setItems] = useState<Equipment[]>([]);
  const [linked, setLinked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const [revision, setRevision] = useState(0);
  const alive = useRef(false);
  const busy = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setLinkError(null);
    setError(null);
    void (async () => {
      try {
        const [inventory, links] = await Promise.all([
          supabase.from('inventario')
            .select('id,barco_id,categoria,nombre,cantidad_actual,unidad,ubicacion,fecha_caducidad')
            .eq('barco_id', shipId).eq('categoria', 'Seguridad').order('nombre'),
          supabase.from('barco_seguridad_equipos').select('inventario_id').eq('barco_id', shipId)
        ]);
        if (inventory.error) throw inventory.error;

        if (!current) return;
        setItems((inventory.data ?? []).filter(item => item.barco_id === shipId && item.categoria === 'Seguridad'));
        if (links.error) {
          setLinked(new Set());
          setLinkError('No se pueden consultar los vínculos de Seguridad. Se muestra el inventario sin confirmar vinculaciones. Comprueba los permisos y la migración safety_inventory_links.');
        } else {
          setLinked(new Set((links.data ?? []).map(link => link.inventario_id as string)));
        }
      } catch (cause: unknown) {
        if (current) setError('No se pudieron cargar los equipos y sus vínculos. Comprueba la conexión, los permisos y la migración local.');
      } finally {
        if (current) setLoading(false);
      }
    })();
    return () => { current = false; };
  }, [supabase, shipId, revision]);

  async function toggle(item: Equipment) {
    if (busy.current || loading || error || linkError || item.barco_id !== shipId || item.categoria !== 'Seguridad') return;
    busy.current = true;
    setPending(item.id);
    setError(null);
    const wasLinked = linked.has(item.id);
    try {
      // The composite PK prevents duplicates; the composite FK enforces the vessel.
      const result = wasLinked
        ? await supabase.from('barco_seguridad_equipos').delete()
          .eq('barco_id', shipId).eq('inventario_id', item.id).select('inventario_id')
        : await supabase.from('barco_seguridad_equipos')
          .upsert({ barco_id: shipId, inventario_id: item.id }, {
            onConflict: 'barco_id,inventario_id', ignoreDuplicates: true
          }).select('inventario_id');
      if (result.error) throw result.error;
      // Confirm through SELECT as RLS can silently affect zero rows.
      const confirmed = await supabase.from('barco_seguridad_equipos').select('inventario_id')
        .eq('barco_id', shipId).eq('inventario_id', item.id);
      if (confirmed.error) throw confirmed.error;
      if ((confirmed.data.length > 0) === wasLinked) throw new Error('El vínculo no se confirmó');
      if (alive.current) setLinked(previous => {
        const next = new Set(previous);
        if (wasLinked) next.delete(item.id); else next.add(item.id);
        return next;
      });
    } catch (cause: unknown) {
      if (alive.current) setError('No se pudo confirmar el cambio. Recarga los equipos antes de volver a intentarlo.');
    } finally {
      busy.current = false;
      if (alive.current) setPending(null);
    }
  }

  return <section className="space-y-3 rounded-2xl border border-slate-700 p-4 text-sm text-slate-200" aria-label="Equipos de seguridad vinculados">
    <button type="button" onClick={() => setExpanded(value => !value)} aria-expanded={expanded}
      className="rounded-xl bg-cyan-800 px-4 py-3 font-bold">Vincular desde Inventario</button>
    <p>El inventario no acredita estado operativo ni disponibilidad real. Comprobación física manual obligatoria.</p>
    {!loading && linkError && <div role="alert"><p>{linkError}</p><button type="button" onClick={() => setRevision(value => value + 1)}>Reintentar vínculos</button></div>}
    {loading ? <p role="status">Cargando equipos…</p> : error ? <div role="alert">
      <p>{error}</p><button type="button" disabled={pending !== null} onClick={() => setRevision(value => value + 1)}>Recargar equipos</button>
    </div> : <>
      {items.filter(item => expanded || linkError !== null || linked.has(item.id)).map(item => <div key={item.id} className="space-y-2 rounded-xl bg-slate-950 p-3">
        <p className="font-bold">{item.nombre}</p>
        <p>Cantidad: {item.cantidad_actual ?? 0} {item.unidad ?? ''} · Ubicación: {item.ubicacion || 'Sin indicar'}</p>
        <p>Caducidad: {item.fecha_caducidad || 'Sin indicar'}</p>
        <p className="text-amber-300">Pendiente de comprobación física</p>
        <button type="button" disabled={pending !== null || linkError !== null} onClick={() => void toggle(item)} className="rounded-lg border border-slate-600 px-3 py-2 disabled:opacity-50">
          {linkError ? 'Vinculación no disponible' : pending === item.id ? 'Guardando…' : linked.has(item.id) ? 'Desvincular' : 'Vincular'}
        </button>
      </div>)}
      {items.length === 0 && <p>No hay objetos de la categoría Seguridad en el inventario de este barco.</p>}
      {!expanded && !linkError && items.length > 0 && linked.size === 0 && <p>No hay equipos vinculados.</p>}
    </>}
  </section>;
}
