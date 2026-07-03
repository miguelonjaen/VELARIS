console.log('*** ELECTRON MAIN REAL EJECUTADO ***');
process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const packageJson = require('./package.json');
require('dotenv').config();
const { connectAIS } = require('./aisBridge');
// Importación de servicios core (ahora en la raíz)
const isProduction = app.isPackaged;
const { NMEAService } = require(isProduction ? './dist-main/NMEAService.js' : './NMEAService.ts');
const { TacticalTicker } = require(isProduction ? './dist-main/TacticalTicker.js' : './TacticalTicker.ts');
const { startMapServer, stopMapServer } = require('./map-server.js');
let mainWindow;
let nmeaService;
let tacticalEngine;
/**
 * Configuración del sistema de actualizaciones automáticas
 */
function setupAutoUpdater() {
    autoUpdater.logger = log;
    autoUpdater.logger.transports.file.level = 'info';
    autoUpdater.on("checking-for-update", () => {
        log.info("🔍 Buscando actualizaciones...");
    });
    autoUpdater.on("update-not-available", (info) => {
        log.info("ℹ️ No hay actualizaciones disponibles:", info.version);
    });
    autoUpdater.on('update-available', (info) => {
        log.info('🔄 Actualización disponible:', info.version);
        if (mainWindow) {
            mainWindow.webContents.send('update-available', info);
        }
    });
    autoUpdater.on('download-progress', (progressObj) => {
        if (mainWindow) {
            mainWindow.webContents.send('download-progress', progressObj);
        }
    });
    autoUpdater.on('update-downloaded', (info) => {
        log.info('✅ Actualización descargada y lista para instalar');
        if (mainWindow) {
            mainWindow.webContents.send('update-downloaded', info);
        }
    });
    autoUpdater.on('error', (error) => {
        log.error('❌ Error de auto-update:', error);
        if (mainWindow) {
            mainWindow.webContents.send('update-error', { message: error.message });
        }
    });
}
/**
 * Creación de la ventana principal
 */
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1200,
        minHeight: 760,
        show: false,
        title: 'SmartShip Pro',
        autoHideMenuBar: true,
        icon: path.join(__dirname, 'public', 'icon.ico'),
        backgroundColor: '#020617',
        webPreferences: {
            preload: path.join(__dirname, 'electron-preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: false,
        },
    });
    mainWindow.removeMenu();
    const isDev = !app.isPackaged;
    if (isDev) {
        mainWindow.loadURL('http://localhost:3000').catch(() => {
            log.warn('Vite no disponible, reintentando...');
            setTimeout(() => mainWindow.loadURL('http://localhost:3000'), 2000);
        });
    }
    else {
        mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));
    }
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        // Solo para depuración
        mainWindow.webContents.openDevTools({
            mode: 'detach'
        });
    });
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
    if (!isDev) {
        console.log("CHECKING FOR UPDATES");
        autoUpdater.checkForUpdatesAndNotify();
    }
}
/**
 * Inicialización de servicios náuticos y servidores locales
 */
function initializeServices(window) {
    log.info('🚀 Iniciando servicios tácticos...');
    // Motor de reglas en tiempo real
    tacticalEngine = new TacticalTicker(window);
    tacticalEngine.start();
    // Servicio NMEA para hardware serial
    nmeaService = new NMEAService((message) => {
        console.log("📡 TELEMETRIA:", message);
        window.webContents.send("vessel-telemetry", message);
    });
    // Backend local canónico: cartas, salud, Supabase y Gemini.
    startMapServer(8089);
}
// === MANEJADORES IPC (INTER-PROCESS COMMUNICATION) ===
ipcMain.handle('check-for-updates', async () => {
    return await autoUpdater.checkForUpdates();
});
ipcMain.handle('install-update', () => {
    autoUpdater.quitAndInstall();
});
ipcMain.handle('get-app-version', () => {
    return app.getVersion();
});
ipcMain.handle('get-default-charts-path', () => {
    const defaultPath = path.join(app.getPath('documents'), 'SmartShip_Cartas');
    if (!fs.existsSync(defaultPath)) {
        fs.mkdirSync(defaultPath, { recursive: true });
    }
    return defaultPath;
});
const selectDirectoryHandler = async () => {
    const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Seleccionar carpeta de cartas náuticas'
    });
    return result.canceled ? null : result.filePaths[0];
};
ipcMain.handle('select-charts-directory', selectDirectoryHandler);
ipcMain.handle('select-directory', selectDirectoryHandler);
ipcMain.handle('list-charts-files', async (event, folderPath) => {
    try {
        if (!folderPath || !fs.existsSync(folderPath))
            return [];
        const files = fs.readdirSync(folderPath);
        return files.filter(f => {
            const low = f.toLowerCase();
            return low.endsWith('.mbtiles') || low.endsWith('.geojson');
        });
    }
    catch (err) {
        log.error('Error al listar archivos de mapas:', err);
        return [];
    }
});
ipcMain.on('hw:connect', (event, port) => {
    if (nmeaService)
        nmeaService.connect(port);
});
// === EVENTOS DE CICLO DE VIDA DE LA APP ===
app.whenReady().then(() => {
    console.log("AUTOUPDATER SETUP");
    setupAutoUpdater();
    console.log("SETUP AUTOUPDATER");
    createWindow();
    initializeServices(mainWindow);
    console.log('INITIALIZE SERVICES EJECUTADO');
    console.log("AIS KEY:", process.env.VITE_AISSTREAM_API_KEY);
    if (process.env.VITE_AISSTREAM_API_KEY) {
        // Esperar a que el renderer termine de cargar para no perder mensajes
        mainWindow.webContents.once('did-finish-load', () => {
            connectAIS(mainWindow, process.env.VITE_AISSTREAM_API_KEY);
        });
    }
    else {
        console.warn("❌ No hay API KEY de AISStream");
    }
});
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
        app.quit();
});
app.on('before-quit', () => {
    stopMapServer();
});
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0)
        createWindow();
});
