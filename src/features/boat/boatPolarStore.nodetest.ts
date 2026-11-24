import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBoatPolar, saveBoatPolar, removeBoatPolar } from './boatPolarStore';

test('configuración local por barco: vacío, guardado, recarga, retirada y JSON inválido', () => {
  const oldStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key)
  } });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
  try {
    assert.equal(loadBoatPolar('boat-a'), null);
    const text = 'TWA/TWS;6;10\n40;4;6\n90;5;7';
    saveBoatPolar('boat-a', 'Polar A', text);
    assert.equal(loadBoatPolar('boat-a')?.name, 'Polar A'); assert.equal(loadBoatPolar('boat-b'), null);
    saveBoatPolar('boat-b', 'Polar B', text); removeBoatPolar('boat-a');
    assert.equal(loadBoatPolar('boat-a'), null); assert.equal(loadBoatPolar('boat-b')?.name, 'Polar B');
    assert.throws(() => saveBoatPolar('boat-b', 'Inválida', 'texto incorrecto'));
    assert.equal(loadBoatPolar('boat-b')?.name, 'Polar B');
    data.set('VELARIS_boat_polar:boat-b', '{bad json'); assert.equal(loadBoatPolar('boat-b'), null);
  } finally {
    if (oldStorage) Object.defineProperty(globalThis, 'localStorage', oldStorage); else Reflect.deleteProperty(globalThis, 'localStorage');
    if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow); else Reflect.deleteProperty(globalThis, 'window');
  }
});
