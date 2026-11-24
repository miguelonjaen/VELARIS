const {interpretRouteConversation}=require('../ollama-route-intent');
const started=Date.now();
interpretRouteConversation(process.argv[2]||'Qué significa SOG',undefined,{timeoutMs:90000,onMetrics:metrics=>console.log('MODEL_METRICS',Date.now()-started,JSON.stringify(metrics))})
.then(result=>console.log('INTERPRETATION',Date.now()-started,JSON.stringify(result)))
.catch(error=>{console.error(error.name,error.message,Date.now()-started);process.exitCode=1;});
