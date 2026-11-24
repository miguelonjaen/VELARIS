import type { EngineReadings } from '../../core/instruments/BoatInstrumentStore';
import { INSTRUMENT_MAX_AGE_MS } from '../../core/instruments/BoatInstrumentStore';
import { currentValue } from './boatVisualModel';
export function engineVisualModel(engine: EngineReadings | null) {
  const rpm = currentValue(engine?.rpm ?? null, INSTRUMENT_MAX_AGE_MS.rpm);
  return {
    rpm,
    temperature: currentValue(engine?.temperatureC ?? null),
    oil: currentValue(engine?.oilPressureBar ?? null),
    state: rpm === null ? 'Desconocido' : rpm === 0 ? 'Parado' : 'En marcha',
  } as const;
}
