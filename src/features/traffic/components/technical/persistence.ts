import { canonicalJson } from './canonicalJson';
export { canonicalJson } from './canonicalJson';
import { parseInventory, type TechnicalInventory } from './model';
import type { DraftStorage, InventorySnapshot } from './drafts';
import { persistDraft } from './drafts';

/** Transport boundary keeps the persistence contract testable without a live account. */
export interface InventoryTransport {
  load(shipId: string, signal?: AbortSignal): Promise<unknown>;
  save(shipId: string, revision: number, inventory: TechnicalInventory, signal?: AbortSignal): Promise<unknown>;
}

export class InventoryConflictError extends Error {
  constructor() {
    super('Otro equipo ha modificado esta configuración. El borrador se conserva; recarga y revisa los cambios antes de guardar.');
    this.name = 'InventoryConflictError';
  }
}

export function parseSnapshot(value: unknown): InventorySnapshot {
  if (!value || typeof value !== 'object' || !('revision' in value)
    || !Number.isSafeInteger(value.revision) || Number(value.revision) < 0 || !('inventory' in value)) {
    throw new Error('Respuesta de persistencia técnica no compatible');
  }
  return { revision: Number(value.revision), inventory: parseInventory(value.inventory) };
}

export function createInventoryRepository(transport: InventoryTransport) {
  const pending = new Map<string, Promise<unknown>>();
  const confirmed = new Map<string, InventorySnapshot>();
  // A rejected write must release the queue too. Different vessels remain independent.
  function enqueue(shipId: string, operation: () => Promise<InventorySnapshot>): Promise<InventorySnapshot> {
    const previous = pending.get(shipId);
    const next = (previous ? previous.catch(() => undefined) : Promise.resolve()).then(operation);
    pending.set(shipId, next);
    void next.finally(() => { if (pending.get(shipId) === next) pending.delete(shipId); }).catch(() => undefined);
    return next;
  }
  return {
    load(shipId: string, signal?: AbortSignal): Promise<InventorySnapshot> {
      return enqueue(shipId, async () => {
        signal?.throwIfAborted();
        if (!shipId.trim()) throw new Error('Selecciona una embarcación');
        const result = parseSnapshot(await transport.load(shipId, signal));
        signal?.throwIfAborted();
        confirmed.set(shipId, structuredClone(result));
        return result;
      });
    },
    save(shipId: string, snapshot: InventorySnapshot, signal?: AbortSignal): Promise<InventorySnapshot> {
      // Detach queued input from mutable editor state before waiting for the vessel queue.
      const input = parseSnapshot(structuredClone(snapshot));
      return enqueue(shipId, async () => {
        signal?.throwIfAborted();
        if (!shipId.trim()) throw new Error('Selecciona una embarcación');
        const baseline = confirmed.get(shipId);
        if (baseline) {
          if (baseline.revision !== input.revision) throw new InventoryConflictError();
          if (canonicalJson(baseline.inventory) === canonicalJson(input.inventory)) return structuredClone(baseline);
        }
        // Never replay ambiguous writes; reload and reconcile their revision first.
        const result = parseSnapshot(await transport.save(shipId, input.revision, input.inventory, signal));
        signal?.throwIfAborted();
        if (result.revision !== input.revision + 1) throw new Error('Supabase no ha confirmado la revisión esperada. Recarga antes de reintentar.');
        if (canonicalJson(result.inventory.installation) !== canonicalJson(input.inventory.installation)) throw new Error('El servidor no ha devuelto la instalación completa. Conserva el borrador y recarga antes de reintentar.');
        if (canonicalJson(result.inventory.electrical) !== canonicalJson(input.inventory.electrical)) throw new Error('El servidor no ha conservado el esquema eléctrico completo. El borrador local se conserva.');
        if (canonicalJson(result.inventory) !== canonicalJson(input.inventory)) throw new Error('El servidor no ha conservado el esquema eléctrico o el inventario completo. El borrador local se conserva.');
        confirmed.set(shipId, structuredClone(result));
        return result;
      });
    }
  };
}

export interface SaveReceipt {
  snapshot: InventorySnapshot;
  recoveryWarning: string | null;
}

/** Local storage assists recovery; only the acknowledged remote transaction counts as saved. */
export async function saveWithRecovery(
  storage: DraftStorage,
  key: string,
  snapshot: InventorySnapshot,
  commit: (snapshot: InventorySnapshot) => Promise<InventorySnapshot>
): Promise<SaveReceipt> {
  let recoveryWarning: string | null = null;
  try { persistDraft(storage, key, snapshot); }
  catch { recoveryWarning = 'No se pudo conservar una copia de recuperación en este equipo.'; }

  let confirmed: InventorySnapshot;
  try { confirmed = await commit(snapshot); }
  catch (error: unknown) {
    if (error instanceof InventoryConflictError) throw error;
    const detail = error instanceof Error ? error.message : 'Error de conexión o permisos';
    throw new Error(`${detail} ${recoveryWarning ?? 'El borrador local se conserva.'} Pendiente de guardar en Supabase.`);
  }

  // A failed or ambiguous remote request never removes the user's recovery copy.
  try {
    const current = storage.getItem(key);
    if (current !== null && canonicalJson(JSON.parse(current)) === canonicalJson(snapshot)) storage.removeItem(key);
  }
  catch { recoveryWarning = 'Guardado en Supabase; no se pudo limpiar el borrador de este equipo.'; }
  return { snapshot: confirmed, recoveryWarning };
}
