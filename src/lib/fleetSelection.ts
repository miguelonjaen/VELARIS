/** Selection is per user (usuarios.barco_activo_id); is_active is only a legacy fallback. */
export function resolveFleetSelection<T extends { id: string; is_active?: boolean }>(
  fleet: readonly T[], current: string | null, profile: string | null
): string | null {
  for (const id of [current, profile]) if (id && fleet.some(ship => ship.id === id)) return id;
  return fleet.find(ship => ship.is_active)?.id ?? fleet[0]?.id ?? null;
}
