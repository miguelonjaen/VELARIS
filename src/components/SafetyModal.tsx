import { useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { InventoryItem, ShipData, UserProfile } from '../shared/types';

import { Check, ChevronRight } from 'lucide-react';
import type { MissionPlan } from '../core/voyage/missionPlan';
import type { VoyageCrewMember } from '../lib/tripLogger';

type CrewRow = { id: string; nombre: string; rol: string | null };
type Product = Pick<InventoryItem, 'id' | 'nombre' | 'cantidad_actual' | 'unidad' | 'ubicacion' | 'fecha_caducidad'>;
type Levels = { fuel_level: number; water_level: number };
type Draft = { checked: string[]; aboard: string[]; officerId: string | null };

interface SafetyModalProps {
  plan?: MissionPlan;
  userProfile: UserProfile | null;
  supabase: SupabaseClient;
  fleet: ShipData[];
  onClose: () => void;
  onDispatch: (levels: Levels, crew: VoyageCrewMember[], officer: VoyageCrewMember) => Promise<void>;
  selectedShipId: string | null;
  draftId: string;
  simulatedPosition: boolean;
  prepareOnly: boolean;
  onStartSimulation?: () => Promise<void>;
}

const sections = [
  {
    "title": "Seguridad y Documentación",
    "items": [
      {
        "id": "chalecos",
        "label": "Chalecos (1x tripulante + fecha)"
      },
      {
        "id": "pirotecnia",
        "label": "Material Seguridad (Bengalas/Espejo)"
      },
      {
        "id": "extintores",
        "label": "Sistema Contraincendios"
      },
      {
        "id": "botiquin",
        "label": "Botiquín Completo"
      },
      {
        "id": "documentacion",
        "label": "Documentación del Barco"
      },
      {
        "id": "radio_vhf",
        "label": "Radio VHF Cargada y Operativa"
      }
    ]
  },
  {
    "title": "Motor y Casco",
    "items": [
      {
        "id": "combustible_ok",
        "label": "Combustible (Travesía + Reserva)"
      },
      {
        "id": "agua_potable_ok",
        "label": "Reserva Agua Potable"
      },
      {
        "id": "aceite_motor",
        "label": "Nivel Aceite y Refrigerante"
      },
      {
        "id": "correas",
        "label": "Correas y ausencia de fugas"
      },
      {
        "id": "sentinas",
        "label": "Sentinas Secas y Estanqueidad"
      },
      {
        "id": "grifos_fondo",
        "label": "Grifos de Fondo y Escotillas"
      },
      {
        "id": "baterias",
        "label": "Baterías y Sistema Eléctrico"
      },
      {
        "id": "luces_nav",
        "label": "Luces de Navegación"
      },
      {
        "id": "timon",
        "label": "Prueba de Gobierno (Timón)"
      }
    ]
  },
  {
    "title": "Navegación y Meteorología",
    "items": [
      {
        "id": "meteorologia",
        "label": "Parte Meteorológico Consultado"
      },
      {
        "id": "cartas",
        "label": "Cartas Náuticas (Físicas/Digitales)"
      },
      {
        "id": "fondeo",
        "label": "Fondeo (Ancla, Cabo, Molinete)"
      }
    ]
  },
  {
    "title": "Check-list Último Minuto",
    "items": [
      {
        "id": "aviso_tierra",
        "label": "Plan de Navegación Avisado"
      },
      {
        "id": "objetos_sueltos",
        "label": "Objetos Sueltos Asegurados"
      },
      {
        "id": "linternas",
        "label": "Linternas Estancas con Pilas"
      }
    ]
  }
];

const emptyDraft: Draft = { checked: [], aboard: [], officerId: null };
const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(entry => typeof entry === 'string');

function loadDraft(key: string): Draft | null {
  try {
    const value: Partial<Draft> | null = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (value && strings(value.checked) && strings(value.aboard)
      && (value.officerId === null || typeof value.officerId === 'string')) {
      return { checked: value.checked, aboard: value.aboard, officerId: value.officerId };
    }
  } catch (error) {
    console.warn('No se pudo leer el borrador de despacho.', error);
  }
  return null;
}

const crewMember = (row: CrewRow): VoyageCrewMember => ({
  id: row.id,
  nombre: row.nombre,
  rango: row.rol ?? 'Tripulante',
});

const field = 'min-h-11 min-w-0 rounded-lg border border-slate-600 bg-slate-950 px-3 text-sm text-white focus-visible:outline-2 focus-visible:outline-cyan-300';
const button = 'min-h-11 rounded-lg border border-slate-500 px-3 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-400';

export function DispatchForm({ ship, draftId, userProfile, supabase, simulatedPosition, prepareOnly, onStartSimulation, onClose, onDispatch }: {
  ship: ShipData;
} & Pick<SafetyModalProps, 'draftId' | 'userProfile' | 'supabase' | 'simulatedPosition' | 'prepareOnly' | 'onStartSimulation' | 'onClose' | 'onDispatch'>) {
  const key = `GAULOS_dispatch:${userProfile?.id ?? 'local'}:${ship.id}:${draftId}`;
  const [initial] = useState(() => loadDraft(key));
  const [draft, setDraft] = useState(initial ?? emptyDraft);
  const [inventory, setInventory] = useState<Product[]>([]);
  const [crew, setCrew] = useState<VoyageCrewMember[]>([]);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [storageError, setStorageError] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const mounted = useRef(true);
  const [showAddCrew, setShowAddCrew] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState('Oficial');
  const productChecks = inventory.map(product => ({
    id: `inventory:${JSON.stringify([product.id, product.nombre, product.cantidad_actual, product.unidad, product.ubicacion, product.fecha_caducidad])}`,
    label: `${product.nombre} · ${product.cantidad_actual} ${product.unidad ?? ''}${product.ubicacion ? ` · ${product.ubicacion}` : ''}${product.fecha_caducidad ? ` · Caducidad ${product.fecha_caducidad}` : ''}`,
  }));
  const aboard = crew.filter(member => draft.aboard.includes(member.id));
  const officer = aboard.find(member => member.id === draft.officerId);
  const pending = (items: { id: string }[]) => items.filter(item => !draft.checked.includes(item.id)).length;
  const allChecked = sections.every(section => pending(section.items) === 0) && pending(productChecks) === 0;

  useEffect(() => () => { mounted.current = false; }, []);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setLoadError(null);
    void (async () => {
      try {
        const [products, members] = await Promise.all([
          supabase.from('inventario').select('id,nombre,cantidad_actual,unidad,ubicacion,fecha_caducidad').eq('barco_id', ship.id).order('nombre'),
          supabase.from('tripulacion').select('id,nombre,rol').eq('barco_id', ship.id).order('nombre'),
        ]);
        if (products.error) throw products.error;
        if (members.error) throw members.error;
        if (!current) return;
        const roster = (members.data ?? []).map(crewMember);
        let captain = roster.find(member => member.nombre === userProfile?.name);
        if (!captain && userProfile) {
          captain = { id: `captain-${userProfile.id}`, nombre: userProfile.name, rango: 'Capitán' };
          roster.unshift(captain);
        }
        setCrew(roster);
        setInventory(products.data ?? []);
        if (!initial && captain) {
          const id = captain.id;
          setDraft(previous => ({ ...previous, aboard: [id], officerId: id }));
        }
      } catch (cause) {
        if (current) setLoadError(cause && typeof cause === 'object' && 'message' in cause
          ? String(cause.message) : 'Error de conexión.');
      } finally {
        if (current) setLoading(false);
      }
    })();
    return () => { current = false; };
  }, [initial, revision, ship.id, supabase, userProfile?.id, userProfile?.name]);

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(draft));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [draft, key]);

  async function addCrew(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || !name.trim()) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const { data, error: insertError } = await supabase.from('tripulacion')
        .insert({ barco_id: ship.id, nombre: name.trim(), rol: role })
        .select('id,nombre,rol').single();
      if (insertError) throw new Error(insertError.message);
      const member = crewMember(data);
      setCrew(previous => [...previous, member]);
      setDraft(previous => ({ ...previous, aboard: [...previous.aboard, member.id] }));
      setName('');
      setShowAddCrew(false);
    } catch (cause) {
      setError(`No se pudo añadir el tripulante. ${cause instanceof Error ? cause.message : ''}`);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function dispatch() {
    if (prepareOnly || lock.current || loading || loadError || !allChecked || !officer || simulatedPosition) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      await onDispatch({ fuel_level: ship.fuel_level ?? 0, water_level: ship.water_level ?? 0 }, aboard, officer);
      if (!mounted.current) return;
      try { localStorage.removeItem(key); }
      catch (cause) { console.warn('No se pudo limpiar el borrador de despacho confirmado.', cause); }
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo iniciar la travesía.');
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  function checklist(title: string, items: { id: string; label: string }[], count = false) {
    const remaining = pending(items);
    const status = items.length === 0 ? 'Sin productos' : count ? `${items.length - remaining} de ${items.length}`
      : remaining === 0 ? 'Completado' : remaining === 1 ? '1 pendiente' : `${remaining} pendientes`;
    return (
      <details key={title} className="group border-b border-slate-700/80">
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 py-2 focus-visible:outline-2 focus-visible:outline-cyan-300">
          <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-slate-400 group-open:rotate-90" />
          <span className="font-semibold">{title}</span>
          <span className={`ml-auto shrink-0 text-right text-sm ${remaining ? 'text-amber-300' : 'text-cyan-300'}`}>{status}</span>
        </summary>
        <div className="grid gap-1 pb-3 pl-7">
          {items.map(item => (
            <label key={item.id} className="flex min-h-11 items-center gap-3 text-sm">
              <input type="checkbox" className="size-4 shrink-0 accent-cyan-400" checked={draft.checked.includes(item.id)} onChange={event => {
                const checked = event.currentTarget.checked;
                setDraft(previous => ({ ...previous, checked: checked
                  ? [...previous.checked, item.id]
                  : previous.checked.filter(id => id !== item.id) }));
              }} />
              {item.label}
            </label>
          ))}
          {items.length === 0 && <p className="text-sm text-slate-300">El inventario de este barco está vacío.</p>}
        </div>
      </details>
    );
  }

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 sm:px-6">
        {loading && <p role="status">Cargando inventario y tripulación…</p>}
        {loadError && <p role="alert">No se pudo cargar el despacho. {loadError}{' '}
          <button type="button" className={button} onClick={() => setRevision(previous => previous + 1)}>Reintentar</button>
        </p>}
        {!loading && !loadError && (
          <fieldset disabled={busy} className="min-w-0">
            {sections.map(section => checklist(section.title, section.items))}
            {checklist('Inventario', productChecks, true)}
            <details className="group border-b border-slate-700/80">
              <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 py-2 focus-visible:outline-2 focus-visible:outline-cyan-300">
                <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-slate-400 group-open:rotate-90" />
                <span className="font-semibold">Tripulación</span>
                <span className="ml-auto shrink-0 text-sm text-slate-200">{aboard.length} a bordo</span>
              </summary>
              <div className="space-y-2 pb-3 pl-7">
                {crew.map(member => (
                  <label key={member.id} className="flex min-h-11 items-center gap-3 text-sm">
                    <input type="checkbox" className="size-4 shrink-0 accent-cyan-400" checked={draft.aboard.includes(member.id)} onChange={event => {
                      const selected = event.currentTarget.checked;
                      setDraft(previous => ({
                        ...previous,
                        aboard: selected ? [...previous.aboard, member.id] : previous.aboard.filter(id => id !== member.id),
                        officerId: !selected && previous.officerId === member.id ? null : previous.officerId,
                      }));
                    }} />
                    {member.nombre} · {member.rango}
                  </label>
                ))}
                <button type="button" className={button} onClick={() => setShowAddCrew(previous => !previous)}>
                  {showAddCrew ? 'Cerrar formulario' : 'Añadir tripulante'}
                </button>
                {showAddCrew && (
                  <form onSubmit={addCrew} className="grid gap-2">
                    <label className="grid gap-1 text-sm">Nombre
                      <input className={field} value={name} onChange={event => setName(event.target.value)} required />
                    </label>
                    <label className="grid gap-1 text-sm">Rol
                      <select className={field} value={role} onChange={event => setRole(event.target.value)}>
                        <option>Oficial</option><option>Marinero</option><option>Invitado</option>
                      </select>
                    </label>
                    <button type="submit" className={button} disabled={!name.trim()}>Guardar tripulante</button>
                  </form>
                )}
              </div>
            </details>
              <label className="grid items-center gap-2 border-b border-slate-700/80 py-3 text-sm font-semibold sm:grid-cols-2">Primera guardia
                <select className={field} value={officer?.id ?? ''} onChange={event => {
                  const officerId = event.currentTarget.value || null;
                  setDraft(previous => ({ ...previous, officerId }));
                }}>
                  <option value="">Sin asignar</option>
                  {aboard.map(member => <option key={member.id} value={member.id}>{member.nombre}</option>)}
                </select>
              </label>
          </fieldset>
        )}
        {storageError && <p role="alert">El borrador se conserva mientras este formulario esté abierto.</p>}
        {error && <p role="alert" className="text-rose-300">{error}</p>}
      </div>
      <footer className="shrink-0 border-t border-slate-700 bg-slate-900 px-5 py-3 sm:px-6">
        <div className="flex flex-wrap gap-2 [&>button]:flex-1">
          <button type="button" className={button} onClick={onClose} disabled={busy}>{draftId === 'libre' ? 'Volver' : 'Volver al plan'}</button>
          {!prepareOnly && simulatedPosition && onStartSimulation && <button type="button" className={button} disabled={busy} onClick={async () => {
            if (lock.current) return;
            lock.current = true;
            setBusy(true);
            setError(null);
            try { await onStartSimulation(); } catch (cause) {
              setError(cause instanceof Error ? cause.message : 'Ensayo SIM no disponible.');
            } finally {
              lock.current = false;
              setBusy(false);
            }
          }}>Iniciar ensayo SIM</button>}
          {!prepareOnly && <button type="button" className={`${button} border-cyan-400 bg-cyan-400 text-slate-950 hover:bg-cyan-300`} onClick={dispatch}
            disabled={busy || loading || Boolean(loadError) || !allChecked || !officer || simulatedPosition}>
            Zarpar
          </button>}
        </div>
        {!prepareOnly && simulatedPosition && <p className="mt-2 text-center text-sm font-medium text-amber-300">Posición simulada activa · salida real bloqueada</p>}
      </footer>
    </>
  );
}

export default function SafetyModal(props: SafetyModalProps) {
  const ship = props.fleet.find(candidate => candidate.id === props.selectedShipId);
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { titleRef.current?.focus({ preventScroll: true }); }, []);
  const { plan } = props;
  const departure = plan?.waypoints.at(0)?.name;
  const destination = plan?.waypoints.at(-1)?.name;
  return (
    <aside aria-labelledby="dispatch-title"
      className="relative z-10 flex h-[64%] min-h-0 w-full shrink-0 flex-col border-t border-slate-600 bg-[#0b1729] text-slate-100 md:h-full md:w-[clamp(19rem,38%,31rem)] md:border-l md:border-t-0">
      <header className="shrink-0 border-b border-slate-700 px-5 pb-3 pt-4 sm:px-6">
        <h2 ref={titleRef} tabIndex={-1} id="dispatch-title" className="text-xl font-bold tracking-tight lg:text-2xl">Despacho de salida</h2>
        <p className="text-sm text-slate-300">{plan ? 'Navegación por ruta' : 'Navegación libre'}{ship && ` · ${ship.nombre}`}</p>
      </header>
      {plan && (
        <div className="shrink-0 border-b border-slate-700 px-5 py-3 sm:px-6">
          <p className="truncate font-semibold" title={plan.name}>
            {plan.waypoints.length > 1 && departure && destination ? `${departure} → ${destination}` : plan.name}
          </p>
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-slate-300">
            {plan.waypoints.length} {plan.waypoints.length === 1 ? 'waypoint' : 'waypoints'} · {plan.savedAt ? `Plan v${plan.version}` : 'Borrador'}
            {plan.reviewed
              ? <span className="inline-flex items-center gap-1 text-cyan-300"><Check aria-hidden="true" className="size-4" /> Derrota revisada</span>
              : <span className="text-amber-300">Derrota pendiente de revisión</span>}
          </p>
        </div>
      )}
      {ship ? <DispatchForm key={JSON.stringify([ship.id, props.userProfile?.id, props.draftId])} ship={ship} {...props} /> : (
        <div className="space-y-3 p-5">
          <p role="alert">Selecciona una embarcación de la flota.</p>
          <button type="button" className={button} onClick={props.onClose}>Volver</button>
        </div>
      )}
    </aside>
  );
}
