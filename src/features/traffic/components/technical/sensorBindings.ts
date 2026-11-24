import { INSTRUMENT_MAX_AGE_MS, type AgedValue, type BoatInstrumentSnapshot } from '../../../../core/instruments/BoatInstrumentStore';
import type { NmeaServiceStatusView } from '../../../nmea/nmeaGatewayConfig';
import type { SensorBinding, SensorChannel, TechnicalInventory } from './model';

export interface InstrumentFeed {
  vesselId: string | null;
  connection: NmeaServiceStatusView | null;
  capturedAt: number;
  instruments: BoatInstrumentSnapshot;
}
export type InstrumentProvider = () => Promise<InstrumentFeed | null>;
export interface SensorOption { channel: SensorChannel; sensor: string; metric: SensorBinding['metric']; label: string; reading: AgedValue<number>; unit: 'V' | 'A' | '%' }
export interface ConfirmedConnection { vesselId: string; connection: string; at: number }

/** Endpoint is an explicit user declaration, never proof of a physical vessel. */
export function connectionFingerprint(status: NmeaServiceStatusView | null): string | null {
  if (status?.state !== 'CONNECTED' || status.source !== 'BOAT') return null;
  if (status.transport === 'serial' && status.portPath?.trim()) return JSON.stringify(['serial', status.portPath]);
  if (status.transport === 'tcp' && status.host?.trim() && status.port !== null && Number.isInteger(status.port) && status.port > 0 && status.port <= 65535) return JSON.stringify(['tcp', status.host, status.port]);
  return null;
}

export function sensorOptions(instruments: BoatInstrumentSnapshot): SensorOption[] {
  const options: SensorOption[] = [];
  const add = (channel: SensorChannel, sensor: string, metric: SensorBinding['metric'], label: string, reading: AgedValue<number> | null | undefined, unit: SensorOption['unit']) => {
    const inRange=reading && (unit === '%' ? reading.value >= 0 && reading.value <= 100 : unit === 'V' ? reading.value >= 0 && reading.value <= 1000 : Math.abs(reading.value) <= 2000 && (channel === 'battery-current' || reading.value >= 0));
    if (inRange && reading && Number.isFinite(reading.value) && Number.isFinite(reading.ageMs) && reading.ageMs >= 0 && reading.ageMs <= INSTRUMENT_MAX_AGE_MS.transducer) options.push({channel,sensor,metric,label,reading,unit});
  };
  for (const b of instruments.batteries) {
    add('battery-voltage', b.name, 'voltage', `${b.name} · tensión`, b.volts, 'V');
    add('battery-soc', b.name, 'soc', `${b.name} · SOC`, b.socPercent, '%');
    add('battery-current', b.name, 'current', `${b.name} · corriente neta`, b.amps, 'A');
  }
  for (const t of instruments.tanks) add('tank-level', t.name, 'level', `${t.name} · nivel`, t.percent, '%');
  add('solar-voltage', 'SOLAR0_OUT', 'voltage', 'Regulador solar · tensión de salida medida', instruments.solar?.outputVolts, 'V');
  add('alternator-voltage', 'alternator-common', 'voltage', 'Alternador · tensión medida', instruments.alternatorVolts, 'V');
  add('solar-current', 'SOLAR0_OUT', 'current', 'Solar · corriente de salida medida', instruments.solar?.outputAmps, 'A');
  if (instruments.alternatorCurrentSource === 'measured') add('alternator-current', 'alternator-common', 'current', 'Alternador · corriente común medida', instruments.alternatorAmps, 'A');
  return options;
}

/** Net battery current never becomes source/consumer branch current. */
export function compatibleTarget(inventory: TechnicalInventory, targetId: string, channel: SensorChannel): boolean {
  const component = inventory.components.find(c => c.id === targetId);
  if (channel === 'tank-level') return component?.kind === 'tank';
  if (channel === 'battery-voltage' || channel === 'battery-soc') return component?.kind === 'battery' || component?.kind === 'bank';
  if (channel === 'battery-current') return component?.kind === 'battery' || component?.kind === 'bank';
  const device = inventory.electrical?.devices.find(d => d.componentId === targetId);
  if (device && (['solar-current','solar-voltage'].includes(channel) && device.catalogId === 'controller' || ['alternator-current','alternator-voltage'].includes(channel) && device.catalogId === 'alternator')) return true;
  if (channel === 'solar-voltage' || channel === 'alternator-voltage') return false;
  const link = inventory.installation?.links.find(l => l.id === targetId && l.medium === 'cable');
  const source = inventory.installation?.nodes.find(n => n.id === link?.from);
  return !!link && source?.kind === (channel === 'solar-current' ? 'solar' : 'alternator')
    && (channel !== 'solar-current' || !inventory.installation?.nodes.some(n => n.id === link.to && n.kind === 'controller'))
    && inventory.installation?.links.filter(l => l.from === source.id).length === 1;
}

export function validateSensorBindings(value: unknown, inventory: TechnicalInventory): asserts value is SensorBinding[] {
  if (!Array.isArray(value) || value.length > 4000) throw new Error('Vínculos de sensores inválidos');
  const targets = new Set<string>(), sensors = new Set<string>();
  const metrics: Record<SensorChannel, SensorBinding['metric']> = {'tank-level':'level','battery-voltage':'voltage','battery-soc':'soc','battery-current':'current','solar-current':'current','alternator-current':'current','solar-voltage':'voltage','alternator-voltage':'voltage'};
  for (const v of value) {
    if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).some(k => !['targetId','metric','channel','sensor','connection'].includes(k))) throw new Error('Vínculo de sensor inválido');
    const b = v as Record<string, unknown>;
    if (typeof b.channel !== 'string' || !Object.prototype.hasOwnProperty.call(metrics,b.channel) || b.metric !== metrics[b.channel as SensorChannel]
      || typeof b.targetId !== 'string' || typeof b.sensor !== 'string' || !b.sensor.trim() || b.sensor.length > 240
      || typeof b.connection !== 'string' || !b.connection.trim() || b.connection.length > 1024
      || !compatibleTarget(inventory,b.targetId,b.channel as SensorChannel)
      || ['solar-current','solar-voltage'].includes(String(b.channel)) && b.sensor !== 'SOLAR0_OUT'
      || ['alternator-current','alternator-voltage'].includes(String(b.channel)) && b.sensor !== 'alternator-common') throw new Error('Sensor o destino incompatible; no se permite inferir ramales');
    const target = JSON.stringify([b.targetId,b.metric]), sensor = JSON.stringify([b.connection,b.channel,b.sensor]);
    if (targets.has(target) || sensors.has(sensor)) throw new Error('Sensor o magnitud asignados más de una vez');
    targets.add(target); sensors.add(sensor);
  }
}

export function resolveBinding(binding: SensorBinding, feed: InstrumentFeed | null, confirmation: ConfirmedConnection | null, vesselId: string, now: number): SensorOption | null {
  if (!feed || !confirmation || feed.vesselId !== vesselId || confirmation.vesselId !== vesselId
    || now < feed.capturedAt || now - feed.capturedAt > 2500 || confirmation.at > now
    || binding.connection !== confirmation.connection || connectionFingerprint(feed.connection) !== confirmation.connection) return null;
  const option = sensorOptions(feed.instruments).find(s => s.channel === binding.channel && s.sensor === binding.sensor);
  if (!option || feed.capturedAt - option.reading.ageMs < confirmation.at
    || now - feed.capturedAt + option.reading.ageMs > INSTRUMENT_MAX_AGE_MS.transducer) return null;
  return option;
}
