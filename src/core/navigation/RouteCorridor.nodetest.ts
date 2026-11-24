import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    selectRouteCorridor,
    type RouteSector
} from './RouteCorridor';

const sectors: RouteSector[] = [
    {
        id: 'mediterranean-east',
        bbox: [-3.8, 36.4, -3.1, 37.1],
        simplified: false,
        resources: ['sector-mediterranean-east-0.json']
    },
    {
        id: 'almeria-west',
        bbox: [-3.1, 35.8, -2.4, 37.3],
        simplified: false,
        resources: ['sector-almeria-west-0.json']
    },
    {
        id: 'almeria-east',
        bbox: [-2.4, 36.7, -1.6, 37.6],
        simplified: false,
        resources: ['sector-almeria-east-0.json']
    },
    {
        id: 'overview',
        bbox: [-7.43, 32.9, 11.75, 42.47],
        simplified: true,
        resources: ['sector-overview-0.json']
    }
];

test('selecciona los sectores que intersectan el corredor', () => {
    const result = selectRouteCorridor(
        [[-3.5, 36.7], [-2.6, 36.8]],
        sectors,
        3
    );

    assert.deepEqual(
        result.sectors.map(s => s.id),
        ['mediterranean-east', 'almeria-west']
    );

    assert.equal(result.covered, false);
});

test('excluye los sectores simplificados', () => {
    const result = selectRouteCorridor(
        [[-3.5, 36.7], [-2.6, 36.8]],
        sectors,
        3
    );

    assert.ok(result.sectors.every(s => !s.simplified));
});

test('el margen amplía los límites del corredor', () => {
    const result = selectRouteCorridor(
        [[-3.5, 36.7], [-2.6, 36.8]],
        sectors,
        5
    );

    assert.ok(result.bounds[0] < -3.5);
    assert.ok(result.bounds[1] < 36.7);
    assert.ok(result.bounds[2] > -2.6);
    assert.ok(result.bounds[3] > 36.8);
});

test('rechaza coordenadas inválidas', () => {
    assert.throws(() =>
        selectRouteCorridor([[200, 36], [-3, 37]], sectors)
    );

    assert.throws(() =>
        selectRouteCorridor([[NaN, 36], [-3, 37]], sectors)
    );

    assert.throws(() =>
        selectRouteCorridor([[-3, 37]], sectors)
    );
});

test('rechaza márgenes inválidos', () => {
    assert.throws(() =>
        selectRouteCorridor([[-3, 36], [-2, 37]], sectors, -1)
    );

    assert.throws(() =>
        selectRouteCorridor([[-3, 36], [-2, 37]], sectors, 101)
    );
});

test('no declara cobertura completa sin validación', () => {
    const result = selectRouteCorridor(
        [[-3.5, 36.7], [-2.6, 36.8]],
        sectors
    );

    assert.equal(result.covered, false);
});
