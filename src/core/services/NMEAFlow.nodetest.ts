// Flujo NMEA real hasta el estado de navegación compartido, con un puerto serie de prueba (node:test).
// Ejecutar con: node --import tsx --test src/core/services/NMEAFlow.nodetest.ts
//
// Usa NMEAService, NMEAParser, ElectronTelemetryAdapter y SharedNavigationState reales; solo el
// puerto serie y el canal IPC se sustituyen por dobles de prueba. Ninguna de estas sentencias
// procede de instrumentos reales.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { NMEAService, type NMEAPortFactory, type NMEALogger } from '../../../NMEAService';
import { ElectronTelemetryAdapter, type ElectronTelemetryApi } from '../../platform/telemetry/ElectronTelemetryAdapter';
import { NAVIGATION_FIELDS, SharedNavigationState, type NavigationFreshnessPolicy } from '../navigation/SharedNavigationState';
import type { TelemetryService } from './TelemetryService';
import type { TelemetryMessage } from '../types/TelemetryMessage';

const T0 = Date.UTC(2026, 9, 20, 12, 0, 0);
const MAX_AGE = 10_000;
const policy = Object.fromEntries(NAVIGATION_FIELDS.map((field) => [field, {
  BOAT: { maxAgeMs: MAX_AGE, ageFrom: 'receivedAt' },
  DROID: { maxAgeMs: MAX_AGE, ageFrom: 'receivedAt' }
}])) as unknown as NavigationFreshnessPolicy;

/** Sentencia NMEA 0183 con su suma de control. */
function nmea(body: string): string {
  let checksum = 0;
  for (const char of body) checksum ^= char.charCodeAt(0);
  return `$${body}*${checksum.toString(16).toUpperCase().padStart(2, '0')}\r\n`;
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

const silentLogger: NMEALogger = { info: () => undefined, warn: () => undefined, error: () => undefined };

function setup(options: { openError?: Error } = {}) {
  let now = T0;
  const clock = () => now;
  const ports: FakePort[] = [];
  const opened: string[] = [];
  const openPort: NMEAPortFactory = ({ path }, onOpen) => {
    const port = new FakePort();
    ports.push(port);
    opened.push(path);
    setImmediate(() => {
      if (options.openError) return onOpen(options.openError);
      port.isOpen = true;
      onOpen(null);
    });
    return port as unknown as ReturnType<NMEAPortFactory>;
  };

  // Canales IPC "vessel-telemetry" y "simulator-telemetry" (proceso principal → renderer).
  const handlers = new Set<(data: unknown) => void>();
  const simulatorHandlers = new Set<(data: unknown) => void>();
  const channel = (name: string) => (name === 'simulator-telemetry' ? simulatorHandlers : handlers);
  const ipc: ElectronTelemetryApi = {
    on: (name, handler) => { channel(name).add(handler); },
    removeListener: (name, handler) => { channel(name).delete(handler); }
  };
  const service = new NMEAService(
    (message: TelemetryMessage) => { for (const handler of handlers) handler(message); },
    { openPort, logger: silentLogger, clock, listPorts: async () => [] }
  );

  const navigationState = new SharedNavigationState(policy, clock);
  const processed: unknown[] = [];
  const telemetry = { process: (data: unknown) => processed.push(data) } as unknown as TelemetryService;
  const adapter = new ElectronTelemetryAdapter(telemetry, navigationState, clock);
  adapter.start(ipc);

  return {
    service, adapter, navigationState, ports, opened, processed, handlers, simulatorHandlers,
    advance: (ms: number) => { now += ms; },
    write: async (port: FakePort, text: string) => {
      port.write(text);
      await new Promise((resolve) => setImmediate(resolve));
    }
  };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

// 36°43.290'N 3°31.410'W = 36.7215, -3.5235
const RMC_1 = nmea('GPRMC,120000,A,3643.290,N,00331.410,W,005.5,084.0,201026,,');
const RMC_2 = nmea('GPRMC,120001,A,3643.300,N,00331.420,W,005.7,085.0,201026,,');
const GGA = nmea('GPGGA,120002,3643.500,N,00331.500,W,1,08,0.9,10.0,M,46.9,M,,');
const VTG = nmea('GPVTG,090.0,T,,M,006.1,N,011.3,K');
const RMC_VOID = nmea('GPRMC,120003,V,,,,,,,201026,,');
const HDT = nmea('HEHDT,271.5,T');

test('RMC del puerto llega al estado compartido como fuente BOAT', async () => {
  const flow = setup();
  assert.equal(flow.service.connect('COM_TEST'), true);
  await flush();
  assert.equal(flow.service.getStatus().state, 'CONNECTED');
  await flow.write(flow.ports[0], RMC_1);

  const state = flow.navigationState.snapshot();
  assert.equal(state.position.source, 'BOAT');
  assert.deepEqual(state.position.value, { lat: 36.7215, lng: -3.5235 });
  assert.equal(state.sog.value, 5.5);
  assert.equal(state.cog.value, 84);
  assert.equal(state.position.observedAtFromSource, true);
  assert.equal(flow.service.getStatus().lastLineAt, T0);
});

test('GGA actualiza la posición y no sobrescribe SOG ni COG con cero', async () => {
  const flow = setup();
  flow.service.connect('COM_TEST');
  await flush();
  await flow.write(flow.ports[0], RMC_1);
  flow.advance(1000);
  await flow.write(flow.ports[0], GGA);

  const state = flow.navigationState.snapshot();
  assert.deepEqual(state.position.value, { lat: 36.725, lng: -3.525 });
  assert.equal(state.sog.value, 5.5);
  assert.equal(state.cog.value, 84);
});

test('VTG actualiza SOG y COG y no sobrescribe la posición con 0,0', async () => {
  const flow = setup();
  flow.service.connect('COM_TEST');
  await flush();
  await flow.write(flow.ports[0], RMC_1);
  flow.advance(1000);
  await flow.write(flow.ports[0], VTG);

  const state = flow.navigationState.snapshot();
  assert.deepEqual(state.position.value, { lat: 36.7215, lng: -3.5235 });
  assert.equal(state.sog.value, 6.1);
  assert.equal(state.cog.value, 90);
});

test('una sentencia inválida no destruye el último dato válido', async () => {
  const flow = setup();
  flow.service.connect('COM_TEST');
  await flush();
  await flow.write(flow.ports[0], RMC_1);
  flow.advance(500);
  await flow.write(flow.ports[0], RMC_VOID);
  await flow.write(flow.ports[0], '$GPRMC,120004,A,0000.000,N,00000.000,E,000.0,000.0,201026,,*00\r\n');
  await flow.write(flow.ports[0], 'basura sin formato\r\n');

  const state = flow.navigationState.snapshot();
  assert.equal(state.position.status, 'VALID');
  assert.deepEqual(state.position.value, { lat: 36.7215, lng: -3.5235 });
  assert.equal(state.sog.value, 5.5);
  // El renderer sigue recibiendo los rechazos para diagnóstico.
  assert.ok(flow.processed.some((m) => (m as TelemetryMessage).type === 'NMEA_INVALID'));
});

test('rumbo verdadero del barco y caducidad sin nuevas sentencias', async () => {
  const flow = setup();
  flow.service.connect('COM_TEST');
  await flush();
  await flow.write(flow.ports[0], HDT);
  assert.equal(flow.navigationState.resolve('headingTrue').value, 271.5);
  flow.advance(MAX_AGE + 1);
  assert.equal(flow.navigationState.resolve('headingTrue').status, 'UNKNOWN');
});

test('una línea partida en varios fragmentos se recompone antes de analizarla', async () => {
  const flow = setup();
  flow.service.connect('COM_TEST');
  await flush();
  await flow.write(flow.ports[0], RMC_2.slice(0, 20));
  assert.equal(flow.navigationState.resolve('position').status, 'UNKNOWN');
  await flow.write(flow.ports[0], RMC_2.slice(20));
  assert.equal(flow.navigationState.resolve('position').source, 'BOAT');
});

test('la entrada simulada no se registra como telemetría del barco', () => {
  const flow = setup();
  flow.adapter.forward({ type: 'GPS', lat: 36.7, lng: -3.5, sog: 6, cog: 90 });
  assert.equal(flow.processed.length, 1, 'la simulación sigue llegando al núcleo existente');
  const state = flow.navigationState.snapshot();
  assert.equal(state.position.status, 'UNKNOWN');
  assert.equal(state.sog.status, 'UNKNOWN');
});

test('conectar dos veces el mismo puerto no duplica la conexión ni los listeners', async () => {
  const flow = setup();
  flow.service.connect('COM_TEST');
  flow.service.connect('COM_TEST');
  await flush();
  flow.service.connect('COM_TEST');
  assert.deepEqual(flow.opened, ['COM_TEST']);
  await flow.write(flow.ports[0], RMC_1);
  assert.equal(flow.processed.length, 1);
});

test('cambiar de puerto cierra el anterior y deja de leerlo', async () => {
  const flow = setup();
  flow.service.connect('COM_A');
  await flush();
  flow.service.connect('COM_B');
  await flush();
  assert.equal(flow.ports[0].closeCount, 1);
  await flow.write(flow.ports[0], RMC_1);
  assert.equal(flow.processed.length, 0, 'el puerto anterior ya no entrega datos');
  await flow.write(flow.ports[1], RMC_1);
  assert.equal(flow.processed.length, 1);
  assert.equal(flow.service.getStatus().portPath, 'COM_B');
});

test('disconnect cierra el puerto, deja de entregar datos y se puede repetir', async () => {
  const flow = setup();
  flow.service.connect('COM_TEST');
  await flush();
  flow.service.disconnect();
  flow.service.disconnect();
  assert.equal(flow.ports[0].closeCount, 1);
  assert.equal(flow.service.getStatus().state, 'DISCONNECTED');
  await flow.write(flow.ports[0], RMC_1);
  assert.equal(flow.processed.length, 0);
});

test('desconectar mientras se abre no deja un puerto abierto huérfano', async () => {
  const flow = setup();
  flow.service.connect('COM_TEST');
  flow.service.disconnect();
  await flush();
  assert.equal(flow.ports[0].isOpen, false);
  assert.equal(flow.service.getStatus().state, 'DISCONNECTED');
});

test('un error al abrir queda en el estado y no inventa datos', async () => {
  const flow = setup({ openError: new Error('Access denied') });
  assert.equal(flow.service.connect('COM_TEST'), true);
  await flush();
  const status = flow.service.getStatus();
  assert.equal(status.state, 'ERROR');
  assert.match(status.error ?? '', /Access denied/);
  assert.equal(flow.navigationState.resolve('position').status, 'UNKNOWN');
});

test('sin puerto indicado no se abre ninguna conexión', () => {
  const flow = setup();
  assert.equal(flow.service.connect(''), false);
  assert.equal(flow.service.connect('   '), false);
  assert.deepEqual(flow.opened, []);
});

test('detener el adaptador retira el listener del canal IPC', () => {
  const flow = setup();
  assert.equal(flow.handlers.size, 1);
  assert.equal(flow.simulatorHandlers.size, 1);
  flow.adapter.start({ on: () => undefined, removeListener: () => undefined });
  assert.equal(flow.handlers.size, 0, 'reiniciar no deja listeners duplicados');
  assert.equal(flow.simulatorHandlers.size, 0);
});
