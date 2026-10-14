/**
 * AIS Collision Alarm (CPA/TCPA)
 *
 * Capa de decisión de alarma sobre blancos AIS ya enriquecidos por
 * AisCollisionRisk (riskLevel, cpaNm, tcpaMinutes, isApproaching, relativeBearing).
 *
 * Responsabilidad única: decidir SI hay alarma, con QUÉ severidad y sobre QUÉ blanco.
 * No calcula CPA/TCPA (eso es CollisionPrediction) ni clasifica riesgo
 * (eso es CollisionRiskEngine). Sin React, Supabase, DOM ni estado global.
 *
 * Reglas:
 *   - riskLevel CRITICAL                                  -> 'critical'
 *   - riskLevel WARNING                                   -> 'warning'
 *   - Anillo de seguridad del usuario (minCPA):
 *       isApproaching && CPA < minCpaNm && TCPA <= maxTcpaMinutes -> 'critical'
 *   - riskLevel CAUTION por sí solo NO dispara alarma (solo visual en carta).
 *   - Blancos alejándose, sin TCPA o parados respecto a nosotros NO disparan
 *     el anillo (evita falsos positivos en puerto/fondeo con barcos amarrados).
 *   - Blancos con timestamp (ms epoch) más antiguo que staleAfterMs se ignoran.
 *
 * Selección del blanco más peligroso: severidad desc -> TCPA asc -> CPA asc.
 */

import { CollisionRiskLevel } from './CollisionRiskEngine';

export type AisCollisionAlarmSeverity = 'warning' | 'critical';

export interface AisCollisionAlarmOptions {
  /** Anillo de seguridad del usuario (NM). Corresponde a SecurityThresholds.minCPA */
  minCpaNm: number;
  /** Horizonte temporal del anillo de seguridad (min) */
  maxTcpaMinutes: number;
  /** Antigüedad máxima de un blanco con timestamp (ms) */
  staleAfterMs: number;
}

export const DEFAULT_AIS_ALARM_OPTIONS: AisCollisionAlarmOptions = {
  minCpaNm: 0.27,
  maxTcpaMinutes: 30,
  staleAfterMs: 3 * 60 * 1000
};

export interface AisCollisionAlarmTarget {
  mmsi?: string | number;
  id?: string | number;
  nombre?: string;
  name?: string;
  riskLevel?: CollisionRiskLevel;
  cpaNm?: number | null;
  tcpaMinutes?: number | null;
  isApproaching?: boolean;
  relativeBearing?: number;
  timestamp?: number;
}

export interface AisCollisionAlarmResult {
  severity: AisCollisionAlarmSeverity | null;
  targetId: string | null;
  targetName: string | null;
  cpaNm: number | null;
  tcpaMinutes: number | null;
  bearing: number | null;
  /** Nº de blancos que disparan alarma (incluido el seleccionado) */
  dangerousCount: number;
  /** Texto listo para VELARISAlarm.message (null si no hay alarma) */
  message: string | null;
  /** Motivo técnico breve (depuración) */
  reason: string;
}

const NO_ALARM = (reason: string): AisCollisionAlarmResult => ({
  severity: null,
  targetId: null,
  targetName: null,
  cpaNm: null,
  tcpaMinutes: null,
  bearing: null,
  dangerousCount: 0,
  message: null,
  reason
});

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

/** Timestamps en ms epoch (> año 2001). Otros formatos no se usan para descartar. */
function isStale(target: AisCollisionAlarmTarget, nowMs: number, staleAfterMs: number): boolean {
  const ts = target.timestamp;
  if (!isFiniteNumber(ts) || ts < 1e12) return false;
  return nowMs - ts > staleAfterMs;
}

export function classifyAisTargetAlarm(
  target: AisCollisionAlarmTarget,
  options: AisCollisionAlarmOptions = DEFAULT_AIS_ALARM_OPTIONS
): AisCollisionAlarmSeverity | null {
  if (target.riskLevel === 'CRITICAL') return 'critical';

  const cpa = target.cpaNm;
  const tcpa = target.tcpaMinutes;
  const insideSafetyRing =
    target.isApproaching === true &&
    isFiniteNumber(cpa) && cpa < options.minCpaNm &&
    isFiniteNumber(tcpa) && tcpa >= 0 && tcpa <= options.maxTcpaMinutes;

  if (insideSafetyRing) return 'critical';
  if (target.riskLevel === 'WARNING') return 'warning';
  return null;
}

function severityRank(s: AisCollisionAlarmSeverity): number {
  return s === 'critical' ? 2 : 1;
}

function formatBearing(b: number): string {
  const n = ((Math.round(b) % 360) + 360) % 360;
  return String(n).padStart(3, '0') + '°';
}

export function formatAisCollisionMessage(
  severity: AisCollisionAlarmSeverity,
  name: string,
  cpaNm: number | null,
  tcpaMinutes: number | null,
  bearing: number | null,
  extraTargets: number
): string {
  const parts = [
    (severity === 'critical' ? 'PELIGRO COLISIÓN: ' : 'RIESGO COLISIÓN: ') + name
  ];
  if (isFiniteNumber(cpaNm)) parts.push('CPA ' + cpaNm.toFixed(2) + ' NM');
  if (isFiniteNumber(tcpaMinutes)) parts.push('TCPA ' + tcpaMinutes.toFixed(1) + ' min');
  if (isFiniteNumber(bearing)) parts.push('Dem ' + formatBearing(bearing));
  let msg = parts.join(' · ');
  if (extraTargets > 0) msg += ' (+' + extraTargets + ')';
  return msg;
}

export function evaluateAisCollisionAlarm(
  targets: AisCollisionAlarmTarget[],
  options: AisCollisionAlarmOptions = DEFAULT_AIS_ALARM_OPTIONS,
  nowMs: number = Date.now()
): AisCollisionAlarmResult {
  if (!Array.isArray(targets) || targets.length === 0) {
    return NO_ALARM('Sin blancos AIS');
  }

  const candidates: Array<{ target: AisCollisionAlarmTarget; severity: AisCollisionAlarmSeverity }> = [];
  for (const target of targets) {
    if (!target || isStale(target, nowMs, options.staleAfterMs)) continue;
    const severity = classifyAisTargetAlarm(target, options);
    if (severity) candidates.push({ target, severity });
  }

  if (candidates.length === 0) {
    return NO_ALARM('Ningún blanco supera umbrales CPA/TCPA');
  }

  candidates.sort((a, b) => {
    const bySeverity = severityRank(b.severity) - severityRank(a.severity);
    if (bySeverity !== 0) return bySeverity;
    const ta = isFiniteNumber(a.target.tcpaMinutes) ? a.target.tcpaMinutes : Infinity;
    const tb = isFiniteNumber(b.target.tcpaMinutes) ? b.target.tcpaMinutes : Infinity;
    if (ta !== tb) return ta - tb;
    const ca = isFiniteNumber(a.target.cpaNm) ? a.target.cpaNm : Infinity;
    const cb = isFiniteNumber(b.target.cpaNm) ? b.target.cpaNm : Infinity;
    return ca - cb;
  });

  const { target, severity } = candidates[0];
  const targetId = String(target.mmsi ?? target.id ?? 'AIS');
  const targetName = String(target.nombre || target.name || target.mmsi || target.id || 'AIS');
  const cpaNm = isFiniteNumber(target.cpaNm) ? target.cpaNm : null;
  const tcpaMinutes = isFiniteNumber(target.tcpaMinutes) ? target.tcpaMinutes : null;
  const bearing = isFiniteNumber(target.relativeBearing) ? target.relativeBearing : null;

  return {
    severity,
    targetId,
    targetName,
    cpaNm,
    tcpaMinutes,
    bearing,
    dangerousCount: candidates.length,
    message: formatAisCollisionMessage(severity, targetName, cpaNm, tcpaMinutes, bearing, candidates.length - 1),
    reason: target.riskLevel === 'CRITICAL' || target.riskLevel === 'WARNING'
      ? 'riskLevel=' + target.riskLevel
      : 'anillo de seguridad CPA < ' + options.minCpaNm + ' NM'
  };
}
