'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { LinkStore } = require('../linkStore');
const { LinkServer, classifyOrigin, selectBindAddresses, isPrivateIPv4, isOverlayIPv4, overlayAddresses, broadcastAddress } = require('../linkServer');
const { TestClient, point, meta } = require('./helpers');

const DEVICE = 'a9e2d001-0000-4000-8000-000000000002';
const INTRUDER = 'c0ffee00-0000-4000-8000-000000000009';
const TRACK = '5b1f6c2e-3d4a-4b5c-8d6e-7f8091a2b3c4';

const fakeBox = {
  isAvailable: () => true,
  encrypt: (s) => Buffer.from(`enc:${s}`).toString('base64'),
  decrypt: (s) => Buffer.from(s, 'base64').toString().replace(/^enc:/, '')
};

let nextPort = 46000 + Math.floor(Math.random() * 3000);

async function startServer(dir = fs.mkdtempSync(path.join(os.tmpdir(), 'velaris-link-srv-')), extra = {}) {
  const store = new LinkStore({ dir, secretBox: fakeBox }).init();
  const port = nextPort++;
  const server = new LinkServer({ store, port, enableDiscovery: false, networkInterfaces: () => ({}), ...extra });
  await server.setEnabled(true);
  return { server, store, port, dir };
}

/** Empareja DEVICE y devuelve un cliente autenticado más el token. */
async function pairDevice(server, port, deviceId = DEVICE, name = 'Pixel 7') {
  const { code } = server.startPairing();
  const client = new TestClient(port, deviceId, name);
  await client.connect();
  const challenge = await client.hello(false);
  assert.equal(challenge.payload.pairing, true);
  const requested = new Promise((resolve) => server.once('pairingRequest', resolve));
  client.send('PAIR_REQUEST', { code, deviceName: name, platform: 'android' });
  await client.waitType('PAIR_PENDING');
  const request = await requested;
  server.approvePairing(request.requestId);
  const result = await client.waitType('PAIR_RESULT');
  assert.equal(result.payload.accepted, true);
  const welcome = await client.auth(result.payload.token);
  assert.equal(welcome.type, 'WELCOME', JSON.stringify(welcome.payload));
  return { client, token: result.payload.token, welcome };
}

test('direcciones de escucha: solo IPv4 privadas y loopback, nunca 0.0.0.0 ni públicas', () => {
  const binds = selectBindAddresses({
    wifi: [{ family: 'IPv4', address: '192.168.1.34', netmask: '255.255.255.0', internal: false }],
    wan: [{ family: 'IPv4', address: '85.10.20.30', netmask: '255.255.255.0', internal: false }],
    v6: [{ family: 'IPv6', address: 'fe80::1', netmask: 'ffff::', internal: false }],
    hyper: [{ family: 'IPv4', address: '172.20.0.1', netmask: '255.255.240.0', internal: false }]
  });
  assert.deepEqual(binds.map((b) => b.address), ['127.0.0.1', '192.168.1.34', '172.20.0.1']);
  assert.equal(broadcastAddress('192.168.1.34', '255.255.255.0'), '192.168.1.255');
  assert.equal(isPrivateIPv4('172.32.0.1'), false);
  assert.equal(isPrivateIPv4('10.0.0.5'), true);
});

test('VPN: 100.64.0.0/10 solo se acepta en una interfaz Tailscale y se anuncia al teléfono', () => {
  const interfaces = {
    Ethernet: [{ family: 'IPv4', address: '192.168.11.173', netmask: '255.255.255.0', internal: false }],
    Tailscale: [{ family: 'IPv4', address: '100.101.102.103', netmask: '255.255.255.255', internal: false }],
    operador: [{ family: 'IPv4', address: '100.70.1.2', netmask: '255.255.255.0', internal: false }]
  };
  const binds = selectBindAddresses(interfaces);
  assert.deepEqual(binds.map((b) => b.address), ['127.0.0.1', '192.168.11.173', '100.101.102.103']);
  assert.equal(binds.find((b) => b.address === '100.101.102.103').broadcast, '');
  assert.deepEqual(overlayAddresses(interfaces), ['100.101.102.103']);
  assert.equal(isOverlayIPv4('100.63.0.1'), false);
  assert.equal(isOverlayIPv4('100.128.0.1'), false);
  assert.equal(isOverlayIPv4('100.64.0.1'), true);
});

test('el WELCOME incluye las direcciones de VPN del PC (altHosts)', async () => {
  const interfaces = { Tailscale: [{ family: 'IPv4', address: '100.101.102.103', netmask: '255.255.255.255', internal: false }] };
  // La interfaz de VPN aparece solo para el WELCOME: el servidor no intenta escuchar en una IP que el PC de pruebas no tiene.
  let current = {};
  const { server, port } = await startServer(undefined, { networkInterfaces: () => current });
  try {
    current = interfaces;
    const { client, welcome } = await pairDevice(server, port);
    assert.deepEqual(welcome.payload.altHosts, ['100.101.102.103']);
    current = {};
    client.close();
  } finally {
    await server.stop();
  }
});

test('emparejamiento con código y aceptación explícita; reconexión con reto-respuesta', async () => {
  const { server, port, store } = await startServer();
  try {
    const { client, token } = await pairDevice(server, port);
    assert.equal(store.listDevices().length, 1);
    assert.equal(server.getStatus().connections.length, 1);
    client.close();
    await client.waitClosed();
    const again = new TestClient(port, DEVICE);
    await again.connect();
    const challenge = await again.hello(true);
    assert.equal(challenge.payload.pairing, false, 'la ventana de vinculación se cerró al usar el código');
    const welcome = await again.auth(token);
    assert.equal(welcome.type, 'WELCOME');
    again.close();
  } finally {
    await server.stop();
  }
});

test('dispositivo no autorizado: prueba falsa y datos sin autenticar se rechazan', async () => {
  const { server, port, store } = await startServer();
  try {
    const intruder = new TestClient(port, INTRUDER, 'Intruso');
    await intruder.connect();
    await intruder.hello(true);
    const error = await intruder.auth('A'.repeat(43));
    assert.equal(error.type, 'ERROR');
    assert.equal(error.payload.code, 'NOT_AUTHORIZED');
    await intruder.waitClosed();

    const sneaky = new TestClient(port, INTRUDER, 'Intruso');
    await sneaky.connect();
    sneaky.send('TRACK_POINTS', { points: [point(1)] }, { sid: TRACK, ack: true });
    const error2 = await sneaky.waitType('ERROR');
    assert.equal(error2.payload.code, 'NOT_AUTHORIZED');
    await sneaky.waitClosed();
    assert.equal(store.listTracks().length, 0, 'no se guardó nada');
  } finally {
    await server.stop();
  }
});

test('código de vinculación incorrecto, ventana cerrada y rechazo explícito', async () => {
  const { server, port, store } = await startServer();
  try {
    // Sin ventana abierta.
    const early = new TestClient(port, DEVICE);
    await early.connect();
    await early.hello(false);
    early.send('PAIR_REQUEST', { code: '123456', deviceName: 'Pixel 7', platform: 'android' });
    assert.equal((await early.waitType('ERROR')).payload.code, 'PAIRING_CLOSED');
    await early.waitClosed();

    const { code } = server.startPairing();
    const wrong = code === '000000' ? '111111' : '000000';
    const guesser = new TestClient(port, DEVICE);
    await guesser.connect();
    await guesser.hello(false);
    guesser.send('PAIR_REQUEST', { code: wrong, deviceName: 'Pixel 7', platform: 'android' });
    const err = await guesser.waitType('ERROR');
    assert.equal(err.payload.code, 'PAIRING_CODE_INVALID');
    assert.equal(err.payload.fatal, false);

    const requested = new Promise((resolve) => server.once('pairingRequest', resolve));
    guesser.send('PAIR_REQUEST', { code, deviceName: 'Pixel 7', platform: 'android' });
    await guesser.waitType('PAIR_PENDING');
    server.rejectPairing((await requested).requestId);
    const result = await guesser.waitType('PAIR_RESULT');
    assert.equal(result.payload.accepted, false);
    await guesser.waitClosed();
    assert.equal(store.listDevices().length, 0);
  } finally {
    await server.stop();
  }
});

test('track completo: inicio, puntos, duplicados, desordenados, eventos y fin con ACK tras guardar', async () => {
  const { server, port, store } = await startServer();
  try {
    const { client } = await pairDevice(server, port);
    const received = [];
    server.on('trackPoints', (u) => received.push(...u.points.map((p) => p.seq)));
    const logEvents = [];
    server.on('logEvent', (e) => logEvents.push(e.eventId));

    const start = client.send('TRACK_START', meta(1, 'RECORDING'), { sid: TRACK, ack: true });
    let ack = await client.waitFor((m) => m.type === 'ACK' && m.payload.ref === start.id);
    assert.equal(ack.payload.metaRev, 1);

    const batch1 = client.send('TRACK_POINTS', { points: [point(1), point(2), point(3)] }, { sid: TRACK, ack: true });
    ack = await client.waitFor((m) => m.type === 'ACK' && m.payload.ref === batch1.id);
    assert.equal(ack.payload.seq, 3);
    assert.equal(store.getTrackPoints(TRACK).length, 3, 'el ACK llega con los puntos ya en disco');

    // Reenvío tras una pérdida de ACK: duplicados.
    const dup = client.send('TRACK_POINTS', { points: [point(2), point(3), point(4)] }, { sid: TRACK, ack: true });
    ack = await client.waitFor((m) => m.type === 'ACK' && m.payload.ref === dup.id);
    assert.equal(ack.payload.seq, 4);

    // Desordenados.
    const late = client.send('TRACK_POINTS', { points: [point(6), point(7)] }, { sid: TRACK, ack: true });
    ack = await client.waitFor((m) => m.type === 'ACK' && m.payload.ref === late.id);
    assert.equal(ack.payload.seq, 4, 'falta el 5: la secuencia contigua no avanza');
    const gap = client.send('TRACK_POINTS', { points: [point(5)] }, { sid: TRACK, ack: true });
    ack = await client.waitFor((m) => m.type === 'ACK' && m.payload.ref === gap.id);
    assert.equal(ack.payload.seq, 7);

    const event = {
      eventId: 'e7c1b2a3-4d5e-4f60-8a1b-2c3d4e5f6a01', trackId: TRACK, kind: 'TRACK_STARTED', auto: true, at: 1792000000000,
      lat: 36.72, lon: -3.52, title: 'Inicio de track', text: 'Track iniciado', data: {}
    };
    for (let i = 0; i < 2; i++) {
      const sent = client.send('LOG_EVENT', event, { sid: TRACK, ack: true });
      ack = await client.waitFor((m) => m.type === 'ACK' && m.payload.ref === sent.id);
      assert.deepEqual(ack.payload.events, [event.eventId]);
    }

    const end = client.send('TRACK_END', meta(3, 'FINISHED', { lastSeq: 7, distanceNm: 0.05, durationMs: 7000 }), { sid: TRACK, ack: true });
    await client.waitFor((m) => m.type === 'ACK' && m.payload.ref === end.id);

    const summary = store.getTrackSummary(TRACK);
    assert.equal(summary.state, 'FINISHED');
    assert.equal(summary.complete, true);
    assert.equal(summary.pointCount, 7);
    assert.deepEqual(received.sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7], 'cada punto se notifica una sola vez');
    assert.deepEqual(logEvents, [event.eventId], 'evento de bitácora no duplicado');

    // Bucles: el servidor nunca emite datos de navegación hacia el dispositivo.
    const allowed = new Set(['CHALLENGE', 'PAIR_PENDING', 'PAIR_RESULT', 'WELCOME', 'ACK', 'SYNC_STATE', 'HEARTBEAT', 'ERROR', 'BYE']);
    const sentTypes = new Set(client.received.map((m) => m.type));
    for (const type of sentTypes) assert.ok(allowed.has(type), `el servidor envió ${type}`);
    client.close();
  } finally {
    await server.stop();
  }
});

test('desconexión a mitad de track, reinicio de Desktop y recuperación desde el último punto confirmado', async () => {
  const first = await startServer();
  const { client, token } = await pairDevice(first.server, first.port);
  client.send('TRACK_START', meta(1, 'RECORDING'), { sid: TRACK, ack: true });
  const b = client.send('TRACK_POINTS', { points: [point(1), point(2), point(3), point(4)] }, { sid: TRACK, ack: true });
  await client.waitFor((m) => m.type === 'ACK' && m.payload.ref === b.id);
  client.kill(); // pérdida brusca de la conexión
  await first.server.stop(); // Desktop se cierra

  // Desktop vuelve a abrirse con los mismos datos.
  const store = new LinkStore({ dir: first.dir, secretBox: fakeBox }).init();
  const port = nextPort++;
  const server = new LinkServer({ store, port, enableDiscovery: false, networkInterfaces: () => ({}) });
  assert.equal(store.settings.enabled, true, 'el ajuste activado persiste');
  await server.start();
  try {
    const again = new TestClient(port, DEVICE);
    await again.connect();
    await again.hello(true);
    assert.equal((await again.auth(token)).type, 'WELCOME', 'la vinculación sobrevive al reinicio');
    const request = again.send('SYNC_REQUEST', { tracks: [TRACK, 'ffffffff-0000-4000-8000-000000000000'] });
    const state = await again.waitFor((m) => m.type === 'SYNC_STATE' && m.payload.ref === request.id);
    const [known, unknown] = state.payload.tracks;
    assert.equal(known.seq, 4);
    assert.equal(known.metaRev, 1);
    assert.equal(unknown.known, false);
    // Android reenvía desde seq 5 todo lo que grabó mientras estaba desconectado.
    const rest = Array.from({ length: 150 }, (_, i) => point(5 + i));
    const sent = again.send('TRACK_POINTS', { points: rest }, { sid: TRACK, ack: true });
    const ack = await again.waitFor((m) => m.type === 'ACK' && m.payload.ref === sent.id);
    assert.equal(ack.payload.seq, 154);
    assert.equal(store.getTrackPoints(TRACK).length, 154);
    again.close();
  } finally {
    await server.stop();
  }
});

test('varios dispositivos: cada uno solo escribe en sus tracks; una nueva conexión del mismo dispositivo sustituye a la anterior', async () => {
  const { server, port, store } = await startServer();
  try {
    const a = await pairDevice(server, port, DEVICE, 'Pixel 7');
    const b = await pairDevice(server, port, INTRUDER, 'Tablet');
    a.client.send('TRACK_START', meta(1, 'RECORDING'), { sid: TRACK, ack: true });
    await a.client.waitType('ACK');
    b.client.send('TRACK_POINTS', { points: [point(1)] }, { sid: TRACK, ack: true });
    const err = await b.client.waitType('ERROR');
    assert.equal(err.payload.code, 'TRACK_OWNER_MISMATCH');
    assert.equal(store.getTrackPoints(TRACK).length, 0);

    const second = new TestClient(port, DEVICE);
    await second.connect();
    await second.hello(true);
    assert.equal((await second.auth(a.token)).type, 'WELCOME');
    await a.client.waitClosed();
    assert.equal(server.getStatus().connections.filter((c) => c.deviceId === DEVICE).length, 1);
    second.close();
    b.client.close();
  } finally {
    await server.stop();
  }
});

test('posiciones: una posición antigua o sin coordenadas no sustituye a la válida', async () => {
  const { server, port } = await startServer();
  try {
    const { client } = await pairDevice(server, port);
    const positions = [];
    server.on('position', (p) => positions.push(p.fix.t));
    const fix = (t) => ({ t, lat: 36.72, lon: -3.52, acc: 5, sog: 1, cog: 90, hdg: null, src: 'phone_gps' });
    client.send('POSITION', { trackId: null, fix: fix(1792000005000) });
    client.send('POSITION', { trackId: null, fix: fix(1792000004000) }); // desordenada
    client.send('POSITION', { trackId: null, fix: { t: 1792000006000, acc: 5, src: 'phone_gps' } }); // sin coordenadas
    const err = await client.waitType('ERROR');
    assert.match(err.payload.message, /BAD_POINT/);
    client.send('POSITION', { trackId: null, fix: fix(1792000007000) });
    await new Promise((r) => setTimeout(r, 150));
    assert.deepEqual(positions, [1792000005000, 1792000007000]);
    assert.equal(server.getStatus().positions[0].fix.t, 1792000007000);
    client.close();
  } finally {
    await server.stop();
  }
});

test('heartbeat: una conexión sin tráfico se marca obsoleta y se cierra', async () => {
  const { server, port } = await startServer(undefined, { heartbeatMs: 100, staleMs: 300 });
  try {
    const { client } = await pairDevice(server, port);
    await client.waitType('HEARTBEAT', 1000);
    // El cliente deja de responder (no envía nada).
    await client.waitClosed(2000);
    assert.equal(server.getStatus().connections.length, 0);
  } finally {
    await server.stop();
  }
});

test('JSON inválido y mensajes basura no tumban el servidor', async () => {
  const { server, port } = await startServer();
  try {
    const { client } = await pairDevice(server, port);
    client.sendRaw('esto no es json');
    assert.equal((await client.waitType('ERROR')).payload.code, 'BAD_MESSAGE');
    client.sendRaw(JSON.stringify({ v: 1, type: 'FORMAT_DISK', id: 'x', src: DEVICE, ts: 1792000000000, payload: {} }));
    assert.match((await client.waitType('ERROR')).payload.message, /UNKNOWN_TYPE/);
    client.send('HEARTBEAT', { pending: 0 });
    const req = client.send('SYNC_REQUEST', { tracks: [] });
    assert.equal((await client.waitFor((m) => m.type === 'SYNC_STATE' && m.payload.ref === req.id)).payload.tracks.length, 0);
    client.close();
  } finally {
    await server.stop();
  }
});

test('revocar un dispositivo cierra su conexión e impide volver a entrar', async () => {
  const { server, port } = await startServer();
  try {
    const { client, token } = await pairDevice(server, port);
    server.revokeDevice(DEVICE);
    assert.equal((await client.waitType('ERROR')).payload.code, 'NOT_AUTHORIZED');
    await client.waitClosed();
    const again = new TestClient(port, DEVICE);
    await again.connect();
    await again.hello(true);
    assert.equal((await again.auth(token)).payload.code, 'NOT_AUTHORIZED');
  } finally {
    await server.stop();
  }
});

test('D5: tras el primer emparejamiento correcto Link queda activado por defecto y persiste al reiniciar Desktop', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'velaris-link-d5-'));
  // Estado inicial real: el almacén arranca con Link desactivado y se activa solo para poder emparejar.
  const first = await startServer(dir);
  try {
    first.store.setEnabled(false); // simula la instalación nueva: desactivado
    assert.equal(first.store.settings.enabled, false);
    const { client } = await pairDevice(first.server, first.port);
    assert.equal(first.store.settings.enabled, true, 'el emparejamiento deja Link activado');
    client.close();
    await client.waitClosed();
  } finally {
    await first.server.stop();
  }
  // Tras «reiniciar» Desktop el ajuste y la confianza siguen ahí.
  const reopened = new LinkStore({ dir, secretBox: fakeBox }).init();
  assert.equal(reopened.settings.enabled, true);
  assert.equal(reopened.listDevices().length, 1);
});

test('la vinculación sobrevive al reinicio de Desktop: el teléfono se reconecta con el mismo token', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'velaris-link-persist-'));
  const first = await startServer(dir);
  let token;
  try {
    const paired = await pairDevice(first.server, first.port);
    token = paired.token;
    paired.client.close();
    await paired.client.waitClosed();
  } finally {
    await first.server.stop();
  }
  const second = await startServer(dir);
  try {
    const again = new TestClient(second.port, DEVICE);
    await again.connect();
    await again.hello(true);
    const welcome = await again.auth(token);
    assert.equal(welcome.type, 'WELCOME');
    again.close();
  } finally {
    await second.server.stop();
  }
});

test('medición: la reconexión de un teléfono registra «desconexión→WELCOME» en segundos', async () => {
  let clock = 1_000_000;
  const logs = [];
  const { server, port } = await startServer(undefined, { now: () => clock, log: (level, message) => logs.push(message) });
  try {
    const { client, token } = await pairDevice(server, port);
    client.close();
    await client.waitClosed();
    // El servidor registra la desconexión en su propio evento 'close': esperarlo antes de avanzar el reloj.
    for (let i = 0; i < 100 && server.getStatus().connections.length > 0; i++) await new Promise((r) => setTimeout(r, 20));
    assert.equal(server.getStatus().connections.length, 0);
    clock += 7_300; // el teléfono tarda 7,3 s en volver
    const recovered = new Promise((resolve) => server.once('recovery', resolve));
    const again = new TestClient(port, DEVICE);
    await again.connect();
    await again.hello(true);
    await again.auth(token);
    const event = await recovered;
    assert.equal(event.deviceId, DEVICE);
    assert.equal(event.seconds, 7.3);
    assert.ok(logs.some((m) => m.includes('RECUPERACION_SESION') && m.includes('7.3 s')), logs.join('\n'));
    again.close();
  } finally {
    await server.stop();
  }
});

test('origen de la sesión: clasificación LAN / VPN / local / otra / desconocida', () => {
  assert.deepEqual(classifyOrigin('192.168.11.50'), { address: '192.168.11.50', origin: 'LAN' });
  assert.deepEqual(classifyOrigin('::ffff:10.0.0.7'), { address: '10.0.0.7', origin: 'LAN' });
  assert.deepEqual(classifyOrigin('100.101.102.103'), { address: '100.101.102.103', origin: 'VPN' });
  assert.deepEqual(classifyOrigin('::ffff:127.0.0.1'), { address: '127.0.0.1', origin: 'local' });
  assert.deepEqual(classifyOrigin('::1'), { address: '::1', origin: 'local' });
  assert.deepEqual(classifyOrigin('203.0.113.9'), { address: '203.0.113.9', origin: 'otra' });
  assert.deepEqual(classifyOrigin('?'), { address: 'desconocida', origin: 'desconocida' });
  assert.deepEqual(classifyOrigin(undefined), { address: 'desconocida', origin: 'desconocida' });
});

test('el registro de recuperación incluye la IP de origen y no registra el token ni la prueba', async () => {
  let clock = 2_000_000;
  const logs = [];
  const { server, port } = await startServer(undefined, { now: () => clock, log: (level, message) => logs.push(message) });
  try {
    const { client, token } = await pairDevice(server, port);
    client.close();
    await client.waitClosed();
    for (let i = 0; i < 100 && server.getStatus().connections.length > 0; i++) await new Promise((r) => setTimeout(r, 20));
    clock += 4_000;
    const recovered = new Promise((resolve) => server.once('recovery', resolve));
    const again = new TestClient(port, DEVICE);
    await again.connect();
    await again.hello(true);
    const welcome = await again.auth(token);
    assert.equal(welcome.type, 'WELCOME', 'la sesión sigue funcionando');
    const event = await recovered;
    assert.equal(event.address, '127.0.0.1');
    assert.equal(event.origin, 'local');
    assert.equal(event.seconds, 4);
    const line = logs.find((m) => m.includes('RECUPERACION_SESION'));
    assert.ok(line && line.includes('origen 127.0.0.1 (local)') && line.includes('4.0 s'), logs.join('\n'));
    const everything = logs.join('\n') + JSON.stringify(event);
    assert.ok(!everything.includes(token), 'el token no aparece en los registros');
    assert.ok(!/proof|nonce|tokenEnc/i.test(everything), 'ni la prueba, ni el nonce, ni el token cifrado');
    again.close();
  } finally {
    await server.stop();
  }
});
