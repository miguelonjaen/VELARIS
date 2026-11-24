'use strict';
// Pruebas del flujo de decisión del actualizador con un autoUpdater simulado localmente.
// No contactan con GitHub. Ejecutar: node --test updater/test/
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createUpdateController } = require('../updateController');

const silentLog = { info() {}, warn() {}, error() {} };
const tick = () => new Promise((r) => setImmediate(r));

function setup({ responses = [], available = null, checkError = null, downloadError = null } = {}) {
  const updater = new EventEmitter();
  const calls = { download: 0, quitAndInstall: 0, dialogs: [] };
  updater.checkForUpdates = async () => {
    updater.emit('checking-for-update');
    if (checkError) { updater.emit('error', checkError); throw checkError; }
    if (available) updater.emit('update-available', { version: available });
    else updater.emit('update-not-available', { version: '1.4.1' });
    return {};
  };
  updater.downloadUpdate = async () => {
    calls.download += 1;
    if (downloadError) { updater.emit('error', downloadError); throw downloadError; }
    return [];
  };
  updater.quitAndInstall = () => { calls.quitAndInstall += 1; };
  const queue = [...responses];
  const showMessageBox = async (_win, options) => {
    calls.dialogs.push(options.title);
    return { response: queue.length ? queue.shift() : options.cancelId ?? 0 };
  };
  const controller = createUpdateController({ autoUpdater: updater, showMessageBox, getWindow: () => null, log: silentLog, appVersion: '1.4.1' });
  return { updater, controller, calls };
}

test('desactiva descarga e instalación automáticas', () => {
  const { updater } = setup();
  assert.equal(updater.autoDownload, false);
  assert.equal(updater.autoInstallOnAppQuit, false);
});

test('sin actualización: no hay diálogos en la comprobación automática', async () => {
  const { controller, calls } = setup();
  await controller.check();
  await tick();
  assert.equal(calls.dialogs.length, 0);
  assert.equal(controller.getState().state, 'idle');
});

test('sin actualización: la comprobación manual informa al usuario', async () => {
  const { controller, calls } = setup();
  await controller.check({ manual: true });
  await tick();
  assert.deepEqual(calls.dialogs, ['GAULOS']);
});

test('«Más tarde»: no descarga, no instala y no vuelve a avisar en la sesión', async () => {
  const { controller, calls, updater } = setup({ available: '1.4.2', responses: [1] });
  await controller.check();
  await tick();
  assert.equal(calls.download, 0);
  assert.equal(calls.quitAndInstall, 0);
  assert.deepEqual(controller.getState().postponed, ['1.4.2']);
  await controller.check();
  await tick();
  assert.equal(calls.dialogs.length, 1, 'no debe repetir el aviso automático');
  // Una descarga que llegara por cualquier vía no se instala sin autorización.
  updater.emit('update-downloaded', { version: '1.4.2' });
  assert.equal(calls.quitAndInstall, 0);
});

test('tras posponer, la comprobación manual vuelve a ofrecer la versión', async () => {
  const { controller, calls } = setup({ available: '1.4.2', responses: [1, 1] });
  await controller.check();
  await tick();
  await controller.check({ manual: true });
  await tick();
  assert.equal(calls.dialogs.filter((t) => t === 'Actualización disponible').length, 2);
});

test('nueva sesión (reapertura) tras posponer: vuelve a preguntar y sigue sin instalar', async () => {
  const first = setup({ available: '1.4.2', responses: [1] });
  await first.controller.check();
  await tick();
  const second = setup({ available: '1.4.2', responses: [1] });
  await second.controller.check();
  await tick();
  assert.equal(second.calls.dialogs.length, 1);
  assert.equal(second.calls.quitAndInstall, 0);
});

test('«Actualizar ahora» + cancelar confirmación: no descarga', async () => {
  const { controller, calls } = setup({ available: '1.4.2', responses: [0, 1] });
  await controller.check();
  await tick();
  assert.equal(calls.download, 0);
  assert.equal(calls.quitAndInstall, 0);
});

test('«Actualizar ahora» + confirmar: descarga y, al completarse, instala', async () => {
  const { controller, calls, updater } = setup({ available: '1.4.2', responses: [0, 0] });
  await controller.check();
  await tick();
  assert.equal(calls.download, 1);
  assert.equal(controller.getState().state, 'downloading');
  updater.emit('update-downloaded', { version: '1.4.2' });
  assert.equal(calls.quitAndInstall, 1);
});

test('descarga fallida o inválida: vuelve a inactivo, avisa y no instala', async () => {
  const { controller, calls, updater } = setup({ available: '1.4.2', responses: [0, 0, 0], downloadError: new Error('sha512 checksum mismatch') });
  await controller.check();
  await tick();
  assert.equal(controller.getState().state, 'idle');
  assert.equal(controller.getState().authorizedVersion, null);
  assert.ok(calls.dialogs.includes('Actualización no completada'));
  updater.emit('update-downloaded', { version: '1.4.2' });
  assert.equal(calls.quitAndInstall, 0);
});

test('servidor inaccesible: la comprobación automática no bloquea ni muestra diálogos', async () => {
  const { controller, calls } = setup({ checkError: new Error('net::ERR_CONNECTION_REFUSED') });
  const result = await controller.check();
  await tick();
  assert.equal(result.started, false);
  assert.equal(calls.dialogs.length, 0);
  assert.equal(controller.getState().state, 'idle');
});

test('install-update sin autorización se ignora', () => {
  const { controller, calls } = setup();
  assert.equal(controller.installIfAuthorized(), false);
  assert.equal(calls.quitAndInstall, 0);
});
