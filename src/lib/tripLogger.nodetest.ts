// Métricas del registrador de travesía con lecturas ausentes (node:test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TripLogger, type TripSession } from './tripLogger';

const session = (entries: TripSession['entries']): TripSession => ({
  id: 't', shipId: 's', startTime: 0, endTime: 3_600_000, entries, isActive: false
});

test('10 · sin viento ni SOG medidos las métricas quedan sin dato, no a cero', () => {
  const m = TripLogger.calculateMetrics(session([
    { timestamp: 0, lat: 36.6, lng: -4.5, cog: null, sog: null, windDir: null, windSpeed: null, depth: null },
    { timestamp: 300_000, lat: 36.61, lng: -4.5, cog: 0, sog: 6, windDir: null, windSpeed: null, depth: null }
  ]));
  assert.ok(m);
  assert.equal(m.avgSOG, 6, 'el promedio solo cuenta las lecturas presentes');
  assert.equal(m.avgWindSpeed, null);
  assert.equal(m.bestVMG, null);
  assert.ok(m.totalDistance > 0.5 && m.totalDistance < 0.7);
});


test('IndexedDB pendiente: salida persistida tras abrir, inicio idempotente y punto inmediato', async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalDb = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  const saved: TripSession[] = [];
  let puts = 0;
  const database = {
    transaction: () => {
      const tx = {
        oncomplete: null as (() => void) | null,
        objectStore: () => ({
          put: (value: TripSession) => {
            puts++;
            saved.push(structuredClone(value));
            setTimeout(() => tx.oncomplete?.(), 0);
          }
        })
      };
      return tx;
    }
  };
  const request = { result: database, onsuccess: null as (() => void) | null };
  const indexedDb = { open: () => request };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { indexedDB: indexedDb } });
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: indexedDb });
  let logger: TripLogger | null = null;
  try {
    logger = new TripLogger();
    const first = logger.startSession('boat');
    const duplicate = logger.startSession('boat');
    await Promise.resolve();
    assert.equal(puts, 0, 'no se pierde el guardado por abrir la base más tarde');
    request.onsuccess?.();
    const [a, b] = await Promise.all([first, duplicate]);
    assert.equal(a.id, b.id);
    assert.equal(saved.length, 1);
    logger.setupAutoLogging(() => ({ lat: 36.6, lng: -4.5, cog: 90, sog: 6, windDir: null, windSpeed: null, depth: null }));
    await new Promise(resolve => setTimeout(resolve, 20));
    logger.stopAutoLogging();
    assert.equal(saved.at(-1)?.entries.length, 1, 'punto de salida guardado sin esperar cinco minutos');
    await assert.rejects(logger.startSession('other-boat'), /Finalice/);
    await logger.endSession();
    assert.equal(saved.at(-1)?.isActive, false);
  } finally {
    logger?.stopAutoLogging();
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    if (originalDb) Object.defineProperty(globalThis, 'indexedDB', originalDb);
    else Reflect.deleteProperty(globalThis, 'indexedDB');
  }
});
