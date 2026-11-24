import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyInventory } from '../model';
import { addElectricalEquipment, initializeElectrical } from './actions';
import { connectOwnerEquipment, ownerConnections, ownerDiagram } from './ownerModel';
import { mapLinkEvidence, visualMapLayout, visualMapPath } from './visualMap';
const fixture=()=>{let i=initializeElectrical(emptyInventory());for(const id of ['shore','alternator','charger','bank-starter','bank-service','lighting'])i=addElectricalEquipment(i,id,{x:123,y:456},id);return i;};
test('visual map keeps source, charger, banks and consumers composition without mutating saved nodes',()=>{
 const i=fixture(),before=JSON.stringify(i),devices=ownerDiagram(i).devices,{positions}=visualMapLayout(devices);
 assert.ok(positions.get('shore')!.y<positions.get('charger')!.y);assert.ok(positions.get('charger')!.y<positions.get('bank-service')!.y);assert.equal(positions.get('lighting')!.x,940);
 assert.equal(JSON.stringify(i),before);const a=positions.get('alternator')!,b=positions.get('bank-service')!;assert.match(visualMapPath(a,b),/900/);
});
test('no inferred edges; partial, legacy and template routes are not confirmed topology',()=>{
 let i=fixture();assert.equal(ownerDiagram(i).links.length,0);const option=ownerConnections(i,'shore','charger')[0];i=connectOwnerEquipment(i,'shore','charger',option.id);
 const link=ownerDiagram(i).links[0];assert.equal(mapLinkEvidence(i,link),'confirmed');assert.equal(mapLinkEvidence(i,{...link,wires:link.wires.slice(0,1)}),'unknown');
 assert.equal(mapLinkEvidence(i,{...link,wires:link.wires.map(w=>({...w,provenance:'legacy'}))}),'unknown');assert.equal(mapLinkEvidence(i,{...link,wires:link.wires.map(w=>({...w,provenance:'template'}))}),'suggested');
});
test('alternator cannot feed the shore charger; independent DC bank route remains available',()=>{
 const i=fixture();assert.deepEqual(ownerConnections(i,'alternator','charger'),[]);assert.ok(ownerConnections(i,'alternator','bank-service').length>0);
});

test('legacy fluid-only consumers stay in inventory without inventing an electrical device',()=>{
 const i={...emptyInventory(),components:[{id:'water',kind:'tank' as const,name:'Agua',fluid:'freshwater' as const,capacityL:null,level:{value:null,origin:'unknown' as const,at:null,sensor:null},location:'',manufacturer:'',model:''}],installation:{nodes:[{id:'tap',kind:'consumer' as const,name:'Grifo',location:'',manufacturer:'',model:''}],links:[{id:'pipe',from:'water',to:'tap',medium:'pipe' as const,name:'Salida'}]}};
 const next=initializeElectrical(i);assert.deepEqual(next.installation,i.installation);assert.deepEqual(next.components,i.components);assert.equal(next.electrical!.devices.length,0);
});

test('manual conductors alone cannot confirm a suggested or legacy endpoint',()=>{
 let i=fixture();i=connectOwnerEquipment(i,'shore','charger',ownerConnections(i,'shore','charger')[0].id);
 const link=ownerDiagram(i).links[0];
 for(const provenance of ['template','legacy'] as const){const next={...i,electrical:{...i.electrical!,devices:i.electrical!.devices.map(d=>d.componentId==='shore'?{...d,provenance}:d)}};assert.equal(mapLinkEvidence(next,link),provenance==='template'?'suggested':'unknown');}
});
