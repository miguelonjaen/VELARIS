import type { BoatInstrumentSnapshot, LightCircuit } from '../../core/instruments/BoatInstrumentStore';
import { currentValue } from './boatVisualModel';
import { CONSUMERS, type ConsumerSettings } from './electricalConsumers';

export type NavigationInstallation = 'separate' | 'tricolor';
export interface MapLights { port: boolean; starboard: boolean; stern: boolean; masthead: boolean; tricolor: boolean; anchor: boolean; fog: boolean; simulated: boolean }
export const UNLIT_MAP_LIGHTS: MapLights = { port: false, starboard: false, stern: false, masthead: false, tricolor: false, anchor: false, fog: false, simulated: false };
const NAV_IDS = ['port', 'starboard', 'stern', 'masthead', 'tricolor'] as const;
export function switchNavigationLights(settings: ConsumerSettings | undefined, on: boolean | null, installation: NavigationInstallation): ConsumerSettings {
  const next = { ...settings };
  for (const id of NAV_IDS) {
    const definition = CONSUMERS.find(c => c.id === id)!;
    const selected = installation === 'tricolor' ? id === 'tricolor' : id !== 'tricolor';
    next[id] = { on: on === null ? null : selected && on, amps: settings?.[id]?.amps ?? definition.amps };
  }
  return next;
}
export function mapLightsFromInstruments(instruments: BoatInstrumentSnapshot, simulated: boolean, fogOn = false): MapLights {
  const on = (circuit: LightCircuit) => currentValue(instruments.lights?.find(l => l.circuit === circuit)?.relay ?? null) === 1;
  // A grouped relay cannot prove which individual lamps are powered.
  return { port: on('LIGHT_PORT_RELAY'), starboard: on('LIGHT_STARBOARD_RELAY'), stern: on('LIGHT_STERN_RELAY'), masthead: on('LIGHT_MASTHEAD_RELAY'), tricolor: on('LIGHT_TRICOLOR_RELAY'), anchor: on('LIGHT_ANCHOR_RELAY'), fog: simulated && fogOn, simulated };
}
/** Local accessory settings stay independent from the navigation-light installation. */
export function switchFogLight(settings: ConsumerSettings | undefined, on: boolean): ConsumerSettings {
  return { ...settings, fog: { on, amps: settings?.fog?.amps ?? 0 } };
}
export function navigationLightsOn(lights: MapLights, installation: NavigationInstallation): boolean {
  return installation === 'tricolor' ? lights.tricolor : lights.port && lights.starboard && lights.stern && lights.masthead;
}
