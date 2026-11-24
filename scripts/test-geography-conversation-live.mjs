import assert from 'node:assert/strict';
import {once} from 'node:events';
import {writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createServer} from 'vite';
const require=createRequire(import.meta.url);
const backend=require('../map-server');
const http=backend.startMapServer(0);
if(!http.listening)await once(http,'listening');
const endpoint=`http://127.0.0.1:${http.address().port}/api/route-intent`;
const vite=await createServer({configFile:false,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:false},appType:'custom'});
const evidence=[];
try{
 const {handleTacticalConversation}=await vite.ssrLoadModule('/src/features/copilot/routeConversationRuntime.ts');
 const cases=[
  ['cartagena','Prepara una ruta desde Motril hasta Cartagena manteniendo una milla de la costa',/cartagena/i],
  ['ibiza','Prepara una ruta desde Motril hasta Ibiza manteniendo una milla de la costa',/ibiza/i],
  ['melilla','Prepara una ruta desde Motril hasta Melilla manteniendo una milla de la costa',/melilla/i],
  ['alboran','Prepara una ruta de Motril a Almería pasando a media milla de la isla de Alborán',/almer[ií]a/i],
  ['malaga-qualified','Prepara una ruta desde Puerto de Málaga, España hasta Motril manteniendo una milla de la costa',/motril/i],
  ['glued-unknown','Ahora calcula una ruta desdemálaga a Cartagena a una milla de la costa',/cartagena/i],
  ['passage-conflict','Prepara una ruta de Motril a Almería pasando a 0,5 NM de la isla de Alborán y manteniendo 1 NM de la costa',/almer[ií]a/i],
  ['melilla-qualified','Prepara una ruta desde Motril hasta Melilla, España, pasando a 0,5 NM de la isla de Alborán, manteniendo 0,1 NM de la costa',/melilla/i]
 ];
 for(const [label,order,destination] of cases){
  const started=performance.now();
  const result=await handleTacticalConversation(order,{spec:null,pending:false},null,endpoint);
  try{
   assert.equal(result.handled,true);assert.ok(result.state.spec);assert.match(result.state.spec.destination,destination);
   assert.ok(result.proposal?.offshore || result.state.pending);
   if(label==='alboran'){assert.equal(result.state.spec.via[0].kind,'ISLAND');assert.equal(result.state.spec.via[0].distanceNm,0.5);assert.equal(result.state.spec.coastDistanceNm,null);assert.equal(result.proposal,undefined);}
   if(label==='passage-conflict'){assert.match(result.reply,/conflicto/);assert.equal(result.proposal,undefined);}
   if(label==='melilla-qualified'){assert.match(result.reply,/cobertura detallada del corredor es incompleta|Referencia «Melilla, España»/);assert.equal(result.proposal,undefined);}
   if(label==='malaga-qualified')assert.match(result.state.spec.origin,/España/i);
   if(label==='glued-unknown')assert.match(result.state.spec.origin,/m[aá]laga/i);
   if(['cartagena','ibiza','melilla'].includes(label))assert.equal(result.proposal,undefined);
   evidence.push({label,order,pass:true,elapsedMs:performance.now()-started,result});console.log(`PASS ${label}: ${result.reply}`);
  }catch(error){evidence.push({label,order,pass:false,error:error.message,elapsedMs:performance.now()-started,result});console.error(`FAIL ${label}: ${error.message}`);}
 }
 await writeFile('work/geography-new-conversations-live.json',JSON.stringify({cases:evidence,failures:evidence.filter(c=>!c.pass).length},null,2));
 console.log(`DYNAMIC RESULT: ${evidence.filter(c=>c.pass).length}/${evidence.length}`);
 if(evidence.some(c=>!c.pass))process.exitCode=1;
}finally{await vite.close();backend.stopMapServer();}
