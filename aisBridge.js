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
let nmeaEnabled = true;
let streamEnabled = true;
let streamStatus = 'disconnected';
let statusWindow = null;
function getAISConnections() { return { streamEnabled, streamStatus, nmeaEnabled }; }
function publishStatus() {
  if (statusWindow && !statusWindow.isDestroyed()) statusWindow.webContents.send('ais:status', getAISConnections());
}
function disconnectAIS() {
  const previous = socket;
  socket = null; // Reject queued messages and late events from the previous connection.
  if (previous) previous.terminate();
  streamStatus = 'disconnected';
  publishStatus();
}
function connectAIS(mainWindow, apiKey) {
  statusWindow = mainWindow;
  if (!streamEnabled || socket) return;
  if (!apiKey) { streamStatus = 'missing-key'; publishStatus(); return; }
  streamStatus = 'connecting';
  publishStatus();
  const current = new WebSocket('wss://stream.aisstream.io/v0/stream');
  socket = current;
  current.on('open', () => {
    if (socket !== current) return;
    current.send(JSON.stringify({ APIKey: apiKey, BoundingBoxes: AIS_PROFILES[ACTIVE_PROFILE] }));
    // Wait for a valid provider message before reporting connected.
  });
  current.on('message', data => {
    if (socket !== current || !streamEnabled || mainWindow.isDestroyed()) return;
    try {
      const message = JSON.parse(data.toString());

      if (!message || typeof message !== 'object') return;

      if (message.error || message.Error) {
        streamStatus = 'error';
        publishStatus();
        current.close();
        return;
      }

      if (!message.MessageType && !message.Message?.MessageType) return;

      if (streamStatus !== 'connected') {
        streamStatus = 'connected';
        publishStatus();
      }

      mainWindow.webContents.send('ais-message', message);
    }
    catch { console.warn('[AIS] Mensaje JSON inválido'); }
  });
  current.on('error', () => {
    if (socket !== current) return;
    streamStatus = 'error';
    publishStatus();
  });
  current.on('close', () => {
    if (socket !== current) return;
    socket = null;
    if (streamStatus !== 'error') streamStatus = 'disconnected';
    publishStatus();
  });
}
function setAISConnection(mainWindow, apiKey, source, enabled) {
  if (typeof enabled !== 'boolean' || !['stream', 'nmea'].includes(source)) throw new Error('Control AIS inválido');
  statusWindow = mainWindow;
  if (source === 'nmea') nmeaEnabled = enabled;
  else {
    streamEnabled = enabled;
    if (enabled) connectAIS(mainWindow, apiKey);
    else disconnectAIS();
  }
  publishStatus();
  return getAISConnections();
}
// Only AIS is gated. The shared serial/TCP connection and all instruments stay active.
function shouldForwardNmea(message) { return nmeaEnabled || message.type !== 'AIS'; }
module.exports = { connectAIS, disconnectAIS, getAISConnections, setAISConnection, shouldForwardNmea };
