import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVesselIdentityPatch, VESSEL_IDENTITY_FIELDS, type VesselIdentityDraft } from './vesselIdentity';
const blank: VesselIdentityDraft={nombre:' Barco ',marca:' Astillero ',modelo:' Modelo ',matricula:null,eslora:null,manga:null,calado:null,potencia_cv:null,numero_serie_casco:''};
test('new vessel identity stays unknown, with explicit Spanish dimensions and no invented specifications',()=>{
  const patch=buildVesselIdentityPatch(blank);
  assert.equal(patch.nombre,'Barco');
  for(const key of ['eslora','manga','calado','potencia_cv','horas_motor','mmsi','puerto_base_lat','puerto_base_lng'] as const) assert.equal(patch[key],null);
  assert.equal(VESSEL_IDENTITY_FIELDS.find(f=>f.key==='eslora')?.label,'Eslora total (m)');
});
test('all editable identity fields survive patch and reload, including zero hours and equator/Greenwich',()=>{
  const draft={...blank,eslora:12.35,manga:3.9,calado:1.85,tipo_barco:'Velero',potencia_cv:40,horas_motor:0,numero_serie_casco:'TEST-CIN',mmsi:'012345678',ais:'Referencia',matricula:'TEST',puerto_base:'Base',puerto_base_lat:0,puerto_base_lng:0};
  const patch=buildVesselIdentityPatch(draft);
  for(const field of VESSEL_IDENTITY_FIELDS) assert.ok(Object.hasOwn(patch,field.key),field.key);
  assert.equal(patch.horas_motor,0);assert.equal(patch.puerto_base_lat,0);assert.equal(patch.puerto_base_lng,0);assert.equal(patch.mmsi,'012345678');
  assert.deepEqual(buildVesselIdentityPatch(JSON.parse(JSON.stringify({...draft,...patch}))),patch);
});
test('invalid dimensions, power, hours, coordinates and MMSI cannot be saved',()=>{
  for(const change of [{eslora:0},{calado:-1},{manga:NaN},{potencia_cv:40.5},{potencia_cv:-1},{horas_motor:-1},{puerto_base_lat:91},{puerto_base_lng:181},{mmsi:'123'},{nombre:' '}]) assert.throws(()=>buildVesselIdentityPatch({...blank,...change}));
});
test('clearing optional values persists null and does not include foreign vessel data or installations',()=>{
  const draft={...blank,puerto_base:'  ',mmsi:'',ais:' ',user_id:'foreign',technical_inventory:{components:['other']}};
  const patch=buildVesselIdentityPatch(draft);
  assert.equal(patch.ais,null);assert.equal(patch.mmsi,null);assert.equal(patch.puerto_base,null);
  assert.equal('user_id' in patch,false);assert.equal('technical_inventory' in patch,false);assert.equal('id' in patch,false);
});
