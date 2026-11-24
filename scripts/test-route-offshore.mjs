import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
const server = await createServer({ configFile:false, optimizeDeps:{noDiscovery:true,include:[]}, server:{middlewareMode:true}, appType:'custom' });
try {
 const {createRouteProposal,generateOffshoreProposal,analyzeRouteProposal} = await server.ssrLoadModule('/src/features/copilot/routeProposal.ts');
 const base=createRouteProposal({origin:'Motril',via:['Adra'],destination:'Almería',coastDistanceNm:3,constraints:[]});
 const started=performance.now();
 const result=await generateOffshoreProposal(base);
 const analysis=await analyzeRouteProposal(result);
 assert.equal(result.offshore.portAccess,'NOT_PLANNED');
 assert.equal(result.offshore.navigationUse,false);
 assert.equal(result.offshore.anchorIndices.length,3);
 assert.equal(analysis.clearance.meetsRequestedDistance,true);
 assert.ok(analysis.clearance.minimumDistanceMeters>=3*1852);
 assert.ok(analysis.surfaces.legs.every(l=>l.status==='NO_LAND_CONTACT_DETECTED'));
 assert.equal(analysis.surfaces.declaredCoverageComplete,true);
 assert.equal(analysis.clearanceCoverageComplete,true);
 for(let i=0;i<base.places.length;i++) assert.notDeepEqual(result.positions[result.offshore.anchorIndices[i]],base.places[i].position);
 const evidence={elapsedMs:performance.now()-started,result,analysis};
 if(process.argv[2])await writeFile(process.argv[2],JSON.stringify(evidence,null,2),'utf8');
 console.log(JSON.stringify({waypoints:result.positions.length,legs:analysis.surfaces.legs.length,
  minimumNm:analysis.clearance.minimumDistanceMeters/1852,covered:analysis.clearanceCoverageComplete,
  examinedNodes:result.offshore.examinedNodes,elapsedMs:evidence.elapsedMs},null,2));
 console.log('PASS: offshore Motril–Adra–Almería; complete declared coverage; no land contact; >=3 NM; port approaches excluded.');
}finally{await server.close();}
