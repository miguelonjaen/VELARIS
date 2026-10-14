'use strict';

/**
 * Servidor VELARIS Link real para la prueba extremo a extremo con el cliente Kotlin de VELARISdroid
 * (VELARISdroid: LinkInteropTest). Lo lanza el propio test de Android con `node`.
 *
 *   node link/test/e2e-server.js <puerto> <deviceId> <token> <archivoEstado>
 *
 * Escucha solo en 127.0.0.1, con un dispositivo ya vinculado, y escribe en <archivoEstado> lo que
 * tiene guardado cada vez que cambia. Termina al cerrarse su entrada estándar.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { LinkStore } = require('../linkStore');
const { LinkServer } = require('../linkServer');

const [port, deviceId, token, stateFile] = process.argv.slice(2);
if (!port || !deviceId || !token || !stateFile) {
  console.error('uso: e2e-server.js <puerto> <deviceId> <token> <archivoEstado>');
  process.exit(2);
}

const secretBox = {
  isAvailable: () => true,
  encrypt: (s) => Buffer.from(s, 'utf8').toString('base64'),
  decrypt: (s) => Buffer.from(s, 'base64').toString('utf8')
};

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'velaris-link-e2e-'));
const store = new LinkStore({ dir, secretBox, defaultName: 'VELARIS · E2E' }).init();
store.addDevice({ deviceId, name: 'VELARISdroid (prueba)', platform: 'android' }, token);
const server = new LinkServer({ store, port: Number(port), enableDiscovery: false, networkInterfaces: () => ({}) });

let positions = 0;
const writeState = () => {
  const state = {
    desktopId: store.identity.desktopId,
    tracks: store.listTracks(),
    events: store.listEvents().map((e) => ({ eventId: e.eventId, kind: e.kind, trackId: e.trackId })),
    positions,
    connections: server.getStatus().connections.length
  };
  fs.writeFileSync(`${stateFile}.tmp`, JSON.stringify(state));
  fs.renameSync(`${stateFile}.tmp`, stateFile);
};

server.on('trackPoints', writeState);
server.on('track', writeState);
server.on('logEvent', writeState);
server.on('status', writeState);
server.on('position', () => { positions++; writeState(); });

server.setEnabled(true).then(() => {
  writeState();
  process.stdout.write(`READY ${store.identity.desktopId}\n`);
});

const shutdown = () => server.stop().finally(() => process.exit(0));
process.stdin.on('end', shutdown);
process.stdin.on('close', shutdown);
process.stdin.resume();
process.on('SIGTERM', shutdown);
