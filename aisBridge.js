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

  console.log('[AIS] Iniciando conexión...');

  socket = new WebSocket('wss://stream.aisstream.io/v0/stream');

  socket.on('open', () => {
    console.log('[AIS] Conectado');

    socket.send(
      JSON.stringify({
        APIKey: apiKey,
        BoundingBoxes: AIS_PROFILES[ACTIVE_PROFILE]    })
    );
  });

  socket.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());

      mainWindow.webContents.send(
        'ais-message',
        msg
      );
    } catch (err) {
      console.error('[AIS] Parse Error', err);
    }
  });

  socket.on('close', (event) => {
    console.log('[AIS] Cerrado', event);
  });

  socket.on('error', (err) => {
    console.error('[AIS] Error', err);
  });
}

module.exports = {
  connectAIS
};