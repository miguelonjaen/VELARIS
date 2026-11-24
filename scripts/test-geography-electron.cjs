"use strict";
// Isolated Electron renderer/backend smoke: never imports electron-main, NMEA or autopilot.
const {app,BrowserWindow}=require('electron');
const path=require('node:path');
const fs=require('node:fs/promises');
const assert=require('node:assert/strict');
app.setPath('userData',path.resolve(__dirname,'../work/geography-electron-profile'));
let backend;
app.whenReady().then(async()=>{
  try {
    const server=require('../map-server');
    server.app.get('/geography-smoke',(_req,res)=>res.type('html').send('<!doctype html><title>GAULOS Geographic Smoke</title><p>Isolated geographic test</p>'));
    backend=server.startMapServer(0);
    if(!backend.listening) await new Promise(resolve=>backend.once('listening',resolve));
    const win=new BrowserWindow({show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
    await win.loadURL(`http://127.0.0.1:${backend.address().port}/geography-smoke`);
    const queries=[['Puerto de Málaga, España','PORT'],['Puerto de Cartagena, España','PORT'],['Ibiza','ISLAND'],['Alborán','ISLAND'],['Puerto de Melilla, España','PORT'],['Cabo de Gata, España','CAPE']];
    const results=[];
    for(const [query,kind] of queries){
      const result=await win.webContents.executeJavaScript(`fetch('/api/geographic-resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(${JSON.stringify({query,kind})})}).then(r=>r.json())`);
      assert.ok(['RESOLVED','AMBIGUOUS','NOT_FOUND','UNAVAILABLE'].includes(result.status));
      results.push(result);console.log(JSON.stringify({query,status:result.status,kinds:result.candidates.map(p=>p.kind),cache:result.cache}));
    }
    const cached=results.find(r=>r.candidates.length);
    if(cached){
      const again=await win.webContents.executeJavaScript(`fetch('/api/geographic-resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(${JSON.stringify({query:cached.query,offline:true})})}).then(r=>r.json())`);
      assert.ok(again.candidates.length);assert.equal(again.cache,'FRESH');
    }
    await fs.mkdir(path.resolve(__dirname,'../work'),{recursive:true});
    await fs.writeFile(path.resolve(__dirname,'../work/geography-electron-evidence.json'),JSON.stringify({electron:process.versions.electron,at:new Date().toISOString(),isolated:true,results},null,2));
    assert.ok(results.some(r=>r.candidates.length),'No real provider results; see evidence');
    win.destroy();server.stopMapServer();app.exit(0);
  }catch(error){console.error(error);backend?.close();app.exit(1);}
});
