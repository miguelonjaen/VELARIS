import assert from 'node:assert/strict';
import { createServer } from 'vite';
const server = await createServer({ configFile:false, optimizeDeps:{noDiscovery:true,include:[]}, server:{middlewareMode:true}, appType:'custom' });
try {
    const { createRouteProposal, analyzeRouteProposal } = await server.ssrLoadModule('/src/features/copilot/routeProposal.ts');
    const proposal = createRouteProposal({ origin:'Motril', via:['Adra'], destination:'Almería', coastDistanceNm:3, constraints:[] });
    assert.equal(proposal.positions.length, 3);
    const result = await analyzeRouteProposal(proposal);
    assert.equal(result.surfaces.navigationUse, false);
    assert.equal(result.surfaces.depthKnown, false);
    assert.equal(result.surfaces.legs.length, 2);
    assert.deepEqual(result.surfaces.legs.map(leg => leg.status), ['LAND_CONTACT', 'LAND_CONTACT']);
    assert.equal(result.coastResourcesLoaded, true);
    assert.equal(result.surfaces.declaredCoverageComplete, true);
    assert.equal(result.failedSectors.length, 0);
    assert.equal(result.clearance.meetsRequestedDistance, false);
    console.log(JSON.stringify(result, null, 2));
    const unknown = await analyzeRouteProposal({ ...proposal, positions:[[-20,30],[-19,30]] });
    assert.equal(unknown.surfaces.legs[0].status, 'INDETERMINATE');
    assert.equal(unknown.clearanceCoverageComplete, false);
    console.log('PASS: real surfaces/coast, published references, requested distance violation and missing coverage.');
} finally { await server.close(); }
