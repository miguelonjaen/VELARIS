import { canonicalJson } from './canonicalJson';
import { parseInventory, type TechnicalInventory } from './model';
export interface InventorySnapshot { inventory: TechnicalInventory; revision: number }
export type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export class DraftStorageUnavailableError extends Error {
  constructor() { super('No se puede consultar la copia de recuperación de este equipo.'); this.name = 'DraftStorageUnavailableError'; }
}
export const draftKey = (userId: string, shipId: string): string => `GAULOS:technical:v1:${userId}:${shipId}`;
export function parseDraft(raw: string): InventorySnapshot {
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || !('revision' in value) || !Number.isSafeInteger(value.revision) || Number(value.revision) < 0 || !('inventory' in value)) throw new Error('Borrador local no compatible');
  return { revision: Number(value.revision), inventory: parseInventory(value.inventory) };
}
export function persistDraft(storage: DraftStorage, key: string, snapshot: InventorySnapshot): void {
  parseDraft(JSON.stringify(snapshot));
  try { storage.setItem(key, JSON.stringify(snapshot)); }
  catch { throw new Error('No se pudo guardar el borrador en este equipo. Comprueba el espacio y los permisos de almacenamiento.'); }
}
export function recoverDraft(storage: DraftStorage, key: string, remote: InventorySnapshot): { snapshot: InventorySnapshot; dirty: boolean; conflict: boolean } {
  let raw: string | null;
  try { raw = storage.getItem(key); }
  catch { throw new DraftStorageUnavailableError(); }
  if (raw === null) return { snapshot: remote, dirty: false, conflict: false };
  const snapshot = parseDraft(raw);
  if (canonicalJson(snapshot.inventory) === canonicalJson(remote.inventory)) return { snapshot: remote, dirty: false, conflict: false };
  return { snapshot, dirty: true, conflict: snapshot.revision !== remote.revision };
}
