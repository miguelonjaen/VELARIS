import { INSTRUMENT_MAX_AGE_MS, type AgedValue, type BoatInstrumentSnapshot } from '../../core/instruments/BoatInstrumentStore';

export const BOAT_TABS = [
  { id: 'general', label: 'General' }, { id: 'tanks', label: 'Depósitos' },
  { id: 'electrical', label: 'Electricidad' }, { id: 'engine', label: 'Motores' },
] as const;
export type BoatTab = typeof BOAT_TABS[number]['id'];
export const TANK_NAMES = { fuel: 'Combustible', freshWater: 'Agua dulce', greyWater: 'Aguas grises', blackWater: 'Aguas negras' } as const;

/** Defensive boundary: stale, nonfinite or future-dated readings never drive graphics. */
export function currentValue(reading: AgedValue<number> | null, maxAge: number = INSTRUMENT_MAX_AGE_MS.transducer): number | null {
  return reading && Number.isFinite(reading.value) && Number.isFinite(reading.ageMs)
    && reading.ageMs >= 0 && reading.ageMs <= maxAge ? reading.value : null;
}
export function tankVisuals(snapshot: BoatInstrumentSnapshot) {
  return snapshot.tanks.map(tank => {
    const value = currentValue(tank.percent);
    return { name: tank.name, kind: tank.kind, percent: value !== null && value >= 0 && value <= 100 ? value : null };
  });
}
export function batteryPower(volts: AgedValue<number> | null, amps: AgedValue<number> | null): number | null {
  const v = currentValue(volts), a = currentValue(amps);
  return v !== null && a !== null && volts && amps && Math.abs(volts.ageMs - amps.ageMs) <= 2000 ? v * a : null;
}
/** Current telemetry has no endpoints/switch state. Voltage or RPM cannot establish a circuit. */
export function hasConfirmedElectricalCircuit(): boolean { return false; }

/** Relay state is feedback only, never a command or confirmation of light emission. */
export function relayLabel(reading: AgedValue<0 | 1> | null | undefined): string {
  const value = currentValue(reading ?? null);
  return value === 1 ? 'Relé cerrado' : value === 0 ? 'Relé abierto' : 'Desconocido';
}
