import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSailHudHtml } from './buildSailHudHtml';

test('north-up heading ray rotates with the boat, with one vessel symbol owned by BoatLayer', () => {
 const html = buildSailHudHtml({heading: 123, twd: 280, waypointBearing: 20});
 assert.match(html, /rotate\(123 130 130\)/);
 assert.match(html, /Viento real/); assert.match(html, /↗ WP/);
 assert.doesNotMatch(html, /layline|Referencias visuales|performanceZone|noGoZone|<image/i);
});
test('absent or invalid readings add no invented north heading, wind or waypoint', () => {
 const html = buildSailHudHtml({heading: Number.NaN, twd: Number.NaN, waypointBearing: Number.NaN});
 assert.doesNotMatch(html, /Dirección del barco|Viento real|↗ WP|NaN/);
});
test('apparent wind remains labelled apparent, with no polar fallback rays', () => {
 const html = buildSailHudHtml({heading: 90, relativeWindAngle: 30, windReference: 'AWA'});
 assert.match(html, /Viento aparente/); assert.doesNotMatch(html, /Viento real|layline/i);
});
