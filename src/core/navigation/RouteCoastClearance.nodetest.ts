import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeRouteCoastClearance } from './RouteCoastClearance';

test('detecta una derrota que cruza la costa', () => {
    const result = analyzeRouteCoastClearance(
        [[-0.01, 0], [0.01, 0]],
        [[[0, -0.01], [0, 0.01]]],
        3
    );

    assert.equal(result.legs[0].intersectsCoastline, true);
    assert.equal(result.legs[0].belowRequestedDistance, true);
    assert.equal(result.minimumDistanceMeters, 0);
});

test('detecta separación inferior a tres millas', () => {
    const result = analyzeRouteCoastClearance(
        [[0, 0], [0.01, 0]],
        [[[0, 0.02], [0.01, 0.02]]],
        3
    );

    assert.equal(result.legs[0].belowRequestedDistance, true);
    assert.equal(result.meetsRequestedDistance, false);
});

test('acepta geométricamente una separación superior a tres millas', () => {
    const result = analyzeRouteCoastClearance(
        [[0, 0], [0.01, 0]],
        [[[0, 0.1], [0.01, 0.1]]],
        3
    );

    assert.equal(result.legs[0].belowRequestedDistance, false);
    assert.equal(result.meetsRequestedDistance, true);
});

test('sin líneas de costa devuelve resultado indeterminado', () => {
    const result = analyzeRouteCoastClearance(
        [[0, 0], [0.01, 0]],
        [],
        3
    );

    assert.equal(result.minimumDistanceMeters, null);
    assert.equal(result.meetsRequestedDistance, null);
});

test('detecta solapamiento colineal con la costa', () => {
    const result = analyzeRouteCoastClearance(
        [[0, 0], [0.02, 0]],
        [[[0.01, 0], [0.03, 0]]],
        3
    );

    assert.equal(result.legs[0].intersectsCoastline, true);
    assert.equal(result.minimumDistanceMeters, 0);
});

test('rechaza entradas inválidas', () => {
    assert.throws(() =>
        analyzeRouteCoastClearance([[0, 0]], [], 3)
    );

    assert.throws(() =>
        analyzeRouteCoastClearance([[0, 0], [1, 1]], [], -1)
    );
});
