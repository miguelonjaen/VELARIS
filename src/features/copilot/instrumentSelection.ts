import type {
  AgedValue,
  BatteryReadings,
  BoatInstrumentSnapshot,
  EngineReadings,
  LightReading,
  TankReading
} from '../../core/instruments/BoatInstrumentStore';

export type InstrumentProvenance = 'BOAT' | 'SIMULATOR';

export interface SelectedInstrumentSnapshot {
  snapshot: BoatInstrumentSnapshot;
  simulated: boolean;
  sources: ReadonlySet<InstrumentProvenance>;
}

function choose<T>(boat: T | null | undefined, simulator: T | null | undefined, sources: Set<InstrumentProvenance>): T | null {
  if (boat !== null && boat !== undefined) { sources.add('BOAT'); return boat; }
  if (simulator !== null && simulator !== undefined) { sources.add('SIMULATOR'); return simulator; }
  return null;
}

function mergeEngines(boat: readonly EngineReadings[], simulator: readonly EngineReadings[], sources: Set<InstrumentProvenance>): EngineReadings[] {
  const ids = new Set([...boat.map(value => value.engine), ...simulator.map(value => value.engine)]);
  return [...ids].sort((a, b) => a - b).map(engine => {
    const real = boat.find(value => value.engine === engine);
    const simulated = simulator.find(value => value.engine === engine);
    return {
      engine,
      rpm: choose(real?.rpm, simulated?.rpm, sources),
      temperatureC: choose(real?.temperatureC, simulated?.temperatureC, sources),
      oilPressureBar: choose(real?.oilPressureBar, simulated?.oilPressureBar, sources)
    };
  }).filter(value => value.rpm || value.temperatureC || value.oilPressureBar);
}

function mergeBatteries(boat: readonly BatteryReadings[], simulator: readonly BatteryReadings[], sources: Set<InstrumentProvenance>): BatteryReadings[] {
  const names = new Set([...boat.map(value => value.name), ...simulator.map(value => value.name)]);
  return [...names].sort().map(name => {
    const real = boat.find(value => value.name === name);
    const simulated = simulator.find(value => value.name === name);
    return {
      name,
      role: real?.role ?? simulated?.role ?? 'unknown',
      volts: choose(real?.volts, simulated?.volts, sources),
      amps: choose(real?.amps, simulated?.amps, sources),
      socPercent: choose(real?.socPercent, simulated?.socPercent, sources)
    };
  });
}

function mergeByKey<T>(boat: readonly T[], simulator: readonly T[], key: (value: T) => string, sources: Set<InstrumentProvenance>): T[] {
  const output = new Map<string, T>();
  for (const value of simulator) output.set(key(value), value);
  if (simulator.length) sources.add('SIMULATOR');
  for (const value of boat) output.set(key(value), value);
  if (boat.length) sources.add('BOAT');
  return [...output.values()];
}

/** Combina por campo sin convertir nunca una lectura SIMULATOR en BOAT. */
export function selectOfficerInstruments(boat: BoatInstrumentSnapshot, simulator: BoatInstrumentSnapshot): SelectedInstrumentSnapshot {
  const sources = new Set<InstrumentProvenance>();
  const snapshot: BoatInstrumentSnapshot = {
    depth: choose(boat.depth, simulator.depth, sources),
    windApparent: choose(boat.windApparent, simulator.windApparent, sources),
    windTrue: choose(boat.windTrue, simulator.windTrue, sources),
    windDirectionTrue: choose(boat.windDirectionTrue, simulator.windDirectionTrue, sources),
    speedThroughWater: choose(boat.speedThroughWater, simulator.speedThroughWater, sources),
    engines: mergeEngines(boat.engines, simulator.engines, sources),
    alternatorAmps: choose(boat.alternatorAmps, simulator.alternatorAmps, sources),
    alternatorCurrentSource: boat.alternatorAmps ? boat.alternatorCurrentSource : simulator.alternatorCurrentSource,
    alternatorVolts: choose(boat.alternatorVolts, simulator.alternatorVolts, sources),
    batteries: mergeBatteries(boat.batteries, simulator.batteries, sources),
    tanks: mergeByKey<TankReading>(boat.tanks, simulator.tanks, value => `${value.kind}:${value.name}`, sources),
    lights: mergeByKey<LightReading>(boat.lights ?? [], simulator.lights ?? [], value => value.circuit, sources),
    solar: {
      pvVolts: choose(boat.solar?.pvVolts, simulator.solar?.pvVolts, sources),
      pvAmps: choose(boat.solar?.pvAmps, simulator.solar?.pvAmps, sources),
      outputVolts: choose(boat.solar?.outputVolts, simulator.solar?.outputVolts, sources),
      outputAmps: choose(boat.solar?.outputAmps, simulator.solar?.outputAmps, sources)
    }
  };
  return { snapshot, simulated: sources.has('SIMULATOR'), sources };
}

export function instrumentReading<T>(value: AgedValue<T> | null | undefined): T | null {
  return value?.value ?? null;
}
