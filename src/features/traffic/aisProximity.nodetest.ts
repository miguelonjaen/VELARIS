import test from 'node:test';
import assert from 'node:assert/strict';
import { aisTargetDistanceNm, aisTargetPosition, sortTargetsByDistance, type AisPanelTarget } from './aisPanelModel';
const options = {minCpaNm: .27, maxTcpaMinutes: 30};
const target = (id: string, lat: number, lng: number): AisPanelTarget => ({id, lat, lng});
test('nearest contacts follow the received boat coordinates when it moves away from its saved port', () => {
 const port = target('port',36.596,-4.512); const offshore = target('offshore',36.1,-3.1);
 assert.equal(sortTargetsByDistance([port,offshore],{lat:36.101,lng:-3.1},options)[0].target.id,'offshore');
 assert.equal(sortTargetsByDistance([port,offshore],{lat:36.596,lng:-4.511},options)[0].target.id,'port');
 assert.equal(sortTargetsByDistance([port,offshore],null,options)[0].distanceNm,null);
});
test('distance exists without speed/course; missing own position does not fall back to a port', () => {
 const t = target('contact',1,0);
 assert.ok(Math.abs(aisTargetDistanceNm({lat:0,lng:0},t)! - 60.04) < .1);
 assert.equal(aisTargetDistanceNm(null,t),null);
 assert.equal(aisTargetDistanceNm({lat:NaN,lng:0},t),null);
});
test('invalid target coordinates cannot be located or get a fictitious zero distance', () => {
 assert.equal(aisTargetPosition(target('bad',91,0)),null);
 assert.equal(aisTargetDistanceNm({lat:0,lng:0},target('bad',0,181)),null);
 assert.deepEqual(aisTargetPosition({id:'lon',lat:10,lon:20}),{lat:10,lng:20});
 const rows=sortTargetsByDistance([target('bad',91,0),target('good',0,.1)],{lat:0,lng:0},options);
 assert.equal(rows[0].target.id,'good');assert.equal(rows[1].distanceNm,null);
});
test('distance order preserves CPA values and does not mutate the source collection', () => {
 const far={...target('far',2,0),cpaNm:0,tcpaMinutes:1,riskLevel:'CRITICAL' as const};
 const near={...target('near',.1,0),cpaNm:3,tcpaMinutes:20};const input=[far,near];
 const rows=sortTargetsByDistance(input,{lat:0,lng:0},options);
 assert.equal(rows[0].target.id,'near');assert.equal(rows[1].target.cpaNm,0);assert.deepEqual(input,[far,near]);
});
