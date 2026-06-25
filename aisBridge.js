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

console.log(
  'AIS KEY PRESENTE:',
  !!process.env.VITE_AISSTREAM_API_KEY
);

console.log(
  'LONGITUD KEY:',
  process.env.VITE_AISSTREAM_API_KEY?.length
);

function connectAIS(mainWindow, apiKey) {
  if (socket) return;

  console.log('[AIS] Iniciando conexión...');

  socket = new WebSocket('wss://stream.aisstream.io/v0/stream');

  socket.on('open', () => {

  console.log('[AIS] Conectado');

  const payload = {
    APIKey: apiKey,
    BoundingBoxes: AIS_PROFILES[ACTIVE_PROFILE]
  };

  console.log(
    '📡 SUSCRIPCION AIS JSON:',
    JSON.stringify(payload)
  );

  socket.send(JSON.stringify(payload));
  setTimeout(() => {
    
  console.log(
    '⏱️ SIGUE CONECTADO TRAS 30s:',
    socket.readyState
  );
}, 30000);
});

  socket.on('message', (data) => {
  // console.log('🚢 AISSTREAM MENSAJE RECIBIDO');
  //console.log(data.toString().substring(0, 300));
  //console.log(
   //  '🚢 MENSAJE AISSTREAM'
  // );

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