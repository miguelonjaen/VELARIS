process.env["ELECTRON_DISABLE_SECURITY_WARNINGS"] = "true";
const { app, BrowserWindow, ipcMain, dialog, globalShortcut, safeStorage, Tray, Menu, nativeImage } = require("electron");
const fs = require("fs");
const path = require("path");
const { autoUpdater } = require("electron-updater");
const log = require("electron-log");
const dotenv = require("dotenv");
const packageJson = require("./package.json");
const { connectAIS } = require("./aisBridge");
const { initVelarisLink } = require("./link/linkMain");
const { createCloseBehavior, buildTrayMenuTemplate } = require("./link/closeBehavior");
const isProduction = app.isPackaged;
if (!isProduction) {
    dotenv.config({
        path: path.join(process.cwd(), ".env"),
    });
}
// Importación de servicios core (ahora en la raíz)
const { NMEAService } = require(isProduction ? './dist-main/NMEAService.js' : './NMEAService.ts');
const { TacticalTicker } = require(isProduction ? './dist-main/TacticalTicker.js' : './TacticalTicker.ts');
const { startMapServer, stopMapServer } = require('./map-server.js');
let mainWindow;
let nmeaService;
let tacticalEngine;
let aisApiKey = process.env.VITE_AISSTREAM_API_KEY || null;
let aisConnected = false;
let velarisLink = null;
function connectAISIfAvailable(window) {
    if (aisConnected)
        return;
    if (!window || window.isDestroyed() || !aisApiKey)
        return;
    aisConnected = true;
    if (window.webContents.isLoadingMainFrame()) {
        window.webContents.once('did-finish-load', () => {
            connectAIS(window, aisApiKey);
        });
    }
    else {
        connectAIS(window, aisApiKey);
    }
}
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
        autoUpdater.disableWebInstaller = true;
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
    autoUpdater.on("update-downloaded", async () => {
        const result = await dialog.showMessageBox(mainWindow, {
            type: "info",
            title: "Actualización disponible",
            message: "VELARIS se ha actualizado.",
            detail: "La actualización está lista para instalar. ¿Deseas reiniciar ahora?",
            buttons: ["Reiniciar ahora", "Más tarde"],
            defaultId: 0,
            cancelId: 1,
        });
        if (result.response === 0) {
            autoUpdater.quitAndInstall();
        }
    });
    autoUpdater.on('error', (error) => {
        log.error('❌ Error de auto-update:', error);
        if (mainWindow) {
            mainWindow.webContents.send('update-error', { message: error.message });
        }
    });
}
// === BANDEJA DEL SISTEMA (D4) ===
// Cerrar la ventana la oculta y deja VELARIS Link activo; la salida real es «Salir» en la bandeja.
let tray = null;
function showMainWindow() {
    if (!mainWindow || mainWindow.isDestroyed()) {
        createWindow();
        return;
    }
    if (mainWindow.isMinimized())
        mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
}
const closeBehavior = createCloseBehavior({
    hideWindow: () => { if (mainWindow && !mainWindow.isDestroyed())
        mainWindow.hide(); },
    onFirstHide: () => {
        try {
            if (tray && typeof tray.displayBalloon === 'function') {
                tray.displayBalloon({ title: 'VELARIS sigue activo', content: 'VELARIS Link continúa en la bandeja del sistema. Para salir, usa «Salir» en su menú.' });
            }
        }
        catch (error) {
            log.warn('[Bandeja] No se pudo mostrar el aviso:', error);
        }
    }
});
function refreshTrayMenu() {
    if (!tray)
        return;
    let linkEnabled = false;
    let devices = 0;
    try {
        const status = velarisLink && velarisLink.server.getStatus();
        if (status) {
            linkEnabled = status.running === true || status.enabled === true;
            devices = (status.connections || []).length;
        }
    }
    catch (error) {
        log.warn('[Bandeja] Estado de Link no disponible:', error);
    }
    tray.setContextMenu(Menu.buildFromTemplate(buildTrayMenuTemplate({ linkEnabled, devices, show: showMainWindow, quit: () => app.quit() })));
}
function createTray() {
    if (tray)
        return;
    try {
        tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'public', 'icon.ico')));
        tray.setToolTip('VELARIS');
        tray.on('click', showMainWindow);
        tray.on('double-click', showMainWindow);
        refreshTrayMenu();
        if (velarisLink)
            velarisLink.server.on('status', refreshTrayMenu);
    }
    catch (error) {
        log.error('[Bandeja] No se pudo crear la bandeja:', error);
    }
}
// Una sola instancia: dos VELARIS compartirían el puerto de Link (47811).
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
    app.quit();
}
else {
    app.on('second-instance', showMainWindow);
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
        title: 'VELARIS',
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
    });
    mainWindow.on('close', (event) => closeBehavior.onWindowClose(event));
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
    if (!isDev) {
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
    const defaultPath = path.join(app.getPath('documents'), 'VELARIS_Cartas');
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
ipcMain.on('ais:set-api-key', (event, apiKey) => {
    aisApiKey = apiKey || null;
    if (aisApiKey) {
        connectAISIfAvailable(mainWindow);
    }
});
// === EVENTOS DE CICLO DE VIDA DE LA APP ===
app.whenReady().then(() => {
    if (!gotSingleInstanceLock)
        return;
    setupAutoUpdater();
    createWindow();
    if (!app.isPackaged) {
        globalShortcut.register("CommandOrControl+Shift+I", () => {
            if (!mainWindow)
                return;
            if (mainWindow.webContents.isDevToolsOpened()) {
                mainWindow.webContents.closeDevTools();
            }
            else {
                mainWindow.webContents.openDevTools({
                    mode: "left",
                });
            }
        });
    }
    initializeServices(mainWindow);
    // VELARIS Link: enlace local con VELARISdroid (desactivado hasta que el usuario lo active).
    try {
        velarisLink = initVelarisLink({ app, ipcMain, safeStorage, getWindow: () => mainWindow, log });
    }
    catch (error) {
        log.error('[VELARIS Link] No se pudo inicializar:', error);
    }
    createTray();
    if (aisApiKey) {
        connectAISIfAvailable(mainWindow);
    }
});
app.on('window-all-closed', () => {
    // La ventana se oculta al cerrarla (bandeja): solo se termina tras «Salir».
    if (process.platform !== 'darwin' && closeBehavior.shouldQuitWhenAllWindowsClosed())
        app.quit();
});
app.on('before-quit', () => {
    closeBehavior.markQuitting();
    stopMapServer();
    if (velarisLink)
        velarisLink.shutdown().catch(() => { });
});
app.on('activate', () => {
    showMainWindow();
});
app.on("will-quit", () => {
    globalShortcut.unregisterAll();
});
