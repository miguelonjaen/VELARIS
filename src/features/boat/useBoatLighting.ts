import { createContext, useEffect, useState } from 'react';
import { app } from '../../application';
import { buildChargeModel, readChargeScenario, type ChargeSettings } from './chargingPolicy';
import { mapLightsFromInstruments, navigationLightsOn, switchNavigationLights, switchFogLight, UNLIT_MAP_LIGHTS, type NavigationInstallation } from './navigationLights';

export const BOAT_LIGHTING_CHANGED = 'gaulos:boat-lighting-changed';
export const MapLightsContext = createContext(UNLIT_MAP_LIGHTS);
export function saveChargeScenario(vesselId: string | null, enabled: boolean, settings: ChargeSettings): boolean {
  if (!vesselId) return false;
  try {
    localStorage.setItem(`velaris:charge-scenario:${vesselId}`, JSON.stringify({ enabled, settings }));
    window.dispatchEvent(new Event(BOAT_LIGHTING_CHANGED));
    return true;
  } catch { return false; }
}
export function useBoatLighting(vesselId: string | null) {
  const [, tick] = useState(0);
  const [error, setError] = useState(false);
  useEffect(() => {
    const refresh = () => tick(t => t + 1);
    const timer = window.setInterval(refresh, 1000);
    window.addEventListener(BOAT_LIGHTING_CHANGED, refresh);
    window.addEventListener('storage', refresh);
    return () => { clearInterval(timer); window.removeEventListener(BOAT_LIGHTING_CHANGED, refresh); window.removeEventListener('storage', refresh); };
  }, []);
  const raw = app.boatInstruments.snapshot();
  const scenario = readChargeScenario(vesselId, raw);
  const installation = scenario.settings.navigationInstallation ?? 'separate';
  const model = scenario.enabled ? buildChargeModel(raw, scenario.settings, null, Date.now()) : null;
  const instruments = model?.instruments ?? raw;
  const fogOn = model?.consumers.some(consumer => consumer.id === 'fog' && consumer.on) ?? false;
  const mapLights = mapLightsFromInstruments(instruments, scenario.enabled, fogOn);
  const on = navigationLightsOn(mapLights, installation);
  const save = (enabled: boolean, settings: ChargeSettings) => { const ok = saveChargeScenario(vesselId, enabled, settings); setError(!ok); return ok; };
  return { mapLights, on, fogOn, installation, enabled: scenario.enabled, error,
    toggleFog: () => save(true, { ...scenario.settings, consumers: switchFogLight(scenario.settings.consumers, !fogOn) }),
    toggle: () => save(true, { ...scenario.settings, consumers: switchNavigationLights(scenario.settings.consumers, !on, installation) }),
    setInstallation: (value: NavigationInstallation) => save(scenario.enabled, { ...scenario.settings, navigationInstallation: value, consumers: switchNavigationLights(scenario.settings.consumers, on, value) }) };
}
