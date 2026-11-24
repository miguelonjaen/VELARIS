import test from 'node:test';
import assert from 'node:assert/strict';
import { SharedNavigationState, NAVIGATION_FIELDS, type NavigationFreshnessPolicy } from '../../../core/navigation/SharedNavigationState';
import { BoatInstrumentStore } from '../../../core/instruments/BoatInstrumentStore';
import { activeCandidateView } from './diagnosticView';
import { candidateKey, type Candidate } from './contracts';
const policy = Object.fromEntries(NAVIGATION_FIELDS.map(field => [field, { BOAT: { maxAgeMs: 1000, ageFrom: 'receivedAt' }, DROID: { maxAgeMs: 1000, ageFrom: 'receivedAt' } }])) as unknown as NavigationFreshnessPolicy;
const base: Candidate = { id: candidateKey({ transport: 'tcp', host: 'boat.local', port: 10110 }), transport: 'tcp', host: 'boat.local', port: 10110, configured: true, state: 'NO_DATA', protocol: 'UNKNOWN', lastValidAt: null, instruments: [], reason: '', action: '' };
const status = { state: 'CONNECTED', transport: 'tcp', host: 'boat.local', port: 10110, source: 'BOAT', portPath: null, error: null, lastLineAt: null } as const;
test('Droid alone does not make a connected BOAT gateway operational', () => {
  const nav = new SharedNavigationState(policy);
  nav.update({ field: 'position', source: 'DROID', sourceId: 'phone', value: { lat: 36, lng: -5 }, receivedAt: 1000, observedAt: 1000, observedAtFromSource: true });
  const snap = nav.snapshot(1000);
  assert.equal(snap.position.source, 'DROID');
  assert.equal(activeCandidateView(base, status, snap, new BoatInstrumentStore().snapshot(1000), 1000).state, 'NO_DATA');
});
test('partial BOAT telemetry is degraded; expired telemetry never remains connected', () => {
  const nav = new SharedNavigationState(policy), store = new BoatInstrumentStore();
  nav.update({ field: 'position', source: 'BOAT', sourceId: 'nmea', value: { lat: 36, lng: -5 }, receivedAt: 1000, observedAt: 1000, observedAtFromSource: true });
  const live = activeCandidateView(base, status, nav.snapshot(1000), store.snapshot(1000), 1000);
  assert.equal(live.state, 'DEGRADED'); assert.deepEqual(live.instruments, ['position']); assert.equal(live.lastValidAt, 1000);
  const stale = activeCandidateView(base, status, nav.snapshot(2001), store.snapshot(2001), 2001);
  assert.equal(stale.state, 'DEGRADED'); assert.deepEqual(stale.instruments, []); assert.equal(stale.lastValidAt, null);
  assert.equal(activeCandidateView(base, { ...status, state: 'DISCONNECTED' }, nav.snapshot(1000), store.snapshot(1000), 1000).state, 'DISCONNECTED');
});
