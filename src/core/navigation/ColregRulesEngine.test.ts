/**
 * PHASE 4: COLREG Rules Engine Tests
 * 
 * Mathematical and deterministic test suite for ColregRulesEngine.ts.
 * 
 * Validates:
 * - Scenarios T1 to T10 defined in the Technical Plan
 * - Edge boundaries and adversarial cases for Rules 13, 14, 15, and 18
 * - STATIONARY_TARGET handling (SOG < 0.5 kn)
 * - Data Confidence computation and failure gates
 * 
 * Execution:
 *   npx tsx src/core/navigation/ColregRulesEngine.test.ts
 */

import {
  calculateColregRule,
  calculateDataConfidence,
  ColregInput,
  ColregResult,
  ColregClassification,
  ColregObligation,
  MaritimeVesselType,
  MIN_DATA_CONFIDENCE_THRESHOLD,
  MIN_STEERAGE_SOG_KN
} from './ColregRulesEngine';
import { calculateCollisionPrediction, Vessel } from './CollisionPrediction';
import { calculateCollisionRisk } from './CollisionRiskEngine';

interface TestCase {
  id: string;
  name: string;
  category: 'PLAN_T1_T10' | 'RULE_13' | 'RULE_14' | 'RULE_15' | 'RULE_18' | 'STATIONARY' | 'CONFIDENCE';
  input: ColregInput;
  now?: Date;
  validate: (result: ColregResult) => void;
}

const EPSILON = 1e-2;
const DEG_TO_RAD = Math.PI / 180;
const NM_PER_DEG_LAT = 60;

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}\n  Expected: ${String(expected)}\n  Actual:   ${String(actual)}`);
  }
}

function assertAlmostEqual(actual: number, expected: number, tolerance: number, message: string) {
  const diff = Math.abs(actual - expected);
  if (diff > tolerance) {
    throw new Error(`${message}\n  Expected: ${expected}\n  Actual:   ${actual}\n  Diff:     ${diff} (tolerance: ${tolerance})`);
  }
}

/**
 * Helper to construct complete ColregInput from geographic coordinates & kinematics
 */
function buildColregInput(
  own: { lat: number; lng: number; sog: number; cog: number; vesselType?: MaritimeVesselType; heading?: number },
  tgt: { lat: number; lng: number; sog: number; cog: number; vesselType?: MaritimeVesselType; heading?: number; timestamp?: number; navStatus?: string },
  now: Date = new Date('2026-08-24T12:00:00Z')
): ColregInput {
  const ownVessel: Vessel = { lat: own.lat, lng: own.lng, sog: own.sog, cog: own.cog };
  const tgtVessel: Vessel = { lat: tgt.lat, lng: tgt.lng, sog: tgt.sog, cog: tgt.cog };
  
  const pred = calculateCollisionPrediction(ownVessel, tgtVessel, now);
  const risk = calculateCollisionRisk(pred);

  return {
    ownShip: {
      lat: own.lat,
      lng: own.lng,
      sog: own.sog,
      cog: own.cog,
      vesselType: own.vesselType,
      heading: own.heading
    },
    target: {
      lat: tgt.lat,
      lng: tgt.lng,
      sog: tgt.sog,
      cog: tgt.cog,
      vesselType: tgt.vesselType,
      heading: tgt.heading,
      timestamp: tgt.timestamp ?? now.getTime(),
      navStatus: tgt.navStatus ?? 'Under way using engine'
    },
    prediction: {
      cpaNm: pred.cpaNm,
      tcpaHours: pred.tcpaHours,
      closingSpeed: pred.closingSpeed,
      isApproaching: pred.isApproaching,
      relativeBearing: pred.relativeBearing
    },
    riskLevel: risk.level
  };
}

const BASE_TIME = new Date('2026-08-24T12:00:00Z');
const LAT_REF = 36.0;
const LNG_REF = -4.0;
const COS_LAT = Math.cos(LAT_REF * DEG_TO_RAD);

// ============================================================================
// SECTION 1: SCENARIOS T1 TO T10 (TECHNICAL PLAN SUITE)
// ============================================================================

const testT1: TestCase = {
  id: 'T1',
  name: 'T1: Head-On across 0°/360° Discontinuity',
  category: 'PLAN_T1_T10',
  input: buildColregInput(
    { lat: LAT_REF, lng: LNG_REF, sog: 10, cog: 359, vesselType: 'POWER_DRIVEN' },
    { lat: LAT_REF + 2.0 / NM_PER_DEG_LAT, lng: LNG_REF, sog: 10, cog: 179, vesselType: 'POWER_DRIVEN' },
    BASE_TIME
  ),
  now: BASE_TIME,
  validate: (res) => {
    assertEqual(res.classification, 'HEAD_ON', 'T1 Classification');
    assertEqual(res.obligation, 'GIVE_WAY', 'T1 Obligation');
    assert(res.confidence >= MIN_DATA_CONFIDENCE_THRESHOLD, 'T1 Confidence >= threshold');
    assertAlmostEqual(res.relativeBearing, 1.0, 1.5, 'T1 Relative Bearing (~1°)');
    assertAlmostEqual(res.targetAspect, 1.0, 1.5, 'T1 Target Aspect (~1°)');
    assertAlmostEqual(res.deltaCog, 180.0, 1.0, 'T1 Delta COG (180°)');
  }
};

const testT2: TestCase = {
  id: 'T2',
  name: 'T2: Overtaking Give-Way on Exact Starboard Boundary (Aspect = 112.5°)',
  category: 'PLAN_T1_T10',
  input: buildColregInput(
    { lat: LAT_REF, lng: LNG_REF, sog: 14, cog: 0, vesselType: 'POWER_DRIVEN' },
    {
      lat: LAT_REF + 0.382683 / NM_PER_DEG_LAT,
      lng: LNG_REF - 0.92388 / (NM_PER_DEG_LAT * COS_LAT),
      sog: 6,
      cog: 0,
      vesselType: 'POWER_DRIVEN'
    },
    BASE_TIME
  ),
  now: BASE_TIME,
  validate: (res) => {
    assertEqual(res.classification, 'OVERTAKING_GIVE_WAY', 'T2 Classification');
    assertEqual(res.obligation, 'GIVE_WAY', 'T2 Obligation');
    assert(res.confidence >= MIN_DATA_CONFIDENCE_THRESHOLD, 'T2 Confidence >= threshold');
    assertAlmostEqual(res.targetAspect, 112.5, 0.5, 'T2 Target Aspect (112.5°)');
    assert(res.boundaryMarginDeg !== null && res.boundaryMarginDeg <= 1.0, 'T2 Boundary Margin near 0°');
  }
};

const testT3: TestCase = {
  id: 'T3',
  name: 'T3: Overtaking Give-Way on Exact Port Boundary (Aspect = 247.5°)',
  category: 'PLAN_T1_T10',
  input: buildColregInput(
    { lat: LAT_REF, lng: LNG_REF, sog: 14, cog: 0, vesselType: 'POWER_DRIVEN' },
    {
      lat: LAT_REF + 0.382683 / NM_PER_DEG_LAT,
      lng: LNG_REF + 0.92388 / (NM_PER_DEG_LAT * COS_LAT),
      sog: 6,
      cog: 0,
      vesselType: 'POWER_DRIVEN'
    },
    BASE_TIME
  ),
  now: BASE_TIME,
  validate: (res) => {
    assertEqual(res.classification, 'OVERTAKING_GIVE_WAY', 'T3 Classification');
    assertEqual(res.obligation, 'GIVE_WAY', 'T3 Obligation');
    assert(res.confidence >= MIN_DATA_CONFIDENCE_THRESHOLD, 'T3 Confidence >= threshold');
    assertAlmostEqual(res.targetAspect, 247.5, 0.5, 'T3 Target Aspect (247.5°)');
    assert(res.boundaryMarginDeg !== null && res.boundaryMarginDeg <= 1.0, 'T3 Boundary Margin near 0°');
  }
};

const testT4: TestCase = {
  id: 'T4',
  name: 'T4: Overtaken Stand-On (Faster target approaching from astern)',
  category: 'PLAN_T1_T10',
  input: buildColregInput(
    { lat: LAT_REF, lng: LNG_REF, sog: 6, cog: 90, vesselType: 'POWER_DRIVEN' },
    {
      lat: LAT_REF,
      lng: LNG_REF - 1.0 / (NM_PER_DEG_LAT * COS_LAT),
      sog: 15,
      cog: 90,
      vesselType: 'POWER_DRIVEN'
    },
    BASE_TIME
  ),
  now: BASE_TIME,
  validate: (res) => {
    assertEqual(res.classification, 'OVERTAKEN_STAND_ON', 'T4 Classification');
    assertEqual(res.obligation, 'STAND_ON', 'T4 Obligation');
    assert(res.confidence >= MIN_DATA_CONFIDENCE_THRESHOLD, 'T4 Confidence >= threshold');
    assertAlmostEqual(res.relativeBearing, 180.0, 0.5, 'T4 Relative Bearing (180°)');
    assertAlmostEqual(res.targetAspect, 0.0, 0.5, 'T4 Target Aspect (0°)');
  }
};

const testT5: TestCase = {
  id: 'T5',
  name: 'T5: Crossing Give-Way on Starboard Bow (45°)',
  category: 'PLAN_T1_T10',
  input: buildColregInput(
    { lat: LAT_REF, lng: LNG_REF, sog: 10, cog: 0, vesselType: 'POWER_DRIVEN' },
    {
      lat: LAT_REF + 0.8 / NM_PER_DEG_LAT,
      lng: LNG_REF + 0.8 / (NM_PER_DEG_LAT * COS_LAT),
      sog: 10,
      cog: 270,
      vesselType: 'POWER_DRIVEN'
    },
    BASE_TIME
  ),
  now: BASE_TIME,
  validate: (res) => {
    assertEqual(res.classification, 'CROSSING_GIVE_WAY', 'T5 Classification');
    assertEqual(res.obligation, 'GIVE_WAY', 'T5 Obligation');
    assert(res.confidence >= MIN_DATA_CONFIDENCE_THRESHOLD, 'T5 Confidence >= threshold');
    assertAlmostEqual(res.relativeBearing, 45.0, 1.0, 'T5 Relative Bearing (~45°)');
    assertAlmostEqual(res.targetAspect, 315.0, 1.0, 'T5 Target Aspect (~315°)');
  }
};

const testT6: TestCase = {
  id: 'T6',
  name: 'T6: Crossing Stand-On on Port Bow (315°)',
  category: 'PLAN_T1_T10',
  input: buildColregInput(
    { lat: LAT_REF, lng: LNG_REF, sog: 10, cog: 0, vesselType: 'POWER_DRIVEN' },
    {
      lat: LAT_REF + 0.8 / NM_PER_DEG_LAT,
      lng: LNG_REF - 0.8 / (NM_PER_DEG_LAT * COS_LAT),
      sog: 10,
      cog: 90,
      vesselType: 'POWER_DRIVEN'
    },
    BASE_TIME
  ),
  now: BASE_TIME,
  validate: (res) => {
    assertEqual(res.classification, 'CROSSING_STAND_ON', 'T6 Classification');
    assertEqual(res.obligation, 'STAND_ON', 'T6 Obligation');
    assert(res.confidence >= MIN_DATA_CONFIDENCE_THRESHOLD, 'T6 Confidence >= threshold');
    assertAlmostEqual(res.relativeBearing, 315.0, 1.0, 'T6 Relative Bearing (~315°)');
    assertAlmostEqual(res.targetAspect, 45.0, 1.0, 'T6 Target Aspect (~45°)');
  }
};

const testT7: TestCase = {
  id: 'T7',
  name: 'T7: Parallel Courses with Safe Distance (CPA = 2.5 NM)',
  category: 'PLAN_T1_T10',
  input: buildColregInput(
    { lat: LAT_REF, lng: LNG_REF, sog: 10, cog: 90, vesselType: 'POWER_DRIVEN' },
    {
      lat: LAT_REF + 2.5 / NM_PER_DEG_LAT,
      lng: LNG_REF,
      sog: 10,
      cog: 90,
      vesselType: 'POWER_DRIVEN'
    },
    BASE_TIME
  ),
  now: BASE_TIME,
  validate: (res) => {
    assertEqual(res.classification, 'NOT_APPLICABLE', 'T7 Classification');
    assertEqual(res.obligation, 'NONE', 'T7 Obligation');
    assert(res.confidence >= MIN_DATA_CONFIDENCE_THRESHOLD, 'T7 Confidence >= threshold');
  }
};

const testT8: TestCase = {
  id: 'T8',
  name: 'T8: Reciprocal Courses with Safe Lateral Separation (CPA >= 2.0 NM)',
  category: 'PLAN_T1_T10',
  input: buildColregInput(
    { lat: LAT_REF, lng: LNG_REF, sog: 10, cog: 0, vesselType: 'POWER_DRIVEN' },
    {
      lat: LAT_REF + 2.0 / NM_PER_DEG_LAT,
      lng: LNG_REF - 2.05 / (NM_PER_DEG_LAT * Math.cos((LAT_REF + 1.0 / NM_PER_DEG_LAT) * DEG_TO_RAD)),
      sog: 10,
      cog: 180,
      vesselType: 'POWER_DRIVEN'
    },
    BASE_TIME
  ),
  now: BASE_TIME,
  validate: (res) => {
    assertEqual(res.classification, 'NOT_APPLICABLE', 'T8 Classification');
    assertEqual(res.obligation, 'NONE', 'T8 Obligation');
  }
};

const testT9: TestCase = {
  id: 'T9',
  name: 'T9: Stationary Target (SOG = 0.1 kn < 0.5 kn threshold)',
  category: 'PLAN_T1_T10',
  input: buildColregInput(
    { lat: LAT_REF, lng: LNG_REF, sog: 10, cog: 0, vesselType: 'POWER_DRIVEN' },
    {
      lat: LAT_REF + 0.5 / NM_PER_DEG_LAT,
      lng: LNG_REF,
      sog: 0.1,
      cog: 45,
      vesselType: 'POWER_DRIVEN'
    },
    BASE_TIME
  ),
  now: BASE_TIME,
  validate: (res) => {
    assertEqual(res.classification, 'STATIONARY_TARGET', 'T9 Classification');
    assertEqual(res.obligation, 'GIVE_WAY', 'T9 Obligation');
    assert(res.confidence >= MIN_DATA_CONFIDENCE_THRESHOLD, 'T9 Confidence >= 0.65 (telemetry valid)');
  }
};

const testT10: TestCase = {
  id: 'T10',
  name: 'T10: Sailing Vessel on Port Bow (Rule 18 Hierarchy)',
  category: 'PLAN_T1_T10',
  input: buildColregInput(
    { lat: LAT_REF, lng: LNG_REF, sog: 10, cog: 0, vesselType: 'POWER_DRIVEN' },
    {
      lat: LAT_REF + 0.8 / NM_PER_DEG_LAT,
      lng: LNG_REF - 0.8 / (NM_PER_DEG_LAT * COS_LAT),
      sog: 7,
      cog: 90,
      vesselType: 'SAILING'
    },
    BASE_TIME
  ),
  now: BASE_TIME,
  validate: (res) => {
    assertEqual(res.classification, 'RULE_18_GIVE_WAY', 'T10 Classification');
    assertEqual(res.obligation, 'GIVE_WAY', 'T10 Obligation');
    assert(res.confidence >= MIN_DATA_CONFIDENCE_THRESHOLD, 'T10 Confidence >= threshold');
  }
};

// ============================================================================
// SECTION 2: ADVERSARIAL & BOUNDARY TESTS - RULE 13 (OVERTAKING)
// ============================================================================

const testR13_RecedingInStern: TestCase = {
  id: 'R13_RECEDING',
  name: 'Rule 13: Target in stern sector but separating (closingSpeed < 0)',
  category: 'RULE_13',
  input: buildColregInput(
    { lat: LAT_REF, lng: LNG_REF, sog: 10, cog: 0, vesselType: 'POWER_DRIVEN' },
    {
      lat: LAT_REF - 1.0 / NM_PER_DEG_LAT,
      lng: LNG_REF,
      sog: 5,
      cog: 180, // Target moving South away from own ship
      vesselType: 'POWER_DRIVEN'
    },
    BASE_TIME
  ),
  now: BASE_TIME,
  validate: (res) => {
    assertEqual(res.classification, 'NOT_APPLICABLE', 'Receding target must be NOT_APPLICABLE');
    assertEqual(res.obligation, 'NONE', 'No obligation when separating');
  }
};

const testR13_InsufficientSpeedDelta: TestCase = {
  id: 'R13_SPEED_DELTA',
  name: 'Rule 13: Own ship behind target but SOG delta <= 1.0 kn (10.5 vs 10.0 kn)',
  category: 'RULE_13',
  input: buildColregInput(
    { lat: LAT_REF, lng: LNG_REF, sog: 10.5, cog: 0, vesselType: 'POWER_DRIVEN' },
    {
      lat: LAT_REF + 0.8 / NM_PER_DEG_LAT,
      lng: LNG_REF + 0.3 / (NM_PER_DEG_LAT * COS_LAT),
      sog: 10.0,
      cog: 340,
      vesselType: 'POWER_DRIVEN'
    },
    BASE_TIME
  ),
  now: BASE_TIME,
  validate: (res) => {
    // Cannot be classified as OVERTAKING_GIVE_WAY because delta SOG = 0.5 <= 1.0 kn
    assert(
      res.classification !== 'OVERTAKING_GIVE_WAY',
      'Should NOT classify as OVERTAKING when speed advantage is <= 1.0 kn'
    );
  }
};

// ============================================================================
// SECTION 3: ADVERSARIAL & BOUNDARY TESTS - RULE 14 (HEAD-ON)
// ============================================================================

const testR14_NonReciprocalCourse: TestCase = {
  id: 'R14_NON_RECIPROCAL',
  name: 'Rule 14: Target dead ahead but course delta is 150° (|delta-180| = 30° > 12°)',
  category: 'RULE_14',
  input: buildColregInput(
    { lat: LAT_REF, lng: LNG_REF, sog: 10, cog: 0, vesselType: 'POWER_DRIVEN' },
    {
      lat: LAT_REF + 1.0 / NM_PER_DEG_LAT,
      lng: LNG_REF,
      sog: 10,
      cog: 150, // 30° off reciprocal
      vesselType: 'POWER_DRIVEN'
    },
    BASE_TIME
  ),
  now: BASE_TIME,
  validate: (res) => {
    assert(res.classification !== 'HEAD_ON', 'Must NOT classify as HEAD_ON when delta COG deviation > 12°');
  }
};

const testR14_RelativeBearingBoundaryExceeded: TestCase = {
  id: 'R14_RB_EXCEEDED',
  name: 'Rule 14: Reciprocal courses but Relative Bearing = 15° (> 8° boundary)',
  category: 'RULE_14',
  input: buildColregInput(
    { lat: LAT_REF, lng: LNG_REF, sog: 10, cog: 0, vesselType: 'POWER_DRIVEN' },
    {
      lat: LAT_REF + 1.0 / NM_PER_DEG_LAT,
      lng: LNG_REF + 0.3 / (NM_PER_DEG_LAT * COS_LAT),
      sog: 10,
      cog: 180,
      vesselType: 'POWER_DRIVEN'
    },
    BASE_TIME
  ),
  now: BASE_TIME,
  validate: (res) => {
    assert(res.classification !== 'HEAD_ON', 'Must NOT classify as HEAD_ON when relative bearing > 8°');
  }
};

// ============================================================================
// SECTION 4: ADVERSARIAL & BOUNDARY TESTS - RULE 15 (CROSSING)
// ============================================================================

const testR15_StarboardBoundary_5Deg: TestCase = {
  id: 'R15_5DEG',
  name: 'Rule 15: Target on Starboard Bow at 6° (just inside 5°-112.5° sector)',
  category: 'RULE_15',
  input: buildColregInput(
    { lat: LAT_REF, lng: LNG_REF, sog: 10, cog: 0, vesselType: 'POWER_DRIVEN' },
    {
      lat: LAT_REF + 1.0 / NM_PER_DEG_LAT,
      lng: LNG_REF + 0.105 / (NM_PER_DEG_LAT * COS_LAT), // ~6° bearing
      sog: 10,
      cog: 250,
      vesselType: 'POWER_DRIVEN'
    },
    BASE_TIME
  ),
  now: BASE_TIME,
  validate: (res) => {
    assertEqual(res.classification, 'CROSSING_GIVE_WAY', 'Target at 6° starboard must be CROSSING_GIVE_WAY');
    assertEqual(res.obligation, 'GIVE_WAY', 'Own ship must give way');
  }
};

const testR15_PortBoundary_354Deg: TestCase = {
  id: 'R15_354DEG',
  name: 'Rule 15: Target on Port Bow at 354° (inside 247.5°-355° sector)',
  category: 'RULE_15',
  input: buildColregInput(
    { lat: LAT_REF, lng: LNG_REF, sog: 10, cog: 0, vesselType: 'POWER_DRIVEN' },
    {
      lat: LAT_REF + 1.0 / NM_PER_DEG_LAT,
      lng: LNG_REF - 0.105 / (NM_PER_DEG_LAT * COS_LAT), // ~354° bearing
      sog: 10,
      cog: 110,
      vesselType: 'POWER_DRIVEN'
    },
    BASE_TIME
  ),
  now: BASE_TIME,
  validate: (res) => {
    assertEqual(res.classification, 'CROSSING_STAND_ON', 'Target at 354° port must be CROSSING_STAND_ON');
    assertEqual(res.obligation, 'STAND_ON', 'Own ship is stand on');
  }
};

const testR15_A_RecedingPort: TestCase = {
  id: 'R15_A_RECEDING_PORT',
  name: 'Rule 15-A: Target on Port Bow (RB=315°) but separating (closingSpeed <= 0) -> NOT_APPLICABLE',
  category: 'RULE_15',
  input: buildColregInput(
    { lat: LAT_REF, lng: LNG_REF, sog: 10, cog: 0, vesselType: 'POWER_DRIVEN' },
    {
      lat: LAT_REF + 1.0 / NM_PER_DEG_LAT,
      lng: LNG_REF - 1.0 / (NM_PER_DEG_LAT * COS_LAT), // RB = 315°
      sog: 15,
      cog: 315, // Moving away faster
      vesselType: 'POWER_DRIVEN'
    },
    BASE_TIME
  ),
  now: BASE_TIME,
  validate: (res) => {
    assertEqual(res.classification, 'NOT_APPLICABLE', 'Separating target at 315° must be NOT_APPLICABLE');
    assertEqual(res.obligation, 'NONE', 'Obligation NONE');
  }
};

const testR15_B_ApproachingCpaGt2: TestCase = {
  id: 'R15_B_CPA_GT_2',
  name: 'Rule 15-B: Target on Port Bow (RB=292°), approaching, but CPA >= 2.0 NM -> NOT_APPLICABLE',
  category: 'RULE_15',
  input: buildColregInput(
    { lat: LAT_REF, lng: LNG_REF, sog: 10, cog: 0, vesselType: 'POWER_DRIVEN' },
    {
      // Target at (-5.0 NM East, +2.0 NM North) on port bow sector (247.5°-355°), moving East at 10 kn -> CPA = 2.12 NM >= 2.0 NM
      lat: LAT_REF + 2.0 / NM_PER_DEG_LAT,
      lng: LNG_REF - 5.0 / (NM_PER_DEG_LAT * Math.cos((LAT_REF + 1.0 / NM_PER_DEG_LAT) * DEG_TO_RAD)),
      sog: 10,
      cog: 90,
      vesselType: 'POWER_DRIVEN'
    },
    BASE_TIME
  ),
  now: BASE_TIME,
  validate: (res) => {
    assertEqual(res.classification, 'NOT_APPLICABLE', 'CPA >= 2.0 NM must be NOT_APPLICABLE');
    assertEqual(res.obligation, 'NONE', 'Obligation NONE');
  }
};

const testR15_C_ApproachingCpaLt2: TestCase = {
  id: 'R15_C_CPA_LT_2',
  name: 'Rule 15-C: Target on Port Bow (RB=315°), approaching, CPA < 2.0 NM -> CROSSING_STAND_ON',
  category: 'RULE_15',
  input: buildColregInput(
    { lat: LAT_REF, lng: LNG_REF, sog: 10, cog: 0, vesselType: 'POWER_DRIVEN' },
    {
      lat: LAT_REF + 0.8 / NM_PER_DEG_LAT,
      lng: LNG_REF - 0.8 / (NM_PER_DEG_LAT * COS_LAT), // RB = 315°
      sog: 10,
      cog: 90,
      vesselType: 'POWER_DRIVEN'
    },
    BASE_TIME
  ),
  now: BASE_TIME,
  validate: (res) => {
    assertEqual(res.classification, 'CROSSING_STAND_ON', 'Crossing on port with risk must be CROSSING_STAND_ON');
    assertEqual(res.obligation, 'STAND_ON', 'Obligation STAND_ON');
  }
};

const testR15_D_RecedingStbd: TestCase = {
  id: 'R15_D_RECEDING_STBD',
  name: 'Rule 15-D: Target on Starboard Bow (RB=45°) but separating (closingSpeed <= 0) -> NOT_APPLICABLE',
  category: 'RULE_15',
  input: buildColregInput(
    { lat: LAT_REF, lng: LNG_REF, sog: 10, cog: 0, vesselType: 'POWER_DRIVEN' },
    {
      lat: LAT_REF + 1.0 / NM_PER_DEG_LAT,
      lng: LNG_REF + 1.0 / (NM_PER_DEG_LAT * COS_LAT), // RB = 45°
      sog: 15,
      cog: 45, // Moving away faster
      vesselType: 'POWER_DRIVEN'
    },
    BASE_TIME
  ),
  now: BASE_TIME,
  validate: (res) => {
    assertEqual(res.classification, 'NOT_APPLICABLE', 'Separating target at 45° must be NOT_APPLICABLE');
    assertEqual(res.obligation, 'NONE', 'Obligation NONE');
  }
};

const testR15_E_ApproachingCpaLt2: TestCase = {
  id: 'R15_E_CPA_LT_2',
  name: 'Rule 15-E: Target on Starboard Bow (RB=45°), approaching, CPA < 2.0 NM -> CROSSING_GIVE_WAY',
  category: 'RULE_15',
  input: buildColregInput(
    { lat: LAT_REF, lng: LNG_REF, sog: 10, cog: 0, vesselType: 'POWER_DRIVEN' },
    {
      lat: LAT_REF + 0.8 / NM_PER_DEG_LAT,
      lng: LNG_REF + 0.8 / (NM_PER_DEG_LAT * COS_LAT), // RB = 45°
      sog: 10,
      cog: 270,
      vesselType: 'POWER_DRIVEN'
    },
    BASE_TIME
  ),
  now: BASE_TIME,
  validate: (res) => {
    assertEqual(res.classification, 'CROSSING_GIVE_WAY', 'Crossing on starboard with risk must be CROSSING_GIVE_WAY');
    assertEqual(res.obligation, 'GIVE_WAY', 'Obligation GIVE_WAY');
  }
};

// ============================================================================
// SECTION 5: ADVERSARIAL & BOUNDARY TESTS - RULE 18 (VESSEL HIERARCHY)
// ============================================================================

const testR18_Fishing: TestCase = {
  id: 'R18_FISHING',
  name: 'Rule 18: Power-driven vs Vessel Engaged in Fishing',
  category: 'RULE_18',
  input: buildColregInput(
    { lat: LAT_REF, lng: LNG_REF, sog: 10, cog: 0, vesselType: 'POWER_DRIVEN' },
    {
      lat: LAT_REF + 0.8 / NM_PER_DEG_LAT,
      lng: LNG_REF - 0.8 / (NM_PER_DEG_LAT * COS_LAT),
      sog: 4,
      cog: 90,
      vesselType: 'FISHING'
    },
    BASE_TIME
  ),
  now: BASE_TIME,
  validate: (res) => {
    assertEqual(res.classification, 'RULE_18_GIVE_WAY', 'Must give way to FISHING vessel');
    assertEqual(res.obligation, 'GIVE_WAY', 'Obligation GIVE_WAY');
  }
};

const testR18_RAM: TestCase = {
  id: 'R18_RAM',
  name: 'Rule 18: Power-driven vs Restricted Manoeuvrability (RAM)',
  category: 'RULE_18',
  input: buildColregInput(
    { lat: LAT_REF, lng: LNG_REF, sog: 10, cog: 0, vesselType: 'POWER_DRIVEN' },
    {
      lat: LAT_REF + 0.8 / NM_PER_DEG_LAT,
      lng: LNG_REF - 0.8 / (NM_PER_DEG_LAT * COS_LAT),
      sog: 5,
      cog: 90,
      vesselType: 'RESTRICTED_MANOEUVRABILITY'
    },
    BASE_TIME
  ),
  now: BASE_TIME,
  validate: (res) => {
    assertEqual(res.classification, 'RULE_18_GIVE_WAY', 'Must give way to RAM vessel');
  }
};

const testR18_UnknownVesselType: TestCase = {
  id: 'R18_UNKNOWN',
  name: 'Rule 18: Target with explicit UNKNOWN vessel category',
  category: 'RULE_18',
  input: buildColregInput(
    { lat: LAT_REF, lng: LNG_REF, sog: 10, cog: 0, vesselType: 'POWER_DRIVEN' },
    {
      lat: LAT_REF + 0.8 / NM_PER_DEG_LAT,
      lng: LNG_REF - 0.8 / (NM_PER_DEG_LAT * COS_LAT),
      sog: 8,
      cog: 90,
      vesselType: 'UNKNOWN'
    },
    BASE_TIME
  ),
  now: BASE_TIME,
  validate: (res) => {
    assertEqual(res.classification, 'UNDETERMINED', 'UNKNOWN category must result in UNDETERMINED');
    assertEqual(res.obligation, 'CAUTION', 'Obligation CAUTION');
  }
};

// ============================================================================
// SECTION 6: DATA CONFIDENCE & CORRUPT TELEMETRY GATES
// ============================================================================

const testConf_PerfectData: TestCase = {
  id: 'CONF_PERFECT',
  name: 'Data Confidence: High quality telemetry with fresh timestamp (score = 1.0)',
  category: 'CONFIDENCE',
  input: buildColregInput(
    { lat: LAT_REF, lng: LNG_REF, sog: 10, cog: 0, vesselType: 'POWER_DRIVEN' },
    { lat: LAT_REF + 1.0 / NM_PER_DEG_LAT, lng: LNG_REF, sog: 10, cog: 180, timestamp: BASE_TIME.getTime() - 5000 },
    BASE_TIME
  ),
  now: BASE_TIME,
  validate: (res) => {
    assertEqual(res.confidence, 1.0, 'Perfect telemetry confidence must be 1.0');
    assertEqual(res.confidenceFactors.c_gate, 1.0, 'c_gate must be 1.0');
  }
};

const testConf_StaleTimestamp: TestCase = {
  id: 'CONF_STALE',
  name: 'Data Confidence: Stale AIS timestamp (delta = 200s > 180s)',
  category: 'CONFIDENCE',
  input: buildColregInput(
    { lat: LAT_REF, lng: LNG_REF, sog: 10, cog: 0, vesselType: 'POWER_DRIVEN' },
    {
      lat: LAT_REF + 1.0 / NM_PER_DEG_LAT,
      lng: LNG_REF,
      sog: 10,
      cog: 180,
      timestamp: BASE_TIME.getTime() - 200 * 1000 // 200 seconds ago
    },
    BASE_TIME
  ),
  now: BASE_TIME,
  validate: (res) => {
    assertEqual(res.confidenceFactors.f_time, 0.0, 'f_time must be 0 for delta > 180s');
    assert(res.confidence < MIN_DATA_CONFIDENCE_THRESHOLD, 'Overall confidence must drop below threshold');
    assertEqual(res.classification, 'DATA_INSUFFICIENT', 'Must classify as DATA_INSUFFICIENT');
  }
};

const testConf_NaN_Coordinates: TestCase = {
  id: 'CONF_NAN_COORDS',
  name: 'Data Confidence: Corrupt latitude (NaN) activates C_gate = 0',
  category: 'CONFIDENCE',
  input: {
    ownShip: { lat: LAT_REF, lng: LNG_REF, sog: 10, cog: 0 },
    target: { lat: NaN, lng: LNG_REF, sog: 10, cog: 180 },
    prediction: { cpaNm: 0, tcpaHours: 0.1, closingSpeed: 20, isApproaching: true, relativeBearing: 0 },
    riskLevel: 'CRITICAL'
  },
  now: BASE_TIME,
  validate: (res) => {
    assertEqual(res.confidence, 0.0, 'Confidence must be 0 when coordinates are NaN');
    assertEqual(res.confidenceFactors.c_gate, 0.0, 'c_gate must be 0');
    assertEqual(res.classification, 'DATA_INSUFFICIENT', 'Classification must be DATA_INSUFFICIENT');
  }
};

const testConf_OutOfRangeLatitude: TestCase = {
  id: 'CONF_OUT_OF_RANGE_LAT',
  name: 'Data Confidence: Out-of-range latitude (95°) activates C_gate = 0',
  category: 'CONFIDENCE',
  input: {
    ownShip: { lat: LAT_REF, lng: LNG_REF, sog: 10, cog: 0 },
    target: { lat: 95.0, lng: LNG_REF, sog: 10, cog: 180 },
    prediction: { cpaNm: 0, tcpaHours: 0.1, closingSpeed: 20, isApproaching: true, relativeBearing: 0 },
    riskLevel: 'CRITICAL'
  },
  now: BASE_TIME,
  validate: (res) => {
    assertEqual(res.confidence, 0.0, 'Confidence must be 0 for invalid latitude');
    assertEqual(res.classification, 'DATA_INSUFFICIENT', 'Classification must be DATA_INSUFFICIENT');
  }
};

const testConf_InvalidCOG: TestCase = {
  id: 'CONF_INVALID_COG',
  name: 'Data Confidence: Out-of-range COG (400°) activates C_gate = 0',
  category: 'CONFIDENCE',
  input: {
    ownShip: { lat: LAT_REF, lng: LNG_REF, sog: 10, cog: 0 },
    target: { lat: LAT_REF + 0.1, lng: LNG_REF, sog: 10, cog: 400 },
    prediction: { cpaNm: 0, tcpaHours: 0.1, closingSpeed: 20, isApproaching: true, relativeBearing: 0 },
    riskLevel: 'CRITICAL'
  },
  now: BASE_TIME,
  validate: (res) => {
    assertEqual(res.confidence, 0.0, 'Confidence must be 0 for COG >= 360');
    assertEqual(res.classification, 'DATA_INSUFFICIENT', 'Classification must be DATA_INSUFFICIENT');
  }
};

// ============================================================================
// TEST RUNNER
// ============================================================================

export function runColregRulesEngineTests(): { passed: number; failed: number; errors: Array<{ id: string; name: string; error: string }> } {
  const testSuite: TestCase[] = [
    // Plan T1 to T10
    testT1,
    testT2,
    testT3,
    testT4,
    testT5,
    testT6,
    testT7,
    testT8,
    testT9,
    testT10,
    // Rule 13
    testR13_RecedingInStern,
    testR13_InsufficientSpeedDelta,
    // Rule 14
    testR14_NonReciprocalCourse,
    testR14_RelativeBearingBoundaryExceeded,
    // Rule 15
    testR15_StarboardBoundary_5Deg,
    testR15_PortBoundary_354Deg,
    testR15_A_RecedingPort,
    testR15_B_ApproachingCpaGt2,
    testR15_C_ApproachingCpaLt2,
    testR15_D_RecedingStbd,
    testR15_E_ApproachingCpaLt2,
    // Rule 18
    testR18_Fishing,
    testR18_RAM,
    testR18_UnknownVesselType,
    // Data Confidence
    testConf_PerfectData,
    testConf_StaleTimestamp,
    testConf_NaN_Coordinates,
    testConf_OutOfRangeLatitude,
    testConf_InvalidCOG
  ];

  console.log('='.repeat(80));
  console.log(`VELARIS FASE 4: COLREG Rules Engine Test Suite (${testSuite.length} tests)`);
  console.log('='.repeat(80));

  let passed = 0;
  let failed = 0;
  const errors: Array<{ id: string; name: string; error: string }> = [];

  testSuite.forEach((test, idx) => {
    const num = `[${(idx + 1).toString().padStart(2, '0')}/${testSuite.length}]`;
    try {
      const result = calculateColregRule(test.input, test.now);
      test.validate(result);
      console.log(`${num} ✅ PASS: ${test.name}`);
      passed++;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`${num} ❌ FAIL: ${test.name}`);
      console.error(`     Reason: ${errorMsg}`);
      failed++;
      errors.push({ id: test.id, name: test.name, error: errorMsg });
    }
  });

  console.log('='.repeat(80));
  console.log(`Summary: ${passed} PASSED, ${failed} FAILED across ${testSuite.length} total test scenarios.`);
  console.log('='.repeat(80));

  return { passed, failed, errors };
}

// Execute tests if file is invoked directly
if (require.main === module) {
  const result = runColregRulesEngineTests();
  process.exit(result.failed === 0 ? 0 : 1);
}
