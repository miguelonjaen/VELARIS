const WebSocket = require('ws');
const ACTIVE_PROFILE = 'SPAIN';
const AIS_PROFILES = {
  LOCAL: [
    [
      [35.5, -5.0],
      [37.5, -2.0]
    ]
  ],

  SPAIN: [
    [
      [27.0, -19.0],
      [44.0, 5.0]
    ]
  ],

  MEDITERRANEAN: [
    [
      [35.0, -6.0],
      [44.0, 15.0]
    ]
  ]
};

let socket = null;

function connectAIS(mainWindow, apiKey) {
  if (socket) return;

  const log = require("electron-log");

log.info("[AIS] Iniciando conexión...");

  socket = new WebSocket('wss://stream.aisstream.io/v0/stream');

  socket.on('open', () => {

  const log = require("electron-log");
  log.info("[AIS] connectAIS() llamado");

log.info("[AIS] conectado...");


  const payload = {
    APIKey: apiKey,
    BoundingBoxes: AIS_PROFILES[ACTIVE_PROFILE]
  };

  
  socket.send(JSON.stringify(payload));
  setTimeout(() => {
    
  
}, 30000);
});

  socket.on('message', (data) => {
    
  
  try {
    const msg = JSON.parse(data.toString());

   if (!mainWindow.isDestroyed()) {
    mainWindow.webContents.send("ais-message", msg);
}
  } catch (err) {
    console.error('[AIS] Parse Error', err);
  }
});
  socket.on('close', (code, reason) => {
  console.error(
    '❌ AIS CERRADO:',
    code,
    reason?.toString()
  );
});

socket.on('error', (err) => {
  console.error(
    '❌ AIS ERROR:',
    err
  );
});

  socket.on('error', (err) => {
  console.error('❌ AIS ERROR COMPLETO:', err);
});

socket.on('close', (code, reason) => {
  console.error(
    '❌ AIS CERRADO:',
    code,
    reason?.toString()
  );
});
}

module.exports = {
  connectAIS
};