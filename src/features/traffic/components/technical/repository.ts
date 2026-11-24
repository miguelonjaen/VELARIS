import { supabase } from '../../../../supabaseClient';
import { createInventoryRepository, InventoryConflictError, type InventoryTransport } from './persistence';
import type { InventorySnapshot } from './drafts';

const transport: InventoryTransport = {
  async load(shipId, signal) {
    const { data, error } = await supabase.rpc('load_vessel_technical_inventory', { p_ship_id: shipId })
      .retry(false).abortSignal(signal ? AbortSignal.any([signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000));
    if (error) throw new Error(`No se pudo cargar el inventario de Supabase: ${error.message}. Comprueba las migraciones 022 y 023, la conexión y los permisos.`);
    return data as unknown;
  },
  async save(shipId, revision, inventory, signal) {
    const { data, error } = await supabase.rpc('save_vessel_technical_inventory', {
      p_ship_id: shipId,
      p_expected_revision: revision,
      p_inventory: inventory
    }).retry(false).abortSignal(signal ? AbortSignal.any([signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000));
    if (error?.code === '40001') throw new InventoryConflictError();
    if (error) throw new Error(`Supabase no confirmó el guardado: ${error.message}`);
    return data as unknown;
  }
};

const repository = createInventoryRepository(transport);
export const loadTechnicalInventory = repository.load;

export async function saveTechnicalInventory(shipId: string, snapshot: InventorySnapshot, signal?: AbortSignal): Promise<InventorySnapshot> {
  return repository.save(shipId, snapshot, signal);
}
