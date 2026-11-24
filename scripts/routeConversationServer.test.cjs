const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validateConversation,validateConversationContext,interpretRouteConversation}=require('../ollama-route-intent');
const none={domain:'OTHER',action:'NONE',origin:null,destination:null,via:null,coastDistance:{operation:'KEEP',nm:null},unhandledConstraints:[],wantsTotalDistance:false,question:null};
test('backend rechaza coordenadas y contexto con datos no permitidos',()=>{
 assert.throws(()=>validateConversation({...none,positions:[[1,2]]}));
 assert.throws(()=>validateConversationContext({spec:null,hasCalculatedProposal:false,lat:36}));
 assert.throws(()=>validateConversation({...none,domain:'ROUTE',action:'QUERY',destination:'Motril'}));
});
test('petición al modelo incluye contrato y contexto, no herramientas de navegación',async()=>{
 let sent;
 const result=await interpretRouteConversation('qué es SOG',undefined,{fetchImpl:async(url,options)=>{sent=JSON.parse(options.body);return {ok:true,json:async()=>({message:{content:JSON.stringify({intent:'OTHER'})}})};}});
 assert.equal(result.domain,'OTHER');assert.equal(sent.options.temperature,0);assert.equal(sent.tools,undefined);assert.equal(sent.format.additionalProperties,false);
});
test('indisponibilidad y TIMEOUT no tienen intérprete alternativo inventado',async()=>{
 for(const name of ['TimeoutError','TypeError']){
  const error=new Error('unavailable');error.name=name;
  await assert.rejects(interpretRouteConversation('calcula una ruta',undefined,{fetchImpl:async()=>{throw error;}}),e=>e===error);
 }
});

test('segmenta preposiciones pegadas a entidades del catálogo sin clasificar por frases',()=>{
 const {normalizeGeographicSpelling}=require('../ollama-route-intent');
 assert.equal(normalizeGeographicSpelling('ahora desdemotril a Melilla a 0,5 MN'),'ahora desde Motril a Melilla a 0,5 MN');
 assert.equal(normalizeGeographicSpelling('haciaalmería, desdeadra'),'hacia Almería, desde Adra');
 assert.equal(normalizeGeographicSpelling('No prepares una ruta'),'No prepares una ruta');
});

test('rechaza una separación general inventada en una orden con distancia solo a una isla',async()=>{
 const order='Prepara una ruta de Motril a Almería pasando a media milla de la isla de Alborán';
 const extracted={origin:'Motril',destination:'Almería',via:[{name:'Alborán',kind:'ISLAND',mode:'PASS',distanceNm:0.5}],coastDistance:{operation:'SET',nm:1},unhandledConstraints:[],coastDistanceEvidence:order};
 let calls=0;
 await assert.rejects(interpretRouteConversation(order,undefined,{fetchImpl:async()=>({ok:true,json:async()=>({message:{content:JSON.stringify(++calls===1 ? {intent:'CREATE'} : extracted)}})})}),/UNGROUNDED_COAST_DISTANCE/);
});
test('evidencia literal de costa queda en el intérprete, sin ampliar el contrato público',async()=>{
 const order='Prepara una ruta de Motril a Almería a una milla de costa';
 const extracted={origin:'Motril',destination:'Almería',via:null,coastDistance:{operation:'SET',nm:1},unhandledConstraints:[],coastDistanceEvidence:'a una milla de costa'};
 let calls=0;
 const result=await interpretRouteConversation(order,undefined,{fetchImpl:async()=>({ok:true,json:async()=>({message:{content:JSON.stringify(++calls===1 ? {intent:'CREATE'} : extracted)}})})});
 assert.equal(result.coastDistance.nm,1);assert.equal(Object.hasOwn(result,'coastDistanceEvidence'),false);
});
test('una cita que no existe en la orden nunca respalda una restricción',async()=>{
 const order='Calcula Motril a Almería';
 let calls=0;
 const extracted={origin:'Motril',destination:'Almería',via:null,coastDistance:{operation:'SET',nm:1},unhandledConstraints:[],coastDistanceEvidence:'a una milla de costa'};
 await assert.rejects(interpretRouteConversation(order,undefined,{fetchImpl:async()=>({ok:true,json:async()=>({message:{content:JSON.stringify(++calls===1 ? {intent:'CREATE'} : extracted)}})})}),/UNGROUNDED_COAST_DISTANCE/);
});

test('recupera solo la cita omitida sin cambiar el requisito ya extraído',async()=>{
 const order='Prepara una ruta de Motril a Almería a tres millas de la costa';
 const extracted={origin:'Motril',destination:'Almería',via:null,coastDistance:{operation:'SET',nm:3},unhandledConstraints:[],coastDistanceEvidence:null};
 const responses=[{intent:'CREATE'},extracted,{quote:'a tres millas de la costa'}];let calls=0;
 const result=await interpretRouteConversation(order,undefined,{fetchImpl:async()=>({ok:true,json:async()=>({message:{content:JSON.stringify(responses[calls++])}})})});
 assert.equal(result.coastDistance.nm,3);assert.equal(calls,3);
});

for(const [name,order] of [
 ['Cartagena de Indias, Colombia','Prepara una ruta de Cartagena de Indias, Colombia a Motril'],
 ['La Línea de la Concepción','Prepara una ruta desde La Línea de la Concepción hasta Motril'],
 ['Puerto de Málaga (España)','Prepara una ruta desde Puerto de Málaga, España hasta Motril']
])test(`topónimo compuesto conserva partículas y calificadores: ${name}`,async()=>{
 const extracted={origin:name,destination:'Motril',via:null,coastDistance:{operation:'KEEP',nm:null},unhandledConstraints:[],coastDistanceEvidence:null};let calls=0;
 const result=await interpretRouteConversation(order,undefined,{fetchImpl:async()=>({ok:true,json:async()=>({message:{content:JSON.stringify(++calls===1 ? {intent:'CREATE'} : extracted)}})})});
 assert.equal(result.origin,name);assert.equal(calls,2);
});
test('normalizar puntuación no permite inventar un país no mencionado',async()=>{
 const extracted={origin:'Cartagena, Colombia',destination:'Motril',via:null,coastDistance:{operation:'KEEP',nm:null},unhandledConstraints:[],coastDistanceEvidence:null};let calls=0;
 await assert.rejects(interpretRouteConversation('Prepara una ruta de Cartagena a Motril',undefined,{fetchImpl:async()=>({ok:true,json:async()=>({message:{content:JSON.stringify(++calls===1 ? {intent:'CREATE'} : extracted)}})})}),/UNGROUNDED_PLACE/);
});

test('repara preposiciones pegadas a topónimos fuera del catálogo después de clasificar ROUTE',async()=>{
 const order='Ahora calcula una ruta desdemálaga a Cartagena a una milla de la costa';let calls=0;let extractedOrder;
 const extracted={origin:'Málaga',destination:'Cartagena',via:null,coastDistance:{operation:'SET',nm:1},unhandledConstraints:[],coastDistanceEvidence:'a una milla de la costa'};
 const result=await interpretRouteConversation(order,undefined,{fetchImpl:async(_url,options)=>{
  calls++;if(calls===2)extractedOrder=JSON.parse(options.body).messages.at(-1).content;
  return {ok:true,json:async()=>({message:{content:JSON.stringify(calls===1 ? {intent:'CREATE'} : extracted)}})};
 }});
 assert.match(extractedOrder,/desde málaga/);assert.equal(result.origin,'Málaga');
});
test('la reparación genérica no altera la entrada al clasificador ni fuerza ROUTE',async()=>{
 const order='Qué significa desdeñoso';let sent;
 const result=await interpretRouteConversation(order,undefined,{fetchImpl:async(_url,options)=>{sent=JSON.parse(options.body);return {ok:true,json:async()=>({message:{content:'{"intent":"OTHER"}'}})};}});
 assert.equal(sent.messages.at(-1).content,order);assert.equal(result.domain,'OTHER');
});

for(const [order,origin,country] of [
 ['Prepara una ruta de Puerto de Málaga, España a Motril','Puerto de Málaga','España'],
 ['Prepara una ruta desde Cartagena, Colombia hasta Motril','Cartagena','Colombia']
])test(`conserva país explícito omitido por el modelo: ${country}`,async()=>{
 const extracted={origin,destination:'Motril',via:null,coastDistance:{operation:'KEEP',nm:null},unhandledConstraints:[],coastDistanceEvidence:null};let calls=0;
 const result=await interpretRouteConversation(order,undefined,{fetchImpl:async()=>({ok:true,json:async()=>({message:{content:JSON.stringify(++calls===1 ? {intent:'CREATE'} : extracted)}})})});
 assert.equal(result.origin,`${origin}, ${country}`);
});

test('la corrección de un topónimo no vuelve a perder el país explícito',async()=>{
 const order='Prepara una ruta de Puerto de Málaga, España a Motril';
 const base={origin:'Melilla',destination:'Motril',via:null,coastDistance:{operation:'KEEP',nm:null},unhandledConstraints:[],coastDistanceEvidence:null};
 const replies=[{intent:'CREATE'},base,{...base,origin:'Puerto de Málaga'}];let calls=0;
 const result=await interpretRouteConversation(order,undefined,{fetchImpl:async()=>({ok:true,json:async()=>({message:{content:JSON.stringify(replies[calls++])}})})});
 assert.equal(result.origin,'Puerto de Málaga, España');assert.equal(calls,3);
});
