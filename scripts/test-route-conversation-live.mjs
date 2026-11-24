import assert from 'node:assert/strict';
import {once} from 'node:events';
import {writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createServer} from 'vite';
const require=createRequire(import.meta.url);
const {startMapServer,stopMapServer}=require('../map-server.js');
const http=startMapServer(0);
if(!http.listening)await once(http,'listening');
const endpoint=`http://127.0.0.1:${http.address().port}/api/route-intent`;
const vite=await createServer({configFile:false,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:false},appType:'custom'});
const evidence=[];let failures=0;
try{
 const {handleTacticalConversation}=await vite.ssrLoadModule('/src/features/copilot/routeConversationRuntime.ts');
 let baseline=null,baselineState={spec:null,pending:false};
 async function check(label,order,state,current,verify){
  const started=performance.now();
  const result=await handleTacticalConversation(order,state,current,endpoint);
  try{verify(result);evidence.push({label,order,pass:true,elapsedMs:performance.now()-started,state:result.state,reply:result.reply,diagnostic:result.diagnostic,proposal:result.proposal});console.log(`PASS ${label}: ${result.reply}`);}
  catch(error){failures++;evidence.push({label,order,pass:false,error:error.message,elapsedMs:performance.now()-started,result});console.log(`FAIL ${label}: ${error.message.split('\n')[0]} | ${JSON.stringify({state:result.state,reply:result.reply,diagnostic:result.diagnostic})}`);}
  return result;
 }
 const A=await check('A-3NM','Prepara una ruta desde Motril hasta Almería, pasando frente a Adra, manteniendo tres millas de la costa',{spec:null,pending:false},null,r=>{assert.equal(r.handled,true);assert.equal(r.state.spec.coastDistanceNm,3);assert.ok(r.proposal?.offshore);});
 if(A.proposal){baseline=A.proposal;baselineState=A.state;}
 const B=await check('B-una-millas','Prepara una ruta desde Motril hasta Almería, pasando frente a Adra, manteniendo una millas de la costa',{spec:null,pending:false},baseline,r=>{assert.equal(r.handled,true);assert.equal(r.state.spec.coastDistanceNm,1);assert.ok(r.proposal?.offshore);});
 if(B.proposal){baseline=B.proposal;baselineState=B.state;}
 await check('C-Alboran-0,5','Ahora calcula una ruta desdemotril a melilla, pasando a 0,5 millas de la isla de alboran, dame distancia total',baselineState,baseline,r=>{assert.equal(r.handled,true);assert.equal(r.proposal,undefined);assert.equal(r.state.spec.origin.toLowerCase(),'motril');assert.equal(r.state.spec.destination.toLowerCase(),'melilla');assert.equal(r.state.spec.coastDistanceNm,null);assert.equal(r.state.spec.via[0].distanceNm,0.5);assert.match(r.reply,/no la aplicaré a toda la costa|Referencia|referencias|geográfica/);});
 await check('por-delante','Quiero ir de Motril a Almería por delante de Adra',{spec:null,pending:false},null,r=>{assert.equal(r.handled,true);assert.equal(r.state.spec.via[0].mode,'PASS');assert.equal(r.proposal,undefined);assert.match(r.reply,/separación general/);});
 await check('media-milla','Calcula Motril–Melilla pasando a media milla de Alborán',{spec:null,pending:false},null,r=>{assert.equal(r.handled,true);assert.equal(r.state.spec.via[0].distanceNm,0.5);assert.equal(r.state.spec.coastDistanceNm,null);assert.equal(r.proposal,undefined);});
 await check('decimal-NM','Prepara una derrota a 1,5 NM de la costa',{spec:null,pending:false},null,r=>{assert.equal(r.handled,true);assert.equal(r.state.spec.coastDistanceNm,1.5);assert.equal(r.proposal,undefined);assert.match(r.reply,/origen/);});
 if(baseline){
  const moved=await check('incremento-contextual','Aléjala otra milla',baselineState,baseline,r=>{assert.equal(r.handled,true);assert.ok(r.proposal?.offshore);assert.equal(r.state.spec.coastDistanceNm,2);});
  const queryState=moved.proposal ? moved.state:baselineState;
  const queryProposal=moved.proposal ?? baseline;
  await check('distancia-total','Dime la distancia total',queryState,queryProposal,r=>{assert.equal(r.handled,true);assert.equal(r.proposal,undefined);assert.match(r.reply,/suma/);assert.match(r.reply,/Excluye los accesos/);});
  await check('nuevo-destino','Cambia el destino a Málaga',baselineState,baseline,r=>{assert.equal(r.handled,true);assert.equal(r.proposal,undefined);assert.match(r.state.spec.destination,/Málaga|Malaga/);assert.match(r.reply,/Referencia|referencias geográficas|cobertura cartográfica/);});
 }
 const ambiguous=await check('escala-ambigua','Prepara una ruta desde Motril hasta Almería, pasando por Adra, a una milla de la costa',{spec:null,pending:false},null,r=>{assert.equal(r.handled,true);assert.equal(r.proposal,undefined);assert.equal(r.state.spec.via[0].mode,'UNSPECIFIED');assert.match(r.reply,/escala/);});
 if(ambiguous.state.spec)await check('respuesta-aclaracion','Sin escala, por delante de Adra',ambiguous.state,null,r=>{assert.equal(r.handled,true);assert.ok(r.proposal?.offshore);assert.equal(r.state.spec.via[0].mode,'PASS');});
 await check('restriccion-desconocida','Prepara una ruta de Motril a Almería a una milla de costa evitando todas las zonas militares',{spec:null,pending:false},null,r=>{assert.equal(r.handled,true);assert.equal(r.proposal,undefined);assert.ok(r.state.spec.unhandledConstraints.length>0);assert.match(r.reply,/conservado/);});
 await check('consulta-ajena','Qué significa SOG',{spec:null,pending:false},null,r=>{assert.equal(r.handled,false);assert.equal(r.proposal,undefined);});
 if(process.argv[2])await writeFile(process.argv[2],JSON.stringify({endpoint,cases:evidence,failures},null,2),'utf8');
 console.log(`INTEGRATION RESULT: ${evidence.length-failures}/${evidence.length} passed; ${failures} failed.`);
 if(failures)process.exitCode=1;
}finally{await vite.close();stopMapServer();}
