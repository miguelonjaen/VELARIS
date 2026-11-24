import type { TechnicalInventory } from '../model';
import type { ElectricalSystem } from './types';

/** React Flow uses a null event for programmatic moves, including initialisation. */
export function userViewport(inventory: TechnicalInventory, event: unknown | null, viewport: ElectricalSystem['viewport']): TechnicalInventory {
  const system=inventory.electrical;
  if (!event || !system) return inventory;
  const previous=system.viewport;
  if (Math.abs(viewport.x-previous.x)<=1e-8 && Math.abs(viewport.y-previous.y)<=1e-8 && Math.abs(viewport.zoom-previous.zoom)<=1e-8) return inventory;
  return {...inventory,electrical:{...system,viewport}};
}
