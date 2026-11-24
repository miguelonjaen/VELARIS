import type { GPXRoute } from '../../lib/gpxParser';

export interface MissionWaypoint { id: string; name: string; lat: number; lng: number }
export interface MissionPlan {
  id: string;
  version: number;
  name: string;
  waypoints: MissionWaypoint[];
  constraints: string;
  reviewed: boolean;
  savedAt: number;
}
export const validCoordinate = (lat: number, lng: number): boolean =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
export function validateMissionPlan(value: unknown): value is MissionPlan {
  if (!value || typeof value !== 'object') return false;
  const p = value as Partial<MissionPlan>;
  return typeof p.id === 'string' && typeof p.name === 'string' && p.name.trim().length > 0
    && Number.isInteger(p.version) && (p.version ?? 0) > 0 && typeof p.constraints === 'string'
    && typeof p.reviewed === 'boolean' && typeof p.savedAt === 'number' && Number.isFinite(p.savedAt)
    && Array.isArray(p.waypoints) && p.waypoints.length <= 500 && p.waypoints.every((w: unknown) => {
      if (!w || typeof w !== 'object') return false;
      const point = w as Partial<MissionWaypoint>;
      return typeof point.id === 'string' && typeof point.name === 'string'
        && typeof point.lat === 'number' && typeof point.lng === 'number' && validCoordinate(point.lat, point.lng);
    });
}
export const emptyMissionPlan = (): MissionPlan => ({ id: crypto.randomUUID(), version: 1,
  name: 'Nueva misión', waypoints: [], constraints: '', reviewed: false, savedAt: 0 });
export function planFromGpx(route: GPXRoute): MissionPlan {
  const plan = { ...emptyMissionPlan(), name: route.name || 'Ruta importada', waypoints: route.waypoints.map(w =>
    ({ id: crypto.randomUUID(), name: w.name, lat: w.lat, lng: w.lng })) };
  if (!validateMissionPlan(plan)) throw new Error('GPX con coordenadas inválidas o más de 500 waypoints');
  return plan;
}
/** Collection scoped to a vessel. A saved version is never overwritten. */
export function loadMissionPlans(storage: Pick<Storage, 'getItem'>, shipId: string): MissionPlan[] {
  const value: unknown = JSON.parse(storage.getItem(`VELARIS_missions:${shipId}`) ?? '[]');
  if (!Array.isArray(value) || !value.every(validateMissionPlan)) throw new Error('Planes locales dañados; no se han sobrescrito');
  return value;
}
export function saveMissionPlan(storage: Pick<Storage, 'getItem' | 'setItem'>, shipId: string, plan: MissionPlan): MissionPlan {
  if (!validateMissionPlan(plan)) throw new Error('Plan inválido');
  const plans = loadMissionPlans(storage, shipId);
  const version = Math.max(0, ...plans.filter(p => p.id === plan.id).map(p => p.version)) + 1;
  const saved = { ...plan, version, savedAt: Date.now() };
  storage.setItem(`VELARIS_missions:${shipId}`, JSON.stringify([...plans, saved]));
  return saved;
}
