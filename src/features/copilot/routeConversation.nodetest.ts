import test from 'node:test';
import assert from 'node:assert/strict';
import {handleRouteConversation,proposalDistanceNm,type RouteConversationState,type RouteConversationDependencies} from './routeConversation';
import type {RouteInterpretation,RouteSpecification} from './routeIntent';
import type {RouteProposal,RouteProposalAnalysis} from './routeProposal';
import {resolveRoutePlace} from './routePlaces';
function build(spec:RouteSpecification):RouteProposal{const places=[spec.origin,...spec.via.map(v=>v.name),spec.destination].map(resolveRoutePlace);return {id:'test-draft',places,positions:places.map(p=>p.position),requestedDistanceNm:spec.coastDistanceNm,constraints:spec.unhandledConstraints,specification:spec};}
const base:RouteInterpretation={domain:'ROUTE',action:'CREATE',origin:'Motril',destination:'Almería',via:[{name:'Adra',kind:'PORT',mode:'PASS',distanceNm:null}],coastDistance:{operation:'SET',nm:3},unhandledConstraints:[],wantsTotalDistance:false,question:null};
const spec:RouteSpecification={origin:'Motril',destination:'Almería',via:base.via!,coastDistanceNm:3,unhandledConstraints:[]};
const state:RouteConversationState={spec,pending:false};
const blank:RouteConversationState={spec:null,pending:false};
function calculated(p:RouteProposal):RouteProposal{return {...p,offshore:{positions:p.positions,anchorIndices:[0,1,2],requestedDistanceNm:p.requestedDistanceNm!,constructionMarginNm:0.2,gridStepNm:0.5,examinedNodes:1,navigationUse:false,portAccess:'NOT_PLANNED'}};}
const current=calculated(build(spec));
const analysis:RouteProposalAnalysis={surfaces:{legs:[],declaredCoverageComplete:true,navigationUse:false,depthKnown:false},clearance:{requestedDistanceNm:3,legs:[],minimumDistanceMeters:6000,meetsRequestedDistance:true},coastResourcesLoaded:true,clearanceCoverageComplete:true,failedSectors:[]};
function services(i:RouteInterpretation){let generations=0;const d:RouteConversationDependencies={interpret:async()=>i,generate:async p=>{generations++;return calculated(build(p));},analyze:async()=>analysis};return {d,count:()=>generations};}
for(const [order,distance] of [
 ['Prepara una ruta desde Motril hasta Almería, pasando frente a Adra, manteniendo tres millas de la costa',3],
 ['Prepara una ruta desde Motril hasta Almería, pasando frente a Adra, manteniendo una millas de la costa',1]
] as const)test(`despacha y calcula requisito normalizado: ${distance} NM`,async()=>{
 const deps=services({...base,coastDistance:{operation:'SET',nm:distance}});
 const r=await handleRouteConversation(order,blank,null,deps.d);
 assert.equal(r.handled,true);assert.equal(r.proposal?.requestedDistanceNm,distance);assert.equal(deps.count(),1);assert.equal(r.state.pending,false);
});
test('Motril–Alborán–Melilla conserva distancia específica y no calcula ni usa chat general',async()=>{
 const deps=services({...base,destination:'Melilla',via:[{name:'isla de Alborán',kind:'ISLAND',mode:'PASS',distanceNm:0.5}],coastDistance:{operation:'KEEP',nm:null},wantsTotalDistance:true});
 const r=await handleRouteConversation('Ahora calcula una ruta desdemotril a melilla, pasando a 0,5 millas de la isla de alboran, dame distancia total',state,current,deps.d);
 assert.equal(r.handled,true);assert.equal(r.proposal,undefined);assert.equal(deps.count(),0);assert.equal(r.state.spec?.coastDistanceNm,null);
 assert.equal(r.state.spec?.via[0].distanceNm,0.5);assert.match(r.reply,/no la aplicaré a toda la costa/);assert.match(r.reply,/No he calculado/);
});
test('origen ausente y costa decimal provocan aclaración sin inventar coordenadas',async()=>{
 const deps=services({...base,origin:null,destination:null,via:null,coastDistance:{operation:'SET',nm:1.5}});
 const r=await handleRouteConversation('Prepara una derrota a 1,5 NM de la costa',blank,null,deps.d);
 assert.equal(r.state.spec?.coastDistanceNm,1.5);assert.equal(r.proposal,undefined);assert.match(r.reply,/origen/);assert.equal(deps.count(),0);
});
test('aléjala otra milla modifica la propuesta con su contexto',async()=>{
 const deps=services({...base,action:'MODIFY',origin:null,destination:null,via:null,coastDistance:{operation:'INCREASE',nm:1}});
 const r=await handleRouteConversation('Aléjala otra milla',state,current,deps.d);
 assert.equal(r.proposal?.requestedDistanceNm,4);assert.equal(r.proposal?.places[0].name,'Motril');assert.equal(r.proposal?.places[2].name,'Almería');
});
test('destino nuevo desconocido nunca se sustituye por el anterior',async()=>{
 const deps=services({...base,action:'MODIFY',origin:null,destination:'Málaga',via:null,coastDistance:{operation:'KEEP',nm:null}});
 const r=await handleRouteConversation('cambia el destino a Málaga',state,current,deps.d);
 assert.equal(r.state.spec?.destination,'Málaga');assert.equal(r.proposal,undefined);assert.match(r.reply,/Málaga/);assert.equal(deps.count(),0);
});
test('pasando por Adra requiere aclarar escala antes del cálculo',async()=>{
 const deps=services({...base,via:[{name:'Adra',kind:'PORT',mode:'UNSPECIFIED',distanceNm:null}]});
 const r=await handleRouteConversation('Pasando por Adra',state,current,deps.d);
 assert.equal(r.proposal,undefined);assert.match(r.reply,/escala/);assert.equal(deps.count(),0);
});
test('una aclaración de paso conserva el borrador pendiente',async()=>{
 const deps=services({...base,action:'MODIFY',origin:null,destination:null,coastDistance:{operation:'KEEP',nm:null}});
 const r=await handleRouteConversation('sin escala', {spec:{...spec,via:[{...spec.via[0],mode:'UNSPECIFIED'}]},pending:true},current,deps.d);
 assert.ok(r.proposal);assert.equal(r.state.pending,false);
});
test('restricciones desconocidas se conservan en modificaciones y bloquean el cálculo',async()=>{
 const deps=services({...base,action:'MODIFY',origin:null,destination:null,via:null,coastDistance:{operation:'INCREASE',nm:1}});
 const r=await handleRouteConversation('Aléjala otra milla',{spec:{...spec,unhandledConstraints:['sin zonas militares']},pending:true},current,deps.d);
 assert.deepEqual(r.state.spec?.unhandledConstraints,['sin zonas militares']);assert.equal(deps.count(),0);assert.match(r.reply,/No recalcularé eliminándolas/);
});
test('distancia total se suma sobre la geometría visible y no llama al generador',async()=>{
 const deps=services({...base,action:'QUERY',origin:null,destination:null,via:null,coastDistance:{operation:'KEEP',nm:null},wantsTotalDistance:true});
 const r=await handleRouteConversation('Dime la distancia total',state,current,deps.d);
 assert.ok(proposalDistanceNm(current)!>0);assert.match(r.reply,/Excluye los accesos portuarios/);assert.equal(deps.count(),0);assert.equal(r.proposal,undefined);
 const pending=await handleRouteConversation('Dime la distancia total',{...state,pending:true},current,deps.d);
 assert.match(pending.reply,/todavía no tiene una propuesta calculada/);
});
for(const failure of ['TIMEOUT','OLLAMA_UNAVAILABLE','INVALID_JSON'])test(`recuperación cerrada: ${failure}`,async()=>{
 const deps=services(base);deps.d.interpret=async()=>{throw new Error(failure);};
 const r=await handleRouteConversation('Calcula Motril–Melilla',state,current,deps.d);
 assert.equal(r.handled,true);assert.equal(r.state,state);assert.equal(r.proposal,undefined);assert.equal(deps.count(),0);assert.match(r.reply,/no he enviado la orden al chat general/);
});
test('solo OTHER validado puede continuar hacia el asistente general',async()=>{
 const deps=services({...base,domain:'OTHER',action:'NONE',origin:null,destination:null,via:null,coastDistance:{operation:'KEEP',nm:null}});
 assert.equal((await handleRouteConversation('Qué es SOG',state,current,deps.d)).handled,false);
});
test('fallo de validación geométrica nunca publica ni activa la propuesta',async()=>{
 const deps=services(base);deps.d.analyze=async()=>({...analysis,clearanceCoverageComplete:false});
 const before=JSON.stringify(current);
 const r=await handleRouteConversation('nueva ruta',state,current,deps.d);
 assert.equal(r.proposal,undefined);assert.equal(JSON.stringify(current),before);assert.match(r.reply,/Mantengo la propuesta anterior/);
});

test('no reabre una propuesta descartada ni publica una modificación vacía',async()=>{
 const deps=services({...base,action:'MODIFY',origin:null,destination:null,via:null,coastDistance:{operation:'KEEP',nm:null}});
 const discarded=await handleRouteConversation('aléjala',state,null,deps.d);
 assert.equal(discarded.proposal,undefined);assert.equal(deps.count(),0);
 const unchanged=await handleRouteConversation('cambia algo',state,current,deps.d);
 assert.equal(unchanged.proposal,undefined);assert.equal(deps.count(),0);assert.match(unchanged.reply,/No he identificado/);
});

test('paso objetivo 0,5 ±0,05 NM incompatible con costa de 1 NM pide aclaración antes de buscar o calcular',async()=>{
 const deps=services({...base,via:[{name:'Alborán',kind:'ISLAND',mode:'PASS',distanceNm:0.5}],coastDistance:{operation:'SET',nm:1}});
 deps.d.resolve=async()=>{assert.fail('Conflict must be resolved before geographic searches');};
 const result=await handleRouteConversation('paso de isla con separación general incompatible',blank,current,deps.d);
 assert.equal(result.proposal,undefined);assert.equal(result.state.pending,true);assert.equal(deps.count(),0);
 assert.match(result.reply,/conflicto/);assert.match(result.reply,/0,45–0,55 NM/);assert.match(result.reply,/No aplicaré una excepción/);
 assert.equal(result.state.spec?.coastDistanceNm,1);assert.equal(result.state.spec?.via[0].distanceNm,0.5);
});
test('un paso objetivo conserva la banda acordada sin declarar implementado su cálculo',async()=>{
 const deps=services({...base,via:[{name:'Alborán',kind:'ISLAND',mode:'PASS',distanceNm:0.5}],coastDistance:{operation:'KEEP',nm:null}});
 const result=await handleRouteConversation('paso a media milla de isla',blank,null,deps.d);
 assert.equal(result.proposal,undefined);assert.equal(deps.count(),0);assert.match(result.reply,/0,45–0,55 NM/);
 assert.match(result.reply,/No he calculado/);assert.equal(result.state.spec?.coastDistanceNm,null);
});

for(const status of ['OUTSIDE_BAND','UNKNOWN'] as const)test(`no publica una propuesta si el paso local está ${status} aunque la costa general cumpla`,async()=>{
 // Mocked controller contract; real island geometry is tested by test-route-island-passage.mjs.
 const deps=services({...base,via:[{name:'Adra',kind:'ISLAND',mode:'PASS',distanceNm:0.5}],coastDistance:{operation:'SET',nm:0.1}});
 deps.d.supportsIslandPassages=true;
 deps.d.analyze=async()=>({...analysis,referencePassages:[{name:'Adra',targetDistanceNm:0.5,toleranceNm:0.05,minimumDistanceNm:status==='UNKNOWN' ? null : 0.8,status}]});
 const result=await handleRouteConversation('fixture de contrato de paso',blank,current,deps.d);
 assert.equal(deps.count(),1);assert.equal(result.proposal,undefined);assert.equal(result.state.pending,true);
});
test('capacidad local sin separación general explícita solicita ese dato y conserva el objetivo',async()=>{
 const deps=services({...base,via:[{name:'Adra',kind:'ISLAND',mode:'PASS',distanceNm:0.5}],coastDistance:{operation:'KEEP',nm:null}});
 deps.d.supportsIslandPassages=true;
 const result=await handleRouteConversation('fixture de objetivo local',blank,null,deps.d);
 assert.equal(deps.count(),0);assert.match(result.reply,/0,45–0,55 NM/);assert.match(result.reply,/separación general/);
 assert.equal(result.state.spec?.coastDistanceNm,null);
});

test('una distancia a PLACE no se trata como distancia al contorno costero de una isla',async()=>{
 const deps=services({...base,via:[{name:'Adra',kind:'PLACE',mode:'PASS',distanceNm:0.5}],coastDistance:{operation:'SET',nm:1}});
 const result=await handleRouteConversation('referencia genérica con distancia local',blank,null,deps.d);
 assert.equal(result.proposal,undefined);assert.equal(deps.count(),0);assert.doesNotMatch(result.reply,/Hay un conflicto/);
 assert.match(result.reply,/tipo de paso/);
});
