/**
 * PHASE 4: Tactical Collision Alert Tests
 * 
 * Deterministic tests for collision alert logic and formatting
 */

import { describe, it, expect } from 'vitest';
import { getHighestRiskTarget, formatTcpa, AisTargetWithRisk } from './TacticalCollisionAlert';

describe('TacticalCollisionAlert', () => {
  // BASE TARGET FOR TESTING
  const baseTarget = (overrides?: Partial<AisTargetWithRisk>): AisTargetWithRisk => ({
    mmsi: '1001',
    nombre: 'Test Vessel',
    lat: 36.7215,
    lng: -3.5235,
    cog: 90,
    sog: 10,
    riskLevel: 'SAFE',
    cpaNm: 2.0,
    tcpaMinutes: 30,
    closingSpeed: 0,
    isApproaching: false,
    relativeBearing: 45,
    ...overrides
  });

  // ============ RISK LEVEL FILTERING ============

  // TEST 1: SAFE target is excluded
  it('TEST 1: SAFE target → not displayed', () => {
    const targets = [
      baseTarget({ mmsi: '1001', riskLevel: 'SAFE' })
    ];

    const result = getHighestRiskTarget(targets);

    expect(result).toBeNull();
  });

  // TEST 2: CAUTION target is shown
  it('TEST 2: CAUTION target → displayed', () => {
    const targets = [
      baseTarget({ mmsi: '1002', riskLevel: 'CAUTION' })
    ];

    const result = getHighestRiskTarget(targets);

    expect(result).not.toBeNull();
    expect(result?.riskLevel).toBe('CAUTION');
  });

  // TEST 3: WARNING target is shown
  it('TEST 3: WARNING target → displayed', () => {
    const targets = [
      baseTarget({ mmsi: '1003', riskLevel: 'WARNING' })
    ];

    const result = getHighestRiskTarget(targets);

    expect(result).not.toBeNull();
    expect(result?.riskLevel).toBe('WARNING');
  });

  // TEST 4: CRITICAL target is shown
  it('TEST 4: CRITICAL target → displayed', () => {
    const targets = [
      baseTarget({ mmsi: '1004', riskLevel: 'CRITICAL' })
    ];

    const result = getHighestRiskTarget(targets);

    expect(result).not.toBeNull();
    expect(result?.riskLevel).toBe('CRITICAL');
  });

  // ============ PRIORITY LOGIC ============

  // TEST 5: CRITICAL > WARNING
  it('TEST 5: Multiple targets, CRITICAL has priority over WARNING', () => {
    const targets = [
      baseTarget({ mmsi: '1005', riskLevel: 'WARNING', tcpaMinutes: 5 }),
      baseTarget({ mmsi: '1006', riskLevel: 'CRITICAL', tcpaMinutes: 30 })
    ];

    const result = getHighestRiskTarget(targets);

    expect(result?.mmsi).toBe('1006');
    expect(result?.riskLevel).toBe('CRITICAL');
  });

  // TEST 6: WARNING > CAUTION
  it('TEST 6: WARNING has priority over CAUTION', () => {
    const targets = [
      baseTarget({ mmsi: '1007', riskLevel: 'CAUTION', tcpaMinutes: 2 }),
      baseTarget({ mmsi: '1008', riskLevel: 'WARNING', tcpaMinutes: 25 })
    ];

    const result = getHighestRiskTarget(targets);

    expect(result?.mmsi).toBe('1008');
    expect(result?.riskLevel).toBe('WARNING');
  });

  // TEST 7: CAUTION > SAFE (but SAFE filtered)
  it('TEST 7: CAUTION shown when mixed with SAFE', () => {
    const targets = [
      baseTarget({ mmsi: '1009', riskLevel: 'SAFE', tcpaMinutes: 1 }),
      baseTarget({ mmsi: '1010', riskLevel: 'CAUTION', tcpaMinutes: 25 })
    ];

    const result = getHighestRiskTarget(targets);

    expect(result?.mmsi).toBe('1010');
    expect(result?.riskLevel).toBe('CAUTION');
  });

  // ============ WITHIN SAME RISK LEVEL ============

  // TEST 8: Same level: lower TCPA wins
  it('TEST 8: Same risk level, lower TCPA wins', () => {
    const targets = [
      baseTarget({ mmsi: '1011', riskLevel: 'WARNING', tcpaMinutes: 20 }),
      baseTarget({ mmsi: '1012', riskLevel: 'WARNING', tcpaMinutes: 8 })
    ];

    const result = getHighestRiskTarget(targets);

    expect(result?.mmsi).toBe('1012');
    expect(result?.tcpaMinutes).toBe(8);
  });

  // TEST 9: Same level, same TCPA: lower CPA wins
  it('TEST 9: Same risk/TCPA, lower CPA wins', () => {
    const targets = [
      baseTarget({ mmsi: '1013', riskLevel: 'CAUTION', tcpaMinutes: 25, cpaNm: 1.5 }),
      baseTarget({ mmsi: '1014', riskLevel: 'CAUTION', tcpaMinutes: 25, cpaNm: 0.8 })
    ];

    const result = getHighestRiskTarget(targets);

    expect(result?.mmsi).toBe('1014');
    expect(result?.cpaNm).toBe(0.8);
  });

  // TEST 10: TCPA null vs valid: valid wins
  it('TEST 10: Valid TCPA prioritized over null TCPA (same level)', () => {
    const targets = [
      baseTarget({ mmsi: '1015', riskLevel: 'CAUTION', tcpaMinutes: null, cpaNm: 1.2 }),
      baseTarget({ mmsi: '1016', riskLevel: 'CAUTION', tcpaMinutes: 25, cpaNm: 1.8 })
    ];

    const result = getHighestRiskTarget(targets);

    expect(result?.mmsi).toBe('1016');
    expect(result?.tcpaMinutes).toBe(25);
  });

  // ============ TCPA FORMATTING ============

  // TEST 11: formatTcpa - sub-minute
  it('TEST 11: formatTcpa - 0.5 minutes → 00:30', () => {
    const result = formatTcpa(0.5);

    expect(result).toBe('00:30');
  });

  // TEST 12: formatTcpa - minutes + seconds
  it('TEST 12: formatTcpa - 4.75 minutes → 04:45', () => {
    const result = formatTcpa(4.75);

    expect(result).toBe('04:45');
  });

  // TEST 13: formatTcpa - hour range
  it('TEST 13: formatTcpa - 63 minutes → 01:03:00', () => {
    const result = formatTcpa(63);

    expect(result).toBe('01:03:00');
  });

  // TEST 14: formatTcpa - null
  it('TEST 14: formatTcpa - null → "—"', () => {
    const result = formatTcpa(null);

    expect(result).toBe('—');
  });

  // TEST 15: formatTcpa - negative (passed)
  it('TEST 15: formatTcpa - negative → "PASSED"', () => {
    const result = formatTcpa(-5);

    expect(result).toBe('PASSED');
  });

  // ============ EMPTY/EDGE CASES ============

  // TEST 16: Empty targets array
  it('TEST 16: Empty targets → null', () => {
    const result = getHighestRiskTarget([]);

    expect(result).toBeNull();
  });

  // TEST 17: All SAFE targets
  it('TEST 17: All SAFE targets → null', () => {
    const targets = [
      baseTarget({ mmsi: '1017', riskLevel: 'SAFE' }),
      baseTarget({ mmsi: '1018', riskLevel: 'SAFE' })
    ];

    const result = getHighestRiskTarget(targets);

    expect(result).toBeNull();
  });

  // TEST 18: Single CRITICAL
  it('TEST 18: Single CRITICAL target', () => {
    const targets = [
      baseTarget({ mmsi: '1019', riskLevel: 'CRITICAL', cpaNm: 0.3, tcpaMinutes: 5 })
    ];

    const result = getHighestRiskTarget(targets);

    expect(result?.riskLevel).toBe('CRITICAL');
    expect(result?.cpaNm).toBe(0.3);
  });

  // ============ STALENESS / UPDATES ============

  // TEST 19: Alert update (same contact, TCPA changes)
  it('TEST 19: Alert does not re-trigger on TCPA update', () => {
    const contact1 = baseTarget({ mmsi: '1020', riskLevel: 'WARNING', tcpaMinutes: 20 });
    const contact2 = baseTarget({ mmsi: '1020', riskLevel: 'WARNING', tcpaMinutes: 15 });

    const result1 = getHighestRiskTarget([contact1]);
    const result2 = getHighestRiskTarget([contact2]);

    // Same MMSI, but TCPA changed - should be same contact, updated values
    expect(result1?.mmsi).toBe(result2?.mmsi);
    expect(result1?.tcpaMinutes).toBe(20);
    expect(result2?.tcpaMinutes).toBe(15);
  });

  // TEST 20: Alert escalation (WARNING → CRITICAL same contact)
  it('TEST 20: Alert escalates when risk increases (WARNING → CRITICAL)', () => {
    const contact1 = baseTarget({ mmsi: '1021', riskLevel: 'WARNING', cpaNm: 1.2 });
    const contact2 = baseTarget({ mmsi: '1021', riskLevel: 'CRITICAL', cpaNm: 0.3 });

    const result1 = getHighestRiskTarget([contact1]);
    const result2 = getHighestRiskTarget([contact2]);

    expect(result1?.riskLevel).toBe('WARNING');
    expect(result2?.riskLevel).toBe('CRITICAL');
    expect(result2?.cpaNm).toBe(0.3);
  });

  // TEST 21: Contact changes when new higher-risk appears
  it('TEST 21: Alert switches to new higher-risk target', () => {
    const targets1 = [
      baseTarget({ mmsi: '1022', riskLevel: 'WARNING', tcpaMinutes: 15 })
    ];

    const targets2 = [
      baseTarget({ mmsi: '1022', riskLevel: 'WARNING', tcpaMinutes: 15 }),
      baseTarget({ mmsi: '1023', riskLevel: 'CRITICAL', tcpaMinutes: 8 })
    ];

    const result1 = getHighestRiskTarget(targets1);
    const result2 = getHighestRiskTarget(targets2);

    expect(result1?.mmsi).toBe('1022');
    expect(result2?.mmsi).toBe('1023');
  });

  // TEST 22: Contact with missing MMSI/nombre
  it('TEST 22: Contact without MMSI or name still displays', () => {
    const targets = [
      baseTarget({
        mmsi: undefined,
        nombre: undefined,
        riskLevel: 'CAUTION',
        tcpaMinutes: 20
      })
    ];

    const result = getHighestRiskTarget(targets);

    expect(result?.riskLevel).toBe('CAUTION');
    expect(result?.tcpaMinutes).toBe(20);
  });

  // TEST 23: Complex scenario - multiple levels and priorities
  it('TEST 23: Complex scenario with mixed risks', () => {
    const targets = [
      baseTarget({ mmsi: '2001', riskLevel: 'SAFE', tcpaMinutes: 2 }),
      baseTarget({ mmsi: '2002', riskLevel: 'CAUTION', tcpaMinutes: 30 }),
      baseTarget({ mmsi: '2003', riskLevel: 'WARNING', tcpaMinutes: 40 }),
      baseTarget({ mmsi: '2004', riskLevel: 'CAUTION', tcpaMinutes: 5 }),
      baseTarget({ mmsi: '2005', riskLevel: 'CRITICAL', tcpaMinutes: 50 })
    ];

    const result = getHighestRiskTarget(targets);

    // Should pick CRITICAL even though TCPA is highest
    expect(result?.mmsi).toBe('2005');
    expect(result?.riskLevel).toBe('CRITICAL');
  });
});
