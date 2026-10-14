'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createCloseBehavior, buildTrayMenuTemplate } = require('../closeBehavior');

function setup() {
  const calls = { hide: 0, firstHide: 0 };
  const behavior = createCloseBehavior({ hideWindow: () => { calls.hide++; }, onFirstHide: () => { calls.firstHide++; } });
  const event = () => ({ prevented: false, preventDefault() { this.prevented = true; } });
  return { calls, behavior, event };
}

test('cerrar la ventana la oculta, cancela el cierre y no sale de la aplicación', () => {
  const { calls, behavior, event } = setup();
  const e = event();
  assert.equal(behavior.onWindowClose(e), 'hidden');
  assert.equal(e.prevented, true);
  assert.equal(calls.hide, 1);
  assert.equal(behavior.shouldQuitWhenAllWindowsClosed(), false);
  assert.equal(behavior.isQuitting(), false);
});

test('el aviso de bandeja solo se muestra la primera vez', () => {
  const { calls, behavior, event } = setup();
  behavior.onWindowClose(event());
  behavior.onWindowClose(event());
  assert.equal(calls.hide, 2);
  assert.equal(calls.firstHide, 1);
});

test('tras «Salir» (before-quit) la ventana se cierra de verdad y la aplicación termina', () => {
  const { calls, behavior, event } = setup();
  behavior.markQuitting();
  const e = event();
  assert.equal(behavior.onWindowClose(e), 'closing');
  assert.equal(e.prevented, false);
  assert.equal(calls.hide, 0);
  assert.equal(behavior.shouldQuitWhenAllWindowsClosed(), true);
});

test('el menú de la bandeja tiene «Abrir VELARIS» y un «Salir» explícito que llama a quit', () => {
  let shown = 0; let quit = 0;
  const menu = buildTrayMenuTemplate({ linkEnabled: true, devices: 1, show: () => shown++, quit: () => quit++ });
  const labels = menu.filter((i) => i.label).map((i) => i.label);
  assert.deepEqual(labels, ['Abrir VELARIS', 'VELARIS Link: activo · 1 dispositivo conectado', 'Salir']);
  menu.find((i) => i.label === 'Abrir VELARIS').click();
  menu.find((i) => i.label === 'Salir').click();
  assert.deepEqual([shown, quit], [1, 1]);
  assert.equal(menu.find((i) => (i.label || '').startsWith('VELARIS Link')).enabled, false);
});

test('el menú refleja Link desactivado', () => {
  const menu = buildTrayMenuTemplate({ linkEnabled: false, devices: 0, show() {}, quit() {} });
  assert.ok(menu.some((i) => i.label === 'VELARIS Link: desactivado'));
});
