import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coastDistanceMeters, coastLevel } from './CoastProximity';
test('distancia al interior del segmento, extremos y línea degenerada', () => {
    const p = { lat: 0, lng: 0 };
    assert.ok(Math.abs(coastDistanceMeters(p, [[[0.001,-0.01],[0.001,0.01]]])! - 111.195) < 0.1);
    assert.ok(coastDistanceMeters(p, [[[0.001,0.001],[0.002,0.001]]])! > 157);
    assert.equal(coastDistanceMeters(p, [[[0,0],[0,0]]]), 0);
    assert.equal(coastDistanceMeters(p, []), null);
    assert.equal(coastDistanceMeters({lat:NaN,lng:0}, [[[0,0],[1,1]]]), null);
});
test('histéresis evita repetición al oscilar cerca de los umbrales', () => {
    assert.equal(coastLevel(500,500,'clear'),'warning');
    assert.equal(coastLevel(550,500,'warning'),'warning');
    assert.equal(coastLevel(601,500,'warning'),'clear');
    assert.equal(coastLevel(249,500,'clear'),'critical');
    assert.equal(coastLevel(300,500,'critical'),'critical');
    assert.equal(coastLevel(351,500,'critical'),'warning');
});
