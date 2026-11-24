export const NAUTICAL_PREFERENCES_KEY = 'velaris.smartcharts.nautical.v1';
export type NauticalSource = 'openseamap' | 'local' | 'offline' | 'none';
export interface NauticalPreferences { version: 1; source: NauticalSource }
type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function readNauticalPreferences(storage: Pick<PreferenceStorage, 'getItem'>): NauticalPreferences {
  const fallback: NauticalPreferences = { version: 1, source: 'none' };
  try {
    const raw = storage.getItem(NAUTICAL_PREFERENCES_KEY);
    if (raw === null) return { version: 1, source: 'openseamap' };
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null || !('version' in value) || value.version !== 1 || !('source' in value)) return fallback;
    return value.source === 'openseamap' || value.source === 'local' || value.source === 'offline' || value.source === 'none'
      ? { version: 1, source: value.source } : fallback;
  } catch {
    // Failed reads must not override a potentially saved opt-out.
    return fallback;
  }
}

export function readBrowserNauticalPreferences(): NauticalPreferences {
  return readNauticalPreferences({ getItem: key => window.localStorage.getItem(key) });
}

export function saveNauticalPreferences(preferences: NauticalPreferences, storage?: Pick<PreferenceStorage, 'setItem'>): boolean {
  try {
    (storage ?? window.localStorage).setItem(NAUTICAL_PREFERENCES_KEY, JSON.stringify(preferences));
    return true;
  } catch {
    return false;
  }
}

/** Explicit offline mode never contacts a public tile service, even if the browser reports connectivity. */
export function resolveNauticalDisplay(source: NauticalSource, online: boolean, tileFailure: boolean): NauticalSource {
  return source === 'openseamap' && (!online || tileFailure) ? 'offline' : source;
}