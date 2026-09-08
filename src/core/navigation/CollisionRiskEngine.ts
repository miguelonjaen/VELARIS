/**
 * PHASE 2: Collision Risk Engine
 * 
 * Pure mathematical motor for AIS collision risk classification.
 * 
 * Transforms CPA, TCPA, and closingSpeed from CollisionPrediction into risk levels:
 * SAFE → CAUTION → WARNING → CRITICAL
 * 
 * No dependencies on React, Supabase, AISStream, App state, DOM, or Leaflet.
 * 
 * Key principle: Risk is NOT determined by CPA alone.
 * A distant target approaching slowly is SAFE.
 * A nearby target already receding is SAFE (not CRITICAL).
 * A moderately-distant target with very short TCPA may be WARNING/CRITICAL.
 */

import { CollisionPredictionResult } from './CollisionPrediction';

/**
 * Risk level classification
 */
export type CollisionRiskLevel = 'SAFE' | 'CAUTION' | 'WARNING' | 'CRITICAL';

/**
 * Configurable thresholds for risk classification
 * Default values are conservative for recreational/coastal navigation
 */
export interface CollisionRiskThresholds {
  /** CPA threshold for CAUTION level (nautical miles) */
  cautionCpaNm: number;
  
  /** CPA threshold for WARNING level (nautical miles) */
  warningCpaNm: number;
  
  /** CPA threshold for CRITICAL level (nautical miles) */
  criticalCpaNm: number;
  
  /** TCPA threshold for CAUTION level (minutes) */
  cautionTcpaMinutes: number;
  
  /** TCPA threshold for WARNING level (minutes) */
  warningTcpaMinutes: number;
  
  /** TCPA threshold for CRITICAL level (minutes) */
  criticalTcpaMinutes: number;
  
  /** Minimum closing speed to be considered significantly converging (knots) */
  minimumClosingSpeedKn: number;
  
  /** If CPA <= this AND target is very close despite receding, maintain minimum risk level (NM) */
  immediateDangerCpaNm?: number;
}

/**
 * Result of collision risk classification
 */
export interface CollisionRiskResult {
  /** Risk level: SAFE, CAUTION, WARNING, or CRITICAL */
  level: CollisionRiskLevel;
  
  /** Closest Point of Approach (NM) */
  cpaNm: number | null;
  
  /** Time to Closest Point of Approach (minutes) */
  tcpaMinutes: number | null;
  
  /** Closing speed (NM/h, > 0 means approaching) */
  closingSpeed: number;
  
  /** Are we approaching? */
  isApproaching: boolean;
  
  /** Brief technical reason for the classification */
  reason: string;
}

/**
 * Default thresholds: conservative for recreational/coastal navigation
 * Suitable for small vessels in European waters
 */
export const DEFAULT_RISK_THRESHOLDS: CollisionRiskThresholds = {
  cautionCpaNm: 2.0,          // Alert if within 2 NM and approaching
  warningCpaNm: 1.0,          // Warning if within 1 NM and approaching quickly
  criticalCpaNm: 0.5,         // Critical if within 0.5 NM and approaching
  
  cautionTcpaMinutes: 30,     // Alert if collision in less than 30 minutes
  warningTcpaMinutes: 20,     // Warning if collision in less than 20 minutes
  criticalTcpaMinutes: 10,    // Critical if collision in less than 10 minutes
  
  minimumClosingSpeedKn: 0.5, // Must close at more than 0.5 knots to be significant
  
  immediateDangerCpaNm: 0.25  // If extremely close (< 0.25 NM / ~460m), maintain minimum caution
};

/**
 * Classify collision risk based on prediction results
 * 
 * Logic (evaluated in order, highest risk first):
 * 
 * 1. If NOT approaching → SAFE
 *    (Exception: if CPA <= immediateDangerCpaNm, use CAUTION as minimum)
 * 
 * 2. If TCPA is null → SAFE (no future convergence)
 * 
 * 3. If closing speed too low → SAFE (not significantly converging)
 * 
 * 4. If CPA <= critical AND TCPA <= critical → CRITICAL
 * 
 * 5. If CPA <= warning AND TCPA <= warning → WARNING
 * 
 * 6. If CPA <= caution AND TCPA <= caution → CAUTION
 * 
 * 7. Default → SAFE
 * 
 * @param prediction Result from CollisionPrediction.calculateCollisionPrediction()
 * @param thresholds Risk thresholds (defaults to DEFAULT_RISK_THRESHOLDS)
 * @returns Risk classification result
 */
export function calculateCollisionRisk(
  prediction: CollisionPredictionResult,
  thresholds: CollisionRiskThresholds = DEFAULT_RISK_THRESHOLDS
): CollisionRiskResult {
  
  // Convert TCPA from hours to minutes for comparison with thresholds
  const tcpaMinutes = prediction.tcpaHours !== null
    ? prediction.tcpaHours * 60
    : null;
  
  // Extract values for easier reading
  const cpaNm = prediction.cpaNm;
  const closingSpeed = prediction.closingSpeed;
  const isApproaching = prediction.isApproaching;
  const immediateDanger = thresholds.immediateDangerCpaNm ?? 0.3;
  
  // RULE 1: Not approaching
  if (!isApproaching) {
    // Exception: if extremely close, maintain minimum alert
    if (cpaNm !== null && cpaNm <= immediateDanger) {
      return {
        level: 'CAUTION',
        cpaNm,
        tcpaMinutes,
        closingSpeed,
        isApproaching,
        reason: `Immediate vicinity (${cpaNm.toFixed(2)} NM), no active convergence`
      };
    }
    
    return {
      level: 'SAFE',
      cpaNm,
      tcpaMinutes,
      closingSpeed,
      isApproaching,
      reason: 'No active convergence'
    };
  }
  
  // RULE 2: No future convergence point
  if (tcpaMinutes === null) {
    // Exception: if extremely close, maintain minimum alert
    if (cpaNm !== null && cpaNm <= immediateDanger) {
      return {
        level: 'CAUTION',
        cpaNm,
        tcpaMinutes,
        closingSpeed,
        isApproaching,
        reason: `Immediate vicinity (${cpaNm.toFixed(2)} NM), convergence unclear`
      };
    }
    
    return {
      level: 'SAFE',
      cpaNm,
      tcpaMinutes,
      closingSpeed,
      isApproaching,
      reason: 'No convergence point computed'
    };
  }
  
  // RULE 3: Closing speed too low to be significant
  if (closingSpeed <= thresholds.minimumClosingSpeedKn) {
    return {
      level: 'SAFE',
      cpaNm,
      tcpaMinutes,
      closingSpeed,
      isApproaching,
      reason: `Low closing speed (${closingSpeed.toFixed(2)} NM/h)`
    };
  }
  
  // RULES 4-6: Evaluate against thresholds (highest risk first)
  
  // CRITICAL: CPA and TCPA both within critical thresholds
  if (
    cpaNm !== null && cpaNm <= thresholds.criticalCpaNm &&
    tcpaMinutes <= thresholds.criticalTcpaMinutes
  ) {
    return {
      level: 'CRITICAL',
      cpaNm,
      tcpaMinutes,
      closingSpeed,
      isApproaching,
      reason: `CPA ${cpaNm.toFixed(2)} NM / TCPA ${tcpaMinutes.toFixed(1)} min`
    };
  }
  
  // WARNING: CPA and TCPA both within warning thresholds
  if (
    cpaNm !== null && cpaNm <= thresholds.warningCpaNm &&
    tcpaMinutes <= thresholds.warningTcpaMinutes
  ) {
    return {
      level: 'WARNING',
      cpaNm,
      tcpaMinutes,
      closingSpeed,
      isApproaching,
      reason: `CPA ${cpaNm.toFixed(2)} NM / TCPA ${tcpaMinutes.toFixed(1)} min`
    };
  }
  
  // CAUTION: CPA and TCPA both within caution thresholds
  if (
    cpaNm !== null && cpaNm <= thresholds.cautionCpaNm &&
    tcpaMinutes <= thresholds.cautionTcpaMinutes
  ) {
    return {
      level: 'CAUTION',
      cpaNm,
      tcpaMinutes,
      closingSpeed,
      isApproaching,
      reason: `CPA ${cpaNm.toFixed(2)} NM / TCPA ${tcpaMinutes.toFixed(1)} min`
    };
  }
  
  // RULE 7: Default to SAFE if no thresholds triggered
  return {
    level: 'SAFE',
    cpaNm,
    tcpaMinutes,
    closingSpeed,
    isApproaching,
    reason: 'Below alert thresholds'
  };
}

/**
 * Get a simple numeric severity score for sorting/comparison
 * Useful for determining which contact to display first in alerts
 * 
 * SAFE=0, CAUTION=1, WARNING=2, CRITICAL=3
 */
export function getRiskSeverity(level: CollisionRiskLevel): number {
  const severityMap: Record<CollisionRiskLevel, number> = {
    'SAFE': 0,
    'CAUTION': 1,
    'WARNING': 2,
    'CRITICAL': 3
  };
  return severityMap[level];
}

/**
 * Determine if a risk level requires active monitoring/alerts
 */
export function isRiskLevelAlert(level: CollisionRiskLevel): boolean {
  return level !== 'SAFE';
}
