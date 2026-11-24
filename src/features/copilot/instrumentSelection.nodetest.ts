import test from 'node:test';
import assert from 'node:assert/strict';
import type { BoatInstrumentSnapshot } from '../../core/instruments/BoatInstrumentStore';
import { selectOfficerInstruments } from './instrumentSelection';

const empty = (): BoatInstrumentSnapshot => ({ depth: null, windApparent: null, windTrue: null, engines: [], alternatorVolts: null, batteries: [], tanks: [] });

test('SIMULATOR aporta RPM, sonda y baterías sin convertirse en BOAT', () => {
  const simulator: BoatInstrumentSnapshot = { ...empty(), depth: { value: { meters: 8, reference: 'transducer' }, ageMs: 10 },
    engines: [{ engine: 1, rpm: { value: 900, ageMs: 10 }, temperatureC: null, oilPressureBar: null }],
    batteries: [{ name: 'SERVICE', role: 'service', volts: { value: 12.5, ageMs: 10 }, amps: null }] };
  const result = selectOfficerInstruments(empty(), simulator);
  assert.equal(result.snapshot.engines[0]?.rpm?.value, 900);
  assert.equal(result.snapshot.depth?.value.meters, 8);
  assert.equal(result.simulated, true);
  assert.deepEqual([...result.sources], ['SIMULATOR']);
});

test('BOAT prevalece campo a campo y conserva los campos simulados ausentes en BOAT', () => {
  const boat: BoatInstrumentSnapshot = { ...empty(), engines: [{ engine: 1, rpm: { value: 1200, ageMs: 5 }, temperatureC: null, oilPressureBar: null }] };
  const simulator: BoatInstrumentSnapshot = { ...empty(), engines: [{ engine: 1, rpm: { value: 700, ageMs: 5 }, temperatureC: { value: 74, ageMs: 5 }, oilPressureBar: null }] };
  const result = selectOfficerInstruments(boat, simulator);
  assert.equal(result.snapshot.engines[0]?.rpm?.value, 1200);
  assert.equal(result.snapshot.engines[0]?.temperatureC?.value, 74);
  assert.deepEqual(new Set(result.sources), new Set(['BOAT', 'SIMULATOR']));
});

test('sin datos no inventa lecturas ni procedencia', () => {
  const result = selectOfficerInstruments(empty(), empty());
  assert.equal(result.snapshot.depth, null);
  assert.equal(result.snapshot.engines.length, 0);
  assert.equal(result.sources.size, 0);
});
