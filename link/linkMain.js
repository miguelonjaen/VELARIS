// @ts-check
'use strict';

/**
 * Integración de GAULOS Link con el proceso principal de Electron.
 * Canales IPC concretos y validados; el renderer nunca recibe acceso genérico a IPC ni a Node.
 */

const path = require('path');
const { LinkStore } = require('./linkStore');
const { LinkServer } = require('./linkServer');
const { STRONG_ID_PATTERN } = require('./protocol');

const CHANNELS = Object.freeze({
  GET_STATUS: 'gaulos-link:get-status',
  SET_ENABLED: 'gaulos-link:set-enabled',
  START_PAIRING: 'gaulos-link:start-pairing',
  CANCEL_PAIRING: 'gaulos-link:cancel-pairing',
  APPROVE: 'gaulos-link:approve',
  REJECT: 'gaulos-link:reject',
  REVOKE: 'gaulos-link:revoke',
  LIST_TRACKS: 'gaulos-link:list-tracks',
  GET_TRACK_POINTS: 'gaulos-link:get-track-points',
  LIST_EVENTS: 'gaulos-link:list-events',
  // main → renderer
  STATUS: 'gaulos-link:status',
  POSITION: 'gaulos-link:position',
  TRACK: 'gaulos-link:track',
  TRACK_POINTS: 'gaulos-link:track-points',
  LOG_EVENT: 'gaulos-link:log-event'
});

/**
 * Cifrado con el almacén del sistema (DPAPI en Windows) mediante Electron safeStorage.
 * @param {{ isEncryptionAvailable(): boolean, encryptString(s: string): Buffer, decryptString(b: Buffer): string }} safeStorage
 */
function electronSecretBox(safeStorage) {
  return {
    isAvailable: () => safeStorage.isEncryptionAvailable(),
    encrypt: (/** @type {string} */ plain) => safeStorage.encryptString(plain).toString('base64'),
    decrypt: (/** @type {string} */ enc) => safeStorage.decryptString(Buffer.from(enc, 'base64'))
  };
}

/**
 * @param {{
 *   app: { getPath(name: string): string },
 *   ipcMain: import('electron').IpcMain,
 *   safeStorage: any,
 *   getWindow: () => import('electron').BrowserWindow | null | undefined,
 *   log?: { info(...a: any[]): void, warn(...a: any[]): void, error(...a: any[]): void }
 * }} options
 */
function initGaulosLink(options) {
  const { app, ipcMain, safeStorage, getWindow } = options;
  const logger = options.log;
  const store = new LinkStore({
    dir: path.join(app.getPath('userData'), 'velaris-link'),
    secretBox: electronSecretBox(safeStorage)
  }).init();

  const server = new LinkServer({
    store,
    log: (level, message) => {
      if (!logger) return;
      if (level === 'error') logger.error(message); else if (level === 'warn') logger.warn(message); else logger.info(message);
    }
  });

  /** @param {string} channel @param {unknown} payload */
  const toRenderer = (channel, payload) => {
    const window = getWindow();
    if (window && !window.isDestroyed()) window.webContents.send(channel, payload);
  };

  server.on('sharedRoute', (route) => toRenderer('gaulos-link:shared-route', route));
  server.on('status', (status) => toRenderer(CHANNELS.STATUS, status));
  server.on('position', (position) => toRenderer(CHANNELS.POSITION, position));
  server.on('track', (summary) => toRenderer(CHANNELS.TRACK, summary));
  server.on('trackPoints', (update) => toRenderer(CHANNELS.TRACK_POINTS, update));
  server.on('logEvent', (event) => toRenderer(CHANNELS.LOG_EVENT, event));

  /**
   * Solo la ventana principal puede invocar los canales del enlace.
   * @param {import('electron').IpcMainInvokeEvent} event
   */
  const assertTrusted = (event) => {
    const window = getWindow();
    if (!window || window.isDestroyed() || event.sender.id !== window.webContents.id) {
      throw new Error('Origen IPC no autorizado');
    }
  };

  /** @param {unknown} value @param {string} what */
  const requireId = (value, what) => {
    if (typeof value !== 'string' || !STRONG_ID_PATTERN.test(value)) throw new Error(`${what} inválido`);
    return value;
  };

  /**
   * @param {string} channel
   * @param {(...args: any[]) => any} handler
   */
  const handle = (channel, handler) => {
    ipcMain.handle(channel, async (event, ...args) => {
      assertTrusted(event);
      return handler(...args);
    });
  };

  handle('gaulos-link:publish-shared', (type, payload) => server.publishSharedData(type, payload));
  handle(CHANNELS.GET_STATUS, () => server.getStatus());
  handle(CHANNELS.SET_ENABLED, async (enabled) => {
    if (typeof enabled !== 'boolean') throw new Error('enabled debe ser booleano');
    await server.setEnabled(enabled);
    return server.getStatus();
  });
  handle(CHANNELS.START_PAIRING, () => server.startPairing());
  handle(CHANNELS.CANCEL_PAIRING, () => { server.cancelPairing(); return true; });
  handle(CHANNELS.APPROVE, (requestId) => { server.approvePairing(requireId(requestId, 'requestId')); return true; });
  handle(CHANNELS.REJECT, (requestId) => { server.rejectPairing(requireId(requestId, 'requestId')); return true; });
  handle(CHANNELS.REVOKE, (deviceId) => server.revokeDevice(requireId(deviceId, 'deviceId')));
  handle(CHANNELS.LIST_TRACKS, () => store.listTracks());
  handle(CHANNELS.GET_TRACK_POINTS, (trackId) => store.getTrackPoints(requireId(trackId, 'trackId')));
  handle(CHANNELS.LIST_EVENTS, () => store.listEvents());

  if (store.settings.enabled) {
    server.start().catch((error) => logger?.error(`[GAULOS Link] No se pudo iniciar: ${error.message}`));
  }

  return {
    store,
    server,
    shutdown: () => server.stop()
  };
}

module.exports = { initGaulosLink, electronSecretBox, CHANNELS };
