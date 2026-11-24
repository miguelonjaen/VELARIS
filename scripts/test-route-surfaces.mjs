import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({
    configFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true },
    appType: 'custom'
});

try {
    const contract = await server.ssrLoadModule(
        '/src/features/navigation/components/smartcharts/surface-contract.ts'
    );

    const resources = import.meta.glob;
    // La lectura de JSON se realiza mediante el cargador de Vite.
    const read = async filename => {
        const module = await server.ssrLoadModule(
            `/src/features/navigation/components/smartcharts/mediterranean/base/${filename}`
        );
        return module.default;
    };

    for (const id of ['mediterranean-east', 'almeria-west']) {
        const sector = await contract.loadSurfaceSector(id, read);

        assert.equal(sector.id, id);
        assert.equal(sector.navigationUse, false);
        assert.equal(sector.depthKnown, false);

        console.log(`\n=== ${id} ===`);

        for (const kind of ['sea', 'land', 'inlandWater']) {
            const count = sector.layers[kind].features.length;
            console.log(`${kind}: ${count} polígonos`);
        }

        assert.ok(sector.layers.land.features.length > 0);
        assert.ok(sector.layers.sea.features.length > 0);
    }

    console.log('\nPRUEBA DE SUPERFICIES SUPERADA');
} finally {
    await server.close();
}
