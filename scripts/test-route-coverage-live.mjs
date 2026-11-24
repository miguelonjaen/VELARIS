import assert from 'node:assert/strict';
import {once} from 'node:events';
import {writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createServer} from 'vite';
const require=createRequire(import.meta.url);
const backend=require('../map-server.js');
const http=backend.startMapServer(0);
if(!http.listening)await once(http,'listening');
const root=`http://127.0.0.1:${http.address().port}`;
const vite=await createServer({configFile:false,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:false},appType:'custom'});
const cases=[];
try{
 const {handleTacticalConversation}=await vite.ssrLoadModule('/src/features/copilot/routeConversationRuntime.ts');
 let state={spec:null,pending:false},proposal=null;
 // Populate through the real provider/cache endpoint, never with test coordinates.
 const identity=await fetch(root+'/api/geographic-resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:'Melilla',kind:'PLACE'})});
 assert.equal(identity.ok,true);
 const lookup=await identity.json();
 const portResponse=await fetch(root+'/api/geographic-resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:'Puerto de Melilla, España',kind:'PORT'})});
 assert.equal(portResponse.ok,true);
 const portLookup=await portResponse.json();
 await writeFile('work/melilla-port-identity-coverage.json',JSON.stringify(portLookup,null,2));
 const ports=portLookup.candidates.filter(c=>c.kind==='PORT');
 assert.equal(ports.length,1,'This named benchmark needs one port identity; never take the first ambiguous port');
 const port=ports[0];
 await writeFile('work/melilla-identity-coverage.json',JSON.stringify(lookup,null,2));
 for(const [label,order,verify] of [
  ['partial-create','Prepara una derrota a 1,5 NM de la costa',r=>{assert.equal(r.state.spec.coastDistanceNm,1.5);assert.match(r.reply,/origen/);}],
  ['ambiguous-city','Prepara una ruta desde Motril hasta Melilla, España, pasando a 0,5 NM de la isla de Alborán y manteniendo 0,5 NM de separación general a costa',r=>{assert.equal(r.proposal,undefined);assert.equal(r.state.pending,true);assert.match(r.reply,/Referencia/);}],
  ['full-corridor',`Prepara una ruta desde Motril hasta «${port.name}», pasando a 0,5 NM de la isla de Alborán y manteniendo 0,5 NM de la costa`,r=>{assert.ok(r.proposal?.offshore);assert.equal(r.state.spec.coastDistanceNm,0.5);assert.equal(r.proposal.places.at(-1).providerId,port.providerId);}],
  ['distance','Dime la distancia total',r=>assert.match(r.reply,/suma/)],
  ['same-clearance','Modifica la propuesta: mantén 0,5 NM de separación general a costa',r=>{assert.equal(r.state.spec.coastDistanceNm,0.5);assert.equal(r.state.pending,false);}],
  ['baseline-three','Prepara una ruta desde Motril hasta Almería, pasando frente a Adra, manteniendo tres millas de la costa',r=>assert.ok(r.proposal?.offshore)],
  ['set-clearance','Modifica la propuesta: mantén una milla de separación general a costa',r=>{assert.ok(r.proposal?.offshore);assert.equal(r.state.spec.coastDistanceNm,1);}],
  ['distance-after-modification','Dime la distancia total',r=>assert.match(r.reply,/suma/)]
 ]){
  const started=performance.now();
  const result=await handleTacticalConversation(order,state,proposal,root+'/api/route-intent');
  let pass=true,error;
  try{verify(result);}catch(e){pass=false;error=e.message;}
  cases.push({label,order,pass,error,elapsedMs:performance.now()-started,result});
  console.log(JSON.stringify({label,pass,error,reply:result.reply,diagnostic:result.diagnostic}));
  state=result.state;if(result.proposal)proposal=result.proposal;
 }
 await writeFile('work/route-coverage-port-live.json',JSON.stringify({cases,failures:cases.filter(c=>!c.pass).length},null,2));
 if(cases.some(c=>!c.pass))process.exitCode=1;
}finally{await vite.close();backend.stopMapServer();}
