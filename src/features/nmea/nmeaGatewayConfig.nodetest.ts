// Configuración «Gateway NMEA» (node:test).
// Ejecutar con: node --import tsx --test src/features/nmea/nmeaGatewayConfig.nodetest.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_NMEA_GATEWAY_CONFIG,
  NMEA_GATEWAY_STORAGE_KEY,
  describeNmeaStatus,
  loadNmeaGatewayConfig,
  saveNmeaGatewayConfig,
  toConnectionTarget,
  type KeyValueStorage,
  type NmeaServiceStatusView
} from './nmeaGatewayConfig';

const memoryStorage = (): KeyValueStorage & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } };
};

test('por defecto: TCP a 127.0.0.1:10110 (prueba local con el simulador)', () => {
  assert.deepEqual(loadNmeaGatewayConfig(memoryStorage()), DEFAULT_NMEA_GATEWAY_CONFIG);
  assert.deepEqual(toConnectionTarget(DEFAULT_NMEA_GATEWAY_CONFIG), { transport: 'tcp', host: '127.0.0.1', port: '10110', source: 'BOAT' });
});

test('guarda y recupera la configuración con la clave GAULOS_nmea_gateway', () => {
  const storage = memoryStorage();
  assert.equal(saveNmeaGatewayConfig(storage, { transport: 'serial', host: '127.0.0.1', port: '10110', serialPath: 'COM4', tcpSource: 'SIMULATOR' }), true);
  assert.ok(storage.data.has(NMEA_GATEWAY_STORAGE_KEY));
  const loaded = loadNmeaGatewayConfig(storage);
  assert.equal(loaded.transport, 'serial');
  assert.deepEqual(toConnectionTarget(loaded), { transport: 'serial', path: 'COM4' });
  assert.equal(loaded.tcpSource, 'SIMULATOR');
  storage.setItem(NMEA_GATEWAY_STORAGE_KEY, JSON.stringify({ transport: 'tcp', host: '127.0.0.1', port: '10110' }));
  assert.equal(loadNmeaGatewayConfig(storage).tcpSource, 'BOAT', 'configuración guardada antes de existir el campo: barco');
});

test('datos guardados dañados o almacenamiento no disponible: valores por defecto, sin excepción', () => {
  const storage = memoryStorage();
  storage.setItem(NMEA_GATEWAY_STORAGE_KEY, '{no es json');
  assert.deepEqual(loadNmeaGatewayConfig(storage), DEFAULT_NMEA_GATEWAY_CONFIG);
  storage.setItem(NMEA_GATEWAY_STORAGE_KEY, JSON.stringify({ transport: 'udp', host: 5, port: 10110 }));
  assert.deepEqual(loadNmeaGatewayConfig(storage), { ...DEFAULT_NMEA_GATEWAY_CONFIG, port: '10110' });
  const throwing: KeyValueStorage = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('bloqueado'); } };
  assert.deepEqual(loadNmeaGatewayConfig(throwing), DEFAULT_NMEA_GATEWAY_CONFIG);
  assert.equal(saveNmeaGatewayConfig(throwing, DEFAULT_NMEA_GATEWAY_CONFIG), false);
  assert.equal(saveNmeaGatewayConfig(null, DEFAULT_NMEA_GATEWAY_CONFIG), false);
});

const base: NmeaServiceStatusView = {
  state: 'CONNECTED', transport: 'tcp', portPath: null, host: '127.0.0.1', port: 10110,
  source: 'SIMULATOR', error: null, lastLineAt: null
};

test('estado: TCP declarado como simulador se identifica correctamente', () => {
  const waiting = describeNmeaStatus(base, 10_000);
  assert.equal(waiting.tone, 'ok');
  assert.match(waiting.text, /TCP 127\.0\.0\.1:10110\. Esperando sentencias/);
  assert.match(waiting.classification ?? '', /SIMULADOS/);
  assert.match(describeNmeaStatus({ ...base, lastLineAt: 7_000 }, 10_000).text, /hace 3 s/);
  const error = describeNmeaStatus({ ...base, state: 'ERROR', error: 'Conexión rechazada por 127.0.0.1:10110' }, 0);
  assert.equal(error.tone, 'error');
  assert.match(error.text, /rechazada/);
  assert.equal(describeNmeaStatus(null, 0).text, 'Desconectado.');
  const serial = describeNmeaStatus({ ...base, transport: 'serial', portPath: 'COM3', host: null, port: null, source: 'BOAT' }, 0);
  assert.match(serial.text, /serie COM3/);
  assert.equal(serial.classification, 'Instrumentos del barco.');
});


test('TCP declarado expresamente como BOAT conserva su origen', () => {
  const storage = memoryStorage();

  const config = {
    ...DEFAULT_NMEA_GATEWAY_CONFIG,
    tcpSource: 'BOAT' as const
  };

  assert.equal(saveNmeaGatewayConfig(storage, config), true);

  const loaded = loadNmeaGatewayConfig(storage);

  assert.equal(loaded.tcpSource, 'BOAT');

  assert.deepEqual(toConnectionTarget(loaded), {
    transport: 'tcp',
    host: '127.0.0.1',
    port: '10110',
    source: 'BOAT'
  });
});