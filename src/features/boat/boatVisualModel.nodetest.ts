import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BoatInstrumentStore } from '../../core/instruments/BoatInstrumentStore';
import { BOAT_TABS, currentValue, tankVisuals, batteryPower, hasConfirmedElectricalCircuit, relayLabel } from './boatVisualModel';
import { stowageGroups } from './stowageModel';
import { DOCUMENT_URL_KEYS } from '../traffic/components/documentFields';
import type { InventoryItem } from '../../shared/types';

test('BARCO has exactly the agreed tabs', () => {
  assert.deepEqual(BOAT_TABS.map(t => t.label), ['General', 'Depósitos', 'Electricidad', 'Motores']);
});
test('missing sensors never create equipment or zero readings', () => {
  assert.deepEqual(tankVisuals(new BoatInstrumentStore().snapshot()), []);
  assert.equal(currentValue(null), null);
  assert.equal(currentValue({ value: NaN, ageMs: 0 }), null);
  assert.equal(currentValue({ value: 10, ageMs: -1 }), null);
  assert.equal(currentValue({ value: 0, ageMs: 0 }), 0);
  assert.equal(currentValue({ value: 12, ageMs: 15001 }), null);
  assert.equal(hasConfirmedElectricalCircuit(), false);
});
test('tank zero/full and expiry come from the existing store', () => {
  const store = new BoatInstrumentStore(() => 1000);
  store.ingest({ type: 'TRANSDUCER', readings: [
    { kind: 'V', unit: 'P', value: 0, name: 'FUEL1' },
    { kind: 'V', unit: 'P', value: 100, name: 'WATER1' },
  ] }, 1000);
  assert.deepEqual(tankVisuals(store.snapshot(1000)).map(t => t.percent), [0, 100]);
  assert.equal(tankVisuals(store.snapshot(16001)).length, 0);
});
test('power requires current synchronized voltage and current', () => {
  assert.equal(batteryPower({value:12, ageMs:0}, {value:-2, ageMs:0}), -24);
  assert.equal(batteryPower({value:12, ageMs:0}, {value:2, ageMs:2001}), null);
  assert.equal(batteryPower(null, {value:2, ageMs:0}), null);
});
test('stowage uses declared locations only and preserves quantities', () => {
  const item: InventoryItem = {id:'1',nombre:'Filtro',referencia:'F',cantidad_actual:2,cantidad_minima:3,ubicacion:' Pañol ',categoria:'Técnico'};
  const groups = stowageGroups([item, {...item,id:'2',ubicacion:''}]);
  assert.deepEqual(groups.map(g => g.location), ['', 'Pañol']);
  assert.equal(groups[1].lowStock, 1);
  assert.equal(groups[1].quantity, 2);
  assert.equal(item.ubicacion, ' Pañol ');
});
test('insurance and ITB use the persisted document URL fields', () => {
  assert.equal(DOCUMENT_URL_KEYS.docs_seguro_vigente, 'url_seguro');
  assert.equal(DOCUMENT_URL_KEYS.docs_itb_vigente, 'url_itb');
});


test('solar power requires same-side fresh synchronized readings; zero remains measurable', () => {
  assert.equal(batteryPower({value:38,ageMs:100}, {value:4.2,ageMs:100}),159.6);
  assert.equal(batteryPower({value:13.4,ageMs:0}, {value:0,ageMs:0}),0);
  assert.equal(batteryPower({value:13.4,ageMs:0}, {value:11.3,ageMs:2001}),null);
  assert.equal(batteryPower({value:13.4,ageMs:15001}, {value:11.3,ageMs:15001}),null);
  assert.equal(batteryPower(null, {value:11.3,ageMs:0}),null);
});

test('relay labels distinguish open, closed and unknown, including expiry', () => {
  assert.equal(relayLabel({value:0,ageMs:0}), 'Relé abierto');
  assert.equal(relayLabel({value:1,ageMs:0}), 'Relé cerrado');
  assert.equal(relayLabel({value:1,ageMs:15001}), 'Desconocido');
  assert.equal(relayLabel(undefined), 'Desconocido');
});
