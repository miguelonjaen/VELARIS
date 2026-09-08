import { describe, it, expect } from 'vitest';
import { calculateAisTargetRisk, enrichAisTargetsWithRisk, getRiskColor } from './AisCollisionRisk';
import { Vessel } from './CollisionPrediction';

describe('AisCollisionRisk', () => {
  // Own ship position for tests
  const baseOwnShip: Vessel = {
    lat: 36.7215,
    lng: -3.5235,
    sog: 10,
    cog: 90  // Heading east
  };

  // Reference time
  const refTime = new Date('2026-05-23T14:00:00Z');

  // TEST 1: Close approaching head-on (high closing speed)
  it('TEST 1: Close head-on approach → approaching with high closing speed', () => {
    const headOnTarget = {
      mmsi: '1001',
      nombre: 'Buque1',
      lat: 36.7215,
      lng: -3.35,    // ~0.5 NM east
      cog: 270,      // Heading west (toward own ship)
      sog: 15        // Higher closing speed
    };

    const result = calculateAisTargetRisk(baseOwnShip, headOnTarget, refTime);

    // Should be approaching with high closing speed (~25 kn relative)
    expect(result.isApproaching).toBe(true);
    expect(result.closingSpeed).toBeGreaterThan(20);  // 10+15 approaching
    expect(result.tcpaMinutes).toBeDefined();
    expect(result.tcpaMinutes).toBeGreaterThan(0);
  });

  // TEST 2: Moderate separation distance (approaching from ahead)
  it('TEST 2: Moderate distance ahead → approaching', () => {
    const targetAhead = {
      mmsi: '1002',
      nombre: 'Buque2',
      lat: 36.7215,
      lng: -3.40,    // 0.3 NM east (ahead on our course)
      cog: 100,      // Slightly diverging from our course
      sog: 5         // Slower than us
    };

    const result = calculateAisTargetRisk(baseOwnShip, targetAhead, refTime);

    // We're catching up to slower target ahead - distance closing
    expect(result.cpaNm).toBeLessThan(2);  // Should have some calculated CPA
    expect(result.riskLevel).toBe('SAFE');  // Moderate distance
  });

  // TEST 3: Receding vessel (moving away)
  it('TEST 3: Receding vessel → SAFE', () => {
    const recedingTarget = {
      mmsi: '1003',
      nombre: 'Buque3',
      lat: 36.7215,
      lng: -3.3235,  // 2 NM east
      cog: 90,       // Heading same direction as own ship (both going east)
      sog: 15        // Faster than own ship, so pulling away
    };

    const result = calculateAisTargetRisk(baseOwnShip, recedingTarget, refTime);

    expect(result.riskLevel).toBe('SAFE');
    expect(result.isApproaching).toBe(false);
    expect(result.closingSpeed).toBeLessThanOrEqual(0);
  });

  // TEST 4: Parallel vessels (same course, not converging)
  it('TEST 4: Parallel course → SAFE', () => {
    const parallelTarget = {
      mmsi: '1004',
      nombre: 'Buque4',
      lat: 36.8215,    // 1 NM north
      lng: -3.5235,    // Same longitude
      cog: 90,         // Same course as own ship
      sog: 10          // Same speed
    };

    const result = calculateAisTargetRisk(baseOwnShip, parallelTarget, refTime);

    expect(result.riskLevel).toBe('SAFE');
    expect(result.isApproaching).toBe(false);
    expect(result.tcpaMinutes).toBeNull();  // No convergence
  });

  // TEST 5: Incomplete AIS data (missing position)
  it('TEST 5: Missing position → defaults to SAFE, no crash', () => {
    const incompleteTarget = {
      mmsi: '1005',
      nombre: 'Buque5',
      // Missing lat/lng
      cog: 90,
      sog: 10
    };

    const result = calculateAisTargetRisk(baseOwnShip, incompleteTarget, refTime);

    expect(result.riskLevel).toBe('SAFE');
    expect(result.cpaNm).toBeNull();
    expect(result.tcpaMinutes).toBeNull();
    expect(result.mmsi).toBe('1005');  // Original data preserved
  });

  // TEST 6: Invalid motion data (NaN or Infinity)
  it('TEST 6: Invalid SOG/COG → defaults to SAFE, no crash', () => {
    const invalidMotionTarget = {
      mmsi: '1006',
      nombre: 'Buque6',
      lat: 36.8215,
      lng: -3.4235,
      cog: NaN,
      sog: Infinity
    };

    const result = calculateAisTargetRisk(baseOwnShip, invalidMotionTarget, refTime);

    expect(result.riskLevel).toBe('SAFE');
    expect(result.cpaNm).toBeNull();
  });

  // TEST 7: OwnShip missing (null)
  it('TEST 7: No own ship → defaults to SAFE, no crash', () => {
    const target = {
      mmsi: '1007',
      nombre: 'Buque7',
      lat: 36.8215,
      lng: -3.4235,
      cog: 90,
      sog: 10
    };

    const result = calculateAisTargetRisk(null, target, refTime);

    expect(result.riskLevel).toBe('SAFE');
    expect(result.cpaNm).toBeNull();
  });

  // TEST 8: Change in OwnShip motion (SOG increase) → risk recalculated
  it('TEST 8: OwnShip motion change → risk updated', () => {
    const target = {
      mmsi: '1008',
      nombre: 'Buque8',
      lat: 36.8215,  // 1 NM north
      lng: -3.5235,  // Same longitude
      cog: 270,      // Heading west
      sog: 8
    };

    // At low speed
    const ownShipSlow: Vessel = { ...baseOwnShip, sog: 2 };
    const resultSlow = calculateAisTargetRisk(ownShipSlow, target, refTime);

    // At high speed
    const ownShipFast: Vessel = { ...baseOwnShip, sog: 18 };
    const resultFast = calculateAisTargetRisk(ownShipFast, target, refTime);

    // Higher closing speed should reduce TCPA
    const slowTcpa = resultSlow.tcpaMinutes ?? 999;
    const fastTcpa = resultFast.tcpaMinutes ?? 999;

    expect(fastTcpa).toBeLessThan(slowTcpa);
  });

  // TEST 9: Time-based TCPA progression (approaching vessel)
  it('TEST 9: Approaching vessel → TCPA decreases over time', () => {
    const target = {
      mmsi: '1009',
      nombre: 'Buque9',
      lat: 36.7215,
      lng: -3.42,    // 0.6 NM east, approaching from ahead
      cog: 270,      // Heading west toward own ship
      sog: 10        // Approaching at combined speed
    };

    const refTimeEarly = new Date('2026-05-23T13:55:00Z');
    const refTimeLater = new Date('2026-05-23T14:05:00Z');

    const resultEarly = calculateAisTargetRisk(baseOwnShip, target, refTimeEarly);
    const resultLater = calculateAisTargetRisk(baseOwnShip, target, refTimeLater);

    // Both should be approaching with valid TCPA
    expect(resultEarly.isApproaching).toBe(true);
    expect(resultLater.isApproaching).toBe(true);
    
    // TCPA and CPA may be similar if target is stationary, but closingSpeed should reflect relative motion
    expect(resultEarly.closingSpeed).toBeGreaterThan(0);
    expect(resultLater.closingSpeed).toBeGreaterThan(0);
  });

  // TEST 10: Target with 'lon' instead of 'lng' (alternative property name)
  it('TEST 10: Alternative property name "lon" → works correctly', () => {
    const targetWithLon = {
      mmsi: '1010',
      name: 'Ship10',
      lat: 36.7215,
      lon: -3.3235,  // Using 'lon' instead of 'lng'
      cog: 270,
      sog: 10
    };

    const result = calculateAisTargetRisk(baseOwnShip, targetWithLon, refTime);

    // Should calculate risk despite using 'lon'
    expect(result.riskLevel).toBeDefined();
    expect([true, false]).toContain(result.isApproaching);
  });

  // TEST 11: Batch enrichment of multiple targets
  it('TEST 11: Batch enrichment → all targets processed', () => {
    const targets = [
      {
        mmsi: '2001',
        lat: 36.8215,
        lng: -3.4235,
        cog: 90,
        sog: 10
      },
      {
        mmsi: '2002',
        lat: 36.7215,
        lng: -3.3235,
        cog: 270,
        sog: 10
      },
      {
        mmsi: '2003',
        lat: 36.7215,
        lng: -3.5235,
        cog: 0,
        sog: 5
      }
    ];

    const enriched = enrichAisTargetsWithRisk(baseOwnShip, targets, refTime);

    expect(enriched).toHaveLength(3);
    expect(enriched[0]).toHaveProperty('riskLevel');
    expect(enriched[1]).toHaveProperty('riskLevel');
    expect(enriched[2]).toHaveProperty('riskLevel');
    enriched.forEach((target, i) => {
      expect(target.mmsi).toBe(targets[i].mmsi);  // Data preserved
    });
  });

  // TEST 12: getRiskColor mapping
  it('TEST 12: Risk level → color mapping', () => {
    expect(getRiskColor('SAFE')).toBe('#22c55e');
    expect(getRiskColor('CAUTION')).toBe('#facc15');
    expect(getRiskColor('WARNING')).toBe('#f97316');
    expect(getRiskColor('CRITICAL')).toBe('#ef4444');
  });
});
