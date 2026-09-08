/**
 * PHASE 4: COLREG Rules Engine (International Regulations for Preventing Collisions at Sea)
 * 
 * Pure mathematical domain engine for COLREG classification and tactical maneuver recommendations.
 * 
 * Decoupled from React, Leaflet, Electron, UI, DOM, and network adapters.
 * 
 * Flow:
 *   ColregInput (OwnShip, Target, Prediction, RiskLevel)
 *     -> calculateDataConfidence() (Data quality metrics)
 *     -> Kinetic & Precondition Checks (Safety, SOG thresholds)
 *     -> COLREG Geometric Decision Matrix (Rules 13, 18, 14, 15)
 *     -> ColregResult (Classification, Obligation, Action, Confidence)
 */

import { CollisionRiskLevel } from './CollisionRiskEngine';

/**
 * Vessel navigation categories under COLREG Rule 3 / Rule 18
 */
export type MaritimeVesselType =
  | 'POWER_DRIVEN'                 // Power-driven vessel under way (Buque de propulsión mecánica)
  | 'SAILING'                      // Sailing vessel under way (Buque de vela)
  | 'FISHING'                      // Vessel engaged in fishing (Buque dedicado a la pesca)
  | 'RESTRICTED_MANOEUVRABILITY'   // Vessel restricted in her ability to manoeuvre (RAM)
  | 'CONSTRAINED_BY_DRAUGHT'       // Vessel constrained by her draught (CBD)
  | 'NOT_UNDER_COMMAND'            // Vessel not under command (NUC - Sin gobierno)
  | 'AT_ANCHOR'                    // Vessel at anchor / moored / aground (Fondeado / varado)
  | 'UNKNOWN';                     // Category unknown or not transmitted

/**
 * Tactical navigation obligation for own ship under COLREG Part B
 */
export type ColregObligation =
  | 'GIVE_WAY'   // Cede el paso: Obliged to keep out of the way (Regla 16)
  | 'STAND_ON'   // Con preferencia: Obliged to keep course and speed (Regla 17)
  | 'CAUTION'    // Precaución / vigilancia defensiva
  | 'NONE';      // Sin obligación (sin riesgo de colisión)

/**
 * Standard COLREG situational classification
 */
export type ColregClassification =
  | 'HEAD_ON'                  // Rule 14: Meeting situation (Vuelta encontrada)
  | 'OVERTAKING_GIVE_WAY'      // Rule 13: Own ship is overtaking (Buque propio alcanza)
  | 'OVERTAKEN_STAND_ON'       // Rule 13: Target is overtaking own ship (Blanco nos alcanza)
  | 'CROSSING_GIVE_WAY'        // Rule 15: Crossing situation - target on starboard (Cruce por estribor)
  | 'CROSSING_STAND_ON'        // Rule 15: Crossing situation - target on port (Cruce por babor)
  | 'RULE_18_GIVE_WAY'         // Rule 18: Own ship must give way to privileged category
  | 'RULE_18_STAND_ON'         // Rule 18: Own ship has privilege over power-driven vessel
  | 'STATIONARY_TARGET'        // Target has SOG < 0.5 kn (Obstacle / vessel without headway)
  | 'NOT_APPLICABLE'           // No risk of collision (SAFE, diverging, or lateral separation)
  | 'DATA_INSUFFICIENT'        // Data confidence < 0.65 or corrupt telemetry
  | 'UNDETERMINED';            // Telemetry valid but geometric/category parameters inconclusive

/**
 * Telemetry data for a single vessel in COLREG evaluation
 */
export interface ColregVesselData {
  lat: number;
  lng: number;
  sog: number;                  // Knots
  cog: number;                  // Degrees (0-359.9°)
  vesselType?: MaritimeVesselType;
  heading?: number;             // Magnetic/True compass heading (degrees)
  timestamp?: number;           // Epoch timestamp in milliseconds
  navStatus?: string;           // AIS navigational status string or code
}

/**
 * Prediction summary required for COLREG evaluation
 */
export interface ColregPredictionData {
  cpaNm: number | null;         // Distance at CPA in NM
  tcpaHours: number | null;     // Time to CPA in hours
  closingSpeed: number;         // Knots (>0 = approaching)
  isApproaching: boolean;
  relativeBearing: number;      // Degrees (0-359.9°)
}

/**
 * Complete input structure for the COLREG Rules Engine
 */
export interface ColregInput {
  ownShip: ColregVesselData;
  target: ColregVesselData;
  prediction: ColregPredictionData;
  riskLevel: CollisionRiskLevel;
}

/**
 * Decomposition of Data Confidence factors
 */
export interface DataConfidenceFactors {
  c_gate: number;               // 1 if all primitive numeric fields are valid and finite, 0 otherwise
  f_sog: number;                // Speed sufficiency (0.0 - 1.0)
  f_time: number;               // Data freshness (0.0 - 1.0)
  f_kin: number;                // Kinematic sanity of CPA/TCPA (0.0 - 1.0)
  f_nav: number;                // Navigational status quality (0.0 - 1.0)
  overall: number;              // Weighted product score in range [0.0, 1.0]
}

/**
 * Comprehensive result of COLREG classification
 */
export interface ColregResult {
  /** Situational classification */
  classification: ColregClassification;

  /** Regulatory reference (e.g., 'Regla 14 (Vuelta encontrada)') */
  ruleReference: string | null;

  /** Maneuver obligation for own ship */
  obligation: ColregObligation;

  /** Tactical recommendation narrative for the Almirante */
  actionRecommendation: string;

  /** Data confidence score in range [0.0, 1.0] */
  confidence: number;

  /** Detailed breakdown of confidence factors */
  confidenceFactors: DataConfidenceFactors;

  /** Relative bearing of target from own ship (0-359.9°) */
  relativeBearing: number;

  /** Target aspect angle (relative bearing of own ship seen from target bow, 0-359.9°) */
  targetAspect: number;

  /** Course difference (target.cog - ownShip.cog, 0-359.9°) */
  deltaCog: number;

  /** Angular distance in degrees to nearest regulatory boundary (informative) */
  boundaryMarginDeg: number | null;
}

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const NM_PER_DEG_LAT = 60;

/** Minimum acceptable Data Confidence threshold */
export const MIN_DATA_CONFIDENCE_THRESHOLD = 0.65;

/** Minimum SOG (knots) for a vessel to be considered under command with a stable heading vector */
export const MIN_STEERAGE_SOG_KN = 0.5;

/**
 * Normalizes an angle into the range [0, 360) degrees
 */
export function normalize360(deg: number): number {
  let a = deg % 360;
  if (a < 0) a += 360;
  return Object.is(a, -0) ? 0 : (a >= 360 ? 0 : a);
}

/**
 * Normalizes an angular difference into the signed range [-180, +180] degrees
 */
export function normalizeSigned(deg: number): number {
  let a = normalize360(deg);
  if (a > 180) {
    a -= 360;
  }
  return a;
}

/**
 * Evaluates the Data Confidence of the telemetry input
 * 
 * Formula: C_data = C_gate * (0.35 * f_sog + 0.25 * f_time + 0.25 * f_kin + 0.15 * f_nav)
 * 
 * @param input Complete COLREG input
 * @param now Reference timestamp (defaults to current time)
 * @returns Breakdown of confidence factors and overall score
 */
export function calculateDataConfidence(
  input: ColregInput,
  now: Date = new Date()
): DataConfidenceFactors {
  const { ownShip, target, prediction } = input;

  // 1. Binary Gate (C_gate)
  const isCoordValid =
    Number.isFinite(ownShip.lat) &&
    Number.isFinite(ownShip.lng) &&
    Number.isFinite(target.lat) &&
    Number.isFinite(target.lng) &&
    Math.abs(ownShip.lat) <= 90 &&
    Math.abs(target.lat) <= 90 &&
    Math.abs(ownShip.lng) <= 180 &&
    Math.abs(target.lng) <= 180;

  const isMotionValid =
    Number.isFinite(ownShip.sog) &&
    Number.isFinite(ownShip.cog) &&
    Number.isFinite(target.sog) &&
    Number.isFinite(target.cog) &&
    ownShip.sog >= 0 &&
    target.sog >= 0 &&
    ownShip.cog >= 0 &&
    ownShip.cog < 360 &&
    target.cog >= 0 &&
    target.cog < 360;

  const c_gate = isCoordValid && isMotionValid ? 1.0 : 0.0;
  if (c_gate === 0.0) {
    return {
      c_gate: 0.0,
      f_sog: 0.0,
      f_time: 0.0,
      f_kin: 0.0,
      f_nav: 0.0,
      overall: 0.0
    };
  }

  // 2. Speed Sufficiency (f_sog) - Weight 0.35
  const minSog = Math.min(ownShip.sog, target.sog);
  let f_sog = 0.0;
  if (minSog < MIN_STEERAGE_SOG_KN) {
    f_sog = 0.0;
  } else if (minSog < 2.5) {
    f_sog = Math.min(1.0, (minSog - MIN_STEERAGE_SOG_KN) / 2.0);
  } else {
    f_sog = 1.0;
  }

  // 3. Temporal Freshness (f_time) - Weight 0.25
  let f_time = 0.85; // Neutral baseline if no timestamp provided
  let isCriticallyStale = false;
  if (typeof target.timestamp === 'number' && Number.isFinite(target.timestamp)) {
    const deltaSeconds = Math.max(0, (now.getTime() - target.timestamp) / 1000);
    if (deltaSeconds <= 30) {
      f_time = 1.0;
    } else if (deltaSeconds <= 180) {
      f_time = Math.max(0.0, 1.0 - (deltaSeconds - 30) / 150);
    } else {
      f_time = 0.0;
      isCriticallyStale = true; // Telemetry older than 3 minutes (180s) is critically obsolete
    }
  }

  // 4. Kinematic Sanity (f_kin) - Weight 0.25
  let f_kin = 0.0;
  if (
    prediction.cpaNm !== null &&
    Number.isFinite(prediction.cpaNm) &&
    prediction.closingSpeed > 0 &&
    prediction.tcpaHours !== null &&
    prediction.tcpaHours > 0
  ) {
    f_kin = 1.0;
  } else if (prediction.cpaNm !== null && Number.isFinite(prediction.cpaNm)) {
    f_kin = 0.70; // Non-approaching or parallel, but valid CPA geometry
  } else {
    f_kin = 0.0;
  }

  // 5. Navigational Status (f_nav) - Weight 0.15
  let f_nav = 0.90; // Default standard
  const statusStr = (target.navStatus || '').toLowerCase();
  if (
    statusStr.includes('engine') ||
    statusStr.includes('sailing') ||
    statusStr === '0' ||
    statusStr === '8'
  ) {
    f_nav = 1.0;
  } else if (
    statusStr.includes('fishing') ||
    statusStr.includes('restricted') ||
    statusStr === '1' ||
    statusStr === '2'
  ) {
    f_nav = 0.5;
  } else if (
    statusStr.includes('anchor') ||
    statusStr.includes('moored') ||
    statusStr.includes('aground') ||
    statusStr === '5'
  ) {
    f_nav = 0.3;
  }

  // Critical Staleness Gate: If data is older than 180s, invalidate confidence completely
  if (isCriticallyStale) {
    return {
      c_gate: 0.0,
      f_sog: Number(f_sog.toFixed(4)),
      f_time: 0.0,
      f_kin: Number(f_kin.toFixed(4)),
      f_nav: Number(f_nav.toFixed(4)),
      overall: 0.0
    };
  }

  const overall =
    c_gate * (0.35 * f_sog + 0.25 * f_time + 0.25 * f_kin + 0.15 * f_nav);

  return {
    c_gate,
    f_sog: Number(f_sog.toFixed(4)),
    f_time: Number(f_time.toFixed(4)),
    f_kin: Number(f_kin.toFixed(4)),
    f_nav: Number(f_nav.toFixed(4)),
    overall: Number(overall.toFixed(4))
  };
}

/**
 * Calculates True Bearing (Line of Sight) from OwnShip to Target using local ENU projection
 */
function calculateTrueBearing(own: ColregVesselData, tgt: ColregVesselData): number {
  const dLat = tgt.lat - own.lat;
  const dLng = tgt.lng - own.lng;
  const north = dLat * NM_PER_DEG_LAT;
  const avgLatRad = ((own.lat + tgt.lat) / 2) * DEG_TO_RAD;
  const east = dLng * NM_PER_DEG_LAT * Math.cos(avgLatRad);

  const angleRad = Math.atan2(east, north);
  return normalize360(angleRad * RAD_TO_DEG);
}

/**
 * Pure domain motor for COLREG classification and maneuver recommendation
 * 
 * @param input Complete COLREG evaluation input
 * @param now Reference timestamp (defaults to current time)
 * @returns Deterministic COLREG classification result
 */
export function calculateColregRule(
  input: ColregInput,
  now: Date = new Date()
): ColregResult {
  const { ownShip, target, prediction, riskLevel } = input;

  // 1. Data Confidence Evaluation
  const confidenceFactors = calculateDataConfidence(input, now);
  const confidence = confidenceFactors.overall;

  // Calculate Geometry Angles
  const trueBearing = calculateTrueBearing(ownShip, target);
  const trueBearingRev = normalize360(trueBearing + 180);
  const relativeBearing = normalize360(trueBearing - ownShip.cog);
  const targetAspect = normalize360(trueBearingRev - target.cog);
  const deltaCog = normalize360(target.cog - ownShip.cog);

  // 2. Layer 1 Check: Data Confidence Threshold
  if (confidence < MIN_DATA_CONFIDENCE_THRESHOLD) {
    return {
      classification: 'DATA_INSUFFICIENT',
      ruleReference: null,
      obligation: 'CAUTION',
      actionRecommendation:
        'Calidad o frescura de telemetría insuficiente para determinar situación COLREG. Mantener vigilancia visual reforzada.',
      confidence,
      confidenceFactors,
      relativeBearing,
      targetAspect,
      deltaCog,
      boundaryMarginDeg: null
    };
  }

  // 3. Layer 2 Check: Kinetic Risk & Collision Applicability (CPA >= 2.0 NM is safe/not applicable)
  const isSafeOrReceding =
    riskLevel === 'SAFE' ||
    prediction.closingSpeed <= 0 ||
    prediction.tcpaHours === null ||
    prediction.tcpaHours <= 0 ||
    (prediction.cpaNm !== null && prediction.cpaNm >= 2.0);

  if (isSafeOrReceding) {
    return {
      classification: 'NOT_APPLICABLE',
      ruleReference: null,
      obligation: 'NONE',
      actionRecommendation:
        'Sin riesgo apreciable de abordaje. Mantener derrota y velocidad actuales.',
      confidence,
      confidenceFactors,
      relativeBearing,
      targetAspect,
      deltaCog,
      boundaryMarginDeg: null
    };
  }

  // 4. Layer 3 Check: Stationary Target Precondition (SOG < 0.5 kn)
  if (target.sog < MIN_STEERAGE_SOG_KN) {
    return {
      classification: 'STATIONARY_TARGET',
      ruleReference: 'Regla 2 (Buena práctica marinera)',
      obligation: 'GIVE_WAY',
      actionRecommendation:
        'Blanco sin arrancada apreciable (SOG < 0.5 kn). Maniobrar con resguardo amplio evitando aproximación.',
      confidence,
      confidenceFactors,
      relativeBearing,
      targetAspect,
      deltaCog,
      boundaryMarginDeg: null
    };
  }

  // Normalize vessel categories (default to POWER_DRIVEN if unspecified)
  const ownType: MaritimeVesselType = ownShip.vesselType || 'POWER_DRIVEN';
  const targetType: MaritimeVesselType = target.vesselType || 'POWER_DRIVEN';

  // 5. Layer 4: Rule 13 (Overtaking / Alcance) - UNIVERSAL PREVALENCE
  // Sternlight sector: 112.5° to 247.5° (22.5° abaft the beam on either side)
  const isInTargetSternSector = targetAspect >= 112.5 && targetAspect <= 247.5;
  const isTargetInOwnSternSector = relativeBearing >= 112.5 && relativeBearing <= 247.5;

  // A) OwnShip is overtaking Target
  if (isInTargetSternSector && ownShip.sog > target.sog + 1.0 && prediction.closingSpeed > 0) {
    const marginToStarboardBound = Math.abs(targetAspect - 112.5);
    const marginToPortBound = Math.abs(targetAspect - 247.5);
    const boundaryMarginDeg = Number(Math.min(marginToStarboardBound, marginToPortBound).toFixed(1));

    return {
      classification: 'OVERTAKING_GIVE_WAY',
      ruleReference: 'Regla 13 (Buque que alcanza)',
      obligation: 'GIVE_WAY',
      actionRecommendation:
        'Buque propio alcanza al blanco. Mantenerse enteramente apartado de la derrota del buque alcanzado gobernando con amplio resguardo.',
      confidence,
      confidenceFactors,
      relativeBearing,
      targetAspect,
      deltaCog,
      boundaryMarginDeg
    };
  }

  // B) Target is overtaking OwnShip
  if (isTargetInOwnSternSector && target.sog > ownShip.sog + 1.0 && prediction.closingSpeed > 0) {
    const marginToStarboardBound = Math.abs(relativeBearing - 112.5);
    const marginToPortBound = Math.abs(relativeBearing - 247.5);
    const boundaryMarginDeg = Number(Math.min(marginToStarboardBound, marginToPortBound).toFixed(1));

    return {
      classification: 'OVERTAKEN_STAND_ON',
      ruleReference: 'Regla 13 (Buque alcanzado)',
      obligation: 'STAND_ON',
      actionRecommendation:
        'Blanco alcanza al buque propio por la popa. Mantener rumbo y velocidad; vigilar maniobra de alcance y pase del blanco.',
      confidence,
      confidenceFactors,
      relativeBearing,
      targetAspect,
      deltaCog,
      boundaryMarginDeg
    };
  }

  // 6. Layer 5: Rule 18 (Responsibilities between vessel categories / Jerarquía)
  if (targetType === 'UNKNOWN') {
    return {
      classification: 'UNDETERMINED',
      ruleReference: null,
      obligation: 'CAUTION',
      actionRecommendation:
        'Tipo de buque del blanco desconocido. Extremar precauciones y mantener distancia de seguridad defensiva.',
      confidence,
      confidenceFactors,
      relativeBearing,
      targetAspect,
      deltaCog,
      boundaryMarginDeg: null
    };
  }

  if (
    ownType === 'POWER_DRIVEN' &&
    (targetType === 'SAILING' ||
      targetType === 'FISHING' ||
      targetType === 'RESTRICTED_MANOEUVRABILITY' ||
      targetType === 'CONSTRAINED_BY_DRAUGHT' ||
      targetType === 'NOT_UNDER_COMMAND' ||
      targetType === 'AT_ANCHOR')
  ) {
    return {
      classification: 'RULE_18_GIVE_WAY',
      ruleReference: 'Regla 18 (Obligaciones entre categorías de buques)',
      obligation: 'GIVE_WAY',
      actionRecommendation: `Ceder el paso a buque con privilegio (${targetType}). Maniobrar temprano con resguardo amplio.`,
      confidence,
      confidenceFactors,
      relativeBearing,
      targetAspect,
      deltaCog,
      boundaryMarginDeg: null
    };
  }

  if (ownType === 'SAILING' && targetType === 'POWER_DRIVEN') {
    return {
      classification: 'RULE_18_STAND_ON',
      ruleReference: 'Regla 18 (Obligaciones entre categorías de buques)',
      obligation: 'STAND_ON',
      actionRecommendation:
        'Buque propio a vela con preferencia sobre buque de propulsión mecánica. Mantener rumbo y velocidad.',
      confidence,
      confidenceFactors,
      relativeBearing,
      targetAspect,
      deltaCog,
      boundaryMarginDeg: null
    };
  }

  // 7. Layer 6: Rule 14 (Head-on / Situación de vuelta encontrada)
  // Both power-driven vessels meeting on reciprocal or nearly reciprocal courses
  if (ownType === 'POWER_DRIVEN' && targetType === 'POWER_DRIVEN') {
    const deltaReciprocalDeg = Math.abs(normalizeSigned(deltaCog - 180));
    const ownBowDevDeg = Math.abs(normalizeSigned(relativeBearing));
    const targetBowDevDeg = Math.abs(normalizeSigned(targetAspect));

    const isReciprocalCourse = deltaReciprocalDeg <= 12.0;
    const isTargetDeadAhead = ownBowDevDeg <= 8.0;
    const isOwnDeadAheadOfTarget = targetBowDevDeg <= 8.0;
    const isHeadOnRisk =
      prediction.closingSpeed > 0 &&
      prediction.cpaNm !== null &&
      prediction.cpaNm <= 1.0;

    if (isReciprocalCourse && isTargetDeadAhead && isOwnDeadAheadOfTarget && isHeadOnRisk) {
      const boundaryMarginDeg = Number(
        Math.min(12.0 - deltaReciprocalDeg, 8.0 - ownBowDevDeg, 8.0 - targetBowDevDeg).toFixed(1)
      );

      return {
        classification: 'HEAD_ON',
        ruleReference: 'Regla 14 (Situación de vuelta encontrada)',
        obligation: 'GIVE_WAY',
        actionRecommendation:
          'Situación de vuelta encontrada proa con proa. Ambos buques deben caer con claridad a estribor para pasar babor con babor.',
        confidence,
        confidenceFactors,
        relativeBearing,
        targetAspect,
        deltaCog,
        boundaryMarginDeg
      };
    }

    // 8. Layer 7: Rule 15 (Crossing / Situación de cruce)
    // A) Target on Starboard Bow (5° < RB <= 112.5°): OwnShip gives way
    if (relativeBearing > 5.0 && relativeBearing <= 112.5) {
      const boundaryMarginDeg = Number(
        Math.min(relativeBearing - 5.0, 112.5 - relativeBearing).toFixed(1)
      );

      return {
        classification: 'CROSSING_GIVE_WAY',
        ruleReference: 'Regla 15 (Situación de cruce - Cede el paso)',
        obligation: 'GIVE_WAY',
        actionRecommendation:
          'Blanco se aproxima por la banda de estribor con riesgo de abordaje. Ceder el paso; maniobrar temprano a estribor evitando cortar su proa.',
        confidence,
        confidenceFactors,
        relativeBearing,
        targetAspect,
        deltaCog,
        boundaryMarginDeg
      };
    }

    // B) Target on Port Bow (247.5° <= RB < 355°): OwnShip stands on
    if (relativeBearing >= 247.5 && relativeBearing < 355.0) {
      const boundaryMarginDeg = Number(
        Math.min(relativeBearing - 247.5, 355.0 - relativeBearing).toFixed(1)
      );

      return {
        classification: 'CROSSING_STAND_ON',
        ruleReference: 'Regla 15 (Situación de cruce - Con preferencia)',
        obligation: 'STAND_ON',
        actionRecommendation:
          'Blanco se aproxima por la banda de babor. Mantener rumbo y velocidad; vigilar atentamente que el blanco maniobre.',
        confidence,
        confidenceFactors,
        relativeBearing,
        targetAspect,
        deltaCog,
        boundaryMarginDeg
      };
    }
  }

  // 9. Fallback: Undetermined situation
  return {
    classification: 'UNDETERMINED',
    ruleReference: null,
    obligation: 'CAUTION',
    actionRecommendation:
      'Geometría de aproximación no resoluble bajo reglas estándar. Extremar precauciones y maniobrar defensivamente.',
    confidence,
    confidenceFactors,
    relativeBearing,
    targetAspect,
    deltaCog,
    boundaryMarginDeg: null
  };
}
