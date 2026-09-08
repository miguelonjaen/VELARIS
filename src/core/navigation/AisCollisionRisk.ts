/**
 * PHASE 3 & 4: AIS Collision Risk & COLREG Tactical Adapter
 * 
 * Transforms raw AIS targets using:
 *   - Phase 1 (CollisionPrediction: ENU Projection & CPA/TCPA math)
 *   - Phase 2 (CollisionRiskEngine: Risk Level Classification)
 *   - Phase 4 (ColregRulesEngine: COLREG Decision & Maneuver Recommendation)
 * 
 * Flow:
 *   AIS RAW -> AisCollisionRisk -> CollisionPrediction -> CollisionRiskEngine -> ColregRulesEngine -> TacticalAisTarget
 * 
 * Strict Unidirectional Pipeline with zero circular dependencies.
 */

import { Vessel, calculateCollisionPrediction } from './CollisionPrediction';
import { calculateCollisionRisk, CollisionRiskLevel } from './CollisionRiskEngine';
import {
  ColregResult,
  ColregInput,
  MaritimeVesselType,
  calculateColregRule
} from './ColregRulesEngine';

/**
 * Default fallback ColregResult when telemetry is missing or invalid
 */
const DEFAULT_COLREG_RESULT: ColregResult = {
  classification: 'DATA_INSUFFICIENT',
  ruleReference: null,
  obligation: 'NONE',
  actionRecommendation: 'Sin datos suficientes para evaluación táctica COLREG.',
  confidence: 0.0,
  confidenceFactors: {
    c_gate: 0,
    f_sog: 0,
    f_time: 0,
    f_kin: 0,
    f_nav: 0,
    overall: 0
  },
  relativeBearing: 0,
  targetAspect: 0,
  deltaCog: 0,
  boundaryMarginDeg: null
};

/**
 * Maps raw AIS vessel type / classification to formal MaritimeVesselType
 * 
 * ITU-R M.1371 standard AIS ship type codes:
 * - 30: Fishing
 * - 31, 32: Towing / pushing
 * - 33: Dredging or underwater ops
 * - 34: Diving ops
 * - 35: Military ops
 * - 36: Sailing
 * - 37: Pleasure craft
 * - 40-49: High speed craft (HSC)
 * - 50: Pilot
 * - 51: Search and Rescue (SAR)
 * - 52: Tugs
 * - 53: Port tender
 * - 54: Anti-pollution
 * - 55: Law enforcement
 * - 60-69: Passenger ships
 * - 70-79: Cargo ships
 * - 80-89: Tankers
 * - 90-99: Other
 * 
 * @param rawType String, number or undefined from AIS static/dynamic message
 * @returns Formal MaritimeVesselType, strictly 'UNKNOWN' if not determinable
 */
export function mapToMaritimeVesselType(rawType: unknown): MaritimeVesselType {
  if (rawType === undefined || rawType === null) {
    return 'UNKNOWN';
  }

  // Handle numeric AIS type codes (number or string representation of number)
  const numType =
    typeof rawType === 'number'
      ? rawType
      : typeof rawType === 'string' && /^\d+$/.test(rawType.trim())
      ? parseInt(rawType.trim(), 10)
      : null;

  if (numType !== null) {
    if (numType === 30) return 'FISHING';
    if (numType === 36) return 'SAILING';
    if (numType === 31 || numType === 32 || numType === 33 || numType === 34) {
      return 'RESTRICTED_MANOEUVRABILITY';
    }
    if (numType === 35) return 'POWER_DRIVEN';
    if (numType === 37) return 'POWER_DRIVEN'; // Pleasure craft (unless sailing)
    if (numType >= 40 && numType <= 89) return 'POWER_DRIVEN';
    return 'UNKNOWN';
  }

  if (typeof rawType === 'string') {
    const s = rawType.toLowerCase().trim();
    if (!s) return 'UNKNOWN';

    // Sailing
    if (s.includes('sail') || s.includes('velero') || s.includes('vela')) {
      return 'SAILING';
    }
    // Fishing
    if (s.includes('fish') || s.includes('pesca') || s.includes('pesquero')) {
      return 'FISHING';
    }
    // Restricted Manoeuvrability (RAM)
    if (
      s.includes('restricted') ||
      s.includes('ram') ||
      s.includes('dredg') ||
      s.includes('tow') ||
      s.includes('remolqu')
    ) {
      return 'RESTRICTED_MANOEUVRABILITY';
    }
    // Constrained by Draught (CBD)
    if (
      s.includes('draught') ||
      s.includes('draft') ||
      s.includes('calado') ||
      s.includes('cbd')
    ) {
      return 'CONSTRAINED_BY_DRAUGHT';
    }
    // Not Under Command (NUC)
    if (
      s.includes('not under command') ||
      s.includes('nuc') ||
      s.includes('sin gobierno')
    ) {
      return 'NOT_UNDER_COMMAND';
    }
    // At Anchor / Moored / Aground
    if (
      s.includes('anchor') ||
      s.includes('fonde') ||
      s.includes('moored') ||
      s.includes('amarrad') ||
      s.includes('aground') ||
      s.includes('varad')
    ) {
      return 'AT_ANCHOR';
    }
    // Power-driven
    if (
      s.includes('cargo') ||
      s.includes('tanker') ||
      s.includes('passenger') ||
      s.includes('tug') ||
      s.includes('motor') ||
      s.includes('power') ||
      s.includes('propulsion') ||
      s.includes('mercante') ||
      s.includes('pleasure') ||
      s.includes('yacht') ||
      s.includes('ferry')
    ) {
      return 'POWER_DRIVEN';
    }
  }

  return 'UNKNOWN';
}

/**
 * AIS target with collision risk and COLREG tactical data
 */
export interface AisTargetWithRisk {
  // Original AIS data
  mmsi?: string | number;
  name?: string;
  nombre?: string;
  lat: number;
  lng?: number;
  lon?: number;  // Some targets use 'lon'
  cog: number;
  sog: number;
  heading?: number;
  vesselType?: string;
  tipo?: string;
  status?: string;
  timestamp?: number;
  
  // Collision prediction/risk data (Phases 1 & 2)
  riskLevel: CollisionRiskLevel;
  cpaNm: number | null;
  tcpaMinutes: number | null;
  closingSpeed: number;
  isApproaching: boolean;
  relativeBearing: number;

  // COLREG Decision & Maneuver Recommendation (Phase 4)
  colreg: ColregResult;
}

/**
 * Calculate collision risk and COLREG rule for an AIS target
 * 
 * @param ownShip Own vessel position and motion
 * @param target AIS target (may use 'lon' or 'lng')
 * @param now Reference time for TCPA calculation (defaults to now)
 * @returns Target enriched with collision prediction, risk level, and COLREG recommendation
 */
export function calculateAisTargetRisk<T extends Record<string, any>>(
  ownShip: Vessel | null,
  target: T,
  now: Date = new Date()
): T & {
  riskLevel: CollisionRiskLevel;
  cpaNm: number | null;
  tcpaMinutes: number | null;
  closingSpeed: number;
  isApproaching: boolean;
  relativeBearing: number;
  colreg: ColregResult;
} {
  // Default risk values
  const defaultRisk = {
    riskLevel: 'SAFE' as const,
    cpaNm: null as number | null,
    tcpaMinutes: null as number | null,
    closingSpeed: 0,
    isApproaching: false,
    relativeBearing: 0,
    colreg: DEFAULT_COLREG_RESULT
  };
  
  // Extract longitude from either 'lng' or 'lon'
  const targetLng = (target.lng ?? target.lon) as number | undefined;
  
  // Validate target position
  if (target.lat === undefined || targetLng === undefined) {
    return {
      ...target,
      ...defaultRisk
    };
  }
  
  // Validate target motion data
  if (
    typeof target.cog !== 'number' || !Number.isFinite(target.cog) ||
    typeof target.sog !== 'number' || !Number.isFinite(target.sog)
  ) {
    return {
      ...target,
      ...defaultRisk
    };
  }
  
  // Validate own ship
  if (!ownShip) {
    return {
      ...target,
      ...defaultRisk
    };
  }
  
  // Both vessels must have valid positions and motion data
  if (
    !Number.isFinite(ownShip.lat) || !Number.isFinite(ownShip.lng) ||
    !Number.isFinite(ownShip.sog) || !Number.isFinite(ownShip.cog) ||
    !Number.isFinite(target.lat) || !Number.isFinite(targetLng) ||
    !Number.isFinite(target.cog)
  ) {
    return {
      ...target,
      ...defaultRisk
    };
  }
  
  // Create vessel objects for prediction engine
  const ownVessel: Vessel = {
    lat: ownShip.lat,
    lng: ownShip.lng,
    sog: ownShip.sog,
    cog: ownShip.cog
  };
  
  const targetVessel: Vessel = {
    lat: target.lat,
    lng: targetLng,
    sog: target.sog,
    cog: target.cog
  };
  
  // Phase 1: Calculate collision prediction
  const prediction = calculateCollisionPrediction(ownVessel, targetVessel, now);
  
  // Phase 2: Classify risk
  const risk = calculateCollisionRisk(prediction);

  // Phase 4: Construct ColregInput and calculate COLREG rule
  const colregInput: ColregInput = {
    ownShip: {
      lat: ownShip.lat,
      lng: ownShip.lng,
      sog: ownShip.sog,
      cog: ownShip.cog,
      vesselType: 'POWER_DRIVEN',
      heading: (ownShip as any).heading
    },
    target: {
      lat: target.lat,
      lng: targetLng,
      sog: target.sog,
      cog: target.cog,
      vesselType: mapToMaritimeVesselType(target.vesselType ?? target.tipo ?? target.type),
      heading: target.heading,
      timestamp: target.timestamp,
      navStatus: target.status ?? target.navStatus
    },
    prediction: {
      cpaNm: prediction.cpaNm,
      tcpaHours: prediction.tcpaHours,
      closingSpeed: prediction.closingSpeed,
      isApproaching: prediction.isApproaching,
      relativeBearing: prediction.relativeBearing
    },
    riskLevel: risk.level
  };

  const colreg = calculateColregRule(colregInput, now);
  
  return {
    ...target,
    riskLevel: risk.level,
    cpaNm: risk.cpaNm,
    tcpaMinutes: risk.tcpaMinutes,
    closingSpeed: risk.closingSpeed,
    isApproaching: risk.isApproaching,
    relativeBearing: prediction.relativeBearing,
    colreg
  };
}

/**
 * Enrich multiple AIS targets with collision risk and COLREG tactical recommendation
 * 
 * @param ownShip Own vessel position and motion
 * @param targets Array of AIS targets
 * @param now Reference time (defaults to now)
 * @returns Array of targets enriched with risk and COLREG data
 */
export function enrichAisTargetsWithRisk<T extends Record<string, any>>(
  ownShip: Vessel | null,
  targets: T[],
  now: Date = new Date()
): Array<T & {
  riskLevel: CollisionRiskLevel;
  cpaNm: number | null;
  tcpaMinutes: number | null;
  closingSpeed: number;
  isApproaching: boolean;
  relativeBearing: number;
  colreg: ColregResult;
}> {
  return targets.map(target => calculateAisTargetRisk(ownShip, target, now));
}

/**
 * Map collision risk level to visual color
 * 
 * @param riskLevel Risk level from CollisionRiskEngine
 * @returns Hex color code
 */
export function getRiskColor(riskLevel: CollisionRiskLevel): string {
  const colorMap: Record<CollisionRiskLevel, string> = {
    'SAFE': '#22c55e',      // Green
    'CAUTION': '#facc15',   // Yellow
    'WARNING': '#f97316',   // Orange
    'CRITICAL': '#ef4444'   // Red
  };
  return colorMap[riskLevel];
}

/**
 * Check if a risk level requires alert/monitoring
 */
export function isRiskAlert(riskLevel: CollisionRiskLevel): boolean {
  return riskLevel !== 'SAFE';
}
