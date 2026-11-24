import type { InventoryItem } from '../../shared/types';
/** Only explicit location strings are grouped. Never infer compartments from item category. */
export function stowageGroups(items: readonly InventoryItem[]) {
  const groups = new Map<string, InventoryItem[]>();
  for (const item of items) {
    const location = item.ubicacion?.trim() || '';
    const group = groups.get(location) ?? [];
    group.push(item); groups.set(location, group);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b, 'es')).map(([location, group]) => ({
    location, items: group, quantity: group.reduce((sum, item) => sum + item.cantidad_actual, 0),
    lowStock: group.filter(item => item.cantidad_actual <= item.cantidad_minima).length,
  }));
}
