import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { SyntheticRadar, RadarChannel, polarPoint, displayBearing } from './radar';

test('nautical axes and heading orientation', () => {
  assert.deepEqual(polarPoint(0, 100), { x: 0, y: -100 });
  assert.ok(Math.abs(polarPoint(90, 100).x - 100) < 1e-9);
  assert.equal(displayBearing(350, 'north-up', 20), 10);
  assert.equal(displayBearing(350, 'head-up', null), 350);
  for (const h of [null, NaN, Infinity, -1, 360]) assert.equal(displayBearing(0, 'north-up', h), null);
});
test('deterministic echoes independent of scheduler batching', () => {
  const a = new SyntheticRadar(7), b = new SyntheticRadar(7);
  const all = a.advance(1000, 2778);
  const chunks = [...b.advance(400, 2778), ...b.advance(1000, 2778)];
  assert.deepEqual(all, chunks);
  assert.ok(all.some(s => s.samples.some(v => v > 100)));
  assert.notDeepEqual(all, new SyntheticRadar(8).advance(1000, 2778));
});
test('temporal coherence, rotation and bounded suspension recovery', () => {
  const a = new SyntheticRadar();
  const spokes = a.advance(2500, 2778);
  assert.equal(spokes.length, 360);
  assert.equal(spokes.at(-1)?.bearingDeg, 0);
  assert.equal(spokes.at(-1)?.timeMs, 2500);
  assert.deepEqual(a.advance(2500, 2778), []);
  assert.throws(() => a.advance(2000, 2778));
  assert.equal(a.advance(1e8, 2778).length, 360);
  for (const n of [NaN, Infinity, -1, Number.MAX_VALUE]) assert.throws(() => new SyntheticRadar().advance(n, 2778));
  a.reset(); assert.equal(a.advance(0, 2778)[0].sequence, 0);
});
test('SIM and REAL buses reject cross-source and invalid data; snapshots own bytes', () => {
  const sim = new RadarChannel('RADAR_SIM'), real = new RadarChannel('RADAR_REAL');
  const spoke = new SyntheticRadar().advance(0, 2778)[0];
  assert.equal(real.accept(spoke), false);
  assert.equal(sim.accept({ ...spoke, source: 'RADAR_REAL' }), false);
  assert.equal(sim.accept({ ...spoke, bearingDeg: NaN }), false);
  assert.equal(sim.accept({ ...spoke, rangeM: 0 }), false);
  assert.equal(sim.accept(spoke), true);
  const before = sim.snapshot(0)!.samples[0];
  spoke.samples[0] = 255;
  assert.equal(sim.snapshot(0)!.samples[0], before);
  sim.snapshot(0)!.samples[0] = 255;
  assert.equal(sim.snapshot(0)!.samples[0], before);
  assert.equal(sim.accept(spoke), false);
  assert.equal(sim.snapshot(-1), null);
  assert.equal(sim.snapshot(3001), null);
  sim.reset(); assert.equal(sim.snapshot(0), null);
  assert.equal(real.snapshot(0), null);
});
test('radar model has no imports or operational outputs; UI only consumes local radar', () => {
  const model = readFileSync(new URL('./radar.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(model, /^import\s/m);
  assert.doesNotMatch(model, /window\.|dispatchEvent|WebSocket|localStorage|fetch\(/);
  const ui = readFileSync(new URL('./RadarPanel.tsx', import.meta.url), 'utf8');
  const imports = ui.split('\n').filter(l => l.startsWith('import'));
  assert.equal(imports.length, 6);
  assert.doesNotMatch(imports.join('\n'), /telemetry|SharedNavigation|aisPanel|Alarm|supabase/i);
});
