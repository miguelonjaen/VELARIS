// Presentación del estado de navegación compartido en la banda de instrumentos (node:test).
// Ejecutar con: node --import tsx --test src/features/navigation/utils/sharedNavigationPresentation.nodetest.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NAVIGATION_FIELDS,
  SharedNavigationState,
  type NavigationFreshnessPolicy
} from '../../../core/navigation/SharedNavigationState';
import { presentSharedNavigation, sharedNavigationViewKey } from './sharedNavigationPresentation';

const MAX_AGE = 10_000;
const policy = Object.fromEntries(NAVIGATION_FIELDS.map((field) => [field, {
  BOAT: { maxAgeMs: MAX_AGE, ageFrom: 'receivedAt' },
  DROID: { maxAgeMs: MAX_AGE, ageFrom: 'receivedAt' }
}])) as unknown as NavigationFreshnessPolicy;

const T0 = Date.UTC(2026, 9, 20, 9, 0, 0);

function setup() {
  let now = T0;
  const state = new SharedNavigationState(policy, () => now);
  return { state, at: (value: number) => { now = value; }, view: () => presentSharedNavigation(state.snapshot()) };
}

const boat = (field: 'position' | 'sog' | 'cog' | 'headingTrue' | 'headingMagnetic', value: any, t: number) =>
  ({ field, source: 'BOAT' as const, sourceId: 'nmea', value, observedAt: t, receivedAt: t, observedAtFromSource: false });
const droid = (field: 'position' | 'sog' | 'cog', value: any, t: number) =>
  ({ field, source: 'DROID' as const, sourceId: 'phone-1', value, observedAt: t, receivedAt: t, observedAtFromSource: true });

test('sin datos: todas las celdas sin valor, nunca 0 ni coordenadas por defecto', () => {
  const { view } = setup();
  const current = view();
  for (const cell of [current.position, current.sog, current.cog, current.heading]) {
    assert.equal(cell.available, false);
    assert.equal(cell.value, '');
    assert.equal(cell.source, null);
    assert.match(cell.title, /sin dato válido/);
  }
});

test('dato del barco: valor con unidades actuales y fuente BOAT', () => {
  const { state, view } = setup();
  state.update(boat('sog', 6.25, T0));
  state.update(boat('cog', 7.4, T0));
  state.update(boat('position', { lat: 36.72151, lng: -3.52349 }, T0));
  const current = view();
  assert.deepEqual([current.sog.value, current.sog.unit, current.sog.source], ['6.3', 'kn', 'BOAT']);
  assert.deepEqual([current.cog.value, current.cog.unit], ['007', '°']);
  assert.equal(current.position.value, '36.7215, -3.5235');
  assert.match(current.sog.title, /instrumentos del barco/);
});

test('respaldo de Droid visible como tal y vuelta automática al barco', () => {
  const { state, at, view } = setup();
  state.update(boat('sog', 5, T0));
  state.update(droid('sog', 5.4, T0 + 9_000));
  at(T0 + MAX_AGE + 1);
  const fallback = view().sog;
  assert.equal(fallback.source, 'DROID');
  assert.equal(fallback.value, '5.4');
  assert.match(fallback.title, /GAULOSdroid \(respaldo\)/);

  state.update(boat('sog', 5.1, T0 + MAX_AGE + 500));
  at(T0 + MAX_AGE + 600);
  assert.equal(view().sog.source, 'BOAT');
});

test('todo caducado: pasa a sin dato y explica el motivo por fuente', () => {
  const { state, at, view } = setup();
  state.update(boat('position', { lat: 36.7, lng: -3.5 }, T0));
  state.update(droid('position', { lat: 36.71, lng: -3.51 }, T0));
  at(T0 + MAX_AGE + 1);
  const position = view().position;
  assert.equal(position.available, false);
  assert.equal(position.value, '');
  assert.match(position.title, /barco: caducado; Droid: caducado/);
});

test('rumbo: verdadero si es válido; si no, magnético marcado como °M; nunca el COG', () => {
  const { state, view } = setup();
  state.update(boat('cog', 90, T0));
  assert.equal(view().heading.available, false, 'el COG no debe mostrarse como rumbo');

  state.update(boat('headingMagnetic', 87, T0));
  assert.deepEqual([view().heading.value, view().heading.unit], ['087', '°M']);

  state.update(boat('headingTrue', 89.6, T0));
  assert.deepEqual([view().heading.value, view().heading.unit], ['090', '°']);
});

test('la clave de vista solo cambia cuando cambia algo visible', () => {
  const { state, at, view } = setup();
  state.update(boat('sog', 6, T0));
  const first = sharedNavigationViewKey(view());
  at(T0 + 2000);
  assert.equal(sharedNavigationViewKey(view()), first, 'el paso del tiempo sin caducar no debe forzar render');
  state.update(boat('sog', 6.4, T0 + 2500));
  assert.notEqual(sharedNavigationViewKey(view()), first);
});


test('posición truncada conserva coordenadas completas y formato náutico en el tooltip', () => {
  const { state, view } = setup();
  state.update(boat('position', { lat: 36.526312, lng: -3.590123 }, T0));
  assert.match(view().position.title, /36\.526312, -3\.590123/);
  assert.match(view().position.title, /36° 31\.579′ N/);
  assert.match(view().position.title, /3° 35\.407′ W/);
});
