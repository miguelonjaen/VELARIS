import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyInventory, parseInventory, removeComponent, replaceComponent, unknownReading, type Bank, type Battery, type TechnicalInventory } from './model';
import { bankNominal } from './installationModel';
import { createInventoryRepository } from './persistence';
const bank: Bank = { id:'b',kind:'bank',name:'Servicio',location:'',manufacturer:'',model:'',purpose:'service',topology:'parallel' };
const battery = (id: string): Battery => ({ id,kind:'battery',name:id,location:'',manufacturer:'',model:'',bankId:'b',chemistry:'AGM',nominalV:12,capacityAh:100,voltage:unknownReading(),soc:unknownReading() });
const inventory = (): TechnicalInventory => ({ version:1,components:[bank,battery('a'),battery('c')],installation:{ nodes:[{ id:'s',kind:'solar',name:'Panel',location:'',manufacturer:'',model:'' },{ id:'d',kind:'consumer',name:'Bomba',location:'',manufacturer:'',model:'' }],links:[{ id:'l',from:'s',to:'b',medium:'cable',name:'Carga solar' }] } });
test('nominal equivalents: parallel sums Ah, series sums V, energy unchanged', () => {
  const i=inventory(); assert.deepEqual(bankNominal(bank,i),{volts:12,ah:200,wh:2400,reason:'Calculado · nominal declarado; no capacidad útil'});
  assert.equal(bankNominal({...bank,topology:'series'},i).volts,24);
  assert.equal(bankNominal({...bank,topology:'series'},i).ah,100);
  assert.equal(bankNominal({...bank,topology:'series'},i).wh,2400);
  assert.equal(bankNominal({...bank,topology:'unknown'},i).volts,null);
});
test('incomplete, heterogeneous or mixed chemistry banks never return misleading nominal totals', () => {
  for (const change of [{nominalV:null},{nominalV:24},{chemistry:'LiFePO4' as const},{chemistry:'unknown' as const}]) {
    assert.equal(bankNominal(bank,{version:1,components:[bank,battery('a'),{...battery('c'),...change}]}).wh,null);
  }
  assert.equal(bankNominal(bank,emptyInventory()).wh,null);
  const unequal={version:1 as const,components:[bank,battery('a'),{...battery('c'),capacityAh:80}]};
  assert.equal(bankNominal(bank,unequal).ah,180);
  assert.equal(bankNominal({...bank,topology:'series'},unequal).ah,80);
});
test('installation survives component edits, JSON roundtrip and revisioned persistence', async () => {
  const i=parseInventory(inventory());
  const changed=replaceComponent(i,{...battery('a'),name:'Renombrada'});
  assert.deepEqual(changed.installation,i.installation);
  let saved: unknown;
  const repository=createInventoryRepository({load:async()=>({revision:0,inventory:i}),save:async(_id,revision,inventory)=>{saved=JSON.parse(JSON.stringify(inventory));return {revision:revision+1,inventory:saved};}});
  const result=await repository.save('vessel',{revision:0,inventory:changed});
  assert.deepEqual(result.inventory.installation,i.installation);
});
test('reject foreign endpoints, duplicate links, wrong medium, deletion with live links and corrupt nodes', () => {
  for(const change of [{to:'foreign'},{medium:'pipe'},{from:'b',to:'s'}]) {const i=inventory();Object.assign(i.installation!.links[0],change);assert.throws(()=>parseInventory(i));}
  const i=inventory();i.installation!.links.push({...i.installation!.links[0],id:'other'});assert.throws(()=>parseInventory(i));
  assert.throws(()=>parseInventory({...inventory(),installation:{nodes:[],links:inventory().installation!.links}}));
  const withoutBatteries={...inventory(),components:[bank]};assert.throws(()=>removeComponent(withoutBatteries,'b'));
  assert.throws(()=>parseInventory({...inventory(),installation:{nodes:[{id:'partial'}],links:[]}}));
});
test('tank pipes and consumers are explicit; unknown and zero levels remain distinct', () => {
  const i=inventory();i.components.push({id:'t',kind:'tank',name:'Agua',location:'',manufacturer:'',model:'',fluid:'freshwater',capacityL:120,level:unknownReading()});
  i.installation!.links.push({id:'p',from:'t',to:'d',medium:'pipe',name:'Salida bomba'});
  assert.equal(parseInventory(i).components.length,4);
  assert.throws(()=>removeComponent(i,'t'));
});
