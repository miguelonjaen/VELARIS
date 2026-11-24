
const { app, BrowserWindow, ipcMain, dialog, globalShortcut, safeStorage, Tray, Menu, nativeImage } = require("electron");
const fs = require("fs");
const path = require("path");
const { autoUpdater } = require("electron-updater");
const log = require("electron-log");
const dotenv = require("dotenv");

const packageJson = require("./package.json");
// Reuse the existing profile so the rename preserves sessions, charts and Link pairing.
const legacyUserDataPath = ['velaris', 'VELARIS']
  .map((name) => path.join(app.getPath('appData'), name))
  .find((directory) => fs.existsSync(directory));
app.setName('GAULOS');
if (legacyUserDataPath) app.setPath('userData', legacyUserDataPath);

const appIconPath = path.join(__dirname, 'public', process.platform === 'darwin' ? 'logo.png' : 'icon.ico');
const { connectAIS, disconnectAIS, getAISConnections, setAISConnection, shouldForwardNmea } = require("./aisBridge");
const { initGaulosLink } = require("./link/linkMain");
const { BoatDataFeed } = require("./link/boatData");
const { createCloseBehavior, buildTrayMenuTemplate } = require("./link/closeBehavior");
const { createUpdateController } = require("./updater/updateController");

const isProduction = app.isPackaged;

if (!isProduction) {
  dotenv.config({
    path: path.join(process.cwd(), ".env"),
  });
}


// Importación de servicios core (ahora en la raíz)
const { NMEAService, validateConnectionTarget } = require(isProduction ? './dist-main/NMEAService.js' : './NMEAService.ts');
const { AntaresClient } = require(isProduction ? './dist-main/src/main/radar/AntaresClient.js' : './src/main/radar/AntaresClient.ts');
const antaresClient = new AntaresClient();
const { TacticalTicker } = require(isProduction ? './dist-main/TacticalTicker.js' : './TacticalTicker.ts');
const { startMapServer, stopMapServer, configureOpenAIKey, getOpenAIStatus } = require('./map-server.js');
const { registerOpenAICredentials } = require('./updater/openaiCredentials');

let mainWindow;
let nmeaService;
const { createDesktopDiagnostics } = require(isProduction ? './dist-main/src/main/diagnostics/desktopDiagnostics.js' : './src/main/diagnostics/desktopDiagnostics.ts');
const startupDiagnostics = createDesktopDiagnostics(() => nmeaService);
ipcMain.handle('diagnostics:run', (event, request) => {
  if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error('Unauthorized diagnostics sender');
  const input = request && typeof request === 'object' ? request : {};
  return startupDiagnostics.run({
    target: input.target,
    authorizedInterfaces: Array.isArray(input.authorizedInterfaces) ? input.authorizedInterfaces.filter(value => typeof value === 'string').slice(0, 16) : []
  });
});
ipcMain.handle('diagnostics:cancel', (event) => {
  if (mainWindow && event.sender === mainWindow.webContents) startupDiagnostics.cancel();
});
app.on('before-quit', () => startupDiagnostics.cancel());
let tacticalEngine;
let aisApiKey = null;

let gaulosLink = null;
// Datos vigentes de los instrumentos del barco para BOAT_DATA (GAULOS Link → GAULOSdroid).
const boatDataFeed = new BoatDataFeed();
let boatDataTimer = null;

function connectAISIfAvailable(window) {
  if (!getAISConnections().streamEnabled) return;
  if (!window || window.isDestroyed()) return;



  if (window.webContents.isLoadingMainFrame()) {
    window.webContents.once('did-finish-load', () => {
      if (!window.isDestroyed()) connectAIS(window, aisApiKey);
    });
  } else {
    connectAIS(window, aisApiKey);
  }
}

/**
 * Actualizaciones: ninguna descarga ni instalación sin autorización explícita.
 * Flujo y política documentados en updater/updateController.js y en
 * docs/GAULOS_1.4.1_RELEASE_CANDIDATE.md.
 */
let updateController = null;

function setupAutoUpdater() {
  autoUpdater.logger = log;
  autoUpdater.logger.transports.file.level = 'info';
  updateController = createUpdateController({
    autoUpdater,
    showMessageBox: (win, options) => (win ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options)),
    getWindow: () => mainWindow,
    log,
    appVersion: app.getVersion(),
  });
}

// === BANDEJA DEL SISTEMA (D4) ===
// Cerrar la ventana la oculta y deja GAULOS Link activo; la salida real es «Salir» en la bandeja.
let tray = null;

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  // A second launch must revive a crashed renderer, not just reveal an empty window.
  if (mainWindow.webContents.isCrashed()) {
    log.warn('[Desktop] Recuperando interfaz detenida al mostrar la ventana');
    mainWindow.webContents.reload();
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

const closeBehavior = createCloseBehavior({
  hideWindow: () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide(); },
  onFirstHide: () => {
    try {
      if (tray && typeof tray.displayBalloon === 'function') {
        tray.displayBalloon({ title: 'GAULOS sigue activo', content: 'GAULOS Link continúa en la bandeja del sistema. Para salir, usa «Salir» en su menú.' });
      }
    } catch (error) {
      log.warn('[Bandeja] No se pudo mostrar el aviso:', error);
    }
  }
});

function refreshTrayMenu() {
  if (!tray) return;
  let linkEnabled = false;
  let devices = 0;
  try {
    const status = gaulosLink && gaulosLink.server.getStatus();
    if (status) { linkEnabled = status.running === true || status.enabled === true; devices = (status.connections || []).length; }
  } catch (error) {
    log.warn('[Bandeja] Estado de Link no disponible:', error);
  }
  tray.setContextMenu(Menu.buildFromTemplate(buildTrayMenuTemplate({ linkEnabled, devices, show: showMainWindow, quit: () => app.quit() })));
}

function createTray() {
  if (tray) return;
  try {
    tray = new Tray(nativeImage.createFromPath(appIconPath));
    tray.setToolTip('GAULOS');
    tray.on('click', showMainWindow);
    tray.on('double-click', showMainWindow);
    refreshTrayMenu();
    if (gaulosLink) gaulosLink.server.on('status', refreshTrayMenu);
  } catch (error) {
    log.error('[Bandeja] No se pudo crear la bandeja:', error);
  }
}

// Una sola instancia: dos GAULOS compartirían el puerto de Link (47811).
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', showMainWindow);
}

/**
 * Creación de la ventana principal
 */
const { randomBytes: desktopRandomBytes } = require('node:crypto');
const { pathToFileURL: desktopPathToFileURL } = require('node:url');

const desktopLocalToken = desktopRandomBytes(32).toString('hex');
const desktopEntryURL = desktopPathToFileURL(
  path.join(__dirname, 'dist/index.html')
).href;

function isTrustedDesktopURL(value) {
  try {
    const url = new URL(value);

    if (url.username || url.password) return false;

    if (app.isPackaged) {
      url.hash = '';
      url.search = '';
      return url.href === desktopEntryURL;
    }

    return url.origin === 'http://localhost:3000';
  } catch {
    return false;
  }
}

function protectDesktopWindow(window) {
  const contents = window.webContents;

  contents.setWindowOpenHandler(() => ({ action: 'deny' }));

  contents.on('will-navigate', (event, url) => {
    if (!isTrustedDesktopURL(url)) event.preventDefault();
  });

  contents.on('will-redirect', (event, url) => {
    if (!isTrustedDesktopURL(url)) event.preventDefault();
  });

  contents.session.webRequest.onBeforeSendHeaders(
    {
      urls: [
        'http://localhost:8089/*',
        'http://127.0.0.1:8089/*',
      ],
    },
    (details, callback) => {
      const headers = { ...details.requestHeaders };

      for (const name of Object.keys(headers)) {
        if (name.toLowerCase() === 'x-gaulos-desktop-token') {
          delete headers[name];
        }
      }

      const target = new URL(details.url);

      const allowedPath =
        target.pathname === '/health' ||
        target.pathname.startsWith('/api/') ||
        target.pathname.startsWith('/tiles/');

      const trusted =
        !window.isDestroyed() &&
        details.webContentsId === contents.id &&
        isTrustedDesktopURL(contents.getURL()) &&
        target.protocol === 'http:' &&
        ['localhost', '127.0.0.1'].includes(target.hostname) &&
        target.port === '8089' &&
        !target.username &&
        !target.password &&
        allowedPath;

      if (!trusted) {
        callback({ cancel: true });
        return;
      }

      if (details.method !== 'OPTIONS') {
        headers['X-Gaulos-Desktop-Token'] = desktopLocalToken;
      }

      callback({ requestHeaders: headers });
    }
  );
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 760,

    show: false,

    title: 'GAULOS',
    autoHideMenuBar: true,

    icon: appIconPath,

    backgroundColor: '#020617',

    webPreferences: {
      preload: path.join(__dirname, 'electron-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  mainWindow.removeMenu();
  protectDesktopWindow(mainWindow);

  const window = mainWindow;
  let rendererRecoveryAttempted = false;
  window.webContents.on('destroyed', () => antaresClient.disconnect());
  window.webContents.on('did-start-navigation', (_event, _url, _inPlace, isMainFrame) => { if (isMainFrame) antaresClient.disconnect(); });
  window.webContents.on('render-process-gone', (_event, details) => {
    antaresClient.disconnect();
    log.error('[Desktop] Proceso de interfaz detenido', { reason: details.reason, exitCode: details.exitCode });
    if (window.isDestroyed()) return;
    if (!rendererRecoveryAttempted) {
      rendererRecoveryAttempted = true;
      log.warn('[Desktop] Recargando interfaz una vez; los servicios del proceso principal siguen activos');
      window.webContents.reload();
      return;
    }
    // Do not create an automatic crash/reload loop.
    dialog.showMessageBox(window, {
      type: 'error', title: 'GAULOS - Interfaz detenida',
      message: 'La interfaz de GAULOS se ha detenido de nuevo.',
      detail: 'Los servicios pueden seguir activos. Reintenta la carga de la interfaz. El motivo se ha registrado en el log de Desktop.',
      buttons: ['Recargar interfaz', 'Cerrar aviso'], defaultId: 1, cancelId: 1,
    }).then(({ response }) => {
      if (response === 0 && !window.isDestroyed()) window.webContents.reload();
    }).catch(error => log.error('[Desktop] No se pudo mostrar el aviso de recuperacion', error));
  });
  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, _url, isMainFrame) => {
    if (isMainFrame && errorCode !== -3) log.error('[Desktop] Fallo de carga de interfaz', { errorCode, errorDescription });
  });

  const isDev = !app.isPackaged;

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000').catch(() => {
      log.warn('Vite no disponible, reintentando...');
      setTimeout(() => mainWindow.loadURL('http://localhost:3000'), 2000);
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
  mainWindow.show();



});

  mainWindow.on('close', (event) => closeBehavior.onWindowClose(event));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (!isDev && updateController) {
    // Solo comprueba; la descarga y la instalación requieren confirmación del usuario.
    mainWindow.webContents.once('did-finish-load', () => {
      updateController.check().catch((error) => log.warn('[Updater] Comprobación inicial fallida:', error));
    });
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


nmeaService = new NMEAService((message, origin) => {
    if (!shouldForwardNmea(message)) return;


    // La ventana puede haberse recreado desde la bandeja: enviar siempre a la actual.
    // Solo instrumentos del barco (serie o TCP declarado como barco) alimentan BOAT_DATA.
    if (origin && origin.source === 'BOAT') boatDataFeed.ingest(message, origin);
    const target = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
    if (!target) return;
    // Los datos del simulador NMEA (TCP) van por su propio canal: nunca como instrumentos del barco.
    if (origin && origin.source === 'SIMULATOR') {
      target.webContents.send("simulator-telemetry", { sourceId: origin.sourceId, message });
      return;
    }
    target.webContents.send("vessel-telemetry", message);

});

  // Backend local canónico: cartas, salud, Supabase y Gemini.
  // Local server is started before the renderer.
}

// === MANEJADORES IPC (INTER-PROCESS COMMUNICATION) ===

// Comprobación manual: vuelve a ofrecer una versión pospuesta. No descarga sin confirmación.
ipcMain.handle('check-for-updates', async () => {
  if (!updateController || !app.isPackaged) return { started: false, reason: 'not-packaged' };
  return updateController.check({ manual: true });
});

// Solo instala si existe una autorización explícita y una descarga completa.
ipcMain.handle('install-update', () => {
  return updateController ? updateController.installIfAuthorized() : false;
});

// Concrete SIM-only API; a renderer cannot select arbitrary hosts, ports or control commands.
const assertRadarOwner = (event) => {
  if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) throw new Error('Radar sender not authorized');
};
ipcMain.handle('radar-sim:antares-connect', (event) => { assertRadarOwner(event); return antaresClient.connect(); });
ipcMain.handle('radar-sim:antares-disconnect', (event) => { assertRadarOwner(event); antaresClient.disconnect(); });
ipcMain.handle('radar-sim:antares-snapshot', (event) => { assertRadarOwner(event); return antaresClient.snapshot(); });

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
    if (!folderPath || !fs.existsSync(folderPath)) return [];
    const files = fs.readdirSync(folderPath);
    return files.filter(f => {
      const low = f.toLowerCase();
      return low.endsWith('.mbtiles') || low.endsWith('.geojson');
    });
  } catch (err) {
    log.error('Error al listar archivos de mapas:', err);
    return [];
  }
});

// Entrada NMEA. Destinos admitidos (validados antes de conectar):
//  - cadena o { transport: 'serial', path }: puerto serie del barco (fuente BOAT). Solo se
//    abre un puerto que exista en el equipo; una dirección de red nunca se toma por puerto serie.
//  - { transport: 'tcp', host, port, source }: cliente TCP (gateway del barco o simulador). El origen
//    se declara: 'BOAT' se comporta como instrumentos del barco; sin declarar → 'SIMULATOR'.
// No hay destino por defecto ni conexión automática. Una sola conexión a la vez (ver NMEAService).
async function connectNmea(input) {
  if (!nmeaService) return { ok: false, error: 'El servicio NMEA no está disponible.', status: null };
  const validation = validateConnectionTarget(input);
  if (!validation.ok) {
    log.warn('[NMEA] Destino de conexión rechazado:', validation.error);
    return { ok: false, error: validation.error, status: nmeaService.getStatus() };
  }
  const target = validation.target;
  if (target.transport === 'serial') {
    try {
      const ports = await nmeaService.listPorts();
      if (!ports.some((candidate) => candidate.path === target.path)) {
        log.warn('[NMEA] El puerto solicitado no existe en este equipo:', target.path);
        return { ok: false, error: `El puerto serie ${target.path} no existe en este equipo.`, status: nmeaService.getStatus() };
      }
    } catch (error) {
      log.error('[NMEA] No se pudo comprobar los puertos serie:', error);
      return { ok: false, error: 'No se pudo comprobar los puertos serie del equipo.', status: nmeaService.getStatus() };
    }
  }
  // Otra conexión NMEA: los datos de la anterior no se siguen enviando al teléfono.
  boatDataFeed.clear();
  const result = nmeaService.connectTarget(target);
  return { ...result, status: nmeaService.getStatus() };
}

// Compatibilidad: mensaje existente sin respuesta (acepta también el destino tipado).
ipcMain.on('hw:connect', (event, target) => {
  connectNmea(target).catch((error) => log.error('[NMEA] Error al conectar:', error));
});

// Destino tipado con respuesta: { ok, error?, status } para mostrar el resultado en la interfaz.
ipcMain.handle('hw:connect-target', (event, target) => connectNmea(target));

ipcMain.on('hw:disconnect', () => {
  if (nmeaService) nmeaService.disconnect();
  boatDataFeed.clear();
});

ipcMain.handle('hw:list-ports', async () => {
  if (!nmeaService) return [];
  try {
    return await nmeaService.listPorts();
  } catch (error) {
    log.error('[NMEA] No se pudo listar los puertos serie:', error);
    return [];
  }
});

ipcMain.handle('hw:get-status', () => (nmeaService ? nmeaService.getStatus() : null));

ipcMain.handle('ais:get-connections', event => {
  if (!mainWindow ||
      mainWindow.isDestroyed() ||
      event.sender !== mainWindow.webContents ||
      event.senderFrame !== mainWindow.webContents.mainFrame) {
    throw new Error('UNAUTHORIZED');
  }

  return getAISConnections();
});
ipcMain.handle('ais:set-connection', (event, source, enabled) => {
  if (!mainWindow ||
      mainWindow.isDestroyed() ||
      event.sender !== mainWindow.webContents ||
      event.senderFrame !== mainWindow.webContents.mainFrame) {
    throw new Error('UNAUTHORIZED');
  }

  return setAISConnection(mainWindow, aisApiKey, source, enabled);
});

function configureAISCredential(key) {
  disconnectAIS();
  aisApiKey = key;

  if (mainWindow && !mainWindow.isDestroyed()) {
    connectAISIfAvailable(mainWindow);
  }
}

// === EVENTOS DE CICLO DE VIDA DE LA APP ===

app.whenReady().then(async () => {
    if (!gotSingleInstanceLock) return;
    registerOpenAICredentials({ app, ipcMain, dialog, safeStorage, getWindow: () => mainWindow, configure: configureOpenAIKey, getStatus: getOpenAIStatus });
    setupAutoUpdater();

    require('./map-server').configureDesktopAuthentication(
      desktopLocalToken
    );

    const localServer = startMapServer(8089);

    try {
      if (!localServer.listening) {
        await new Promise((resolve, reject) => {
          localServer.once('listening', resolve);
          localServer.once('error', reject);
        });
      }
    } catch {
      dialog.showErrorBox(
        'GAULOS - Servidor local',
        'No se pudo iniciar el servidor local en el puerto 8089. Compruebe que no existe otra aplicacion utilizando este puerto.'
      );

      app.exit(1);
      return;
    }

    createWindow();

    require('./updater/aisCredentials').registerAISCredentials({
      app,
      ipcMain,
      dialog,
      safeStorage,
      getWindow: () => mainWindow,
      configure: configureAISCredential,
      getStatus: getAISConnections,
    });

      if (!app.isPackaged) {
  globalShortcut.register("CommandOrControl+Shift+I", () => {

    if (!mainWindow) return;

    if (mainWindow.webContents.isDevToolsOpened()) {
      mainWindow.webContents.closeDevTools();
    } else {
      mainWindow.webContents.openDevTools({
        mode: "left",
      });
    }

  });
}

  initializeServices(mainWindow);

  // GAULOS Link: enlace local con GAULOSdroid (desactivado hasta que el usuario lo active).
  try {
    gaulosLink = initGaulosLink({ app, ipcMain, safeStorage, getWindow: () => mainWindow, log });
  } catch (error) {
    log.error('[GAULOS Link] No se pudo inicializar:', error);
  }
  // BOAT_DATA: una vez por segundo, solo a sesiones con boat.v1 (lo decide el servidor del enlace).
  if (!boatDataTimer) {
    boatDataTimer = setInterval(() => {
      if (!gaulosLink || !gaulosLink.server) return;
      const payload = boatDataFeed.payload();
      if (payload) gaulosLink.server.publishBoatData(payload);
    }, 1000);
  }
  createTray();


    if (aisApiKey) {
      connectAISIfAvailable(mainWindow);

    }
});

app.on('window-all-closed', () => {
  // La ventana se oculta al cerrarla (bandeja): solo se termina tras «Salir».
  if (process.platform !== 'darwin' && closeBehavior.shouldQuitWhenAllWindowsClosed()) app.quit();
});

app.on('before-quit', () => {
  disconnectAIS();
  antaresClient.disconnect();
  closeBehavior.markQuitting();
  stopMapServer();
  if (nmeaService) nmeaService.disconnect();
  if (boatDataTimer) clearInterval(boatDataTimer);
  boatDataTimer = null;
  if (gaulosLink) gaulosLink.shutdown().catch(() => {});
});

app.on('activate', () => {
  showMainWindow();
});
app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
