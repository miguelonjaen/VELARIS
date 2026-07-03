const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('smartshipAPI', {
    // Telemetría en tiempo real
    onVesselUpdate: (callback) => ipcRenderer.on('vessel-update', (_, data) => callback(data)),
    // AIS REAL
    onAISMessage: (callback) => {
        const listener = (_, data) => callback(data);
        ipcRenderer.on('ais-message', listener);
        return () => {
            ipcRenderer.removeListener('ais-message', listener);
        };
    },
    // Alertas tácticas del motor de IA
    onTacticalAdvice: (callback) => ipcRenderer.on('tactical-advice', (_, advices) => callback(advices)),
    // Gestión de Hardware
    connectHardware: (port) => ipcRenderer.send('hw:connect', port),
    // Archivos y Cartas (Normalizando nombres de canales)
    selectDirectory: () => ipcRenderer.invoke('select-directory'),
    selectChartsDirectory: () => ipcRenderer.invoke('select-charts-directory'),
    getDefaultChartsPath: () => ipcRenderer.invoke('get-default-charts-path'),
    listChartsFiles: (path) => ipcRenderer.invoke('list-charts-files', path),
    // Utilidades de la App
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    on: (channel, callback) => {
        ipcRenderer.on(channel, (_, data) => callback(data));
    },
    removeListener: (channel, callback) => {
        ipcRenderer.removeListener(channel, callback);
    },
});
