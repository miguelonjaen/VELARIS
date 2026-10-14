const { contextBridge, ipcRenderer } = require('electron');

// Canales que el renderer puede escuchar mediante on/removeListener (antes se aceptaba cualquiera).
const LISTENABLE_CHANNELS = new Set([
  'vessel-telemetry',
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

function subscribe(channel, callback) {
  const listener = (_event, data) => callback(data);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('VELARISAPI', {
  // Telemetría en tiempo real
  onVesselUpdate: (callback) => ipcRenderer.on('vessel-update', (_, data) => callback(data)),

  // AIS REAL
  onAISMessage: (callback) => subscribe('ais-message', callback),

  // Alertas tácticas del motor de IA
  onTacticalAdvice: (callback) => ipcRenderer.on('tactical-advice', (_, advices) => callback(advices)),

  // Gestión de Hardware
  connectHardware: (port) => ipcRenderer.send('hw:connect', port),
  setAISApiKey: (apiKey) => ipcRenderer.send('ais:set-api-key', apiKey),

  // Archivos y Cartas (Normalizando nombres de canales)
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  selectChartsDirectory: () => ipcRenderer.invoke('select-charts-directory'),
  getDefaultChartsPath: () => ipcRenderer.invoke('get-default-charts-path'),
  listChartsFiles: (path) => ipcRenderer.invoke('list-charts-files', path),

  // Utilidades de la App
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
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

// VELARIS Link: API concreta y tipada (src/features/link/velarisLinkTypes.ts). Sin acceso genérico a IPC.
contextBridge.exposeInMainWorld('velarisLink', {
  getStatus: () => ipcRenderer.invoke('velaris-link:get-status'),
  setEnabled: (enabled) => ipcRenderer.invoke('velaris-link:set-enabled', enabled === true),
  startPairing: () => ipcRenderer.invoke('velaris-link:start-pairing'),
  cancelPairing: () => ipcRenderer.invoke('velaris-link:cancel-pairing'),
  approvePairing: (requestId) => ipcRenderer.invoke('velaris-link:approve', String(requestId)),
  rejectPairing: (requestId) => ipcRenderer.invoke('velaris-link:reject', String(requestId)),
  revokeDevice: (deviceId) => ipcRenderer.invoke('velaris-link:revoke', String(deviceId)),
  listTracks: () => ipcRenderer.invoke('velaris-link:list-tracks'),
  getTrackPoints: (trackId) => ipcRenderer.invoke('velaris-link:get-track-points', String(trackId)),
  listEvents: () => ipcRenderer.invoke('velaris-link:list-events'),
  onStatus: (callback) => subscribe('velaris-link:status', callback),
  onPosition: (callback) => subscribe('velaris-link:position', callback),
  onTrack: (callback) => subscribe('velaris-link:track', callback),
  onTrackPoints: (callback) => subscribe('velaris-link:track-points', callback),
  onLogEvent: (callback) => subscribe('velaris-link:log-event', callback),
});
