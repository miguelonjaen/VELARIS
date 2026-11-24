// Entrada NMEA por TCP (cliente) hasta el estado de navegación compartido (node:test).
// Ejecutar con: node --import tsx --test src/core/services/NMEATcp.nodetest.ts
//
// Usa servidores TCP locales reales en 127.0.0.1 (puerto efímero), sin Internet, y
// el código real de NMEAService, NMEAParser, ElectronTelemetryAdapter y
// SharedNavigationState. Las sentencias son de prueba: no proceden de NMEA
// Simulator X ni de instrumentos reales.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server, type Socket } from 'node:net';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import {
  NMEAService,
  NMEALineSplitter,
  validateConnectionTarget,
  validateInputSource,
  validateTcpHost,
  validateTcpPort,
  type NMEAInputOrigin,
  type NMEALogger,
  type NMEAPortFactory,
  type NMEASocketFactory,
  type NMEASocketLike
} from '../../../NMEAService';
import { ElectronTelemetryAdapter, type ElectronTelemetryApi } from '../../platform/telemetry/ElectronTelemetryAdapter';
import {
  NAVIGATION_FIELDS,
  SharedNavigationState,
  type NavigationFreshnessPolicy
} from '../navigation/SharedNavigationState';
import { presentSharedNavigation } from '../../features/navigation/utils/sharedNavigationPresentation';
import type { TelemetryService } from './TelemetryService';
import type { TelemetryMessage } from '../types/TelemetryMessage';

const MAX_AGE = 10_000;
const freshness = { maxAgeMs: MAX_AGE, ageFrom: 'receivedAt' as const };
const fullPolicy = Object.fromEntries(NAVIGATION_FIELDS.map((field) => [field, {
  BOAT: freshness, DROID: freshness, SIMULATOR: freshness
}])) as unknown as NavigationFreshnessPolicy;
const realOnlyPolicy = Object.fromEntries(NAVIGATION_FIELDS.map((field) => [field, {
  BOAT: freshness, DROID: freshness
}])) as unknown as NavigationFreshnessPolicy;

const silentLogger: NMEALogger = { info: () => undefined, warn: () => undefined, error: () => undefined };

function nmea(body: string, terminator = '\r\n'): string {
  let checksum = 0;
  for (const char of body) checksum ^= char.charCodeAt(0);
  return `$${body}*${checksum.toString(16).toUpperCase().padStart(2, '0')}${terminator}`;
}

// 36°43.290'N 3°31.410'W = 36.7215, -3.5235
const RMC = nmea('GPRMC,120000,A,3643.290,N,00331.410,W,005.5,084.0,201026,,');
const RMC_2 = nmea('GPRMC,120001,A,3643.300,N,00331.420,W,005.7,085.0,201026,,');
const GGA = nmea('GPGGA,120002,3643.500,N,00331.500,W,1,08,0.9,10.0,M,46.9,M,,');
const VTG = nmea('GPVTG,090.0,T,,M,006.1,N,011.3,K');
const HDT = nmea('HEHDT,271.5,T');

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate: () => boolean, what: string, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error(`Tiempo agotado esperando: ${what}`);
    await delay(5);
  }
}

/** Servidor NMEA TCP local de prueba (hace el papel del simulador). */
async function startServer(): Promise<{
  server: Server; port: number; clients: Socket[]; connections: () => number;
  send: (text: string) => void; stop: () => Promise<void>;
}> {
  const clients: Socket[] = [];
  let count = 0;
  const server = createServer((socket) => {
    count += 1;
    socket.setNoDelay(true);
    socket.on('error', () => undefined);
    clients.push(socket);
    socket.on('close', () => { const i = clients.indexOf(socket); if (i >= 0) clients.splice(i, 1); });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return {
    server, port, clients, connections: () => count,
    send: (text) => { for (const client of clients) client.write(text); },
    stop: () => new Promise<void>((resolve) => {
      for (const client of [...clients]) client.destroy();
      server.close(() => resolve());
    })
  };
}

class FakePort extends PassThrough {
  public isOpen = false;
  public closeCount = 0;
  close(callback?: (error?: Error | null) => void): this {
    this.isOpen = false;
    this.closeCount += 1;
    this.emit('close');
    callback?.(null);
    return this;
  }
}

/** Reproduce el enrutado de electron-main.js: SIMULATOR por su propio canal. */
function setup(options: {
  reconnect?: { maxAttempts: number; baseDelayMs: number };
  openSocket?: NMEASocketFactory;
  connectTimeoutMs?: number;
  policy?: NavigationFreshnessPolicy;
} = {}) {
  let now = Date.UTC(2026, 9, 20, 12, 0, 0);
  const clock = () => ++now; // cada lectura con un instante distinto
  const vessel = new Set<(data: unknown) => void>();
  const simulator = new Set<(data: unknown) => void>();
  const channel = (name: string) => (name === 'simulator-telemetry' ? simulator : vessel);
  const ipc: ElectronTelemetryApi = {
    on: (name, handler) => { channel(name).add(handler); },
    removeListener: (name, handler) => { channel(name).delete(handler); }
  };
  const origins: NMEAInputOrigin[] = [];
  const ports: FakePort[] = [];
  const openPort: NMEAPortFactory = (_options, onOpen) => {
    const port = new FakePort();
    ports.push(port);
    setImmediate(() => { port.isOpen = true; onOpen(null); });
    return port as unknown as ReturnType<NMEAPortFactory>;
  };
  const service = new NMEAService((message: TelemetryMessage, origin: NMEAInputOrigin) => {
    origins.push(origin);
    if (origin.source === 'SIMULATOR') {
      for (const handler of simulator) handler({ sourceId: origin.sourceId, message });
    } else {
      for (const handler of vessel) handler(message);
    }
  }, {
    openPort,
    openSocket: options.openSocket,
    logger: silentLogger,
    clock,
    listPorts: async () => [],
    connectTimeoutMs: options.connectTimeoutMs ?? 2000,
    reconnect: options.reconnect ?? { maxAttempts: 0, baseDelayMs: 20 }
  });
  const navigationState = new SharedNavigationState(options.policy ?? fullPolicy, clock);
  const processed: unknown[] = [];
  const observed: unknown[] = [];
  const telemetry = { process: (data: unknown) => processed.push(data) } as unknown as TelemetryService;
  const adapter = new ElectronTelemetryAdapter(telemetry, navigationState, clock);
  adapter.start(ipc, (data) => observed.push(data));
  return {
    service, navigationState, processed, observed, origins, ports,
    advance: (ms: number) => { now += ms; },
    close: () => { service.disconnect(); adapter.stop(); }
  };
}

/* ---------------------------------------------------------------- */
/* Conexión TCP y recepción                                          */
/* ---------------------------------------------------------------- */

test('TCP local: conecta a 127.0.0.1 y las sentencias válidas llegan como SIMULATOR', async (t) => {
  const server = await startServer();
  const flow = setup();
  t.after(async () => { flow.close(); await server.stop(); });

  assert.deepEqual(flow.service.connectTcp({ host: '127.0.0.1', port: server.port }), { ok: true });
  await waitFor(() => flow.service.getStatus().state === 'CONNECTED', 'conexión');
  const status = flow.service.getStatus();
  assert.equal(status.transport, 'tcp');
  assert.equal(status.host, '127.0.0.1');
  assert.equal(status.port, server.port);
  assert.equal(status.source, 'SIMULATOR');

  server.send(RMC);
  await waitFor(() => flow.navigationState.resolve('position').status === 'VALID', 'posición');
  const position = flow.navigationState.resolve('position');
  assert.equal(position.source, 'SIMULATOR');
  assert.equal(position.sourceId, `tcp:127.0.0.1:${server.port}`);
  assert.deepEqual(position.value, { lat: 36.7215, lng: -3.5235 });
  assert.equal(flow.navigationState.resolve('sog').value, 5.5);
  assert.equal(flow.navigationState.resolve('cog').value, 84);
  assert.equal(position.observedAtFromSource, false, 'el reloj del simulador no se usa para ordenar');
  assert.ok(flow.service.getStatus().lastLineAt !== null);
});

test('TCP: una sentencia fragmentada en varios paquetes se recompone', async (t) => {
  const server = await startServer();
  const flow = setup();
  t.after(async () => { flow.close(); await server.stop(); });
  flow.service.connectTcp({ host: '127.0.0.1', port: server.port });
  await waitFor(() => server.clients.length === 1, 'cliente');

  server.send(RMC.slice(0, 10));
  await delay(30);
  server.send(RMC.slice(10, 40));
  await delay(30);
  assert.equal(flow.navigationState.resolve('position').status, 'UNKNOWN', 'sin terminador no se analiza');
  server.send(RMC.slice(40));
  await waitFor(() => flow.navigationState.resolve('position').status === 'VALID', 'posición');
  assert.equal(flow.navigationState.resolve('position').source, 'SIMULATOR');
});

test('TCP: varias sentencias en un mismo paquete; cada una solo actualiza sus campos', async (t) => {
  const server = await startServer();
  const flow = setup();
  t.after(async () => { flow.close(); await server.stop(); });
  flow.service.connectTcp({ host: '127.0.0.1', port: server.port });
  await waitFor(() => server.clients.length === 1, 'cliente');

  server.send(RMC + HDT + VTG + GGA);
  await waitFor(() => flow.navigationState.resolve('headingTrue').status === 'VALID'
    && flow.navigationState.resolve('sog').value === 6.1
    && (flow.navigationState.resolve('position').value as { lat: number } | null)?.lat === 36.725, 'cuatro sentencias');

  const state = flow.navigationState.snapshot();
  assert.equal(state.headingTrue.value, 271.5);
  assert.equal(state.sog.value, 6.1, 'VTG actualiza SOG; GGA no lo pone a 0');
  assert.equal(state.cog.value, 90, 'VTG actualiza COG; GGA no lo pone a 0');
  assert.deepEqual(state.position.value, { lat: 36.725, lng: -3.525 }, 'GGA actualiza la posición; VTG no la toca');
  for (const field of NAVIGATION_FIELDS) {
    if (state[field].status === 'VALID') assert.equal(state[field].source, 'SIMULATOR');
  }
});

test('TCP: acepta terminadores CRLF y LF', async (t) => {
  const server = await startServer();
  const flow = setup();
  t.after(async () => { flow.close(); await server.stop(); });
  flow.service.connectTcp({ host: '127.0.0.1', port: server.port });
  await waitFor(() => server.clients.length === 1, 'cliente');

  server.send(nmea('GPRMC,120000,A,3643.290,N,00331.410,W,005.5,084.0,201026,,', '\n'));
  await waitFor(() => flow.navigationState.resolve('position').status === 'VALID', 'RMC con LF');
  server.send(nmea('HEHDT,271.5,T', '\r\n'));
  await waitFor(() => flow.navigationState.resolve('headingTrue').status === 'VALID', 'HDT con CRLF');
});

test('TCP: las sentencias inválidas se rechazan y no destruyen el último dato válido', async (t) => {
  const server = await startServer();
  const flow = setup();
  t.after(async () => { flow.close(); await server.stop(); });
  flow.service.connectTcp({ host: '127.0.0.1', port: server.port });
  await waitFor(() => server.clients.length === 1, 'cliente');

  server.send(RMC);
  await waitFor(() => flow.navigationState.resolve('position').status === 'VALID', 'posición válida');
  server.send(
    '$GPRMC,120001,A,3643.300,N,00331.420,W,009.9,180.0,201026,,*00\r\n' // suma de control errónea
    + nmea('GPRMC,120002,V,,,,,,,201026,,')                              // sin fix
    + 'basura sin formato\n'
    + 'x'.repeat(3000)                                                     // flujo sin terminador
  );
  server.send('\n' + HDT);
  await waitFor(() => flow.navigationState.resolve('headingTrue').status === 'VALID', 'sentencia válida tras basura');

  const state = flow.navigationState.snapshot();
  assert.deepEqual(state.position.value, { lat: 36.7215, lng: -3.5235 });
  assert.equal(state.sog.value, 5.5);
  assert.equal(state.cog.value, 84);
});

/* ---------------------------------------------------------------- */
/* Cierre, desconexión y reintentos                                   */
/* ---------------------------------------------------------------- */

test('TCP: el cierre del servidor se refleja en el estado sin borrar el último dato válido', async (t) => {
  const server = await startServer();
  const flow = setup({ reconnect: { maxAttempts: 0, baseDelayMs: 20 } });
  t.after(async () => { flow.close(); await server.stop(); });
  flow.service.connectTcp({ host: '127.0.0.1', port: server.port });
  await waitFor(() => server.clients.length === 1, 'cliente');
  server.send(RMC);
  await waitFor(() => flow.navigationState.resolve('position').status === 'VALID', 'posición');

  for (const client of [...server.clients]) client.end();
  await waitFor(() => flow.service.getStatus().state === 'ERROR', 'estado de error');
  assert.match(flow.service.getStatus().error ?? '', /cerró la conexión/);
  assert.equal(flow.navigationState.resolve('position').status, 'VALID', 'el dato caduca por su política, no por el cierre');
  flow.advance(MAX_AGE + 1);
  assert.equal(flow.navigationState.resolve('position').status, 'UNKNOWN');
});

test('TCP: tras un cierre remoto reintenta de forma acotada y recupera la conexión', async (t) => {
  const server = await startServer();
  const flow = setup({ reconnect: { maxAttempts: 2, baseDelayMs: 20 } });
  t.after(async () => { flow.close(); await server.stop(); });
  flow.service.connectTcp({ host: '127.0.0.1', port: server.port });
  await waitFor(() => server.clients.length === 1, 'primer cliente');

  server.clients[0].destroy();
  await waitFor(() => server.connections() === 2 && flow.service.getStatus().state === 'CONNECTED', 'reconexión');
  server.send(RMC);
  await waitFor(() => flow.navigationState.resolve('position').status === 'VALID', 'datos tras reconectar');
  assert.equal(flow.service.getStatus().reconnectAttempt, 0, 'los reintentos se reponen al recibir datos');
});

test('TCP: sin servidor, agota los reintentos y queda en error comprensible (sin bucle)', async (t) => {
  const server = await startServer();
  const port = server.port;
  await server.stop(); // puerto local sin nadie escuchando
  const flow = setup({ reconnect: { maxAttempts: 2, baseDelayMs: 20 } });
  t.after(() => flow.close());

  const attempts: number[] = [];
  flow.service.connectTcp({ host: '127.0.0.1', port });
  await waitFor(() => {
    const status = flow.service.getStatus();
    if (status.state === 'RECONNECTING' && !attempts.includes(status.reconnectAttempt)) attempts.push(status.reconnectAttempt);
    return status.state === 'ERROR';
  }, 'error final');
  const status = flow.service.getStatus();
  assert.match(status.error ?? '', /rechazada/);
  assert.match(status.error ?? '', /tras 2 reintentos/);
  assert.deepEqual(attempts, [1, 2]);
  await delay(120);
  assert.equal(flow.service.getStatus().state, 'ERROR', 'no hay más intentos');
});

test('TCP: desconexión del cliente cierra el socket, cancela reintentos y es idempotente', async (t) => {
  const server = await startServer();
  const flow = setup({ reconnect: { maxAttempts: 3, baseDelayMs: 20 } });
  t.after(async () => { flow.close(); await server.stop(); });
  flow.service.connectTcp({ host: '127.0.0.1', port: server.port });
  await waitFor(() => server.clients.length === 1, 'cliente');
  server.send(RMC);
  await waitFor(() => flow.origins.length === 1, 'primera línea');

  flow.service.disconnect();
  flow.service.disconnect();
  assert.equal(flow.service.getStatus().state, 'DISCONNECTED');
  await waitFor(() => server.clients.length === 0, 'el servidor ve el cierre');
  await delay(120);
  assert.equal(server.connections(), 1, 'no reconecta tras una desconexión explícita');
  assert.equal(flow.origins.length, 1);
});

test('TCP: conectar dos veces al mismo destino no duplica la conexión', async (t) => {
  const server = await startServer();
  const flow = setup();
  t.after(async () => { flow.close(); await server.stop(); });
  flow.service.connectTcp({ host: '127.0.0.1', port: server.port });
  flow.service.connectTcp({ host: '127.0.0.1', port: String(server.port) });
  await waitFor(() => flow.service.getStatus().state === 'CONNECTED', 'conexión');
  flow.service.connectTcp({ host: '127.0.0.1', port: server.port });
  await delay(50);
  assert.equal(server.connections(), 1);
  server.send(RMC);
  await waitFor(() => flow.origins.length >= 1, 'línea');
  await delay(30);
  assert.equal(flow.origins.length, 1, 'una sola entrega por sentencia');
});

test('TCP: sin respuesta al conectar se agota el tiempo con un error comprensible', async (t) => {
  class SilentSocket extends EventEmitter {
    private timer: ReturnType<typeof setTimeout> | null = null;
    public destroyed = false;
    setTimeout(ms: number): this {
      if (this.timer) clearTimeout(this.timer);
      this.timer = ms > 0 ? setTimeout(() => this.emit('timeout'), ms) : null;
      return this;
    }
    destroy(): this {
      if (this.timer) clearTimeout(this.timer);
      if (!this.destroyed) { this.destroyed = true; setImmediate(() => this.emit('close')); }
      return this;
    }
  }
  const sockets: SilentSocket[] = [];
  const flow = setup({
    connectTimeoutMs: 40,
    openSocket: () => { const socket = new SilentSocket(); sockets.push(socket); return socket as unknown as NMEASocketLike; }
  });
  t.after(() => flow.close());
  flow.service.connectTcp({ host: '127.0.0.1', port: 10110 });
  await waitFor(() => flow.service.getStatus().state === 'ERROR', 'tiempo agotado');
  assert.match(flow.service.getStatus().error ?? '', /Sin respuesta de 127\.0\.0\.1:10110/);
  assert.equal(sockets[0].destroyed, true, 'no queda un socket huérfano');
});

/* ---------------------------------------------------------------- */
/* Validación de host y puerto                                       */
/* ---------------------------------------------------------------- */

test('validación de host y puerto TCP', () => {
  assert.deepEqual(validateConnectionTarget({ transport: 'tcp', host: '127.0.0.1', port: 10110 }),
    { ok: true, target: { transport: 'tcp', host: '127.0.0.1', port: 10110, source: 'SIMULATOR' } });
  assert.deepEqual(validateConnectionTarget({ transport: 'tcp', host: ' localhost ', port: '10110' }),
    { ok: true, target: { transport: 'tcp', host: 'localhost', port: 10110, source: 'SIMULATOR' } });
  assert.equal(validateTcpHost('::1').ok, true);
  assert.equal(validateTcpHost('gateway.local').ok, true);

  for (const host of ['', '   ', '127.0.0.1:10110', '999.1.1.1', 'http://127.0.0.1', '127.0.0.1/nmea', 'a b', null, 42]) {
    assert.equal(validateTcpHost(host).ok, false, `host ${String(host)}`);
  }
  for (const port of [0, 65536, -1, 10110.5, '10110.5', 'abc', '', null, '1e4']) {
    assert.equal(validateTcpPort(port).ok, false, `puerto ${String(port)}`);
  }
  assert.deepEqual(validateTcpPort(' 10110 '), { ok: true, port: 10110 });
  assert.equal(validateConnectionTarget({ transport: 'udp', host: '127.0.0.1', port: 10110 }).ok, false);
  assert.equal(validateConnectionTarget(null).ok, false);
});

test('host o puerto inválidos no abren ninguna conexión y devuelven el motivo', () => {
  let opened = 0;
  const flow = setup({ openSocket: () => { opened += 1; throw new Error('no debería abrirse'); } });
  const badHost = flow.service.connectTcp({ host: '127.0.0.1:10110', port: 10110 });
  const badPort = flow.service.connectTcp({ host: '127.0.0.1', port: 70000 });
  assert.equal(badHost.ok, false);
  assert.match((badHost as { error: string }).error, /sin protocolo, puerto ni ruta/);
  assert.equal(badPort.ok, false);
  assert.match((badPort as { error: string }).error, /entre 1 y 65535/);
  assert.equal(opened, 0);
  assert.equal(flow.service.getStatus().state, 'DISCONNECTED');
  flow.close();
});

test('una dirección IP nunca se interpreta como ruta de puerto serie', () => {
  for (const path of ['127.0.0.1', '127.0.0.1:10110', 'localhost:10110', 'tcp://127.0.0.1:10110']) {
    const result = validateConnectionTarget(path);
    assert.equal(result.ok, false, path);
    assert.match((result as { error: string }).error, /usa el transporte TCP/);
  }
  assert.deepEqual(validateConnectionTarget('COM3'), { ok: true, target: { transport: 'serial', path: 'COM3' } });
  assert.deepEqual(validateConnectionTarget({ transport: 'serial', path: '/dev/ttyUSB0' }),
    { ok: true, target: { transport: 'serial', path: '/dev/ttyUSB0' } });
  const flow = setup();
  assert.equal(flow.service.connect('127.0.0.1:10110'), false);
  assert.equal(flow.ports.length, 0, 'no se intenta abrir un puerto serie');
  flow.close();
});

/* ---------------------------------------------------------------- */
/* Conservación del transporte serie                                  */
/* ---------------------------------------------------------------- */

test('serie conservado: sigue entrando como BOAT por el canal de instrumentos', async () => {
  const flow = setup();
  assert.equal(flow.service.connect('COM_TEST'), true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(flow.service.getStatus().transport, 'serial');
  assert.equal(flow.service.getStatus().source, 'BOAT');
  flow.ports[0].write(RMC);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(flow.origins[0], { transport: 'serial', source: 'BOAT', sourceId: 'nmea' });
  assert.equal(flow.navigationState.resolve('position').source, 'BOAT');
  assert.equal(flow.processed.length, 1, 'el núcleo de telemetría existente sigue recibiendo el serie');
  flow.close();
});

test('cambiar entre serie y TCP cierra la conexión anterior', async (t) => {
  const server = await startServer();
  const flow = setup();
  t.after(async () => { flow.close(); await server.stop(); });

  flow.service.connect('COM_TEST');
  await new Promise((resolve) => setImmediate(resolve));
  flow.service.connectTcp({ host: '127.0.0.1', port: server.port });
  assert.equal(flow.ports[0].closeCount, 1, 'el puerto serie se cierra al pasar a TCP');
  await waitFor(() => server.clients.length === 1, 'cliente TCP');

  flow.service.connect('COM_TEST');
  await waitFor(() => server.clients.length === 0, 'el socket TCP se cierra al volver a serie');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(flow.service.getStatus().transport, 'serial');
});

/* ---------------------------------------------------------------- */
/* Separación entre datos simulados y reales                          */
/* ---------------------------------------------------------------- */

test('los datos simulados no llegan al núcleo de telemetría ni se registran como BOAT', async (t) => {
  const server = await startServer();
  const flow = setup();
  t.after(async () => { flow.close(); await server.stop(); });
  flow.service.connectTcp({ host: '127.0.0.1', port: server.port });
  await waitFor(() => server.clients.length === 1, 'cliente');
  server.send(RMC + HDT);
  await waitFor(() => flow.navigationState.resolve('headingTrue').status === 'VALID', 'datos');

  assert.equal(flow.processed.length, 0, 'TelemetryService (alarmas, carta…) no recibe datos simulados');
  assert.equal(flow.observed.length, 0);
  for (const field of NAVIGATION_FIELDS) {
    assert.equal(flow.navigationState.lastReading(field, 'BOAT'), null, `${field} sin lecturas BOAT`);
  }
  const view = presentSharedNavigation(flow.navigationState.snapshot());
  assert.equal(view.position.source, 'SIMULATOR');
  assert.match(view.position.title, /SIMULADOS/);
});

test('prioridad: el barco y Droid mandan sobre el simulador; este solo cubre su ausencia', async (t) => {
  const server = await startServer();
  const flow = setup();
  t.after(async () => { flow.close(); await server.stop(); });

  flow.navigationState.update({
    field: 'sog', source: 'DROID', sourceId: 'phone-1', value: 4.2,
    observedAt: Date.UTC(2026, 9, 20, 12, 0, 0), receivedAt: Date.UTC(2026, 9, 20, 12, 0, 0), observedAtFromSource: true
  });
  flow.service.connectTcp({ host: '127.0.0.1', port: server.port });
  await waitFor(() => server.clients.length === 1, 'cliente');
  server.send(RMC);
  await waitFor(() => flow.navigationState.lastReading('sog', 'SIMULATOR') !== null, 'SOG simulado');
  assert.equal(flow.navigationState.resolve('sog').source, 'DROID', 'Droid (real) por delante del simulador');
  assert.equal(flow.navigationState.resolve('position').source, 'SIMULATOR', 'sin dato real, se usa el simulador');

  // Llega el barco por serie: recupera la prioridad en los campos que trae.
  flow.service.disconnect();
  flow.service.connect('COM_TEST');
  await new Promise((resolve) => setImmediate(resolve));
  flow.ports[0].write(RMC_2);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(flow.navigationState.resolve('position').source, 'BOAT');
  assert.equal(flow.navigationState.resolve('sog').source, 'BOAT');
});

test('modelo: sin caducidad para SIMULATOR la fuente queda desactivada (compatibilidad)', () => {
  const state = new SharedNavigationState(realOnlyPolicy, () => 1_000);
  const result = state.update({
    field: 'position', source: 'SIMULATOR', sourceId: 'tcp:127.0.0.1:10110', value: { lat: 36.7, lng: -3.5 },
    observedAt: 1_000, receivedAt: 1_000, observedAtFromSource: false
  });
  assert.deepEqual(result, { accepted: false, reason: 'SOURCE_NOT_CONFIGURED' });
  assert.equal(state.resolve('position').status, 'UNKNOWN');
  assert.equal(state.resolve('position').sources.SIMULATOR, 'NO_DATA');

  const broken = Object.fromEntries(NAVIGATION_FIELDS.map((field) => [field, {
    BOAT: freshness, DROID: freshness, SIMULATOR: { maxAgeMs: 0, ageFrom: 'receivedAt' }
  }])) as unknown as NavigationFreshnessPolicy;
  assert.throws(() => new SharedNavigationState(broken), /SIMULATOR/);
  const missingReal = Object.fromEntries(NAVIGATION_FIELDS.map((field) => [field, { BOAT: freshness }])) as unknown as NavigationFreshnessPolicy;
  assert.throws(() => new SharedNavigationState(missingReal), /DROID/);
});

test('separador de líneas: fragmentos, varias líneas, CRLF/LF y descarte de restos enormes', () => {
  const splitter = new NMEALineSplitter(100);
  assert.deepEqual(splitter.push('$A*00\r'), []);
  assert.deepEqual(splitter.push('\n$B*00\n$C'), ['$A*00', '$B*00']);
  assert.deepEqual(splitter.push('*00\r\n\r\n'), ['$C*00']);
  assert.deepEqual(splitter.push('x'.repeat(150)), []);
  assert.deepEqual(splitter.push('\n$D*00\n'), ['$D*00'], 'el resto descartado no contamina la línea siguiente');
});

/* ---------------------------------------------------------------- */
/* Origen declarado: TCP como instrumentos del barco                  */
/* ---------------------------------------------------------------- */

test('TCP declarado BOAT: se comporta como los instrumentos del barco y gana a Droid', async (t) => {
  const server = await startServer();
  const flow = setup();
  t.after(async () => { flow.close(); await server.stop(); });

  flow.navigationState.update({
    field: 'position', source: 'DROID', sourceId: 'phone-1', value: { lat: 37.7702, lng: -3.79 },
    observedAt: Date.UTC(2026, 9, 20, 12, 0, 0), receivedAt: Date.UTC(2026, 9, 20, 12, 0, 0), observedAtFromSource: true
  });
  assert.deepEqual(flow.service.connectTcp({ host: '127.0.0.1', port: server.port, source: 'BOAT' }), { ok: true });
  await waitFor(() => server.clients.length === 1, 'cliente');
  assert.equal(flow.service.getStatus().source, 'BOAT');
  server.send(RMC + HDT);
  await waitFor(() => flow.navigationState.resolve('headingTrue').status === 'VALID', 'datos');

  assert.deepEqual(flow.origins[0], { transport: 'tcp', source: 'BOAT', sourceId: `tcp:127.0.0.1:${server.port}` });
  assert.equal(flow.navigationState.resolve('position').source, 'BOAT', 'el barco (TCP) gana a Droid');
  assert.deepEqual(flow.navigationState.resolve('position').value, { lat: 36.7215, lng: -3.5235 });
  assert.equal(flow.navigationState.lastReading('position', 'SIMULATOR'), null, 'no se registra como simulador');
  assert.ok(flow.processed.length >= 2, 'llega al núcleo de telemetría como un gateway real');
  assert.ok(flow.observed.length >= 2);
});

test('TCP sin origen declarado sigue siendo SIMULATOR (nunca se supone barco)', async (t) => {
  const server = await startServer();
  const flow = setup();
  t.after(async () => { flow.close(); await server.stop(); });
  flow.service.connectTcp({ host: '127.0.0.1', port: server.port });
  await waitFor(() => server.clients.length === 1, 'cliente');
  assert.equal(flow.service.getStatus().source, 'SIMULATOR');
  server.send(RMC);
  await waitFor(() => flow.origins.length === 1, 'línea');
  assert.equal(flow.origins[0].source, 'SIMULATOR');
  assert.equal(flow.processed.length, 0);
});

test('cambiar el origen declarado del mismo destino reabre la conexión', async (t) => {
  const server = await startServer();
  const flow = setup();
  t.after(async () => { flow.close(); await server.stop(); });
  flow.service.connectTcp({ host: '127.0.0.1', port: server.port, source: 'SIMULATOR' });
  await waitFor(() => flow.service.getStatus().state === 'CONNECTED', 'primera conexión');
  flow.service.connectTcp({ host: '127.0.0.1', port: server.port, source: 'BOAT' });
  await waitFor(() => server.connections() === 2 && flow.service.getStatus().state === 'CONNECTED', 'reconexión');
  assert.equal(flow.service.getStatus().source, 'BOAT');
  await waitFor(() => server.clients.length === 1, 'solo queda una conexión');
});

test('validación del origen declarado', () => {
  assert.deepEqual(validateInputSource(undefined), { ok: true, source: 'SIMULATOR' });
  assert.deepEqual(validateInputSource('BOAT'), { ok: true, source: 'BOAT' });
  assert.equal(validateInputSource('boat').ok, false);
  assert.equal(validateInputSource('DROID').ok, false);
  assert.deepEqual(validateConnectionTarget({ transport: 'tcp', host: '127.0.0.1', port: '10110', source: 'BOAT' }),
    { ok: true, target: { transport: 'tcp', host: '127.0.0.1', port: 10110, source: 'BOAT' } });
  assert.equal(validateConnectionTarget({ transport: 'tcp', host: '127.0.0.1', port: 10110, source: 'X' }).ok, false);
  const flow = setup({ openSocket: () => { throw new Error('no debería abrirse'); } });
  assert.equal(flow.service.connectTcp({ host: '127.0.0.1', port: 10110, source: 'DROID' }).ok, false);
  flow.close();
});
