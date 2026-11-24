import test from 'node:test';
import assert from 'node:assert/strict';
import {handleRouteConversation,type RouteConversationDependencies} from './routeConversation';
import {parseNominatim} from '../../main/geography/geographicResolver';
import type {RouteInterpretation} from './routeIntent';
const intention:RouteInterpretation={domain:'ROUTE',action:'CREATE',origin:'Málaga',destination:'Melilla',via:[],coastDistance:{operation:'SET',nm:1},unhandledConstraints:[],wantsTotalDistance:false,question:null};
const ref=parseNominatim([{osm_type:'node',osm_id:1,name:'Málaga',display_name:'Málaga, España',class:'place',type:'city',lat:'36.7',lon:'-4.4'}])[0];
function dependencies():RouteConversationDependencies {return {
  interpret:async()=>intention,
  resolve:async name=>({query:name,status:'RESOLVED',candidates:[{...ref,name}],cache:'FRESH',message:'resolved'}),
  generate:async()=>{throw new Error('SMARTCHARTS_INCOMPLETE_CORRIDOR_COVERAGE');},
  analyze:async()=>{throw new Error('must not analyze');}
};}
test('resolved geography outside coverage cannot publish a route; provenance remains visible',async()=>{
  const deps=dependencies();let received=0;
  deps.generate=async(spec,places)=>{assert.equal(spec.origin,'Málaga');received=places?.length ?? 0;throw new Error('SMARTCHARTS_INCOMPLETE_CORRIDOR_COVERAGE');};
  const result=await handleRouteConversation('Málaga Melilla',{spec:null,pending:false},null,deps);
  assert.equal(received,2);assert.equal(result.proposal,undefined);assert.equal(result.state.pending,true);
  assert.match(result.reply,/lugares se han resuelto/);assert.match(result.reply,/openstreetmap.org/);
});
for(const status of ['AMBIGUOUS','NOT_FOUND','UNAVAILABLE'] as const)test(`${status} conserves pending specification without generation`,async()=>{
  const deps=dependencies();deps.resolve=async query=>({query,status,candidates:[],cache:'MISS',message:'Precise el lugar'});
  deps.generate=async()=>{assert.fail('must not generate');};
  const result=await handleRouteConversation('Málaga Melilla',{spec:null,pending:false},null,deps);
  assert.equal(result.state.spec?.destination,'Melilla');assert.equal(result.proposal,undefined);assert.match(result.reply,/Precise/);
});
test('stale offline reference is available but does not authorize fresh calculation',async()=>{
  const deps=dependencies();deps.resolve=async query=>({query,status:'RESOLVED',candidates:[ref],cache:'STALE',message:'old'});
  deps.generate=async()=>{assert.fail('must not generate');};
  const result=await handleRouteConversation('Málaga Melilla',{spec:null,pending:false},null,deps);
  assert.match(result.reply,/caché antigua/);assert.equal(result.proposal,undefined);
});
