export const BATHYMETRY_PREFERENCES_KEY = 'velaris.smartcharts.bathymetry.v1';

export interface BathymetryPreferences {
  version: 1;
  reliefEnabled: boolean;
  bathymetryEnabled: boolean;
}

type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

// Only absence means first use. Unreadable/invalid saved data must not opt layers in.
export function readBathymetryPreferences(storage: Pick<PreferenceStorage, 'getItem'>): BathymetryPreferences {
  const fallback: BathymetryPreferences = { version: 1, reliefEnabled: false, bathymetryEnabled: false };
  try {
    const raw = storage.getItem(BATHYMETRY_PREFERENCES_KEY);
    if (raw === null) return { ...fallback, reliefEnabled: true, bathymetryEnabled: true };
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null || !('version' in value) || value.version !== 1) return fallback;
    return {
      ...fallback,
      reliefEnabled: 'reliefEnabled' in value && value.reliefEnabled === true,
      bathymetryEnabled: 'bathymetryEnabled' in value && value.bathymetryEnabled === true,
    };
  } catch {
    return fallback;
  }
}

export function readBrowserBathymetryPreferences(): BathymetryPreferences {
  // Accessing localStorage itself can throw (restricted origins or storage policies).
  return readBathymetryPreferences({ getItem: key => window.localStorage.getItem(key) });
}

export function saveBathymetryPreferences(preferences: BathymetryPreferences): boolean {
  try {
    window.localStorage.setItem(BATHYMETRY_PREFERENCES_KEY, JSON.stringify(preferences));
    return true;
  } catch {
    return false;
  }
}
