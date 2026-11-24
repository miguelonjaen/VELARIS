import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planOffshoreRoute} from './RouteOffshorePlanner';
import type {SurfaceSector,SurfacePosition,SurfaceCollection} from '../../features/navigation/components/smartcharts/surface-contract';
import {analyzeRouteCoastClearance} from './RouteCoastClearance';
import {analyzeRouteSurfaces} from './RouteSurfaceAnalysis';
const outer:SurfacePosition[]=[[-0.5,-0.5],[0.5,-0.5],[0.5,0.5],[-0.5,0.5],[-0.5,-0.5]];
const land:SurfacePosition[]=[[-0.3,0],[-0.01,0],[-0.01,-0.08],[0.01,-0.08],[0.01,0],[0.3,0],[0.3,0.3],[-0.3,0.3],[-0.3,0]];
const collection=(kind:'sea'|'land',rings:SurfacePosition[][]):SurfaceCollection=>({type:'FeatureCollection',features:[{type:'Feature',id:kind,properties:{kind,navigationUse:false,depthKnown:false},geometry:{type:'Polygon',coordinates:rings}}]});
const sector:SurfaceSector={schemaVersion:1,id:'test',navigationUse:false,officialEnc:false,depthKnown:false,experimental:true,license:'ODbL-1.0',coverage:[-0.5,-0.5,0.5,0.5],layers:{sea:collection('sea',[outer,land]),land:collection('land',[land]),inlandWater:{type:'FeatureCollection',features:[]}}};
const refs= [[-0.12,0],[0.12,0]] as const;
test('rodea una península con segmentos completos y excluye accesos portuarios',async()=>{
 const result=await planOffshoreRoute(refs,[land],[sector],3,{yieldControl:async()=>{}});
 assert.equal(result.portAccess,'NOT_PLANNED');
 assert.equal(result.navigationUse,false);
 assert.ok(result.positions.some(p=>p[1]<-0.13));
 assert.equal(analyzeRouteCoastClearance(result.positions,[land],3).meetsRequestedDistance,true);
 assert.ok(analyzeRouteSurfaces(result.positions,[sector]).legs.every(l=>l.status==='NO_LAND_CONTACT_DETECTED'));
 assert.deepEqual(result.anchorIndices,[0,result.positions.length-1]);
});
test('conserva el punto de paso exterior y el orden de referencias',async()=>{
 const result=await planOffshoreRoute([refs[0],[-0.05,0],refs[1]],[land],[sector],3,{yieldControl:async()=>{}});
 assert.equal(result.anchorIndices.length,3);
 assert.ok(result.anchorIndices[0]<result.anchorIndices[1]);
 assert.ok(result.anchorIndices[1]<result.anchorIndices[2]);
});
test('sin datos o presupuesto suficiente no produce coordenadas alternativas',async()=>{
 await assert.rejects(planOffshoreRoute(refs,[],[sector],3),/MISSING_GEOGRAPHY/);
 await assert.rejects(planOffshoreRoute(refs,[land],[],3),/MISSING_GEOGRAPHY/);
 await assert.rejects(planOffshoreRoute(refs,[land],[sector],3,{maxNodes:1}),/BUDGET/);
 await assert.rejects(planOffshoreRoute([[179,0],[-179,0]],[land],[sector],3),/EXTENT/);
});
test('cancelación explícita y cobertura insuficiente no devuelven propuesta',async()=>{
 const controller=new AbortController();controller.abort();
 await assert.rejects(planOffshoreRoute(refs,[land],[sector],3,{signal:controller.signal}),/CANCELLED/);
 await assert.rejects(planOffshoreRoute(refs,[land],[{...sector,coverage:[0.4,0.4,0.5,0.5]}],3,{yieldControl:async()=>{}}),/NO_ANCHOR/);
});

test('no cruza una barrera que divide el área de búsqueda',async()=>{
 const wall:SurfacePosition[]=[[-0.01,-0.4],[0.01,-0.4],[0.01,0.4],[-0.01,0.4],[-0.01,-0.4]];
 const divided:SurfaceSector={...sector,layers:{...sector.layers,land:collection('land',[wall]),sea:collection('sea',[outer,wall])}};
 await assert.rejects(planOffshoreRoute(refs,[wall],[divided],3,{yieldControl:async()=>{}}),/NO_PATH/);
});
test('atiende cancelación durante el cálculo, no solo al empezar',async()=>{
 const controller=new AbortController();let checkpoints=0;
 await assert.rejects(planOffshoreRoute(refs,[land],[sector],3,{
  signal:controller.signal,yieldControl:async()=>{if(++checkpoints===2)controller.abort();}
 }),/CANCELLED/);
 assert.equal(checkpoints,2);
});

// Synthetic closed island tests geometric constraints; no fixture is a nautical waypoint.
const island:SurfacePosition[]=[[-0.004,-0.004],[0.004,-0.004],[0.004,0.004],[-0.004,0.004],[-0.004,-0.004]];
const islandSector:SurfaceSector={...sector,layers:{...sector.layers,land:collection('land',[island]),sea:collection('sea',[outer,island])}};
const islandRefs=[[-0.05,0],[0,0],[0.05,0]] as const;
const target={referenceIndex:1,boundary:island,targetDistanceNm:0.5,toleranceNm:0.05};
test('paso de isla usa punto local fino y verifica banda 0,45–0,55 NM sobre toda la geometría',async()=>{
 const result=await planOffshoreRoute(islandRefs,[island],[islandSector],0.1,{islandPassages:[target],yieldControl:async()=>{}});
 const distance=analyzeRouteCoastClearance(result.positions,[island],0).minimumDistanceMeters!/1852;
 assert.ok(distance>=0.45 && distance<=0.55,`distance ${distance}`);
 assert.equal(result.anchorIndices.length,3);assert.ok(result.anchorIndices[1]>0 && result.anchorIndices[1]<result.positions.length-1);
 assert.equal(analyzeRouteCoastClearance(result.positions,[island],0.1).meetsRequestedDistance,true);
 assert.ok(analyzeRouteSurfaces(result.positions,[islandSector]).legs.every(l=>l.status==='NO_LAND_CONTACT_DETECTED'));
 assert.equal(result.navigationUse,false);assert.equal(result.portAccess,'NOT_PLANNED');
});
test('mantiene la separación general compatible además de la banda local',async()=>{
 const result=await planOffshoreRoute(islandRefs,[island],[islandSector],0.5,{islandPassages:[target],yieldControl:async()=>{}});
 const distance=analyzeRouteCoastClearance(result.positions,[island],0).minimumDistanceMeters!/1852;
 assert.ok(distance>=0.5 && distance<=0.55);
});
test('conflicto de separaciones, contorno abierto y tolerancia inválida fallan sin alternativa',async()=>{
 await assert.rejects(planOffshoreRoute(islandRefs,[island],[islandSector],1,{islandPassages:[target]}),/PASSAGE_CONFLICT/);
 await assert.rejects(planOffshoreRoute(islandRefs,[island],[islandSector],0.1,{islandPassages:[{...target,boundary:island.slice(0,-1)}]}),/INVALID_ISLAND_PASSAGE/);
 await assert.rejects(planOffshoreRoute(islandRefs,[island],[islandSector],0.1,{islandPassages:[{...target,toleranceNm:NaN}]}),/INVALID_ISLAND_PASSAGE/);
});

test('adapta solo la malla automática para un corredor largo sin ampliar el presupuesto ni la banda local',async()=>{
 const wide:SurfacePosition[]=[[-0.5,-1],[0.5,-1],[0.5,1],[-0.5,1],[-0.5,-1]];
 const ocean:SurfaceSector={...islandSector,coverage:[-0.5,-1,0.5,1],layers:{...islandSector.layers,sea:collection('sea',[wide,island])}};
 const longRefs=[[-0.15,0.75],[0,0],[0.15,-0.75]] as const;
 await assert.rejects(planOffshoreRoute(longRefs,[island],[ocean],0.1,{gridStepNm:0.5,islandPassages:[target],yieldControl:async()=>{}}),/BUDGET/);
 const result=await planOffshoreRoute(longRefs,[island],[ocean],0.1,{islandPassages:[target],yieldControl:async()=>{}});
 assert.ok(result.gridStepNm>0.5 && result.gridStepNm<=2);assert.ok(result.examinedNodes<=16000);
 const minimum=analyzeRouteCoastClearance(result.positions,[island],0).minimumDistanceMeters!/1852;
 assert.ok(minimum>=0.45 && minimum<=0.55);
 assert.equal(analyzeRouteCoastClearance(result.positions,[island],0.1).meetsRequestedDistance,true);
});
