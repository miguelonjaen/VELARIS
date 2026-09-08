/**
 * PHASE 2: Collision Risk Engine - Tests
 * 
 * Deterministic test cases for risk classification.
 * 
 * Validates that the risk engine correctly classifies contacts into:
 * SAFE, CAUTION, WARNING, CRITICAL
 */

import { calculateCollisionRisk, CollisionRiskResult, DEFAULT_RISK_THRESHOLDS, CollisionRiskLevel } from './CollisionRiskEngine';
import { CollisionPredictionResult } from './CollisionPrediction';

interface TestCase {
  name: string;
  prediction: CollisionPredictionResult;
  expectedLevel: CollisionRiskLevel;
  validate?: (result: CollisionRiskResult) => void;
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}\n  Expected: ${expected}\n  Actual: ${actual}`);
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

/**
 * TEST 1: Safe Distance
 * 
 * CPA 3.0 NM, TCPA 40 minutes, closing 10 NM/h
 * Expected: SAFE
 */
const test1: TestCase = {
  name: 'TEST 1: Safe Distance (3.0 NM / 40 min)',
  prediction: {
    cpaNm: 3.0,
    tcpaHours: 40 / 60,  // 40 minutes
    tca: new Date(Date.now() + 40 * 60 * 1000),
    closingSpeed: 10,
    relativeBearing: 45,
    isApproaching: true,
    relativeEast: 2.0,
    relativeNorth: 2.1,
    relativeSpeed: 10
  },
  expectedLevel: 'SAFE',
  validate: (result) => {
    console.log(`  Level: ${result.level}`);
    console.log(`  Reason: ${result.reason}`);
    assert(result.level === 'SAFE', 'Should be SAFE at 3.0 NM');
  }
};

/**
 * TEST 2: Caution Zone
 * 
 * CPA 1.8 NM, TCPA 25 minutes, closing 8 NM/h
 * Expected: CAUTION
 */
const test2: TestCase = {
  name: 'TEST 2: Caution Zone (1.8 NM / 25 min)',
  prediction: {
    cpaNm: 1.8,
    tcpaHours: 25 / 60,
    tca: new Date(Date.now() + 25 * 60 * 1000),
    closingSpeed: 8,
    relativeBearing: 90,
    isApproaching: true,
    relativeEast: 1.5,
    relativeNorth: 1.0,
    relativeSpeed: 8
  },
  expectedLevel: 'CAUTION',
  validate: (result) => {
    console.log(`  Level: ${result.level}`);
    console.log(`  Reason: ${result.reason}`);
    assert(result.level === 'CAUTION', 'Should be CAUTION at 1.8 NM / 25 min');
  }
};

/**
 * TEST 3: Warning Zone
 * 
 * CPA 0.8 NM, TCPA 15 minutes, closing 12 NM/h
 * Expected: WARNING
 */
const test3: TestCase = {
  name: 'TEST 3: Warning Zone (0.8 NM / 15 min)',
  prediction: {
    cpaNm: 0.8,
    tcpaHours: 15 / 60,
    tca: new Date(Date.now() + 15 * 60 * 1000),
    closingSpeed: 12,
    relativeBearing: 0,
    isApproaching: true,
    relativeEast: 0.0,
    relativeNorth: 0.8,
    relativeSpeed: 12
  },
  expectedLevel: 'WARNING',
  validate: (result) => {
    console.log(`  Level: ${result.level}`);
    console.log(`  Reason: ${result.reason}`);
    assert(result.level === 'WARNING', 'Should be WARNING at 0.8 NM / 15 min');
  }
};

/**
 * TEST 4: Critical Zone
 * 
 * CPA 0.3 NM, TCPA 6 minutes, closing 15 NM/h
 * Expected: CRITICAL
 */
const test4: TestCase = {
  name: 'TEST 4: Critical Zone (0.3 NM / 6 min)',
  prediction: {
    cpaNm: 0.3,
    tcpaHours: 6 / 60,
    tca: new Date(Date.now() + 6 * 60 * 1000),
    closingSpeed: 15,
    relativeBearing: 180,
    isApproaching: true,
    relativeEast: 0.0,
    relativeNorth: -0.3,
    relativeSpeed: 15
  },
  expectedLevel: 'CRITICAL',
  validate: (result) => {
    console.log(`  Level: ${result.level}`);
    console.log(`  Reason: ${result.reason}`);
    assert(result.level === 'CRITICAL', 'Should be CRITICAL at 0.3 NM / 6 min');
  }
};

/**
 * TEST 5: Already Receding
 * 
 * CPA 0.2 NM, TCPA null (no future approach), closing -5 NM/h (separating)
 * Expected: CAUTION (immediate vicinity exception)
 * 
 * This test validates the protection against false CRITICAL classifications
 * for contacts that are already receding.
 */
const test5: TestCase = {
  name: 'TEST 5: Already Receding (0.2 NM, TCPA null, closing -5)',
  prediction: {
    cpaNm: 0.2,
    tcpaHours: null,  // No future approach
    tca: null,
    closingSpeed: -5,  // Negative: separating
    relativeBearing: 270,
    isApproaching: false,
    relativeEast: -0.2,
    relativeNorth: 0.0,
    relativeSpeed: 5
  },
  expectedLevel: 'CAUTION',  // Minimum alert due to immediate vicinity
  validate: (result) => {
    console.log(`  Level: ${result.level}`);
    console.log(`  Reason: ${result.reason}`);
    console.log(`  TCPA: ${result.tcpaMinutes}`);
    assert(result.level === 'CAUTION', 'Should be CAUTION (immediate vicinity, but receding)');
    assert(result.tcpaMinutes === null, 'TCPA should be null (no future approach)');
    assert(result.closingSpeed < 0, 'Closing speed should be negative (separating)');
  }
};

/**
 * TEST 6: Not Approaching Despite Close
 * 
 * CPA 0.3 NM, TCPA 3 minutes, but isApproaching = false
 * This can happen if the contact is moving parallel or away
 * Expected: NOT CRITICAL despite CPA and TCPA being in critical zone
 * 
 * Validates that isApproaching is a gate before risk assessment.
 */
const test6: TestCase = {
  name: 'TEST 6: Not Approaching Gate (0.3 NM / 3 min / !isApproaching)',
  prediction: {
    cpaNm: 0.3,
    tcpaHours: 3 / 60,
    tca: new Date(Date.now() + 3 * 60 * 1000),
    closingSpeed: 0.1,  // Minimal closing speed
    relativeBearing: 45,
    isApproaching: false,  // KEY: Not approaching
    relativeEast: 0.2,
    relativeNorth: 0.2,
    relativeSpeed: 0.1
  },
  expectedLevel: 'SAFE',  // Should be SAFE due to !isApproaching
  validate: (result) => {
    console.log(`  Level: ${result.level}`);
    console.log(`  Reason: ${result.reason}`);
    assert(result.level === 'SAFE', 'Should be SAFE (!isApproaching protection)');
    assert(result.isApproaching === false, 'isApproaching should remain false');
  }
};

/**
 * TEST 7: Low Closing Speed
 * 
 * CPA 0.7 NM, TCPA 8 minutes, but closing speed 0.2 NM/h (below minimum 0.5)
 * Expected: SAFE
 * 
 * Validates that low closing speed prevents false high-risk classifications.
 */
const test7: TestCase = {
  name: 'TEST 7: Low Closing Speed (0.7 NM / 8 min / 0.2 NM/h)',
  prediction: {
    cpaNm: 0.7,
    tcpaHours: 8 / 60,
    tca: new Date(Date.now() + 8 * 60 * 1000),
    closingSpeed: 0.2,  // Below minimum 0.5 NM/h
    relativeBearing: 45,
    isApproaching: true,
    relativeEast: 0.5,
    relativeNorth: 0.5,
    relativeSpeed: 0.2
  },
  expectedLevel: 'SAFE',
  validate: (result) => {
    console.log(`  Level: ${result.level}`);
    console.log(`  Reason: ${result.reason}`);
    assert(result.level === 'SAFE', 'Should be SAFE (low closing speed)');
  }
};

/**
 * TEST 8: Boundary Condition - Exactly at Caution Thresholds
 * 
 * CPA exactly 2.0 NM, TCPA exactly 30 minutes
 * Expected: CAUTION
 * 
 * Tests deterministic behavior at exact threshold boundaries.
 */
const test8: TestCase = {
  name: 'TEST 8: Boundary Condition (CPA 2.0 / TCPA 30 - caution limits)',
  prediction: {
    cpaNm: 2.0,  // Exactly at threshold
    tcpaHours: 30 / 60,  // Exactly at threshold
    tca: new Date(Date.now() + 30 * 60 * 1000),
    closingSpeed: 4,
    relativeBearing: 90,
    isApproaching: true,
    relativeEast: 2.0,
    relativeNorth: 0.0,
    relativeSpeed: 4
  },
  expectedLevel: 'CAUTION',
  validate: (result) => {
    console.log(`  Level: ${result.level}`);
    console.log(`  Reason: ${result.reason}`);
    assert(result.level === 'CAUTION', 'Should be CAUTION at exact boundaries');
  }
};

/**
 * TEST 9: Boundary Condition - Warning Thresholds
 * 
 * CPA exactly 1.0 NM, TCPA exactly 20 minutes
 * Expected: WARNING
 */
const test9: TestCase = {
  name: 'TEST 9: Boundary Condition (CPA 1.0 / TCPA 20 - warning limits)',
  prediction: {
    cpaNm: 1.0,  // Exactly at threshold
    tcpaHours: 20 / 60,  // Exactly at threshold
    tca: new Date(Date.now() + 20 * 60 * 1000),
    closingSpeed: 8,
    relativeBearing: 0,
    isApproaching: true,
    relativeEast: 0.0,
    relativeNorth: 1.0,
    relativeSpeed: 8
  },
  expectedLevel: 'WARNING',
  validate: (result) => {
    console.log(`  Level: ${result.level}`);
    console.log(`  Reason: ${result.reason}`);
    assert(result.level === 'WARNING', 'Should be WARNING at exact boundaries');
  }
};

/**
 * TEST 10: Boundary Condition - Critical Thresholds
 * 
 * CPA exactly 0.5 NM, TCPA exactly 10 minutes
 * Expected: CRITICAL
 */
const test10: TestCase = {
  name: 'TEST 10: Boundary Condition (CPA 0.5 / TCPA 10 - critical limits)',
  prediction: {
    cpaNm: 0.5,  // Exactly at threshold
    tcpaHours: 10 / 60,  // Exactly at threshold
    tca: new Date(Date.now() + 10 * 60 * 1000),
    closingSpeed: 12,
    relativeBearing: 180,
    isApproaching: true,
    relativeEast: 0.0,
    relativeNorth: -0.5,
    relativeSpeed: 12
  },
  expectedLevel: 'CRITICAL',
  validate: (result) => {
    console.log(`  Level: ${result.level}`);
    console.log(`  Reason: ${result.reason}`);
    assert(result.level === 'CRITICAL', 'Should be CRITICAL at exact boundaries');
  }
};

/**
 * Run all tests
 */
export function runCollisionRiskTests() {
  const tests: TestCase[] = [test1, test2, test3, test4, test5, test6, test7, test8, test9, test10];
  
  console.log('='.repeat(80));
  console.log('PHASE 2: Collision Risk Engine - Tests');
  console.log('='.repeat(80));
  
  let passed = 0;
  let failed = 0;
  
  tests.forEach((test, index) => {
    console.log(`\n[${index + 1}/${tests.length}] ${test.name}`);
    try {
      const result = calculateCollisionRisk(test.prediction);
      
      assertEqual(result.level, test.expectedLevel, `Level mismatch`);
      
      if (test.validate) {
        test.validate(result);
      }
      
      console.log('  ✅ PASSED');
      passed++;
    } catch (error) {
      console.error(`  ❌ FAILED: ${error instanceof Error ? error.message : String(error)}`);
      failed++;
    }
  });
  
  console.log('\n' + '='.repeat(80));
  console.log(`Results: ${passed}/${tests.length} passed, ${failed} failed`);
  console.log('='.repeat(80));
  
  return failed === 0;
}

// Run tests if this file is executed directly
if (require.main === module) {
  const success = runCollisionRiskTests();
  process.exit(success ? 0 : 1);
}
