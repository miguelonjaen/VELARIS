'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateSharedData } = require('../sharedData');
const { validateMessage } = require('../protocol');
const weather = { lat: 36.7, lon: -3.5, ageMs: 1000, windSpeed: 12, windDirection: 245, temperature: 23, pressure: 1013, source: 'openweather' };
test('shared weather validates units, origin, finite values and age', () => {
  assert.equal(validateSharedData('WEATHER_DATA', weather).ok, true);
  for (const change of [{ ageMs: 3600001 }, { windSpeed: NaN }, { source: 'fake' }, { lat: 91 }, { pressure: null }]) {
    assert.equal(validateSharedData('WEATHER_DATA', { ...weather, ...change }).ok, false);
  }
});
test('route revisions reject traversal, oversize and invalid positions', () => {
  const route = { key: 'route-1-7', name: 'Prueba', waypoints: [{ name: 'WP1', lat: 36.7, lon: -3.5 }] };
  assert.equal(validateSharedData('ROUTE_DATA', route).ok, true);
  for (const change of [{ key: '../bad' }, { waypoints: [] }, { waypoints: Array(501).fill(route.waypoints[0]) }, { waypoints: [{ name: 'bad', lat: Infinity, lon: 0 }] }]) {
    assert.equal(validateSharedData('ROUTE_DATA', { ...route, ...change }).ok, false);
  }
});
test('AIS preserves per-target observation age and rejects sentinels', () => {
  const target = { mmsi: '224123456', name: 'Blanco', lat: 36.7, lon: -3.5, sog: 6, cog: 291, ageMs: 1000 };
  assert.deepEqual(validateSharedData('AIS_DATA', { targets: [target] }).value.targets, [target]);
  for (const change of [{ ageMs: 120000 }, { sog: 102.3 }, { cog: 360 }, { mmsi: 'bad' }, { lat: 0, lon: 0 }]) {
    assert.equal(validateSharedData('AIS_DATA', { targets: [{ ...target, ...change }] }).ok, false);
  }
});
test('HDG reference survives JS protocol normalization; legacy heading stays unreferenced', () => {
  const fix = { t: 1792000000000, lat: 36.7, lon: -3.5, src: 'phone_gps', hdg: 45, hdgRef: 'magnetic' };
  const envelope = { v: 1, type: 'POSITION', id: 'message1', src: 'phone-1234', ts: fix.t, payload: { fix } };
  assert.equal(validateMessage(envelope).value.payload.fix.hdgRef, 'magnetic');
  assert.equal(validateMessage({ ...envelope, payload: { fix: { ...fix, hdgRef: 'unknown' } } }).ok, false);
});

test('modeled sea preserves nulls, directions FROM/TOWARD and validates source/age', () => {
  const marine = { lat: 36.7, lon: -3.5, ageMs: 1000, source: 'open-meteo-marine', values: { waveHeight: 1.5, currentDirection: 90 } };
  const check = validateSharedData('MARINE_DATA', marine);
  assert.equal(check.ok, true);
  assert.equal(check.value.values.waveHeight, 1.5);
  assert.equal(check.value.values.currentDirection, 90);
  assert.equal(check.value.values.seaLevelHeight, null);
  for (const change of [{ ageMs: 3600001 }, { source: 'fake' }, { values: { unknown: 4 } }, { values: { waveHeight: -1 } }]) {
    assert.equal(validateSharedData('MARINE_DATA', { ...marine, ...change }).ok, false);
  }
});
