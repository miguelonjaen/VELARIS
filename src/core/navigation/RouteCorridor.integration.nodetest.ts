import { test } from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../../features/navigation/components/smartcharts/mediterranean/catalog.json';
import {
    selectRouteCorridor,
    type RouteSector
} from './RouteCorridor';

test('selecciona sectores reales de SmartCHARTS para el corredor Granada-Almeria', () => {
    const sectors: RouteSector[] = catalog.sectors.map(sector => {
    if (
        sector.bbox.length !== 4 ||
        !sector.bbox.every(Number.isFinite)
    ) {
        throw new Error(`Invalid sector bbox: ${sector.id}`);
    }

    return {
        ...sector,
        bbox: [
            sector.bbox[0],
            sector.bbox[1],
            sector.bbox[2],
            sector.bbox[3]
        ] as [number, number, number, number]
    };
});

    // Coordenadas de ensayo, no posiciones portuarias verificadas.
    const positions = [
        [-3.5, 36.7],
        [-3.0, 36.75],
        [-2.6, 36.8]
    ] as const;

    const result = selectRouteCorridor(positions, sectors, 3);
    const ids = result.sectors.map(s => s.id);

    assert.ok(ids.includes('mediterranean-east'));
    assert.ok(ids.includes('almeria-west'));
    assert.ok(!ids.includes('overview'));

    assert.equal(result.covered, false);

    for (const sector of result.sectors) {
        assert.ok(sector.resources.length > 0);
        assert.equal(sector.simplified, false);
    }

    console.log('Sectores seleccionados:', ids.join(', '));
    console.log('Limites del corredor:', result.bounds);
    console.log('Cobertura verificada:', result.covered);
});
