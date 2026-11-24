'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const dotenv = require('dotenv');

/** The secret is never returned over IPC. Saving requires a native user file selection. */
function createCredentialStore(filename, crypto) {
  const available = () => crypto.isEncryptionAvailable() && (!crypto.getSelectedStorageBackend || crypto.getSelectedStorageBackend() !== 'basic_text');
  return {
    available,
    load() {
      if (!fs.existsSync(filename)) return null;
      if (!available()) throw new Error('El cifrado del sistema no está disponible.');
      return crypto.decryptString(fs.readFileSync(filename));
    },
    save(key) {
      if (!available()) throw new Error('El cifrado del sistema no está disponible.');
      if (typeof key !== 'string' || key.length < 20 || key.length > 512 || /\s/.test(key)) throw new Error('La clave OpenAI no tiene un formato válido.');
      const encrypted = crypto.encryptString(key);
      const temporary = `${filename}.${randomUUID()}.tmp`;
      fs.writeFileSync(temporary, encrypted, { mode: 0o600, flag: 'wx' });
      fs.renameSync(temporary, filename);
    }
  };
}

function registerOpenAICredentials({ app, ipcMain, dialog, safeStorage, getWindow, configure, getStatus }) {
  const store = createCredentialStore(path.join(app.getPath('userData'), 'openai-credential.bin'), safeStorage);
  let source = getStatus().configured ? 'environment' : 'none';
  let warning = null;
  try {
    const key = store.load();
    if (key) { configure(key); source = 'encrypted-profile'; }
  } catch { warning = 'No se pudo abrir la clave cifrada. Vuelva a importarla en este equipo.'; }
  const status = () => ({ ...getStatus(), source, encryptionAvailable: store.available(), warning });
  const trusted = event => {
    const window = getWindow();
    return !!window && !window.isDestroyed() && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame;
  };
  ipcMain.handle('ai:status', event => {
    if (!trusted(event)) return { ok: false, error: 'Solicitud no autorizada.' };
    return { ok: true, status: status() };
  });
  let importing = false;
  ipcMain.handle('ai:import-env', async event => {
    if (!trusted(event)) return { ok: false, error: 'Solicitud no autorizada.' };
    if (importing) return { ok: false, error: 'Ya hay una importación en curso.' };
    if (!store.available()) return { ok: false, error: 'No hay cifrado seguro disponible en este equipo.' };
    importing = true;
    try {
      const result = await dialog.showOpenDialog(getWindow(), { title: 'Importar clave OpenAI desde .env', properties: ['openFile'], filters: [{ name: 'Configuración local', extensions: ['env', '*'] }] });
      if (result.canceled || result.filePaths.length !== 1) return { ok: true, canceled: true, status: status() };
      const filename = result.filePaths[0];
      if (!fs.statSync(filename).isFile() || fs.statSync(filename).size > 64 * 1024) return { ok: false, error: 'El archivo no es una configuración válida (máximo 64 KB).' };
      const key = dotenv.parse(fs.readFileSync(filename)).OPENAI_API_KEY?.trim();
      if (!key) return { ok: false, error: 'El archivo seleccionado no declara OPENAI_API_KEY.' };
      store.save(key);
      configure(key);
      source = 'encrypted-profile'; warning = null;
      return { ok: true, status: status() };
    } catch { return { ok: false, error: 'No se pudo importar la clave OpenAI. Compruebe el archivo y el cifrado del sistema.' }; }
    finally { importing = false; }
  });
}
module.exports = { createCredentialStore, registerOpenAICredentials };
