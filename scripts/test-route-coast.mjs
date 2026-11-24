import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({
    configFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true },
    appType: 'custom'
});

try {
    const module = await server.ssrLoadModule(
        '/src/features/navigation/components/smartcharts/routeCoastLoader.ts'
    );

    const sectors = [
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
        }
    ];

    const result = await module.loadRouteCoast(sectors);

    assert.equal(result.complete, true);
    assert.deepEqual(result.failedSectors, []);
    assert.equal(result.loadedSectors.length, 2);
    assert.ok(result.lines.length > 0);

    console.log('Sectores cargados:', result.loadedSectors);
    console.log('Lineas de costa:', result.lines.length);
    console.log('Recursos cargados:', result.complete);

    const clearanceModule = await server.ssrLoadModule(
        '/src/core/navigation/RouteCoastClearance.ts'
    );

    // Coordenadas de ensayo: NO representan una derrota validada.
    const trialRoute = [
        [-3.5, 36.7],
        [-3.0, 36.75],
        [-2.6, 36.8]
    ];

    const clearance = clearanceModule.analyzeRouteCoastClearance(
        trialRoute,
        result.lines,
        3
    );

    assert.equal(clearance.legs.length, 2);

    console.log('=== ANALISIS DE DERROTA EXPERIMENTAL ===');

    for (const leg of clearance.legs) {
        console.log(
            `Tramo ${leg.legIndex + 1}:`,
            leg.distanceMeters === null
                ? 'distancia desconocida'
                : `${(leg.distanceMeters / 1852).toFixed(2)} NM`,
            '| Cruce costa:', leg.intersectsCoastline,
            '| Menos de 3 NM:', leg.belowRequestedDistance
        );
    }

    console.log(
        'Distancia minima:',
        clearance.minimumDistanceMeters === null
            ? 'desconocida'
            : `${(clearance.minimumDistanceMeters / 1852).toFixed(2)} NM`
    );

    console.log(
        'Cumple distancia respecto a geometrías cargadas:',
        clearance.meetsRequestedDistance
    );

    const missing = await module.loadRouteCoast([
        {
            id: 'missing-test',
            bbox: [0, 0, 1, 1],
            simplified: false,
            resources: ['sector-no-existe.json']
        }
    ]);

    assert.equal(missing.complete, false);
    assert.deepEqual(missing.failedSectors, ['missing-test']);

    console.log('Deteccion de recursos ausentes: OK');
    console.log('PRUEBA SUPERADA');
} finally {
    await server.close();
}
