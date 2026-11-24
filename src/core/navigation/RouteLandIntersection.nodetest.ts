import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SurfaceCollection, SurfacePosition, SurfaceSector } from '../../features/navigation/components/smartcharts/surface-contract';
import { analyzeRouteLandIntersection as analyze } from './RouteLandIntersection';
import { analyzeRouteSurfaces, segmentWithinCoverage, boundsWithinCoverage, segmentHasSeaClassification } from './RouteSurfaceAnalysis';

const outer: SurfacePosition[] = [[0,0],[10,0],[10,10],[0,10],[0,0]];
const hole: SurfacePosition[] = [[2,2],[8,2],[8,8],[2,8],[2,2]];
function land(rings: SurfacePosition[][] = [outer, hole]): SurfaceCollection {
    return { type: 'FeatureCollection', features: [{ type: 'Feature', id: 'test', properties: { kind: 'land', navigationUse: false }, geometry: { type: 'Polygon', coordinates: rings } }] };
}
test('detecta tierra aunque ambos extremos estén fuera', () => assert.equal(analyze([[-1,1],[11,1]], land()).crossesLand, true));
test('segmento completamente dentro de hueco no toca tierra', () => assert.equal(analyze([[3,3],[7,7]], land()).crossesLand, false));
test('salir de un hueco y cruzar otro borde toca tierra', () => assert.equal(analyze([[3,3],[11,3]], land()).crossesLand, true));
test('isla dentro de hueco se evalúa como polígono independiente', () => {
    const collection = land();
    collection.features.push(...land([[[4,4],[6,4],[6,6],[4,6],[4,4]]]).features);
    assert.equal(analyze([[3,5],[7,5]], collection).crossesLand, true);
});
test('contactos, tangencias y solapamientos de bordes exteriores e interiores', () => {
    for (const route of [[[-1,0],[11,0]], [[0,0],[0,0]], [[-1,1],[1,-1]], [[2,3],[2,7]], [[3,3],[2,3]]] as const) {
        assert.equal(analyze(route, land()).crossesLand, true);
    }
});
test('puntos coincidentes en agua y tierra', () => {
    assert.equal(analyze([[3,3],[3,3]], land()).crossesLand, false);
    assert.equal(analyze([[1,1],[1,1]], land()).crossesLand, true);
});
test('rechaza ruta inválida, antimeridiano y anillos abiertos', () => {
    assert.throws(() => analyze([[NaN,0],[1,1]], land()));
    assert.throws(() => analyze([[179,0],[-179,0]], land()));
    assert.throws(() => analyze([[0,0],[1,1]], land([outer.slice(0,-1)])));
});
test('cobertura continua en costura y solapamiento; detecta hueco intermedio', () => {
    assert.equal(segmentWithinCoverage([0,1],[10,1], [[0,0,5,2],[5,0,10,2]]), true);
    assert.equal(segmentWithinCoverage([0,1],[10,1], [[0,0,6,2],[5,0,10,2]]), true);
    assert.equal(segmentWithinCoverage([0,1],[10,1], [[0,0,4,2],[6,0,10,2]]), false);
    assert.equal(segmentWithinCoverage([0,1],[10,1], [[0,0,4.999999999,2],[5,0,10,2]]), false);
    assert.equal(segmentWithinCoverage([0,1],[10,1], []), false);
    assert.equal(segmentWithinCoverage([1,1],[1,1], [[0,0,2,2]]), true);
});
test('sin sectores el resultado es indeterminado; contacto conocido prevalece sobre falta de cobertura', () => {
    assert.equal(analyzeRouteSurfaces([[0,1],[10,1]], []).legs[0].status, 'INDETERMINATE');
    const sector: SurfaceSector = { schemaVersion: 1, id: 'test', navigationUse: false, officialEnc: false, depthKnown: false, experimental: true, license: 'ODbL-1.0', coverage: [0,0,10,10], layers: { land: land(), sea: {type:'FeatureCollection', features:[]}, inlandWater: {type:'FeatureCollection', features:[]} } };
    const result = analyzeRouteSurfaces([[-1,1],[11,1]], [sector]);
    assert.equal(result.legs[0].status, 'LAND_CONTACT');
    assert.equal(result.declaredCoverageComplete, false);
    assert.equal(result.navigationUse, false);
});

test('cobertura del entorno requiere área completa y detecta huecos interiores', () => {
    assert.equal(boundsWithinCoverage([0,0,10,10], [[0,0,5,10],[5,0,10,10]]), true);
    assert.equal(boundsWithinCoverage([0,0,10,10], [[0,0,10,4],[0,6,10,10],[0,4,4,6],[6,4,10,6]]), false);
    assert.equal(boundsWithinCoverage([0,0,10,10], []), false);
    assert.equal(boundsWithinCoverage([0,0,10,10], [[0,0,10,9]]), false);
});

test('exige clasificación marítima continua: detecta huecos que no contienen el punto medio',()=>{
 const sea:SurfaceCollection={type:'FeatureCollection',features:[{type:'Feature',id:'sea',properties:{kind:'sea',navigationUse:false,depthKnown:false},geometry:{type:'Polygon',coordinates:[outer,[[2,2],[3,2],[3,8],[2,8],[2,2]]]}}]};
 assert.equal(segmentHasSeaClassification([1,5],[9,5],[sea]),false);
 assert.equal(segmentHasSeaClassification([4,5],[9,5],[sea]),true);
 assert.equal(segmentHasSeaClassification([4,5],[4,5],[]),false);
 const fill:SurfaceCollection={...sea,features:[{...sea.features[0],geometry:{type:'Polygon',coordinates:[[[2,2],[3,2],[3,8],[2,8],[2,2]]]}}]};
 assert.equal(segmentHasSeaClassification([1,5],[9,5],[sea,fill]),true);
});
