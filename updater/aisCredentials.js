'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const dotenv = require('dotenv');

function createAISCredentialStore(filename, crypto) {
  const available = () =>
    crypto.isEncryptionAvailable() &&
    (!crypto.getSelectedStorageBackend ||
      crypto.getSelectedStorageBackend() !== 'basic_text');

  function validate(value) {
    if (
      typeof value !== 'string' ||
      value.length < 16 ||
      value.length > 512 ||
      /\s/.test(value)
    ) {
      throw new Error('INVALID_AIS_CREDENTIAL');
    }

    return value;
  }

  return {
    available,

    load() {
      if (!fs.existsSync(filename)) return null;
      if (!available()) throw new Error('ENCRYPTION_UNAVAILABLE');

      return validate(
        crypto.decryptString(fs.readFileSync(filename))
      );
    },

    save(value) {
      if (!available()) throw new Error('ENCRYPTION_UNAVAILABLE');

      const encrypted = crypto.encryptString(validate(value));
      const temporary = `${filename}.${randomUUID()}.tmp`;

      try {
        fs.writeFileSync(temporary, encrypted, {
          mode: 0o600,
          flag: 'wx',
        });

        fs.renameSync(temporary, filename);
      } finally {
        fs.rmSync(temporary, { force: true });
      }
    },

    remove() {
      fs.rmSync(filename, { force: true });
    },
  };
}

function registerAISCredentials({
  app,
  ipcMain,
  dialog,
  safeStorage,
  getWindow,
  configure,
  getStatus,
}) {
  const store = createAISCredentialStore(
    path.join(app.getPath('userData'), 'aisstream-credential.bin'),
    safeStorage
  );

  let configured = false;
  let busy = false;

  const trusted = event => {
    const win = getWindow();

    return !!win &&
      !win.isDestroyed() &&
      event.sender === win.webContents &&
      event.senderFrame === win.webContents.mainFrame;
  };

  try {
    const key = store.load();

    if (key) {
      configure(key);
      configured = true;
    }
  } catch {
    console.warn('[AIS] No se pudo cargar la credencial cifrada.');
  }

  const status = () => ({
    ...getStatus(),
    credentialConfigured: configured,
    encryptionAvailable: store.available(),
  });

  ipcMain.handle('ais:credential-status', event => {
    if (!trusted(event)) throw new Error('UNAUTHORIZED');
    return status();
  });

  ipcMain.handle('ais:import-credential', async event => {
    if (!trusted(event)) throw new Error('UNAUTHORIZED');
    if (busy) throw new Error('OPERATION_IN_PROGRESS');
    if (!store.available()) throw new Error('ENCRYPTION_UNAVAILABLE');

    busy = true;

    try {
      const result = await dialog.showOpenDialog(getWindow(), {
        title: 'Importar credencial personal AISStream',
        properties: ['openFile'],
        filters: [
          { name: 'Configuracion local', extensions: ['env', 'txt', '*'] },
        ],
      });

      if (result.canceled || result.filePaths.length !== 1) {
        return status();
      }

      if (!trusted(event)) throw new Error('UNAUTHORIZED');

      const filename = result.filePaths[0];
      const stat = fs.statSync(filename);

      if (!stat.isFile() || stat.size > 65536) {
        throw new Error('INVALID_FILE');
      }

      const values = dotenv.parse(fs.readFileSync(filename));

      const key = (
        values.AISSTREAM_API_KEY ||
        values.VITE_AISSTREAM_API_KEY ||
        ''
      ).trim();

      store.save(key);
      configure(key);
      configured = true;

      return status();
    } catch {
      throw new Error('AIS_CREDENTIAL_IMPORT_FAILED');
    } finally {
      busy = false;
    }
  });

  ipcMain.handle('ais:remove-credential', async event => {
    if (!trusted(event)) throw new Error('UNAUTHORIZED');
    if (busy) throw new Error('OPERATION_IN_PROGRESS');

    busy = true;

    try {
      const result = await dialog.showMessageBox(getWindow(), {
        type: 'warning',
        title: 'AISStream',
        message: 'Eliminar la credencial AISStream de este equipo?',
        detail: 'La recepcion AIS por NMEA no se vera afectada.',
        buttons: ['Cancelar', 'Eliminar'],
        defaultId: 0,
        cancelId: 0,
      });

      if (result.response !== 1) return status();
      if (!trusted(event)) throw new Error('UNAUTHORIZED');

      store.remove();
      configure(null);
      configured = false;

      return status();
    } catch {
      throw new Error('AIS_CREDENTIAL_REMOVE_FAILED');
    } finally {
      busy = false;
    }
  });
}

module.exports = {
  createAISCredentialStore,
  registerAISCredentials,
};