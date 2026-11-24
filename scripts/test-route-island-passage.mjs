import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createServer} from 'vite';
const vite=await createServer({configFile:false,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:false},appType:'custom'});
try{
 const {createRouteProposal,generateOffshoreProposal,analyzeRouteProposal}=await vite.ssrLoadModule('/src/features/copilot/routeProposal.ts');
 const {resolveRoutePlace}=await vite.ssrLoadModule('/src/features/copilot/routePlaces.ts');
 const {proposalDistanceNm}=await vite.ssrLoadModule('/src/features/copilot/routeConversation.ts');
 const evidence=JSON.parse(await readFile('work/geography-electron-evidence.json','utf8'));
 const island=evidence.results.find(r=>r.query==='Alborán').candidates.find(c=>c.kind==='ISLAND');
 assert.equal(island.providerId,'osm:way/162055249');
 // Derived endpoints are synthetic test positions, never published ports or operational waypoints.
 const synthetic=(name,delta)=>({name,position:[island.position[0]+delta,island.position[1]-0.025],source:'https://example.invalid/synthetic-test',sourceCoordinate:'Synthetic test endpoint derived from the island reference; not a port',reference:'TEST ONLY',verifiedOn:island.verifiedOn,datum:'WGS84',kind:'PLACE',navigationUse:false});
 const start=synthetic('Inicio sintético de prueba',-0.04),end=synthetic('Fin sintético de prueba',0.04);
 const spec={origin:start.name,destination:end.name,via:[{name:island.name,kind:'ISLAND',mode:'PASS',distanceNm:0.5}],coastDistanceNm:0.1,unhandledConstraints:[]};
 const draft={...createRouteProposal({origin:spec.origin,destination:spec.destination,via:[island.name],coastDistanceNm:0.1,constraints:[]},[start,island,end]),specification:spec};
 const proposal=await generateOffshoreProposal(draft);
 const analysis=await analyzeRouteProposal(proposal);
 assert.equal(analysis.referencePassages.length,1);assert.equal(analysis.referencePassages[0].status,'WITHIN_BAND');
 assert.ok(analysis.referencePassages[0].minimumDistanceNm>=0.45 && analysis.referencePassages[0].minimumDistanceNm<=0.55);
 assert.equal(analysis.clearance.meetsRequestedDistance,true);assert.equal(analysis.clearanceCoverageComplete,true);
 assert.ok(analysis.surfaces.legs.every(l=>l.status==='NO_LAND_CONTACT_DETECTED'));
 assert.equal(proposal.offshore.navigationUse,false);assert.equal(proposal.offshore.portAccess,'NOT_PLANNED');
 const moved={...proposal,positions:[[island.position[0]-0.04,island.position[1]-0.04],[island.position[0]+0.04,island.position[1]-0.04]],edited:true};
 const afterEdit=await analyzeRouteProposal(moved);
 assert.equal(afterEdit.referencePassages[0].status,'OUTSIDE_BAND');
 const wrongIdentity={...draft,places:draft.places.map((p,i)=>i===1 ? {...p,providerId:'osm:way/999999999999'} : p)};
 await assert.rejects(generateOffshoreProposal(wrongIdentity),/ISLAND_BOUNDARY_UNAVAILABLE/);
 const melilla=evidence.results.find(r=>r.query==='Puerto de Melilla, España').candidates.find(c=>c.kind==='PORT');
 const motril=resolveRoutePlace('Motril');
 const distant={...createRouteProposal({origin:'Motril',destination:melilla.name,via:[island.name],coastDistanceNm:0.5,constraints:[]},[motril,island,melilla]),specification:{...spec,coastDistanceNm:0.5,origin:'Motril',destination:melilla.name}};
 // User-authorized 0.5 NM general clearance is a software fixture, not a navigation recommendation.
 const started=performance.now();
 const complete=await generateOffshoreProposal(distant);
 const completeAnalysis=await analyzeRouteProposal(complete);
 assert.equal(completeAnalysis.referencePassages[0].status,'WITHIN_BAND');
 assert.equal(completeAnalysis.clearanceCoverageComplete,true);
 assert.equal(completeAnalysis.clearance.meetsRequestedDistance,true);
 assert.ok(completeAnalysis.surfaces.legs.every(l=>l.status==='NO_LAND_CONTACT_DETECTED'));
 const repeated=await generateOffshoreProposal(distant);
 assert.deepEqual(repeated.positions,complete.positions);
 const outside={...distant,places:distant.places.map((p,i)=>i===2?{...p,position:[20,35]}:p)};
 await assert.rejects(generateOffshoreProposal(outside),/INCOMPLETE_CORRIDOR_COVERAGE/);
 const output={pass:true,syntheticEndpoints:true,realIslandBoundary:true,proposal,analysis,afterEdit,identityMismatchRejected:true,melillaCoverageVerified:true, reproduciblePositions:complete.positions, complete, totalDistanceNm:proposalDistanceNm(complete), elapsedMs:performance.now()-started, completeAnalysis};
 await writeFile('work/route-island-passage-evidence.json',JSON.stringify(output,null,2));
 console.log(JSON.stringify({pass:true,minimumNm:analysis.referencePassages[0].minimumDistanceNm,source:analysis.referencePassages[0].source,afterEdit:afterEdit.referencePassages[0].status,identityMismatchRejected:true,melillaCoverageVerified:true, reproduciblePositions:complete.positions, complete, totalDistanceNm:proposalDistanceNm(complete), elapsedMs:performance.now()-started, completeAnalysis}));
}finally{await vite.close();}
