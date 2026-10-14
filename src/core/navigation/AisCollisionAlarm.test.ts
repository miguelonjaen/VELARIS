/**
 * AIS Collision Alarm (CPA/TCPA) - Tests
 *
 * Ejecutar: npx tsx src/core/navigation/AisCollisionAlarm.test.ts
 */

import {
  evaluateAisCollisionAlarm,
  classifyAisTargetAlarm,
  DEFAULT_AIS_ALARM_OPTIONS,
  AisCollisionAlarmResult
} from './AisCollisionAlarm';
import { calculateAisTargetRisk } from './AisCollisionRisk';
import { Vessel } from './CollisionPrediction';

interface TestCase {
  name: string;
  run: () => void;
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const OPTS = { ...DEFAULT_AIS_ALARM_OPTIONS, minCpaNm: 0.27 };
const NOW = 1_780_000_000_000;

// Barco propio frente a Motril, rumbo 090 a 6 kn
const OWN: Vessel = { lat: 36.70, lng: -3.50, sog: 6, cog: 90 };
const OWN_MOORED: Vessel = { lat: 36.70, lng: -3.50, sog: 0, cog: 0 };

const tests: TestCase[] = [
  {
    name: 'Sin blancos -> sin alarma',
    run: () => {
      const r = evaluateAisCollisionAlarm([], OPTS, NOW);
      assert(r.severity === null && r.message === null, 'esperaba sin alarma');
    }
  },
  {
    name: 'CAUTION por sí solo no dispara alarma',
    run: () => {
      const r = evaluateAisCollisionAlarm([
        { mmsi: 1, riskLevel: 'CAUTION', cpaNm: 1.5, tcpaMinutes: 25, isApproaching: true }
      ], OPTS, NOW);
      assert(r.severity === null, 'CAUTION no debe alarmar');
    }
  },
  {
    name: 'WARNING -> warning, CRITICAL -> critical',
    run: () => {
      assert(classifyAisTargetAlarm({ riskLevel: 'WARNING', cpaNm: 0.8, tcpaMinutes: 15, isApproaching: true }, OPTS) === 'warning', 'WARNING');
      assert(classifyAisTargetAlarm({ riskLevel: 'CRITICAL', cpaNm: 0.3, tcpaMinutes: 5, isApproaching: true }, OPTS) === 'critical', 'CRITICAL');
    }
  },
  {
    name: 'Anillo de seguridad: CPA < minCPA acercándose con TCPA en horizonte -> critical',
    run: () => {
      const s = classifyAisTargetAlarm({ riskLevel: 'CAUTION', cpaNm: 0.1, tcpaMinutes: 25, isApproaching: true }, OPTS);
      assert(s === 'critical', 'esperaba critical, obtuve ' + s);
    }
  },
  {
    name: 'Anillo NO dispara si el blanco se aleja (CPA = distancia actual)',
    run: () => {
      const s = classifyAisTargetAlarm({ riskLevel: 'SAFE', cpaNm: 0.1, tcpaMinutes: null, isApproaching: false }, OPTS);
      assert(s === null, 'blanco alejándose no debe alarmar');
    }
  },
  {
    name: 'Anillo NO dispara si TCPA supera el horizonte',
    run: () => {
      const s = classifyAisTargetAlarm({ riskLevel: 'SAFE', cpaNm: 0.1, tcpaMinutes: 90, isApproaching: true }, OPTS);
      assert(s === null, 'TCPA lejano no debe alarmar');
    }
  },
  {
    name: 'Selección: un SAFE con CPA menor NO enmascara a un CRITICAL',
    run: () => {
      const r = evaluateAisCollisionAlarm([
        { mmsi: 'SAFE_CERCA', riskLevel: 'SAFE', cpaNm: 0.05, tcpaMinutes: null, isApproaching: false },
        { mmsi: 'PELIGRO', nombre: 'MSC GAIA', riskLevel: 'CRITICAL', cpaNm: 0.3, tcpaMinutes: 6, isApproaching: true, relativeBearing: 45 }
      ], OPTS, NOW);
      assert(r.severity === 'critical', 'esperaba critical');
      assert(r.targetId === 'PELIGRO', 'esperaba PELIGRO, obtuve ' + r.targetId);
      assert(r.dangerousCount === 1, 'dangerousCount');
    }
  },
  {
    name: 'Selección: critical > warning; a igual severidad gana menor TCPA',
    run: () => {
      const r = evaluateAisCollisionAlarm([
        { mmsi: 'W', riskLevel: 'WARNING', cpaNm: 0.6, tcpaMinutes: 2, isApproaching: true },
        { mmsi: 'C1', riskLevel: 'CRITICAL', cpaNm: 0.1, tcpaMinutes: 9, isApproaching: true },
        { mmsi: 'C2', riskLevel: 'CRITICAL', cpaNm: 0.4, tcpaMinutes: 4, isApproaching: true }
      ], OPTS, NOW);
      assert(r.targetId === 'C2', 'esperaba C2, obtuve ' + r.targetId);
      assert(r.dangerousCount === 3, 'dangerousCount=' + r.dangerousCount);
      assert((r.message ?? '').endsWith('(+2)'), 'mensaje debe indicar +2: ' + r.message);
    }
  },
  {
    name: 'Blancos obsoletos (timestamp ms > staleAfterMs) se ignoran',
    run: () => {
      const r = evaluateAisCollisionAlarm([
        { mmsi: 'OLD', riskLevel: 'CRITICAL', cpaNm: 0.1, tcpaMinutes: 3, isApproaching: true, timestamp: NOW - 10 * 60 * 1000 }
      ], OPTS, NOW);
      assert(r.severity === null, 'blanco obsoleto no debe alarmar');
    }
  },
  {
    name: 'Mensaje: formato CPA/TCPA/Demora',
    run: () => {
      const r = evaluateAisCollisionAlarm([
        { mmsi: 1, nombre: 'SEA STAR', riskLevel: 'CRITICAL', cpaNm: 0.123, tcpaMinutes: 6.44, isApproaching: true, relativeBearing: 5.4 }
      ], OPTS, NOW);
      const expected = 'PELIGRO COLISIÓN: SEA STAR · CPA 0.12 NM · TCPA 6.4 min · Dem 005°';
      assert(r.message === expected, 'mensaje: ' + r.message);
    }
  },
  {
    name: 'E2E: barco amarrado a 0.1 NM con ambos parados -> SIN alarma (falso positivo previo)',
    run: () => {
      const moored = calculateAisTargetRisk(OWN_MOORED, {
        mmsi: 'AMARRADO', lat: 36.70, lng: -3.50 + 0.1 / (60 * Math.cos(36.70 * Math.PI / 180)), cog: 0, sog: 0
      }, new Date(NOW));
      const r = evaluateAisCollisionAlarm([moored], OPTS, NOW);
      assert(r.severity === null, 'no debe alarmar: ' + r.reason + ' cpa=' + moored.cpaNm);
    }
  },
  {
    name: 'E2E: rumbo de colisión de frente a 2 NM -> critical',
    run: () => {
      // Blanco 2 NM al Este, rumbo 270 a 10 kn: cierre 16 kn -> TCPA 7.5 min, CPA ~0
      const dLng = 2 / (60 * Math.cos(36.70 * Math.PI / 180));
      const target = calculateAisTargetRisk(OWN, {
        mmsi: 'FERRY', nombre: 'FERRY', lat: 36.70, lng: -3.50 + dLng, cog: 270, sog: 10
      }, new Date(NOW));
      const r: AisCollisionAlarmResult = evaluateAisCollisionAlarm([target], OPTS, NOW);
      assert(r.severity === 'critical', 'esperaba critical, obtuve ' + r.severity + ' (' + target.riskLevel + ')');
      assert(r.tcpaMinutes !== null && Math.abs(r.tcpaMinutes - 7.5) < 0.2, 'TCPA ~7.5, obtuve ' + r.tcpaMinutes);
      assert(r.cpaNm !== null && r.cpaNm < 0.01, 'CPA ~0, obtuve ' + r.cpaNm);
    }
  },
  {
    name: 'E2E: blanco que ya pasó y se aleja a 0.2 NM -> SIN alarma',
    run: () => {
      const dLng = 0.2 / (60 * Math.cos(36.70 * Math.PI / 180));
      const target = calculateAisTargetRisk(OWN, {
        mmsi: 'PASADO', lat: 36.70, lng: -3.50 - dLng, cog: 270, sog: 10
      }, new Date(NOW));
      const r = evaluateAisCollisionAlarm([target], OPTS, NOW);
      assert(r.severity === null, 'no debe alarmar: ' + r.reason + ' riskLevel=' + target.riskLevel);
    }
  }
];

export function runAisCollisionAlarmTests(): boolean {
  let passed = 0;
  let failed = 0;
  console.log('='.repeat(80));
  console.log('AIS COLLISION ALARM (CPA/TCPA) - TESTS');
  console.log('='.repeat(80));
  for (const test of tests) {
    try {
      test.run();
      console.log('  ✅ ' + test.name);
      passed++;
    } catch (error) {
      console.error('  ❌ ' + test.name + ': ' + (error instanceof Error ? error.message : String(error)));
      failed++;
    }
  }
  console.log('Results: ' + passed + '/' + tests.length + ' passed, ' + failed + ' failed');
  return failed === 0;
}

if (require.main === module) {
  const success = runAisCollisionAlarmTests();
  process.exit(success ? 0 : 1);
}
