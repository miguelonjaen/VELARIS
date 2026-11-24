import { GeoMath } from '../../core/navigation/GeoMath';
import type { AisCollisionAlarmTarget } from '../../core/navigation/AisCollisionAlarm';
import { classifyAisTargetAlarm, DEFAULT_AIS_ALARM_OPTIONS } from '../../core/navigation/AisCollisionAlarm';

export interface CpaOptions { minCpaNm: number; maxTcpaMinutes: number }
export interface AisPanelTarget extends AisCollisionAlarmTarget {
  lat: number;
  lng?: number;
  lon?: number;
  cog?: number;
  sog?: number;
  shipName?: string;
  vesselName?: string;
  shipType?: string;
  navigationSource?: string;
}
export const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
export function targetRank(target: AisPanelTarget, options: CpaOptions): number {
  if (target.dataStatus && target.dataStatus !== 'VALID') return -1;
  const alarm = classifyAisTargetAlarm(target, { ...DEFAULT_AIS_ALARM_OPTIONS, ...options });
  return alarm === 'critical' ? 4 : alarm === 'warning' ? 3 : target.riskLevel === 'CAUTION' ? 2 : target.cpaNm != null ? 1 : -1;
}
export function compareTargets(a: AisPanelTarget, b: AisPanelTarget, options: CpaOptions): number {
  const time = (t: AisPanelTarget) => finite(t.tcpaMinutes) && t.tcpaMinutes >= 0 ? t.tcpaMinutes : Infinity;
  return targetRank(b, options) - targetRank(a, options)
    || (time(a) - time(b) || 0)
    || ((a.cpaNm ?? Infinity) - (b.cpaNm ?? Infinity) || 0)
    || String(a.mmsi ?? a.id).localeCompare(String(b.mmsi ?? b.id));
}
export function targetStatus(t: AisPanelTarget): string {
  if (t.dataStatus === 'MISSING_OWN') return 'Sin posición/movimiento propio vigente';
  if (t.dataStatus === 'STALE_TARGET') return 'Objetivo caducado o sin hora';
  if (t.dataStatus === 'INVALID_TARGET' || t.cpaNm == null) return 'Datos incompletos o inválidos';
  if (finite(t.tcpaMinutes) && t.tcpaMinutes < 0) return 'CPA pasado · alejándose';
  if (t.tcpaMinutes == null) return 'Sin movimiento relativo';
  return t.isApproaching ? 'Aproximándose' : 'Sin convergencia';
}
export function formatCpa(t: AisPanelTarget): string {
  return finite(t.cpaNm) ? `${t.cpaNm.toFixed(2)} nm` : '—';
}
export function formatTcpa(t: AisPanelTarget): string {
  if (!finite(t.tcpaMinutes)) return '—';
  if (t.tcpaMinutes < 0) return 'Pasado';
  return t.tcpaMinutes < 1 ? '<1 min' : `${t.tcpaMinutes.toFixed(1)} min`;
}

/** Target motion remains drawable even when own-ship data cannot support CPA. */
export function aisDisplayMotion(t: AisPanelTarget, nowMs: number = Date.now()) {
  const course = finite(t.cog) && t.cog >= 0 && t.cog < 360 ? t.cog : null;
  const speed = finite(t.sog) && t.sog >= 0 && t.sog < 102.3 ? t.sog : null;
  const fresh = finite(t.timestamp) && nowMs - t.timestamp <= DEFAULT_AIS_ALARM_OPTIONS.staleAfterMs
    && t.timestamp <= nowMs + 5000 && t.dataStatus !== 'STALE_TARGET';
  return { course, speed, vectorAvailable: fresh && course !== null && speed !== null && speed > 0 };
}

export interface AisReferencePosition { lat: number; lng: number }
export function aisTargetPosition(target: AisPanelTarget): AisReferencePosition | null {
  const lng = target.lng ?? target.lon;
  return finite(target.lat) && Math.abs(target.lat) <= 90 && finite(lng) && Math.abs(lng) <= 180
    ? {lat: target.lat, lng} : null;
}
/** Received own-ship fix only. No saved port, chart centre or inferred zero position. */
export function aisTargetDistanceNm(own: AisReferencePosition | null, target: AisPanelTarget): number | null {
  const position = aisTargetPosition(target);
  if (!own || !finite(own.lat) || !finite(own.lng) || Math.abs(own.lat) > 90 || Math.abs(own.lng) > 180 || !position) return null;
  return GeoMath.distanceNM(own, position);
}
/** Compute each great-circle distance once per refresh, not on every sort comparison. */
export function sortTargetsByDistance(targets: readonly AisPanelTarget[], own: AisReferencePosition | null, options: CpaOptions) {
  return targets.map(target => ({ target, distanceNm: aisTargetDistanceNm(own, target) })).sort((a, b) => {
    if (a.distanceNm !== null && b.distanceNm === null) return -1;
    if (a.distanceNm === null && b.distanceNm !== null) return 1;
    return (a.distanceNm !== null && b.distanceNm !== null ? a.distanceNm - b.distanceNm : 0)
      || compareTargets(a.target, b.target, options);
  });
}
