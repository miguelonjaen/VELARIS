import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRouteInterpretation, type RouteInterpretation} from './routeIntent';
export const empty:RouteInterpretation={domain:'ROUTE',action:'CREATE',origin:null,destination:null,via:null,
  coastDistance:{operation:'KEEP',nm:null},unhandledConstraints:[],wantsTotalDistance:false,question:null};
test('el contrato conserva 0,5 NM de una isla separado de costa general',()=>{
 const i=parseRouteInterpretation({...empty,origin:'Motril',destination:'Melilla',via:[{name:'Alborán',kind:'ISLAND',mode:'PASS',distanceNm:0.5}]});
 assert.equal(i.coastDistance.nm,null);assert.equal(i.via?.[0].distanceNm,0.5);
});
test('rechaza coordenadas o campos inesperados en cualquier referencia',()=>{
 assert.throws(()=>parseRouteInterpretation({...empty,lat:36}));
 assert.throws(()=>parseRouteInterpretation({...empty,via:[{name:'Adra',kind:'PORT',mode:'PASS',distanceNm:null,lng:-3}]}));
});
test('rechaza números inválidos y consultas con mutaciones ocultas',()=>{
 for(const nm of [NaN,Infinity,0,-1,101])assert.throws(()=>parseRouteInterpretation({...empty,coastDistance:{operation:'SET',nm}}));
 assert.throws(()=>parseRouteInterpretation({...empty,action:'QUERY',origin:'Motril'}));
 assert.throws(()=>parseRouteInterpretation({...empty,domain:'OTHER',action:'CREATE'}));
});
test('preserva restricciones desconocidas y modo de paso ambiguo',()=>{
 const i=parseRouteInterpretation({...empty,via:[{name:'Adra',kind:'PORT',mode:'UNSPECIFIED',distanceNm:null}],unhandledConstraints:['solo de día']});
 assert.deepEqual(i.unhandledConstraints,['solo de día']);assert.equal(i.via?.[0].mode,'UNSPECIFIED');
});
