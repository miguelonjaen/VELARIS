import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSailHudHtml } from './buildSailHudHtml';
import { activeWaypointBearing, sailHudBearings } from './sailHudBearings';
import { createWindNeedleSVG } from './createWindNeedleSVG';
import { createWaypointBeamSVG } from './createWaypointBeamSVG';
import { createInstrumentGeometry } from './InstrumentGeometry';

test('rosa norte arriba: BTW 086 con HDG 086 apunta al este, no al norte', () => {
  const result = sailHudBearings(86, 279, 193, 86);
  assert.equal(result.waypoint, 86);
  assert.equal(result.wind, 279);
  const g = createInstrumentGeometry(320);
  const waypoint = createWaypointBeamSVG(g, 0, result.waypoint!);
  const wind = createWindNeedleSVG(g, 0, result.wind!);
  assert.ok(waypoint.length > 0 && wind.length > 0);
  assert.doesNotMatch(waypoint + wind, /NaN|undefined/);
});
test('AWA relativo se convierte a demora usando la proa; no se mezcla con TWD disponible', () => {
  assert.equal(sailHudBearings(90, undefined, 40).wind, 130);
  assert.equal(sailHudBearings(90, 279, 40).wind, 279);
  assert.equal(sailHudBearings(350, undefined, 20).wind, 10);
  assert.deepEqual(sailHudBearings(90), { wind: null, waypoint: null });
});

test('residual bearing without an active waypoint hides both magenta indicators', () => {
  for (const [target, navigating] of [[null, true], [{lat:36,lng:-4}, false]] as const) {
    const bearing = activeWaypointBearing(18, target, navigating);
    assert.equal(bearing, undefined);
    assert.equal(sailHudBearings(45, 270, undefined, bearing).waypoint, null);
    const html = buildSailHudHtml({heading:45, twd:270, waypointBearing:bearing});
    assert.doesNotMatch(html, /#ff3bf5|↗ WP/);
  }
});
test('active waypoint preserves north and trial bearings; malformed targets remain hidden', () => {
  assert.equal(activeWaypointBearing(0, {lat:0,lng:0}, true), 0);
  assert.equal(activeWaypointBearing(378, {lat:36,lng:-4}, true), 18);
  for (const target of [{lat:NaN,lng:0},{lat:91,lng:0},{lat:0,lng:181}]) {
    assert.equal(activeWaypointBearing(18,target,true), undefined);
  }
  assert.equal(activeWaypointBearing(NaN,{lat:36,lng:-4},true),undefined);
});
