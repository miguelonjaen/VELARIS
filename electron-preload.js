const { contextBridge, ipcRenderer } = require('electron');

// Canales que el renderer puede escuchar mediante on/removeListener (antes se aceptaba cualquiera).
const LISTENABLE_CHANNELS = new Set([
  'vessel-telemetry',
  'simulator-telemetry',
  'vessel-update',
  'ais-message',
  'tactical-advice',
  'update-available',
  'download-progress',
  'update-downloaded',
  'update-error'
]);

// callback del renderer -> listener real registrado en ipcRenderer, por canal.
// Sin este mapa removeListener nunca quitaba nada y cada re-suscripción duplicaba el listener.
const registeredListeners = new Map();
contextBridge.exposeInMainWorld('startupDiagnostics', {
  run: (request) => ipcRenderer.invoke('diagnostics:run', request),
  cancel: () => ipcRenderer.invoke('diagnostics:cancel')
});

function subscribe(channel, callback) {
  const listener = (_event, data) => callback(data);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('GAULOSAPI', {
  // Telemetría en tiempo real
  onVesselUpdate: (callback) => ipcRenderer.on('vessel-update', (_, data) => callback(data)),

  getAISConnections: () => ipcRenderer.invoke('ais:get-connections'),
  setAISConnection: (source, enabled) => ipcRenderer.invoke('ais:set-connection', source, enabled),
  onAISConnectionStatus: (callback) => subscribe('ais:status', callback),

  // AIS REAL
  onAISMessage: (callback) => subscribe('ais-message', callback),

  // Alertas tácticas del motor de IA
  onTacticalAdvice: (callback) => ipcRenderer.on('tactical-advice', (_, advices) => callback(advices)),

  // Gestión de Hardware
  connectHardware: (port) => ipcRenderer.send('hw:connect', String(port ?? '')),
  // Destino tipado: { transport: 'serial', path } o { transport: 'tcp', host, port }. Devuelve { ok, error?, status }.
  connectNmea: (target) => ipcRenderer.invoke('hw:connect-target', target && typeof target === 'object'
    ? { transport: String(target.transport ?? ''), path: target.path, host: target.host, port: target.port, source: target.source }
    : null),
  disconnectHardware: () => ipcRenderer.send('hw:disconnect'),
  listHardwarePorts: () => ipcRenderer.invoke('hw:list-ports'),
  getHardwareStatus: () => ipcRenderer.invoke('hw:get-status'),
  getAISCredentialStatus: () => ipcRenderer.invoke('ais:credential-status'),
  importAISCredential: () => ipcRenderer.invoke('ais:import-credential'),
  removeAISCredential: () => ipcRenderer.invoke('ais:remove-credential'),

  // Archivos y Cartas (Normalizando nombres de canales)
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  selectChartsDirectory: () => ipcRenderer.invoke('select-charts-directory'),
  getDefaultChartsPath: () => ipcRenderer.invoke('get-default-charts-path'),
  listChartsFiles: (path) => ipcRenderer.invoke('list-charts-files', path),

  // Utilidades de la App
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getAIStatus: () => ipcRenderer.invoke('ai:status'),
  importAIConfiguration: () => ipcRenderer.invoke('ai:import-env'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),

  on: (channel, callback) => {
    if (!LISTENABLE_CHANNELS.has(channel) || typeof callback !== 'function') {
      console.warn(`[preload] Canal no permitido: ${channel}`);
      return;
    }
    let byCallback = registeredListeners.get(channel);
    if (!byCallback) {
      byCallback = new Map();
      registeredListeners.set(channel, byCallback);
    }
    if (byCallback.has(callback)) return;
    byCallback.set(callback, subscribe(channel, callback));
  },

  removeListener: (channel, callback) => {
    const byCallback = registeredListeners.get(channel);
    const unsubscribe = byCallback && byCallback.get(callback);
    if (!unsubscribe) return;
    unsubscribe();
    byCallback.delete(callback);
  },
});

// GAULOS Link: API concreta y tipada (src/features/link/gaulosLinkTypes.ts). Sin acceso genérico a IPC.
contextBridge.exposeInMainWorld('gaulosLink', {
  publishShared: (type, payload) => ipcRenderer.invoke('gaulos-link:publish-shared', type, payload),
  onSharedRoute: (callback) => subscribe('gaulos-link:shared-route', callback),
  getStatus: () => ipcRenderer.invoke('gaulos-link:get-status'),
  setEnabled: (enabled) => ipcRenderer.invoke('gaulos-link:set-enabled', enabled === true),
  startPairing: () => ipcRenderer.invoke('gaulos-link:start-pairing'),
  cancelPairing: () => ipcRenderer.invoke('gaulos-link:cancel-pairing'),
  approvePairing: (requestId) => ipcRenderer.invoke('gaulos-link:approve', String(requestId)),
  rejectPairing: (requestId) => ipcRenderer.invoke('gaulos-link:reject', String(requestId)),
  revokeDevice: (deviceId) => ipcRenderer.invoke('gaulos-link:revoke', String(deviceId)),
  listTracks: () => ipcRenderer.invoke('gaulos-link:list-tracks'),
  getTrackPoints: (trackId) => ipcRenderer.invoke('gaulos-link:get-track-points', String(trackId)),
  listEvents: () => ipcRenderer.invoke('gaulos-link:list-events'),
  onStatus: (callback) => subscribe('gaulos-link:status', callback),
  onPosition: (callback) => subscribe('gaulos-link:position', callback),
  onTrack: (callback) => subscribe('gaulos-link:track', callback),
  onTrackPoints: (callback) => subscribe('gaulos-link:track-points', callback),
  onLogEvent: (callback) => subscribe('gaulos-link:log-event', callback),
});

// Dedicated ANTARES SIM interface; no generic IPC and no controller access.
contextBridge.exposeInMainWorld('radarAntares', {
  connect: () => ipcRenderer.invoke('radar-sim:antares-connect'),
  disconnect: () => ipcRenderer.invoke('radar-sim:antares-disconnect'),
  snapshot: () => ipcRenderer.invoke('radar-sim:antares-snapshot'),
});
