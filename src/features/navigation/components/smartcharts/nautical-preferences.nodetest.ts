import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NAUTICAL_PREFERENCES_KEY, readBrowserNauticalPreferences, readNauticalPreferences, saveNauticalPreferences, resolveNauticalDisplay, type NauticalSource } from './nautical-preferences';

test('original OpenSeaMap portrayal is the default for a new configuration', () => {
  assert.deepEqual(readNauticalPreferences({ getItem: () => null }), { version: 1, source: 'openseamap' });
});

test('online, offline and disabled choices survive successive sessions independently of bathymetry', () => {
  const values = new Map<string, string>([['velaris.smartcharts.bathymetry.v1', '{"version":1,"reliefEnabled":false,"bathymetryEnabled":true}']]);
  const storage = { getItem: (key: string): string | null => values.get(key) ?? null,
    setItem: (key: string, value: string): void => { values.set(key, value); } };
  for (const source of ['none', 'local', 'offline', 'openseamap', 'none'] satisfies NauticalSource[]) {
    const preferences = { version: 1 as const, source };
    assert.equal(saveNauticalPreferences(preferences, storage), true);
    assert.deepEqual(readNauticalPreferences(storage), preferences);
    assert.equal(JSON.parse(values.get(NAUTICAL_PREFERENCES_KEY)!).source, source);
  }
  assert.equal(values.get('velaris.smartcharts.bathymetry.v1'), '{"version":1,"reliefEnabled":false,"bathymetryEnabled":true}');
});

test('corrupt, unsupported or unreadable saved preferences never silently enable network requests', () => {
  for (const raw of ['', '{', 'null', '[]', '{}', '{"version":2,"source":"openseamap"}', '{"version":1,"source":true}']) {
    assert.equal(readNauticalPreferences({ getItem: () => raw }).source, 'none');
  }
  assert.equal(readNauticalPreferences({ getItem: () => { throw new Error('denied'); } }).source, 'none');
});

test('storage failure is reported and leaves the previous saved choice intact', () => {
  const previous = '{"version":1,"source":"local"}';
  const storage = { getItem: (): string => previous, setItem: (): void => { throw new Error('quota'); } };
  assert.equal(saveNauticalPreferences({ version: 1, source: 'none' }, storage), false);
  assert.equal(readNauticalPreferences(storage).source, 'local');
});

test('blocked access to browser localStorage cannot prevent map initialization', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    get localStorage(): never { throw new Error('blocked'); },
  } });
  try {
    assert.equal(readBrowserNauticalPreferences().source, 'none');
    assert.equal(saveNauticalPreferences({ version: 1, source: 'openseamap' }), false);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'window', descriptor);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});

test('offline mode remains offline; online failures use the local package without overwriting the saved choice', () => {
  for (const online of [true, false]) for (const failed of [true, false]) {
    assert.equal(resolveNauticalDisplay('offline', online, failed), 'offline');
    assert.equal(resolveNauticalDisplay('local', online, failed), 'local');
    assert.equal(resolveNauticalDisplay('none', online, failed), 'none');
    assert.equal(resolveNauticalDisplay('openseamap', online, failed), online && !failed ? 'openseamap' : 'offline');
  }
});