/**
 * PHASE 1: Collision Prediction Tests
 * 
 * Deterministic test cases for collision prediction engine.
 * Does NOT depend on Date.now() — reference time is explicitly provided.
 * 
 * Test cases cover:
 * 1. Head-on approach
 * 2. Target receding
 * 3. Parallel movement
 * 4. Zero relative velocity
 * 5. Crossing scenario
 * 6. Negative TCPA (CPA already passed)
 */

import { calculateCollisionPrediction, Vessel, CollisionPredictionResult } from './CollisionPrediction';

interface TestCase {
  name: string;
  ownShip: Vessel;
  target: Vessel;
  now: Date;
  validate: (result: CollisionPredictionResult) => void;
}

/**
 * Tolerance for floating-point comparisons
 */
const EPSILON = 1e-3;

function assertAlmostEqual(actual: number, expected: number, tolerance: number, message: string) {
  const diff = Math.abs(actual - expected);
  if (diff > tolerance) {
    throw new Error(`${message}\n  Expected: ${expected}\n  Actual: ${actual}\n  Diff: ${diff}`);
  }
}

function assertNotNull<T>(value: T | null, message: string): T {
  if (value === null) {
    throw new Error(`${message}: Expected non-null value`);
  }
  return value;
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

/**
 * TEST 1: Head-on Approach
 * 
 * Own ship at (36, -4) heading North at 10 knots.
 * Target at (36.1, -4) heading South at 10 knots.
 * 
 * They should meet almost head-on.
 * - CPA should be close to 0
 * - TCPA should be positive (time to collision)
 * - Relative bearing should be ~0 (target is directly ahead)
 */
const test1: TestCase = {
  name: "TEST 1: Head-on Approach",
  ownShip: {
    lat: 36.0,
    lng: -4.0,
    sog: 10,  // knots
    cog: 0    // North
  },
  target: {
    lat: 36.1,
    lng: -4.0,
    sog: 10,
    cog: 180  // South
  },
  now: new Date("2026-01-01T12:00:00Z"),
  validate: (result) => {
    console.log(`  CPA: ${result.cpaNm?.toFixed(3)} NM`);
    console.log(`  TCPA: ${result.tcpaHours?.toFixed(4)} hours`);
    console.log(`  Closing speed: ${result.closingSpeed.toFixed(3)} NM/h`);
    console.log(`  Relative bearing: ${result.relativeBearing.toFixed(1)}°`);
    console.log(`  Is approaching: ${result.isApproaching}`);
    
    // CPA should be small (close pass)
    const cpa = assertNotNull(result.cpaNm, "CPA");
    assertAlmostEqual(cpa, 0, 0.1, "CPA should be close to 0 for head-on");
    
    // TCPA should be positive (time before collision)
    const tcpa = assertNotNull(result.tcpaHours, "TCPA");
    assert(tcpa > 0, "TCPA should be positive");
    // Distance = 6 NM (0.1° * 60), Closing speed = 20 NM/h → TCPA = 6/20 = 0.3 hours
    assertAlmostEqual(tcpa, 0.3, 0.05, "TCPA ~18 minutes (0.3 hrs) for 6 NM at closing 20 NM/h");
    
    // Closing speed should be ~20 knots (10+10)
    assertAlmostEqual(result.closingSpeed, 20, 1, "Closing speed ~20 NM/h");
    
    // Relative bearing ~0° (target ahead)
    assertAlmostEqual(result.relativeBearing, 0, 5, "Relative bearing ~0° (target ahead)");
    
    assert(result.isApproaching, "Should be approaching");
  }
};

/**
 * TEST 2: Target Receding
 * 
 * Own ship at (36, -4) heading North at 10 knots.
 * Target at (35.9, -4) heading South at 5 knots.
 * 
 * Target is moving away/separating.
 * - Closing speed should be negative or zero
 * - isApproaching should be false
 */
const test2: TestCase = {
  name: "TEST 2: Target Receding",
  ownShip: {
    lat: 36.0,
    lng: -4.0,
    sog: 10,
    cog: 0    // North
  },
  target: {
    lat: 35.9,
    lng: -4.0,
    sog: 5,
    cog: 180  // South (but moving south, away from own ship)
  },
  now: new Date("2026-01-01T12:00:00Z"),
  validate: (result) => {
    console.log(`  CPA: ${result.cpaNm?.toFixed(3)} NM`);
    console.log(`  TCPA: ${result.tcpaHours}`);
    console.log(`  Closing speed: ${result.closingSpeed.toFixed(3)} NM/h`);
    console.log(`  Is approaching: ${result.isApproaching}`);
    
    // Closing speed should be <= 0 (negative means separating)
    assert(result.closingSpeed <= 0.1, "Closing speed should be ≤ 0 (separating)");
    
    // TCPA should be null (no future approach)
    assert(result.tcpaHours === null, "TCPA should be null (already separated)");
    
    // isApproaching should be false
    assert(!result.isApproaching, "Should NOT be approaching");
  }
};

/**
 * TEST 3: Parallel Movement
 * 
 * Own ship at (36, -4) heading East at 10 knots.
 * Target at (36.05, -4) heading East at 10 knots (parallel, offset North).
 * 
 * Same heading, same speed, different position = parallel/constant distance.
 * - Relative velocity should be ~0
 * - TCPA should be null
 * - CPA should be current distance (~3 NM)
 * - Closing speed should be ~0
 */
const test3: TestCase = {
  name: "TEST 3: Parallel Movement",
  ownShip: {
    lat: 36.0,
    lng: -4.0,
    sog: 10,
    cog: 90   // East
  },
  target: {
    lat: 36.05,
    lng: -4.0,
    sog: 10,
    cog: 90   // East (parallel)
  },
  now: new Date("2026-01-01T12:00:00Z"),
  validate: (result) => {
    console.log(`  CPA: ${result.cpaNm?.toFixed(3)} NM`);
    console.log(`  TCPA: ${result.tcpaHours}`);
    console.log(`  Closing speed: ${result.closingSpeed.toFixed(6)} NM/h`);
    console.log(`  Is approaching: ${result.isApproaching}`);
    
    // Closing speed should be ~0
    assertAlmostEqual(result.closingSpeed, 0, 0.1, "Closing speed ~0 (parallel)");
    
    // TCPA should be null
    assert(result.tcpaHours === null, "TCPA should be null (parallel movement)");
    
    // CPA should be current distance (~3 NM from Δlat of 0.05°)
    const cpa = assertNotNull(result.cpaNm, "CPA");
    assertAlmostEqual(cpa, 3, 0.2, "CPA ~3 NM (current offset)");
    
    // isApproaching should be false
    assert(!result.isApproaching, "Should NOT be approaching");
  }
};

/**
 * TEST 4: Zero Relative Velocity
 * 
 * Own ship at (36, -4) stationary (SOG = 0).
 * Target at (36.1, -4) moving North at 5 knots.
 * 
 * Target is moving away from stationary own ship.
 * - TCPA should be null
 * - CPA should equal current distance
 * - Closing speed should be negative (receding)
 */
const test4: TestCase = {
  name: "TEST 4: Zero Relative Velocity (Own Ship Stationary)",
  ownShip: {
    lat: 36.0,
    lng: -4.0,
    sog: 0,   // Stationary
    cog: 0
  },
  target: {
    lat: 36.1,
    lng: -4.0,
    sog: 5,
    cog: 0    // Moving North (away)
  },
  now: new Date("2026-01-01T12:00:00Z"),
  validate: (result) => {
    console.log(`  CPA: ${result.cpaNm?.toFixed(3)} NM`);
    console.log(`  TCPA: ${result.tcpaHours}`);
    console.log(`  Closing speed: ${result.closingSpeed.toFixed(3)} NM/h`);
    console.log(`  Is approaching: ${result.isApproaching}`);
    
    // Current distance is 6 NM (0.1° * 60)
    const cpa = assertNotNull(result.cpaNm, "CPA");
    assertAlmostEqual(cpa, 6, 0.2, "CPA should be current distance (~6 NM)");
    
    // TCPA should be null (target moving away)
    assert(result.tcpaHours === null, "TCPA should be null (receding)");
    
    // Closing speed should be negative (separating)
    assert(result.closingSpeed < 0, "Closing speed should be negative (receding)");
    
    assert(!result.isApproaching, "Should NOT be approaching");
  }
};

/**
 * TEST 5: Crossing Scenario
 * 
 * Own ship at (36, -4) heading East at 10 knots.
 * Target at (36.05, -3.95) heading South at 8 knots.
 * 
 * Paths cross but don't collide (target passes in front at safe distance).
 * - CPA should be > 0 (safe)
 * - TCPA should be positive (time before closest point)
 * - isApproaching initially true but CPA large
 */
const test5: TestCase = {
  name: "TEST 5: Crossing Scenario",
  ownShip: {
    lat: 36.0,
    lng: -4.0,
    sog: 10,
    cog: 90   // East
  },
  target: {
    lat: 36.05,
    lng: -3.95,
    sog: 8,
    cog: 180  // South
  },
  now: new Date("2026-01-01T12:00:00Z"),
  validate: (result) => {
    console.log(`  CPA: ${result.cpaNm?.toFixed(3)} NM`);
    console.log(`  TCPA: ${result.tcpaHours?.toFixed(4)} hours`);
    console.log(`  Closing speed: ${result.closingSpeed.toFixed(3)} NM/h`);
    console.log(`  Relative bearing: ${result.relativeBearing.toFixed(1)}°`);
    console.log(`  Is approaching: ${result.isApproaching}`);
    
    // TCPA should be positive
    const tcpa = assertNotNull(result.tcpaHours, "TCPA");
    assert(tcpa > 0, "TCPA should be positive for crossing");
    
    // CPA should be positive (non-zero safe passing distance)
    const cpa = assertNotNull(result.cpaNm, "CPA");
    assert(cpa > 0, "CPA should be > 0 (safe passing)");
    
    // Closing speed should be positive initially
    assert(result.closingSpeed > 0, "Closing speed should be positive (approaching)");
  }
};

/**
 * TEST 6: Target Already Behind Us (Passed)
 * 
 * Own ship at (36, -4) heading North at 10 knots.
 * Target at (35.95, -4) heading North at 5 knots (behind, slower).
 * 
 * Target is behind us and falling further behind (slower speed).
 * - TCPA should be null (no close approach ahead)
 * - CPA should be current distance
 * - Closing speed should be negative (we're pulling away)
 */
const test6: TestCase = {
  name: "TEST 6: Target Behind Us (No Close Approach)",
  ownShip: {
    lat: 36.0,
    lng: -4.0,
    sog: 10,
    cog: 0    // North
  },
  target: {
    lat: 35.95,
    lng: -4.0,
    sog: 5,
    cog: 0    // North (same heading, slower—falling behind)
  },
  now: new Date("2026-01-01T12:00:00Z"),
  validate: (result) => {
    console.log(`  CPA: ${result.cpaNm?.toFixed(3)} NM`);
    console.log(`  TCPA: ${result.tcpaHours}`);
    console.log(`  Closing speed: ${result.closingSpeed.toFixed(3)} NM/h`);
    console.log(`  Is approaching: ${result.isApproaching}`);
    
    // TCPA should be null (no future close approach)
    assert(result.tcpaHours === null, "TCPA should be null (target falling behind)");
    
    // CPA should be current distance (~3 NM)
    const cpa = assertNotNull(result.cpaNm, "CPA");
    assertAlmostEqual(cpa, 3, 0.2, "CPA should be current distance (~3 NM)");
    
    // Closing speed should be negative (we're pulling away)
    assert(result.closingSpeed < 0, "Closing speed should be negative (pulling away)");
    
    assert(!result.isApproaching, "Should NOT be approaching (target behind us)");
  }
};

/**
 * Run all tests
 */
export function runCollisionPredictionTests() {
  const tests: TestCase[] = [test1, test2, test3, test4, test5, test6];
  
  console.log("=".repeat(80));
  console.log("PHASE 1: Collision Prediction Engine - Tests");
  console.log("=".repeat(80));
  
  let passed = 0;
  let failed = 0;
  
  tests.forEach((test, index) => {
    console.log(`\n[${index + 1}/${tests.length}] ${test.name}`);
    try {
      const result = calculateCollisionPrediction(test.ownShip, test.target, test.now);
      test.validate(result);
      console.log("  ✅ PASSED");
      passed++;
    } catch (error) {
      console.error(`  ❌ FAILED: ${error instanceof Error ? error.message : String(error)}`);
      failed++;
    }
  });
  
  console.log("\n" + "=".repeat(80));
  console.log(`Results: ${passed}/${tests.length} passed, ${failed} failed`);
  console.log("=".repeat(80));
  
  return failed === 0;
}

// Run tests if this file is executed directly
if (require.main === module) {
  const success = runCollisionPredictionTests();
  process.exit(success ? 0 : 1);
}
