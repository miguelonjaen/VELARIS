'use strict';

/**
 * Controlador del actualizador de GAULOS (proceso principal).
 *
 * Política (1.4.1):
 * - Nunca se descarga ni se instala nada sin autorización explícita del usuario.
 * - autoDownload = false y autoInstallOnAppQuit = false: cerrar la ventana, salir o
 *   reiniciar Electron NUNCA autoriza una instalación.
 * - «Más tarde» pospone esa versión durante la sesión (sin volver a avisar
 *   automáticamente); una comprobación manual posterior vuelve a ofrecerla.
 * - «Actualizar ahora» pide una segunda confirmación; solo entonces se descarga.
 *   Al terminar la descarga (y verificarse su integridad sha512) se instala y reinicia.
 * - Errores de red, de descarga o de integridad devuelven el estado a «inactivo» y
 *   la aplicación sigue funcionando.
 *
 * Las dependencias se inyectan para poder probar el flujo real sin GitHub.
 */

const STATES = Object.freeze({
  IDLE: 'idle',
  CHECKING: 'checking',
  AWAITING_DECISION: 'awaiting-decision',
  DOWNLOADING: 'downloading',
  INSTALLING: 'installing',
});

function createUpdateController({ autoUpdater, showMessageBox, getWindow, log, appVersion }) {
  if (!autoUpdater) throw new Error('autoUpdater requerido');

  // Ninguna acción implícita del actualizador.
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  // Sin instalador web (GAULOS publica el instalador completo); evita el aviso de electron-updater.
  autoUpdater.disableWebInstaller = true;

  let state = STATES.IDLE;
  let availableVersion = null;
  let authorizedVersion = null;
  let manualCheck = false;
  const postponedVersions = new Set();

  const send = (channel, payload) => {
    try {
      const win = getWindow && getWindow();
      if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
    } catch (error) {
      log.warn('[Updater] No se pudo notificar al renderer:', error);
    }
  };

  const setState = (next) => {
    log.info(`[Updater] estado ${state} -> ${next}`);
    state = next;
  };

  const resetAfterFailure = () => {
    authorizedVersion = null;
    setState(STATES.IDLE);
  };

  async function ask(options) {
    const win = getWindow && getWindow();
    const result = await showMessageBox(win && !win.isDestroyed() ? win : undefined, options);
    return result.response;
  }

  async function offerUpdate(info) {
    setState(STATES.AWAITING_DECISION);
    const choice = await ask({
      type: 'info',
      title: 'Actualización disponible',
      message: `Hay una nueva versión de GAULOS: ${info.version}`,
      detail: `Versión instalada: ${appVersion}.\nNo se descargará ni instalará nada sin su confirmación.`,
      buttons: ['Actualizar ahora', 'Más tarde'],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });

    if (choice !== 0) {
      postponedVersions.add(info.version);
      log.info(`[Updater] Usuario pospone ${info.version}; no se instalará al cerrar.`);
      setState(STATES.IDLE);
      return 'postponed';
    }

    const confirm = await ask({
      type: 'question',
      title: 'Confirmar actualización',
      message: `¿Descargar e instalar GAULOS ${info.version}?`,
      detail: 'Al terminar la descarga, GAULOS se cerrará para instalar la nueva versión y se volverá a abrir.',
      buttons: ['Descargar e instalar', 'Cancelar'],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });

    if (confirm !== 0) {
      postponedVersions.add(info.version);
      log.info(`[Updater] Usuario cancela la confirmación de ${info.version}.`);
      setState(STATES.IDLE);
      return 'cancelled';
    }

    authorizedVersion = info.version;
    setState(STATES.DOWNLOADING);
    try {
      await autoUpdater.downloadUpdate();
      return 'downloading';
    } catch (error) {
      // El evento 'error' también se emite; aquí solo garantizamos un estado coherente.
      log.error('[Updater] Descarga fallida:', error);
      resetAfterFailure();
      return 'download-failed';
    }
  }

  autoUpdater.on('checking-for-update', () => log.info('[Updater] Comprobando actualizaciones...'));

  autoUpdater.on('update-not-available', async (info) => {
    log.info('[Updater] Sin actualizaciones:', info && info.version);
    const wasManual = manualCheck;
    manualCheck = false;
    if (state === STATES.CHECKING) setState(STATES.IDLE);
    if (wasManual) {
      await ask({ type: 'info', title: 'GAULOS', message: 'GAULOS está actualizado.', detail: `Versión instalada: ${appVersion}.`, buttons: ['Aceptar'], noLink: true });
    }
  });

  autoUpdater.on('update-available', async (info) => {
    availableVersion = info.version;
    send('update-available', { version: info.version });
    const wasManual = manualCheck;
    manualCheck = false;
    if (state !== STATES.CHECKING && state !== STATES.IDLE) return;
    if (postponedVersions.has(info.version) && !wasManual) {
      log.info(`[Updater] ${info.version} pospuesta en esta sesión; sin nuevo aviso.`);
      setState(STATES.IDLE);
      return;
    }
    await offerUpdate(info);
  });

  autoUpdater.on('download-progress', (progress) => send('download-progress', progress));

  autoUpdater.on('update-downloaded', (info) => {
    send('update-downloaded', { version: info.version });
    if (!authorizedVersion || info.version !== authorizedVersion) {
      // Descarga no autorizada (p. ej. caché previa): no se instala ni ahora ni al salir.
      log.warn(`[Updater] Descarga de ${info.version} sin autorización vigente; se ignora.`);
      if (state === STATES.DOWNLOADING) setState(STATES.IDLE);
      return;
    }
    setState(STATES.INSTALLING);
    log.info(`[Updater] Instalando ${info.version} por autorización explícita.`);
    autoUpdater.quitAndInstall(false, true);
  });

  autoUpdater.on('error', async (error) => {
    const message = error && error.message ? error.message : String(error);
    log.error('[Updater] Error:', message);
    send('update-error', { message });
    const wasDownloading = state === STATES.DOWNLOADING;
    const wasManual = manualCheck;
    manualCheck = false;
    resetAfterFailure();
    if (wasDownloading || wasManual) {
      await ask({
        type: 'warning',
        title: 'Actualización no completada',
        message: wasDownloading ? 'No se pudo descargar o verificar la actualización.' : 'No se pudo comprobar si hay actualizaciones.',
        detail: 'GAULOS sigue funcionando con la versión instalada. Puede volver a intentarlo más tarde.',
        buttons: ['Aceptar'],
        noLink: true,
      });
    }
  });

  async function check({ manual = false } = {}) {
    if (state !== STATES.IDLE) {
      log.info(`[Updater] Comprobación ignorada: estado ${state}.`);
      return { started: false, state };
    }
    manualCheck = manual;
    setState(STATES.CHECKING);
    try {
      await autoUpdater.checkForUpdates();
      return { started: true, state };
    } catch (error) {
      // El evento 'error' gestiona el aviso; la app sigue utilizable sin servidor.
      log.warn('[Updater] La comprobación no pudo completarse:', error && error.message);
      if (state === STATES.CHECKING) resetAfterFailure();
      return { started: false, state, error: error && error.message };
    }
  }

  /** Solo instala si existe una autorización explícita y la descarga ya terminó. */
  function installIfAuthorized() {
    if (state === STATES.INSTALLING) return true;
    log.warn('[Updater] install-update solicitado sin autorización/descarga completa; se ignora.');
    return false;
  }

  return {
    check,
    installIfAuthorized,
    getState: () => ({ state, availableVersion, authorizedVersion, postponed: [...postponedVersions] }),
    STATES,
  };
}

module.exports = { createUpdateController, STATES };
