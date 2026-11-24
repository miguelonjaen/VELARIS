// Alarmas de sistemas del barco con lecturas medidas y registro de transiciones (node:test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AlarmTransitionTracker, evaluateBoatAlarms, type MeasuredBoatSensors } from './boatAlarms';

const NONE: MeasuredBoatSensors = {
  depthM: null, engineTempC: null, engineRpm: null, oilPressureBar: null,
  batteryVolts: null, fuelPercent: null, freshWaterPercent: null
};

test('10 · sin sensores no se evalúa ninguna alarma (ni se inventa ni se resuelve)', () => {
  assert.deepEqual(evaluateBoatAlarms(NONE), []);
});

test('alarmas medidas: profundidad, temperatura, combustible, agua y batería 12/24 V', () => {
  const byType = (s: Partial<MeasuredBoatSensors>) =>
    Object.fromEntries(evaluateBoatAlarms({ ...NONE, ...s }).map(e => [e.type, e.severity]));
  assert.deepEqual(byType({ depthM: 1.8 }), { depth: 'critical' });
  assert.deepEqual(byType({ depthM: 12 }), { depth: null });
  assert.deepEqual(byType({ engineTempC: 96 }), { engine_temp: 'critical' });
  assert.deepEqual(byType({ fuelPercent: 10 }), { fuel: 'warning' });
  assert.deepEqual(byType({ fuelPercent: 3 }), { fuel: 'critical' });
  assert.deepEqual(byType({ freshWaterPercent: 9 }), { water_low: 'warning' });
  assert.deepEqual(byType({ batteryVolts: 11.8 }), { battery_low: 'warning' });
  assert.deepEqual(byType({ batteryVolts: 11.2 }), { battery_low: 'critical' });
  assert.deepEqual(byType({ batteryVolts: 24.6 }), { battery_low: null });
  assert.deepEqual(byType({ batteryVolts: 23.5 }), { battery_low: 'warning' });
});

test('presión de aceite: solo es alarma con el motor girando según RPM medidas', () => {
  const sev = (s: Partial<MeasuredBoatSensors>) => evaluateBoatAlarms({ ...NONE, ...s }).find(e => e.type === 'oil_pressure')?.severity;
  assert.equal(sev({ oilPressureBar: 0.2, engineRpm: 1800 }), 'critical');
  assert.equal(sev({ oilPressureBar: 0.0, engineRpm: 0 }), null, 'motor parado: presión nula es normal');
  assert.equal(sev({ oilPressureBar: 0.2 }), undefined, 'sin RPM no se puede decidir');
});

test('6 · transiciones: activación, cambio de severidad y resolución, sin repetir por ciclo', () => {
  const tracker = new AlarmTransitionTracker();
  const log: string[] = [];
  const cycle = (severity: string | null) => { const t = tracker.update('fuel', severity); if (t) log.push(t); };
  for (let i = 0; i < 10; i++) cycle('warning');
  cycle('critical');
  for (let i = 0; i < 10; i++) cycle('critical');
  for (let i = 0; i < 10; i++) cycle(null);
  assert.deepEqual(log, ['ACTIVATED', 'SEVERITY_CHANGED', 'RESOLVED']);
  tracker.update('depth', 'critical');
  tracker.forget('depth');
  assert.equal(tracker.update('depth', null), null, 'olvidada: no se registra resolución');
  assert.equal(tracker.update('depth', 'critical'), 'ACTIVATED');
});
