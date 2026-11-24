import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyInventory, parseInventory, type Battery, type TechnicalInventory } from '../model';
import { createInventoryRepository, InventoryConflictError, saveWithRecovery } from '../persistence';
import { type DraftStorage, type InventorySnapshot, parseDraft } from '../drafts';
import { addElectricalEquipment, applyExampleTemplate, autoArrange, configureBank, initializeElectrical, makeWire, putElectrical, removeElectricalEquipment } from './actions';
import { electricalCatalog } from './catalog';
import { electricalIssues, connectionIssues } from './validation';
import { bankNominal } from '../installationModel';
import { ElectricalSession } from './session';
const memory=():DraftStorage=>{const records=new Map<string,string>();return {getItem:key=>records.get(key)??null,setItem:(key,value)=>{records.set(key,value);},removeItem:key=>{records.delete(key);}};};
const populated=()=>{let i=initializeElectrical(emptyInventory());for(const item of electricalCatalog)i=addElectricalEquipment(i,item.id,{x:12,y:34},`item-${item.id}`);return i;};

test('every catalog device creates exactly one master record, terminals and a position; preserves unknown ratings',()=>{
  const i=populated();assert.equal(i.electrical!.devices.length,electricalCatalog.length);assert.equal(i.electrical!.nodes.length,electricalCatalog.length);
  assert.equal(i.components.length+i.installation!.nodes.length,electricalCatalog.length);
  assert.ok(i.electrical!.devices.every(d=>d.nominalV===null&&d.terminals.length));assert.deepEqual(parseInventory(JSON.parse(JSON.stringify(i))),i);
});
test('legacy equipment and box links migrate losslessly with unresolved poles, never invented battery cables',()=>{
  const legacy:TechnicalInventory={version:1,components:[],installation:{nodes:[{id:'s',kind:'solar',name:'Old solar',manufacturer:'brand',model:'type',location:'roof'},{id:'r',kind:'controller',name:'Old regulator',manufacturer:'',model:'',location:''}],links:[{id:'old',from:'s',to:'r',name:'PV',medium:'cable'}]}};
  const i=initializeElectrical(legacy);assert.deepEqual(i.installation,legacy.installation);assert.equal(i.electrical!.wires[0].provenance,'legacy');
  const p=i.electrical!.devices[0].terminals.find(p=>p.id===i.electrical!.wires[0].from.terminalId)!;assert.equal(p.domain,'unknown');assert.equal(p.pole,'unknown');assert.deepEqual(initializeElectrical(i),i);
});
test('terminal endpoints and conductor metadata survive storage and lossy server echo is rejected',async()=>{
  let i=addElectricalEquipment(initializeElectrical(emptyInventory()),'shore',{x:1,y:2},'shore');i=addElectricalEquipment(i,'charger',{x:321,y:2},'charger');
  const wire={...makeWire(i.electrical!,{componentId:'shore',terminalId:'ACL'},{componentId:'charger',terminalId:'ACL'},'wire'),sectionMm2:2.5,lengthM:8,cable:'H07RN-F',notes:'Known cable'};
  i=putElectrical(i,{...i.electrical!,wires:[wire],viewport:{x:40,y:-100,zoom:1.2}});
  const repository=createInventoryRepository({load:async()=>({inventory:i,revision:4}),save:async(_id,revision,inventory)=>({inventory:JSON.parse(JSON.stringify(inventory)),revision:revision+1})});
  assert.deepEqual((await repository.save('boat',{inventory:i,revision:4})).inventory,i);
  const lossy=createInventoryRepository({load:async()=>null,save:async(_id,revision,inventory)=>{const {electrical,...rest}=inventory;return {inventory:rest,revision:revision+1};}});
  await assert.rejects(lossy.save('boat',{inventory:i,revision:4}),/esquema eléctrico/);
});
test('detect AC/DC mismatch, direction, polarity and incompatible voltages without falsifying telemetry',()=>{
  const i=populated(),system=i.electrical!;
  const mismatch=makeWire(system,{componentId:'item-shore',terminalId:'ACL'},{componentId:'item-battery',terminalId:'BAT+'});
  const codes=connectionIssues(system,mismatch).map(i=>i.code);assert.ok(codes.includes('domain'));assert.ok(codes.includes('polarity'));
  const equal=makeWire(system,{componentId:'item-alternator',terminalId:'DC+'},{componentId:'item-battery',terminalId:'BAT+'});assert.ok(!connectionIssues(system,equal).some(i=>i.severity==='error'));
  const reverse=makeWire(system,{componentId:'item-charger',terminalId:'DC+'},{componentId:'item-alternator',terminalId:'DC+'});assert.ok(connectionIssues(system,reverse).some(i=>i.code==='direction'));
  assert.ok(electricalIssues(i).some(i=>i.severity==='pending'));
});
function bankFixture(){let i=addElectricalEquipment(initializeElectrical(emptyInventory()),'bank-service',{x:0,y:0},'bank');for(let n=0;n<4;n++)i=addElectricalEquipment(i,'battery',{x:n*300,y:0},`b${n}`);i={...i,components:i.components.map(c=>c.kind==='battery'?{...c,nominalV:12,capacityAh:100,chemistry:'AGM'}:c)};return i;}
test('series, parallel and mixed banks share nominal calculation, generate both poles, and require complete graph wiring',()=>{
  for(const[strings,volts,ah]of [[[['b0','b1','b2','b3']],48,100],[[['b0'],['b1'],['b2'],['b3']],12,400],[[['b0','b1'],['b2','b3']],24,200]] as const){
    const i=configureBank(bankFixture(),'bank',strings.map(s=>[...s]));const bank=i.components.find(c=>c.kind==='bank')!;if(bank.kind!=='bank')throw new Error('fixture');
    const result=bankNominal(bank,i);assert.equal(result.volts,volts);assert.equal(result.ah,ah);assert.equal(result.wh,4800);
    assert.ok(!electricalIssues(i).some(issue=>issue.code==='polarity'));
    const cut={...i,electrical:{...i.electrical!,wires:i.electrical!.wires.slice(1)}};assert.equal(bankNominal(bank,cut).volts,null);
  }
});
test('bank rejects repeated/foreign batteries, mismatched parallel branches and mixed chemistry',()=>{
  assert.throws(()=>configureBank(bankFixture(),'bank',[['b0','b0']]));assert.throws(()=>configureBank(bankFixture(),'bank',[['foreign']]));
  const i=configureBank(bankFixture(),'bank',[['b0','b1','b2'],['b3']]);const bank=i.components.find(c=>c.kind==='bank')!;if(bank.kind!=='bank')throw new Error('fixture');assert.equal(bankNominal(bank,i).volts,null);
  const mixed={...i,components:i.components.map(c=>c.id==='b0'?{...c,chemistry:'LiFePO4'} as Battery:c)};assert.ok(electricalIssues(mixed).some(i=>i.code==='chemistry'));
  const incomplete={...i,components:i.components.map(c=>c.id==='b0'?{...c,chemistry:'unknown'} as Battery:c)};assert.ok(!electricalIssues(incomplete).some(i=>i.code==='chemistry'&&i.severity==='error'));
});
test('manually reconnected series jumper follows the declared bank and is not a polarity fault',()=>{
  const i=configureBank(bankFixture(),'bank',[['b0','b1','b2','b3']]);const system=i.electrical!;
  const jumper=makeWire(system,{componentId:'b0',terminalId:'BAT-'},{componentId:'b1',terminalId:'BAT+'});assert.equal(jumper.bankId,'bank');
  assert.ok(!connectionIssues(system,jumper).some(i=>i.code==='polarity'));
});
test('known master battery voltage is used for incompatibility checks, not lost in visual metadata',()=>{
  let i=bankFixture();i=addElectricalEquipment(i,'charger',{x:0,y:0},'charger');const system=i.electrical!;
  const devices=system.devices.map(d=>d.componentId==='charger'?{...d,terminals:d.terminals.map(t=>t.id==='DC+'?{...t,nominalV:24}:t)}:d);
  const wire=makeWire({...system,devices},{componentId:'charger',terminalId:'DC+'},{componentId:'b0',terminalId:'BAT+'});
  assert.ok(electricalIssues(putElectrical(i,{...system,devices,wires:[wire]})).some(i=>i.code==='voltage'));
  assert.ok(electricalIssues(putElectrical(i,{...system,devices,wires:[{...wire,bankId:'bank'}]})).some(i=>i.code==='voltage'));
  const configured=configureBank(bankFixture(),'bank',[['b0','b1'],['b2','b3']]);const wrongRating={...configured,electrical:{...configured.electrical!,devices:configured.electrical!.devices.map(d=>d.componentId==='bank'?{...d,nominalV:12}:d)}};assert.ok(electricalIssues(wrongRating).some(i=>i.code==='bank-rating'));
});
test('multiple AC feeds through an unselected distribution path warn about interlocking/synchronisation',()=>{
  const i=populated(),system=i.electrical!;const wires=[makeWire(system,{componentId:'item-shore',terminalId:'ACL'},{componentId:'item-ac-panel',terminalId:'INL'}),makeWire(system,{componentId:'item-generator',terminalId:'ACL'},{componentId:'item-ac-panel',terminalId:'INL'})];
  assert.ok(electricalIssues(putElectrical(i,{...system,wires})).some(i=>i.code==='multiple-ac-sources'));
  const selected=[makeWire(system,{componentId:'item-shore',terminalId:'ACL'},{componentId:'item-ac-transfer',terminalId:'IN1L'}),makeWire(system,{componentId:'item-generator',terminalId:'ACL'},{componentId:'item-ac-transfer',terminalId:'IN2L'}),makeWire(system,{componentId:'item-ac-transfer',terminalId:'OUTL'},{componentId:'item-ac-panel',terminalId:'INL'})];
  assert.ok(!electricalIssues(putElectrical(i,{...system,wires:selected})).some(i=>i.code==='multiple-ac-sources'));
});
test('structural validation rejects foreign terminal IDs, duplicate cables, corrupt coordinates and mismatched catalog roles',()=>{
  const i=populated();const system=i.electrical!;assert.throws(()=>putElectrical(i,{...system,nodes:[{componentId:'foreign',x:0,y:0}]}));
  const cable=makeWire(system,{componentId:'item-shore',terminalId:'ACL'},{componentId:'item-charger',terminalId:'ACL'},'a');assert.throws(()=>putElectrical(i,{...system,wires:[cable,{...cable,id:'b'}]}));
  assert.throws(()=>putElectrical(i,{...system,wires:[{...cable,to:{componentId:'item-charger',terminalId:'not-real'}}]}));
  assert.throws(()=>putElectrical(i,{...system,nodes:[{componentId:'item-shore',x:NaN,y:0}]}));
  assert.throws(()=>putElectrical(i,{...system,devices:system.devices.map(d=>d.componentId==='item-shore'?{...d,catalogId:'battery'}:d)}));
});
test('auto arrangement is deterministic and does not alter components or electrical links',()=>{
  const i=populated();const arranged=autoArrange(i.electrical!);assert.deepEqual(arranged.wires,i.electrical!.wires);assert.deepEqual(autoArrange(arranged).nodes,arranged.nodes);
});
test('template is explicitly illustrative and editable, with wires and example master names',()=>{
  const i=applyExampleTemplate(initializeElectrical(emptyInventory()));assert.equal(i.electrical!.origin,'template');assert.ok(i.electrical!.wires.length>0);assert.ok(i.electrical!.devices.every(d=>d.provenance==='template'));assert.ok([...i.components,...i.installation!.nodes].every(c=>c.name.startsWith('Ejemplo')));assert.ok(electricalIssues(i).some(i=>i.code==='template'));
});
test('equipment deletion never bridges cables and cannot discard a populated bank',()=>{
  const i=configureBank(bankFixture(),'bank',[['b0','b1','b2','b3']]);assert.throws(()=>removeElectricalEquipment(i,'bank'),/reasigna/);
  const next=removeElectricalEquipment(i,'b1');assert.ok(!next.components.some(c=>c.id==='b1'));assert.ok(next.electrical!.wires.every(w=>w.from.componentId!=='b1'&&w.to.componentId!=='b1'));const bank=next.components.find(c=>c.kind==='bank')!;if(bank.kind!=='bank')throw new Error('fixture');assert.equal(bankNominal(bank,next).volts,null);
});
test('configuring a bank from the existing inventory brings its hidden equipment onto the canvas',()=>{
  const original=bankFixture();const hidden={...original,electrical:{...original.electrical!,nodes:[]}};const next=configureBank(hidden,'bank',[['b0','b1','b2','b3']]);
  assert.equal(next.electrical!.nodes.length,5);assert.ok(next.electrical!.nodes.some(n=>n.componentId==='bank'));assert.equal(next.components.length,original.components.length);
});
test('session stores edits locally immediately and undo/redo restore exact documents',()=>{
  const disk=memory(),initial={inventory:initializeElectrical(emptyInventory()),revision:3};const session=new ElectricalSession(initial,disk,'boat',async s=>({...s,revision:s.revision+1}),false,false,60000);
  const next=addElectricalEquipment(initial.inventory,'solar',{x:100,y:200},'new');session.change(next);assert.deepEqual(parseDraft(disk.getItem('boat')!).inventory,next);session.undo();assert.deepEqual(session.getState().snapshot.inventory,initial.inventory);session.redo();assert.deepEqual(session.getState().snapshot.inventory,next);session.dispose();
});
test('in-flight acknowledgement cannot overwrite or remove a newer local edit; subsequent save advances the base revision',async()=>{
  const disk=memory(),initial={inventory:initializeElectrical(emptyInventory()),revision:0};let release!:(value:InventorySnapshot)=>void;
  const commit=async(s:InventorySnapshot)=>new Promise<InventorySnapshot>(resolve=>{release=resolve;});
  const session=new ElectricalSession(initial,disk,'boat',commit,false,false,60000);
  const first=addElectricalEquipment(initial.inventory,'solar',{x:1,y:2},'one');session.change(first);const pending=session.flush();
  const second=addElectricalEquipment(first,'controller',{x:4,y:5},'two');session.change(second);release({inventory:first,revision:1});await pending;
  assert.deepEqual(session.getState().snapshot.inventory,second);assert.equal(session.getState().snapshot.revision,1);assert.deepEqual(parseDraft(disk.getItem('boat')!).inventory,second);assert.equal(parseDraft(disk.getItem('boat')!).revision,1);session.dispose();
});
test('offline save and revision conflict preserve recovery; strict-mode lifecycle can resume edits',async()=>{
  const disk=memory(),initial={inventory:initializeElectrical(emptyInventory()),revision:0};const session=new ElectricalSession(initial,disk,'boat',async()=>{throw new InventoryConflictError();},false,false,60000);
  session.dispose();session.resume();session.change(addElectricalEquipment(initial.inventory,'solar',{x:0,y:0},'s'));await session.flush();assert.equal(session.getState().conflict,true);assert.ok(disk.getItem('boat'));session.dispose();
});
test('loading another technical view waits for an outstanding write to the same vessel',async()=>{
  const initial={inventory:initializeElectrical(emptyInventory()),revision:0};let remote=initial;let release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  const repository=createInventoryRepository({load:async()=>remote,save:async(_id,revision,inventory)=>{await gate;remote={inventory,revision:revision+1};return remote;}});
  const next=addElectricalEquipment(initial.inventory,'solar',{x:7,y:8},'s');const saving=repository.save('boat',{inventory:next,revision:0});let loaded=false;const reading=repository.load('boat').then(value=>{loaded=true;return value;});
  await Promise.resolve();assert.equal(loaded,false);release();await saving;assert.deepEqual(await reading,{inventory:next,revision:1});
});
test('external master edits reset history and preserve pending graph; explicit reload clears recovery only after a successful load',async()=>{
  const initial={inventory:initializeElectrical(emptyInventory()),revision:0},disk=memory();const session=new ElectricalSession(initial,disk,'boat',async s=>({...s,revision:s.revision+1}),false,false,60000);
  const next=addElectricalEquipment(initial.inventory,'solar',{x:10,y:20},'s');session.change(next);session.externalChange({...next,installation:{...next.installation!,nodes:next.installation!.nodes.map(n=>({...n,name:'Renamed'}))}});
  assert.equal(session.getState().canUndo,false);await assert.rejects(session.discardAndReload(async()=>{throw new Error('offline');}));assert.ok(disk.getItem('boat'));
  await session.discardAndReload(async()=>initial);assert.equal(session.getState().dirty,false);assert.equal(disk.getItem('boat'),null);session.dispose();
});
test('unreadable recovery is never overwritten by edits or disposal',()=>{
  const disk=memory();disk.setItem('boat','{corrupt');const initial={inventory:initializeElectrical(emptyInventory()),revision:0};const session=new ElectricalSession(initial,disk,'boat',async s=>({...s,revision:s.revision+1}),false,true,60000);
  assert.throws(()=>session.change(addElectricalEquipment(initial.inventory,'solar',{x:0,y:0},'s')),/ilegible/);session.dispose();assert.equal(disk.getItem('boat'),'{corrupt');assert.equal(session.recoveryText(),'{corrupt');
});
test('a queued sync waits for the previous acknowledgement and then saves the latest revision',async()=>{
  const initial={inventory:initializeElectrical(emptyInventory()),revision:0},disk=memory();let release!:(snapshot:InventorySnapshot)=>void;let calls=0;
  const session=new ElectricalSession(initial,disk,'boat',async snapshot=>{calls++;if(calls===1)return new Promise<InventorySnapshot>(resolve=>{release=resolve;});return {...snapshot,revision:snapshot.revision+1};},false,false,60000);
  const first=addElectricalEquipment(initial.inventory,'solar',{x:0,y:0},'s');session.change(first);const saving=session.flush();const latest=addElectricalEquipment(first,'controller',{x:300,y:0},'r');session.change(latest);const queued=session.flush();release({inventory:first,revision:1});await Promise.all([saving,queued]);
  assert.equal(calls,2);assert.equal(session.getState().snapshot.revision,2);assert.equal(session.getState().dirty,false);assert.deepEqual(session.getState().snapshot.inventory,latest);session.dispose();
});
