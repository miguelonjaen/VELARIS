import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { BATHYMETRY_PREFERENCES_KEY, readBathymetryPreferences, saveBathymetryPreferences } from './layer-preferences';

test('first start enables both layers only when preferences are absent', () => {
  assert.deepEqual(readBathymetryPreferences({ getItem: key => {
    assert.equal(key, BATHYMETRY_PREFERENCES_KEY);
    return null;
  } }), { version: 1, reliefEnabled: true, bathymetryEnabled: true });
});

test('all independent user choices survive saving and a subsequent session', () => {
  for (const reliefEnabled of [false, true]) for (const bathymetryEnabled of [false, true]) {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string): string | null => values.get(key) ?? null,
      setItem: (key: string, value: string): void => { values.set(key, value); } };
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: storage } });
    try {
      const preferences = { version: 1 as const, reliefEnabled, bathymetryEnabled };
      assert.equal(saveBathymetryPreferences(preferences), true);
      assert.deepEqual(readBathymetryPreferences(storage), preferences);
    } finally {
      if (previous) Object.defineProperty(globalThis, 'window', previous);
      else Reflect.deleteProperty(globalThis, 'window');
    }
  }
});

test('invalid, partial and unavailable storage never silently opts a layer in', () => {
  for (const raw of ['', '{', 'null', '{}', '{"version":2,"reliefEnabled":true}', '{"version":1,"reliefEnabled":"true"}']) {
    const value = readBathymetryPreferences({ getItem: () => raw });
    assert.equal(value.reliefEnabled, false);
    assert.equal(value.bathymetryEnabled, false);
  }
  assert.equal(readBathymetryPreferences({ getItem: () => { throw new Error('denied'); } }).reliefEnabled, false);
  assert.deepEqual(readBathymetryPreferences({ getItem: () => '{"version":1,"reliefEnabled":true}' }),
    { version: 1, reliefEnabled: true, bathymetryEnabled: false });
});

test('background layers remain below ENC, seamarks and local aids', () => {
  const read = (file: string): string => readFileSync(new URL(file, import.meta.url), 'utf8');
  const overlay = read('./SmartChartsPilotOverlay.tsx');
  for (const order of [340, 350, 360]) assert.match(overlay, new RegExp(`zIndex: ?${order}`));
  assert.match(read('./SeamarkLayer.tsx'), /zIndex:370/);
  assert.match(read('./LocalNauticalLayer.tsx'), /zIndex:375/);
  assert.match(read('../TacticalMap.tsx'), /pane.style.zIndex = '450'/);
});
