import test from 'node:test';
import assert from 'node:assert/strict';
import { switchNavigationLights, mapLightsFromInstruments, navigationLightsOn, switchFogLight } from './navigationLights';
import { buildChargeModel, DEFAULT_CHARGE_SETTINGS } from './chargingPolicy';
import { BoatInstrumentStore } from '../../core/instruments/BoatInstrumentStore';
import { buildBoatIconHtml } from '../navigation/utils/boatIcon';

const raw = new BoatInstrumentStore().snapshot();
test('single navigation switch enables four separate lights; anchor and cabin preserved', () => {
  const settings = switchNavigationLights({anchor:{on:true,amps:.3},cabin:{on:true,amps:1}},true,'separate');
  for (const id of ['port','starboard','stern','masthead'] as const) assert.equal(settings[id]?.on,true);
  assert.equal(settings.tricolor?.on,false); assert.equal(settings.anchor?.on,true);assert.equal(settings.cabin?.on,true);
  const off=switchNavigationLights(settings,false,'separate');
  for (const id of ['port','starboard','stern','masthead','tricolor'] as const) assert.equal(off[id]?.on,false);
  assert.equal(off.anchor?.on,true);
});
test('tricolor uses same switch, excluding separate lamps and masthead', () => {
  const settings=switchNavigationLights(switchNavigationLights(undefined,true,'separate'),true,'tricolor');
  assert.equal(settings.tricolor?.on,true);
  for (const id of ['port','starboard','stern','masthead'] as const) assert.equal(settings[id]?.on,false);
  const following=switchNavigationLights(settings,null,'tricolor');assert.equal(following.tricolor?.on,null);
});
test('model, map lights and marker share the same grouped state without mutating BOAT', () => {
  const model=buildChargeModel(raw,{...DEFAULT_CHARGE_SETTINGS,consumers:switchNavigationLights(undefined,true,'separate')},null,Date.now());
  const lights=mapLightsFromInstruments(model.instruments,true);
  assert.equal(navigationLightsOn(lights,'separate'),true);
  const html=buildBoatIconHtml(false,90,1,lights);
  for (const id of ['port','starboard','stern','masthead']) assert.ok(html.includes(`data-light="${id}"`));
  assert.ok(html.includes('LUCES SIM'));assert.ok(!html.includes('data-light="tricolor-port"'));
  assert.equal(raw.lights?.length??0,0);
});
test('anchor does not assert grouped navigation; unknown or stale relays stay unlit', () => {
  const model=buildChargeModel(raw,{...DEFAULT_CHARGE_SETTINGS,consumers:{anchor:{on:true,amps:.3}}},null,Date.now());
  assert.ok(!model.instruments.lights?.some(l=>l.circuit==='LIGHT_NAV_RELAY'&&l.relay?.value===1));
  const stale=mapLightsFromInstruments({...raw,lights:[{circuit:'LIGHT_PORT_RELAY',relay:{value:1,ageMs:15001}}]},false);
  assert.equal(stale.port,false);assert.ok(!buildBoatIconHtml(false).includes('data-light='));
});

test('fog switch persists independently of navigation, tricolor and anchor', () => {
  const navigation=switchNavigationLights({anchor:{on:true,amps:.3}},true,'separate');
  const withFog=switchFogLight(navigation,true);
  assert.equal(withFog.fog?.on,true);assert.equal(withFog.fog?.amps,0);
  const offNav=switchNavigationLights(withFog,false,'tricolor');
  assert.equal(offNav.fog?.on,true);assert.equal(offNav.anchor?.on,true);
  const fogOff=switchFogLight(withFog,false);
  assert.equal(fogOff.fog?.on,false);assert.equal(fogOff.port?.on,true);assert.equal(fogOff.anchor?.on,true);
  assert.equal(navigation.fog,undefined);
});
test('fog contributes the configured load without claiming a hardware relay or navigation lights', () => {
  const settings={...DEFAULT_CHARGE_SETTINGS,consumers:switchFogLight({fog:{on:false,amps:2.5}},true)};
  const model=buildChargeModel(raw,settings,null,Date.now());
  assert.equal(model.consumerAmps,2.5);
  assert.equal(model.consumers.find(c=>c.id==='fog')?.circuit,undefined);
  assert.equal(model.instruments.lights?.some(l=>l.circuit==='LIGHT_NAV_RELAY'&&l.relay?.value===1),false);
  const restored=JSON.parse(JSON.stringify(settings)) as typeof settings;
  assert.equal(buildChargeModel(raw,restored,null,Date.now()).consumers.find(c=>c.id==='fog')?.on,true);
});
test('fog on/off is visible on map without changing the navigation group', () => {
  const on=mapLightsFromInstruments(raw,true,true);
  assert.equal(on.fog,true);assert.equal(navigationLightsOn(on,'separate'),false);
  const html=buildBoatIconHtml(false,30,1,on);
  assert.ok(html.includes('data-light="fog"'));assert.ok(html.includes('LUCES SIM'));
  assert.ok(!buildBoatIconHtml(false,30,1,mapLightsFromInstruments(raw,true,false)).includes('data-light="fog"'));
  assert.equal(mapLightsFromInstruments(raw,false,true).fog,false);
});
