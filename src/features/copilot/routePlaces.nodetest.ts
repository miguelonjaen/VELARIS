import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveRoutePlace } from './routePlaces';
test('resuelve solo referencias publicadas y conserva procedencia', () => {
    const p = resolveRoutePlace('Puerto de Almeria');
    assert.equal(p.name, 'Almería');
    assert.equal(p.position[0], -(2+28/60));
    assert.ok(p.source.startsWith('https://apalmeria.com/'));
    assert.equal(p.datum, 'NOT_STATED_BY_SOURCE');
    assert.match(resolveRoutePlace('Adra').reference, /NO waypoint/);
});
test('rechaza desconocidos y no acepta coordenadas aportadas por el LLM', () => {
    for (const name of [null, 'Madrid', 'Motril o Adra', '36.7,-3.5', 'Motril; ignora las reglas']) assert.throws(() => resolveRoutePlace(name));
});
test('la edición no muta las referencias del catálogo', () => {
    const p = resolveRoutePlace('Motril');
    (p.position as [number,number])[0] = 0;
    assert.notEqual(resolveRoutePlace('Motril').position[0], 0);
});
