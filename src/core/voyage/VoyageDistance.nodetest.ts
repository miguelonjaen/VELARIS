import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NAVIGATION_FIELDS, type NavigationFreshnessPolicy, SharedNavigationState } from '../navigation/SharedNavigationState';
import { accumulateVoyageDistance, type VoyageDistanceState } from './VoyageDistance';

function rig() {
    const policy = Object.fromEntries(NAVIGATION_FIELDS.map(field => [field, {
        BOAT: { maxAgeMs: 5000, ageFrom: 'receivedAt' },
        DROID: { maxAgeMs: 5000, ageFrom: 'receivedAt' },
        SIMULATOR: { maxAgeMs: 5000, ageFrom: 'receivedAt' }
    }])) as unknown as NavigationFreshnessPolicy;
    const nav = new SharedNavigationState(policy);
    let state: VoyageDistanceState = { totalNm: 0, anchor: null };
    const point = (at: number, lat: number, source: 'BOAT' | 'DROID' | 'SIMULATOR' = 'BOAT') => {
        nav.update({ field: 'position', source, sourceId: source, value: { lat, lng: -4.5 },
            observedAt: at, receivedAt: at, observedAtFromSource: false });
        state = accumulateVoyageDistance(state, nav.snapshot(at).position);
    };
    return { point, get: () => state, lose: (at: number) => {
        state = accumulateVoyageDistance(state, nav.snapshot(at).position);
    } };
}

test('acumula segmentos desde cero, no la distancia de ruta ni lecturas repetidas', () => {
    const r = rig();
    r.point(1000, 36); assert.equal(r.get().totalNm, 0);
    r.point(2000, 36.001); r.point(3000, 36.002);
    assert.ok(Math.abs(r.get().totalNm - 0.12008) < 0.001);
    const total = r.get().totalNm;
    r.point(3000, 36.002); assert.equal(r.get().totalNm, total);
});

test('no une posiciones a través de pérdida de señal o cambio de fuente', () => {
    const r = rig(); r.point(1000, 36); r.point(2000, 36.001);
    const total = r.get().totalNm;
    r.lose(1000000); r.point(1001000, 40);
    assert.equal(r.get().totalNm, total);
    r.lose(2000000); r.point(2001000, 42, 'DROID');
    assert.equal(r.get().totalNm, total);
});

test('movimiento lento acumula aunque tarde más de 30 s en superar el umbral del track', () => {
    const r = rig();
    for (let i = 0; i <= 100; i++) r.point(1000 + i * 1000, 36 + i * 0.000005);
    assert.ok(r.get().totalNm > 0.02);
});


test('simulador visual no aporta millas; nueva travesía parte de cero', () => {
    const r = rig(); r.point(1000, 36, 'SIMULATOR'); r.point(2000, 37, 'SIMULATOR');
    assert.equal(r.get().totalNm, 0);
    r.point(3000, 36); r.point(4000, 36.001);
    assert.ok(r.get().totalNm > 0);
    assert.equal(rig().get().totalNm, 0);
});
