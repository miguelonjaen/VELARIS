import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateCollisionPrediction } from './CollisionPrediction';
import { NAVIGATION_FIELDS, SharedNavigationState, type NavigationFreshnessPolicy } from './SharedNavigationState';
import { calculateAisTargetRisk, ownVesselForAis } from './AisCollisionRisk';
import { evaluateAisCollisionAlarm, DEFAULT_AIS_ALARM_OPTIONS } from './AisCollisionAlarm';
import { aisDisplayMotion, compareTargets, formatCpa, formatTcpa, targetRank } from '../../features/traffic/aisPanelModel';
const now = new Date('2026-10-24T12:00:00Z');
const own = { lat: 0, lng: 0, sog: 6, cog: 90 };
const raw = { mmsi: '123456789', lat: 0, lng: 2 / 60, sog: 10, cog: 270, timestamp: now.getTime() };
const calc = (change: Partial<typeof raw> = {}) => calculateAisTargetRisk(own, { ...raw, ...change }, now);
test('head-on: CPA zero and TCPA 7.5 minutes, real risk and displayed zero retained', () => {
  const t = calc();
  assert.equal(t.dataStatus, 'VALID'); assert.ok(t.cpaNm! < 1e-10);
  assert.ok(Math.abs(t.tcpaMinutes! - 7.5) < 1e-9);
  assert.equal(formatCpa(t), '0.00 nm'); assert.equal(formatTcpa(t), '7.5 min');
  assert.equal(evaluateAisCollisionAlarm([t], DEFAULT_AIS_ALARM_OPTIONS, +now).severity, 'critical');
});
test('missing own motion/position never displays or alarms a fabricated zero', () => {
  const t = calculateAisTargetRisk(null, raw, now);
  assert.equal(t.dataStatus, 'MISSING_OWN'); assert.equal(formatCpa(t), '—');
  assert.equal(evaluateAisCollisionAlarm([t], DEFAULT_AIS_ALARM_OPTIONS, +now).severity, null);
});
test('stale, future and missing observation timestamps invalidate CPA', () => {
  for (const timestamp of [now.getTime() - 180001, now.getTime() + 6000, NaN]) {
    const t = calc({ timestamp }); assert.equal(t.dataStatus, 'STALE_TARGET'); assert.equal(t.cpaNm, null);
  }
  const { timestamp, ...withoutTime } = raw;
  assert.equal(calculateAisTargetRisk(own, withoutTime, now).dataStatus, 'STALE_TARGET');
});
test('invalid coordinates, negative speed and AIS unavailable sentinels are rejected', () => {
  for (const change of [{ lat: 91 }, { lng: 181 }, { sog: -1 }, { sog: 102.3 }, { cog: 360 }, { sog: NaN }]) {
    const t = calc(change); assert.equal(t.cpaNm, null); assert.equal(t.dataStatus, 'INVALID_TARGET');
  }
});
test('stationary vessel needs no course; equal motion has no unique TCPA', () => {
  const stopped = { lat: 0, lng: 0, sog: 0, cog: NaN };
  const t = calculateAisTargetRisk(stopped, { ...raw, sog: 0, cog: NaN }, now);
  assert.equal(t.dataStatus, 'VALID'); assert.equal(t.tcpaMinutes, null); assert.equal(formatTcpa(t), '—');
  assert.equal(evaluateAisCollisionAlarm([t], DEFAULT_AIS_ALARM_OPTIONS, +now).severity, null);
  const same = calculateCollisionPrediction(own, { ...own, lng: 0.01 });
  assert.equal(same.tcpaHours, null); assert.ok(same.cpaNm! > 0);
});
test('past encounter retains signed TCPA and cannot trigger future collision alarm', () => {
  const t = calc({ lng: -2 / 60 }); assert.ok(t.tcpaMinutes! < 0); assert.equal(formatTcpa(t), 'Pasado');
  assert.equal(evaluateAisCollisionAlarm([t], DEFAULT_AIS_ALARM_OPTIONS, +now).severity, null);
});
test('antimeridian takes the short longitude difference', () => {
  const p = calculateCollisionPrediction({ ...own, lng: 179.99 }, { ...own, lng: -179.99 });
  assert.ok(Math.abs(p.cpaNm! - 1.2) < 1e-8);
});
test('risk ordering and shared configurable safety ring', () => {
  const t = calc(); const missing = calculateAisTargetRisk(null, raw, now);
  assert.ok(compareTargets(t, missing, DEFAULT_AIS_ALARM_OPTIONS) < 0);
  const watch = { ...t, riskLevel: 'SAFE' as const, cpaNm: 0.8, tcpaMinutes: 25 };
  const opts = { ...DEFAULT_AIS_ALARM_OPTIONS, minCpaNm: 1, maxTcpaMinutes: 30 };
  assert.equal(targetRank(watch, opts), 4);
  assert.equal(evaluateAisCollisionAlarm([watch], opts, +now).severity, 'critical');
  assert.equal(targetRank(watch, { ...opts, maxTcpaMinutes: 20 }), 1);
});

test('resolved simulator motion enters CPA; incomplete or expired own data cannot enter', () => {
  const policy = Object.fromEntries(NAVIGATION_FIELDS.map(field => [field, {
    BOAT: { maxAgeMs: 10000, ageFrom: 'receivedAt' },
    DROID: { maxAgeMs: 10000, ageFrom: 'receivedAt' },
    SIMULATOR: { maxAgeMs: 10000, ageFrom: 'receivedAt' }
  }])) as unknown as NavigationFreshnessPolicy;
  const state = new SharedNavigationState(policy, () => +now);
  const base = { source: 'SIMULATOR' as const, sourceId: 'test', observedAt: +now,
    receivedAt: +now, observedAtFromSource: false };
  assert.equal(ownVesselForAis(state.snapshot()), null);
  state.update({ ...base, field: 'position', value: { lat: 36.7, lng: -3.5 } });
  assert.equal(ownVesselForAis(state.snapshot()), null); // Position alone is not stationary motion.
  state.update({ ...base, field: 'sog', value: 6 });
  assert.equal(ownVesselForAis(state.snapshot()), null); // Moving requires a course.
  state.update({ ...base, field: 'cog', value: 90 });
  const live = ownVesselForAis(state.snapshot());
  assert.deepEqual(live, { lat: 36.7, lng: -3.5, sog: 6, cog: 90 });
  assert.equal(calculateAisTargetRisk(live, { ...raw, lat: 36.7, lng: -3.5 + 2 / (60 * Math.cos(36.7 * Math.PI / 180)) }, now).riskLevel, 'CRITICAL');
  assert.equal(ownVesselForAis(state.snapshot(+now + 10001)), null);
});

test('target silhouette and vector do not depend on own-ship CPA availability', () => {
  const t = calculateAisTargetRisk(null, raw, now);
  assert.equal(t.dataStatus, 'MISSING_OWN');
  const motion = aisDisplayMotion(t, +now);
  assert.equal(motion.course, 270);
  assert.equal(motion.vectorAvailable, true);
  assert.equal(t.cpaNm, null);
});
test('stale target retains its last orientation but never a predictive vector', () => {
  const t = { ...raw, dataStatus: 'MISSING_OWN' as const };
  const motion = aisDisplayMotion(t, +now + 180001);
  assert.equal(motion.course, 270);
  assert.equal(motion.vectorAvailable, false);
});
test('missing course, missing speed and stationary targets never fabricate vectors', () => {
  assert.equal(aisDisplayMotion({ ...raw, cog: undefined }, +now).course, null);
  assert.equal(aisDisplayMotion({ ...raw, cog: undefined }, +now).vectorAvailable, false);
  assert.equal(aisDisplayMotion({ ...raw, sog: undefined }, +now).vectorAvailable, false);
  assert.equal(aisDisplayMotion({ ...raw, sog: 0 }, +now).vectorAvailable, false);
  assert.equal(aisDisplayMotion({ ...raw, sog: undefined }, +now).course, 270);
});
