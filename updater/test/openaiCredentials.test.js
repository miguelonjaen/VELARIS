'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createCredentialStore, registerOpenAICredentials } = require('../openaiCredentials');
const fakeCrypto = {
 isEncryptionAvailable: () => true,
 encryptString: key => Buffer.from('cipher:' + [...key].reverse().join('')),
 decryptString: buffer => { const value=buffer.toString(); if (!value.startsWith('cipher:')) throw new Error('corrupt'); return [...value.slice(7)].reverse().join(''); }
};
function fixture(t) {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'gaulos-ai-test-'));
 t.after(() => { const relative=path.relative(os.tmpdir(),root); assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative)); fs.rmSync(root,{recursive:true,force:true}); });
 return root;
}
test('credential survives reload encrypted; insecure storage and invalid keys are rejected', t => {
 const root=fixture(t),file=path.join(root,'credential.bin'),key='test-placeholder-credential-for-validation';
 const store=createCredentialStore(file,fakeCrypto);
 assert.equal(store.load(),null); store.save(key);
 assert.ok(!fs.readFileSync(file).includes(Buffer.from(key))); assert.equal(createCredentialStore(file,fakeCrypto).load(),key);
 assert.throws(()=>store.save('short'));
 assert.throws(()=>createCredentialStore(file,{...fakeCrypto,isEncryptionAvailable:()=>false}).save(key));
 assert.equal(createCredentialStore(file,{...fakeCrypto,getSelectedStorageBackend:()=> 'basic_text'}).available(),false);
});
test('native import persists only OpenAI key; IPC never returns the secret; unauthorized frames cannot import', async t => {
 const root=fixture(t),envFile=path.join(root,'input.env'),key='test-placeholder-credential-for-validation';
 fs.writeFileSync(envFile,`OPENAI_API_KEY=${key}\nUNRELATED_SECRET=never-imported\n`);
 const handlers=new Map();const mainFrame={};const webContents={mainFrame};const window={isDestroyed:()=>false,webContents};
 let configured=null,dialogs=0;
 registerOpenAICredentials({app:{getPath:()=>root},ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},dialog:{showOpenDialog:async()=>{dialogs++;return {canceled:false,filePaths:[envFile]};}},safeStorage:fakeCrypto,getWindow:()=>window,configure:key=>{configured=key},getStatus:()=>({configured:!!configured,model:'gpt-5-mini'})});
 assert.equal((await handlers.get('ai:import-env')({sender:{},senderFrame:{}})).ok,false);assert.equal(dialogs,0);
 const result=await handlers.get('ai:import-env')({sender:webContents,senderFrame:mainFrame});
 assert.equal(result.ok,true);assert.equal(configured,key);assert.equal(result.status.source,'encrypted-profile');
 assert.ok(!JSON.stringify(result).includes(key));assert.ok(!JSON.stringify(handlers.get('ai:status')({sender:webContents,senderFrame:mainFrame})).includes(key));
 assert.ok(!fs.readFileSync(path.join(root,'openai-credential.bin')).includes(Buffer.from('never-imported')));
 assert.equal(fs.readFileSync(envFile,'utf8'),`OPENAI_API_KEY=${key}\nUNRELATED_SECRET=never-imported\n`);
});
test('corrupt encrypted profile is reported without crashing or exposing values', t => {
 const root=fixture(t);fs.writeFileSync(path.join(root,'openai-credential.bin'),'corrupt');
 const handlers=new Map(),frame={},webContents={mainFrame:frame};
 registerOpenAICredentials({app:{getPath:()=>root},ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},dialog:{},safeStorage:fakeCrypto,getWindow:()=>({isDestroyed:()=>false,webContents}),configure:()=>{throw new Error('should not configure')},getStatus:()=>({configured:false,model:'gpt-5-mini'})});
 const result=handlers.get('ai:status')({sender:webContents,senderFrame:frame});
 assert.equal(result.status.configured,false);assert.ok(result.status.warning);assert.ok(!JSON.stringify(result).includes('corrupt'));
});
