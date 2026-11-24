import test from 'node:test';
import assert from 'node:assert/strict';
import { createInventoryRepository, InventoryConflictError } from './persistence';
import { recoverDraft, type DraftStorage } from './drafts';
import { emptyInventory, newComponent, replaceComponent } from './model';
import { ElectricalSession } from './electrical/session';
import { initializeElectrical } from './electrical/actions';
import { userViewport } from './electrical/viewport';

const memory = (): DraftStorage => {
  const entries = new Map<string,string>();
  return { getItem: key => entries.get(key) ?? null, setItem: (key,value) => {entries.set(key,value);}, removeItem: key => {entries.delete(key);} };
};
const changed = () => replaceComponent(emptyInventory(), {...newComponent('tank','water'),name:'Agua'});
const tick = () => new Promise(resolve => setTimeout(resolve,25));

test('programmatic viewport hydration and repeated user position do not trigger saves', async () => {
  const inventory=initializeElectrical(emptyInventory());let calls=0;
  const session=new ElectricalSession({revision:0,inventory},memory(),'boat',async value=>{calls++;return {...value,revision:1};},false,false,1);
  session.change(userViewport(inventory,null,{x:10,y:20,zoom:2}));
  session.change(userViewport(inventory,{},inventory.electrical!.viewport));
  await tick();assert.equal(calls,0);
  session.change(userViewport(inventory,{}, {x:10,y:20,zoom:2}));await tick();assert.equal(calls,1);session.dispose();
});
test('disposing during reload cannot erase recovery when transport ignores cancellation', async () => {
  const disk=memory(),initial={revision:0,inventory:changed()};disk.setItem('boat',JSON.stringify(initial));
  const session=new ElectricalSession(initial,disk,'boat',async value=>value,true,false,1);
  let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
  const loading=session.discardAndReload(async()=>{await gate;return initial;});
  const rejected=assert.rejects(loading,{name:'AbortError'});session.dispose();release();await rejected;assert.ok(disk.getItem('boat'));
});

test('hydration, recovered drafts and reconnect never write automatically', async () => {
  for (const dirty of [false,true]) {
    let calls=0;
    const session=new ElectricalSession({revision:0,inventory:changed()},memory(),'boat',async value=>{calls++;return {...value,revision:1};},dirty,false,1);
    session.resume();session.reconnect();await tick();assert.equal(calls,0);session.dispose();
  }
});
test('equivalent JSONB key ordering and acknowledged recovery are clean', async () => {
  const inventory=changed(),disk=memory();
  disk.setItem('boat',JSON.stringify({revision:0,inventory}));
  assert.equal(recoverDraft(disk,'boat',{revision:1,inventory}).dirty,false);
  let calls=0;
  const repository=createInventoryRepository({load:async()=>({revision:1,inventory}),save:async()=>{calls++;throw new Error('unexpected write');}});
  const loaded=await repository.load('boat');
  await repository.save('boat',{...loaded,inventory:{components:inventory.components,version:1}});
  assert.equal(calls,0);
});
test('same-vessel writes serialize, stale revisions never reach transport, other boats progress', async () => {
  let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});let active=0,max=0,calls=0;
  const repository=createInventoryRepository({load:async()=>({revision:0,inventory:emptyInventory()}),save:async(id,revision,inventory)=>{
    calls++;if(id==='boat'){active++;max=Math.max(max,active);await gate;active--;}return {revision:revision+1,inventory};
  }});
  const first=repository.save('boat',{revision:0,inventory:changed()});
  const second=repository.save('boat',{revision:0,inventory:emptyInventory()});
  const rejected=assert.rejects(second,InventoryConflictError);
  await repository.save('other',{revision:0,inventory:changed()});release();await first;await rejected;
  assert.equal(max,1);assert.equal(calls,2);
});
test('one failed save pauses debounce, reconnect and queued callers until explicit retry', async () => {
  let calls=0;const session=new ElectricalSession({revision:0,inventory:emptyInventory()},memory(),'boat',async()=>{calls++;throw new Error('HTTP 504');},false,false,1);
  session.change(changed());await Promise.all([session.flush(),session.flush(),session.flush()]);
  session.reconnect();await tick();assert.equal(calls,1);assert.equal(session.getState().dirty,true);
  await session.flush();assert.equal(calls,2);session.dispose();
});
test('debounce coalesces edits and disposal cancels transport and queued writes', async () => {
  let calls=0;let signal:AbortSignal|undefined;
  const session=new ElectricalSession({revision:0,inventory:emptyInventory()},memory(),'boat',async(value,abort)=>{calls++;signal=abort;return {...value,revision:1};},false,false,1);
  session.change(changed());session.change({...changed(),installation:{nodes:[],links:[]}});await tick();assert.equal(calls,1);
  session.dispose();assert.equal(signal?.aborted,true);
  let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});let writes=0;
  const repository=createInventoryRepository({load:async()=>{await gate;return {revision:0,inventory:emptyInventory()};},save:async(_id,revision,inventory)=>{writes++;return {revision:revision+1,inventory};}});
  const load=repository.load('boat'),aborter=new AbortController();
  const saving=repository.save('boat',{revision:0,inventory:changed()},aborter.signal);
  const rejected=assert.rejects(saving,{name:'AbortError'});aborter.abort();release();await load;await rejected;assert.equal(writes,0);
});
