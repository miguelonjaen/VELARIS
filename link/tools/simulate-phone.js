'use strict';

/**
 * Simulador de VELARISdroid para probar VELARIS Desktop sin teléfono.
 * Los datos se marcan como SIMULADOS (src = "simulation"); Desktop los muestra como tales.
 *
 *   node link/tools/simulate-phone.js <códigoDe6Dígitos> [host=127.0.0.1] [puerto=47811] [segundos=60]
 *
 * Secuencia: vincula con el código (hay que pulsar Aceptar en Desktop), inicia un track, envía un
 * punto por segundo, corta la conexión 10 s a mitad del paseo (sigue «grabando»), reconecta,
 * recupera lo pendiente desde el último punto confirmado y finaliza el track.
 */

const crypto = require('crypto');
const WebSocket = require('ws');
const protocol = require('../protocol');

const [code, host = '127.0.0.1', portArg = '47811', secondsArg = '60'] = process.argv.slice(2);
if (!/^[0-9]{6}$/.test(code || '')) {
  console.error('uso: node link/tools/simulate-phone.js <código> [host] [puerto] [segundos]');
  process.exit(2);
}
const port = Number(portArg);
const seconds = Number(secondsArg);
const deviceId = crypto.randomUUID();
const deviceName = 'Simulador VELARISdroid';
const trackId = crypto.randomUUID();
const startedAt = Date.now();
const SRC = 'simulation';

/** Diario local del «teléfono»: nunca se borra; el escritorio confirma hasta `acked`. */
const points = [];
const events = [];
let acked = 0;
let metaRev = 1;
let state = 'RECORDING';
let token = null;
let ws = null;
let connected = false;

const log = (m) => console.log(`[${new Date().toLocaleTimeString('es-ES')}] ${m}`);
const send = (type, payload, opts = {}) => {
  if (!ws || ws.readyState !== WebSocket.OPEN) return null;
  const message = protocol.createMessage(type, deviceId, payload, opts);
  ws.send(JSON.stringify(message));
  return message;
};
const meta = () => ({
  rev: metaRev, name: 'Paseo simulado', state, startedAt, endedAt: state === 'FINISHED' ? Date.now() : null,
  lastSeq: points.length, source: SRC, deviceName, distanceNm: points.length * 0.0007, durationMs: Date.now() - startedAt
});
const event = (kind, title, text) => {
  const last = points[points.length - 1];
  events.push({ eventId: crypto.randomUUID(), trackId, kind, auto: true, at: Date.now(), lat: last ? last.lat : null, lon: last ? last.lon : null, title, text, data: {} });
};

/** Envía todo lo que el escritorio aún no ha confirmado (como LinkSyncEngine). */
function pump() {
  if (!connected) return;
  const type = state === 'FINISHED' ? 'TRACK_END' : metaRev === 1 ? 'TRACK_START' : 'TRACK_UPDATE';
  send(type, meta(), { sid: trackId, ack: true });
  for (let i = acked; i < points.length; i += 100) {
    send('TRACK_POINTS', { points: points.slice(i, i + 100) }, { sid: trackId, ack: true });
  }
  for (const e of events.filter((x) => !x.sent)) send('LOG_EVENT', e, { sid: trackId, ack: true });
}

function connect(pairCode) {
  ws = new WebSocket(`ws://${host}:${port}`);
  ws.on('open', () => send('HELLO', { deviceName, platform: 'simulator', app: 'simulate-phone.js', versions: [1], caps: protocol.CAPABILITIES, paired: !!token }));
  ws.on('message', (data) => {
    const result = protocol.validateMessage(JSON.parse(data.toString()));
    if (!result.ok) return log(`mensaje inválido: ${result.code}`);
    const m = result.value;
    if (m.type === 'CHALLENGE') {
      ws.nonce = m.payload.nonce;
      ws.desktopId = m.payload.desktopId;
      if (token) send('AUTH', { proof: protocol.computeProof(token, ws.nonce, ws.desktopId, deviceId) });
      else send('PAIR_REQUEST', { code: pairCode, deviceName, platform: 'simulator' });
    } else if (m.type === 'PAIR_PENDING') {
      log('Esperando a que aceptes el dispositivo en VELARIS Desktop…');
    } else if (m.type === 'PAIR_RESULT') {
      if (!m.payload.accepted) { log('Vinculación rechazada'); process.exit(1); }
      token = m.payload.token;
      log(`Vinculado con ${m.payload.desktopName}`);
      send('AUTH', { proof: protocol.computeProof(token, ws.nonce, ws.desktopId, deviceId) });
    } else if (m.type === 'WELCOME') {
      connected = true;
      log(`Conectado (sesión ${m.payload.sessionId.slice(0, 8)})`);
      send('SYNC_REQUEST', { tracks: [trackId] });
    } else if (m.type === 'SYNC_STATE') {
      const t = m.payload.tracks[0];
      acked = t && t.known ? t.seq : 0;
      for (const e of events) e.sent = t ? t.events.includes(e.eventId) : false;
      log(`El escritorio tiene ${acked} de ${points.length} puntos: se reenvía desde el ${acked + 1}`);
      pump();
    } else if (m.type === 'ACK') {
      if (typeof m.payload.seq === 'number') acked = Math.max(acked, m.payload.seq);
      for (const id of m.payload.events) { const e = events.find((x) => x.eventId === id); if (e) e.sent = true; }
    } else if (m.type === 'ERROR') {
      log(`ERROR ${m.payload.code}: ${m.payload.message}`);
      if (m.payload.fatal) process.exit(1);
    }
  });
  ws.on('close', () => { connected = false; log('Conexión cerrada'); });
  ws.on('error', (e) => log(`Error de conexión: ${e.message}`));
}

// Paseo: rectángulo alrededor de un punto de Motril, 1 punto por segundo (~1,4 m/s).
const origin = { lat: 36.7210, lon: -3.5215 };
let tick = 0;
let dropped = false;
event('TRACK_STARTED', 'Inicio de track', 'Track «Paseo simulado» iniciado en el simulador');
connect(code);

const timer = setInterval(() => {
  if (!token) return; // sin vincular todavía: el reloj del paseo no empieza
  tick++;
  const leg = Math.floor(tick / 15) % 4;
  const step = (tick % 15) * 0.00012;
  const offsets = [[step, 0], [0.0018, step], [0.0018 - step, 0.0018], [0, 0.0018 - step]][leg];
  const point = {
    seq: points.length + 1, t: Date.now(), lat: origin.lat + offsets[0], lon: origin.lon + offsets[1],
    acc: 4 + (tick % 3), sog: 2.7, cog: [0, 90, 180, 270][leg], hdg: null, src: SRC
  };
  points.push(point);
  if (connected) {
    send('POSITION', { trackId, fix: { t: point.t, lat: point.lat, lon: point.lon, acc: point.acc, sog: point.sog, cog: point.cog, hdg: null, src: SRC } });
    pump();
  }
  if (tick === Math.floor(seconds / 2) && !dropped) {
    dropped = true;
    log('Simulando pérdida de Wi-Fi durante 10 s (el «teléfono» sigue grabando)…');
    ws.terminate();
    setTimeout(() => { log('Reconectando…'); connect(code); }, 10000);
  }
  if (tick >= seconds) {
    clearInterval(timer);
    state = 'FINISHED';
    metaRev = 3;
    event('TRACK_FINISHED', 'Fin de track', `Track «Paseo simulado» finalizado: ${points.length} puntos`);
    pump();
    setTimeout(() => {
      log(`Fin. Puntos grabados: ${points.length} · confirmados por el escritorio: ${acked}`);
      send('BYE', { reason: 'USER_DISCONNECT' });
      process.exit(acked === points.length ? 0 : 1);
    }, 3000);
  }
}, 1000);
