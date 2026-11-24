"use strict";
// Component integration test in Electron. Never imports GAULOS hardware/navigation startup.
const {app,BrowserWindow}=require('electron');
const path=require('node:path');
const fs=require('node:fs/promises');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
app.setPath('userData',path.join(root,'work/route-renderer-profile'));
let vite,win;
app.whenReady().then(async()=>{
 try {
  const islandMode=process.argv.includes('--island');
  const evidence=JSON.parse(await fs.readFile(path.join(root,islandMode ? 'work/route-island-passage-evidence.json' : 'work/geography-conversation-live-continued.json'),'utf8'));
  const proposal=islandMode ? evidence.proposal : evidence.cases.find(c=>c.label==='B-una-millas' && c.pass)?.proposal;
  assert.ok(proposal?.offshore,'Requires a successful real Ollama baseline');
  await fs.writeFile(path.join(root,'work/renderer-proposal-fixture.json'),JSON.stringify(proposal));
  await fs.writeFile(path.join(root,'work/route-renderer-test.html'),'<!doctype html><html><head><meta charset="utf-8"><title>GAULOS · verificación de propuesta</title></head><body><div id="root"></div><script type="module" src="/work/route-renderer-test.tsx"></script></body></html>');
  await fs.writeFile(path.join(root,'work/route-renderer-test.tsx'),`
import React from 'react';
import {createRoot} from 'react-dom/client';
import {MapContainer,GeoJSON} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import {RouteProposalLayer} from '/src/features/copilot/RouteProposalLayer';
import {analyzeRouteProposal} from '/src/features/copilot/routeProposal';
import {proposalDistanceNm} from '/src/features/copilot/routeConversation';
import coast1 from '/src/features/navigation/components/smartcharts/mediterranean/sector-mediterranean-east-0.json';
import coast2 from '/src/features/navigation/components/smartcharts/mediterranean/sector-almeria-west-0.json';
const style=document.createElement('style');style.textContent='body{margin:0;background:#0b1827;color:#ecf3fa;font:16px Arial}header{padding:18px 24px}h1{font-size:24px;margin:0 0 10px}p{margin:8px 0}.leaflet-container{background:#142f47}.leaflet-popup-content{color:#182536}';document.head.append(style);
const proposal=await fetch('/work/renderer-proposal-fixture.json').then(r=>r.json());
const analysis=await analyzeRouteProposal(proposal);
const distance=proposalDistanceNm(proposal);
const isLocal=Boolean(proposal.specification?.via.some(v=>v.distanceNm !== null));
const title=isLocal ? 'Paso junto a Alborán · EXTREMOS SINTÉTICOS DE PRUEBA' : 'Motril → frente a Adra → Almería';
const coast={type:'FeatureCollection',features:[...coast1.features,...coast2.features].filter(f=>f.properties.kind==='coastline')};
function TestView(){const [draft,setDraft]=React.useState(proposal);return <><header><h1>GAULOS · Propuesta provisional</h1><p>{title} · {distance.toFixed(2)} NM · separación general {proposal.requestedDistanceNm} NM</p><p>Componentes reales de SmartCHARTS y propuesta editable. Banco de prueba sin conexión a navegación ni piloto.</p><p id="result">{analysis.surfaces.declaredCoverageComplete && analysis.clearance.meetsRequestedDistance ? 'ANÁLISIS GEOMÉTRICO CORRECTO' : 'ANÁLISIS INDETERMINADO'}</p>{analysis.referencePassages?.map(p=><p key={p.name}>Objetivo {p.targetDistanceNm} ±{p.toleranceNm} NM · mínimo medido {p.minimumDistanceNm.toFixed(3)} NM · {p.status}</p>)}</header><MapContainer center={[36.7,-3]} zoom={9} style={{height:'560px',width:'100%'}}><GeoJSON data={coast} style={{color:'#769084',weight:2}}/><RouteProposalLayer proposal={draft} onChange={setDraft} onClose={()=>{window.__routeDiscarded=true;}}/></MapContainer></>};
createRoot(document.getElementById('root')).render(<TestView/>);
window.__routeTest={distance,coverage:analysis.surfaces.declaredCoverageComplete,separation:analysis.clearance.meetsRequestedDistance,positions:proposal.positions.length};
`);
  const {createServer}=await import('vite');
  vite=await createServer({root,configFile:false,esbuild:{jsx:'automatic'},optimizeDeps:{entries:['work/route-renderer-test.html'],include:['react','react-dom/client','leaflet','react-leaflet']},server:{port:0,host:'127.0.0.1',hmr:false},appType:'mpa'});
  await vite.listen();
  const port=vite.httpServer.address().port;
  win=new BrowserWindow({show:false,width:1200,height:780,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
  const errors=[];win.webContents.on('console-message',(_event,level,message)=>{if(level>=3)errors.push(message);});
  await win.loadURL(`http://127.0.0.1:${port}/work/route-renderer-test.html`);
  let result;
  for(let i=0;i<120;i++){
   result=await win.webContents.executeJavaScript('window.__routeTest || null');
   if(result)break;
   if(errors.length)throw new Error(errors.join('\n'));
   await new Promise(resolve=>setTimeout(resolve,500));
  }
  assert.ok(result,'Renderer did not finish');assert.equal(result.coverage,true);assert.equal(result.separation,true);assert.ok(result.distance>0);
  await new Promise(resolve=>setTimeout(resolve,1000));
  const paths=await win.webContents.executeJavaScript('document.querySelectorAll(".leaflet-interactive").length');
  assert.ok(paths>0,'No map geometry rendered');
  await fs.writeFile(path.join(root,islandMode ? 'work/route-island-renderer.png' : 'work/route-electron-renderer.png'),(await win.capturePage()).toPNG());
  await win.webContents.executeJavaScript(`(()=>{const p=document.querySelector('path[stroke="#f59e0b"]');if(!p)throw Error('Route polyline missing');const r=p.getBoundingClientRect();p.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:r.left+r.width/2,clientY:r.top+r.height/2}));})()`);
  await new Promise(resolve=>setTimeout(resolve,200));
  const popup=await win.webContents.executeJavaScript('document.querySelector(".leaflet-popup-content")?.textContent || ""');
  assert.match(popup,/NO ACTIVADA/);assert.match(popup,/SIN PLANIFICAR/);
  if(islandMode)assert.match(popup,/Dentro de banda geométrica/);
  await win.webContents.executeJavaScript(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent==='Editar puntos');if(!b)throw Error('Edit control missing');b.click();})()`);
  await new Promise(resolve=>setTimeout(resolve,100));
  const editableMarkers=await win.webContents.executeJavaScript('document.querySelectorAll(".leaflet-marker-draggable").length');
  assert.equal(editableMarkers,result.positions);
  await win.webContents.executeJavaScript(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent==='Terminar edición');b.click();})()`);
  await new Promise(resolve=>setTimeout(resolve,100));
  assert.equal(await win.webContents.executeJavaScript('document.querySelectorAll(".leaflet-marker-draggable").length'),0);
  await win.webContents.executeJavaScript(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent==='Descartar propuesta');b.click();})()`);
  assert.equal(await win.webContents.executeJavaScript('window.__routeDiscarded'),true);
  const interaction={popupDisclosesLimitations:true,editableMarkers,finishEditing:true,discardCallback:true};
  await fs.writeFile(path.join(root,islandMode ? 'work/route-island-renderer.json' : 'work/route-electron-renderer.json'),JSON.stringify({electron:process.versions.electron,isolated:true,result,paths,interaction,errors},null,2));
  console.log(JSON.stringify({pass:true,...result,paths,interaction,errors}));
  win.destroy();await vite.close();app.exit(0);
 }catch(error){console.error(error);win?.destroy();await vite?.close();app.exit(1);}
});
