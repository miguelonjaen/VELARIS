import type { ResolvedNavigationState, NavigationSource } from '../../../core/navigation/SharedNavigationState';
import type { BoatInstrumentSnapshot } from '../../../core/instruments/BoatInstrumentStore';
import type { NmeaServiceStatusView } from '../nmeaGatewayConfig';
import { candidateKey, type Candidate } from './contracts';

/** Read-only projection; freshness/validity and priorities remain owned by existing stores. */
export function activeCandidateView(candidate: Candidate, status: NmeaServiceStatusView | null, nav: ResolvedNavigationState, instruments: BoatInstrumentSnapshot, now: number): Candidate {
  if (!status?.transport) return candidate;
  const key = candidateKey(status.transport === 'tcp' ? { transport: 'tcp', host: status.host ?? '', port: status.port ?? 0 } : { transport: 'serial', path: status.portPath ?? '' });
  if (key !== candidate.id) return candidate;
  const source: NavigationSource = status.source === 'SIMULATOR' ? 'SIMULATOR' : 'BOAT';
  const fields = Object.values(nav);
  const available = fields.filter(f => f.sources[source] === 'VALID').map(f => f.field as string);
  const received = fields.filter(f => f.source === source && f.receivedAt !== null).map(f => f.receivedAt!);
  if (source === 'BOAT') {
    if (instruments.depth) { available.push('depth'); received.push(now - instruments.depth.ageMs); }
    const wind = instruments.windApparent ?? instruments.windTrue ?? instruments.windDirectionTrue;
    if (wind) { available.push('wind'); received.push(now - wind.ageMs); }
  }
  const degraded = fields.some(f => f.sources[source] === 'STALE' || f.sources[source] === 'INVALID');
  const state = status.state === 'CONNECTED'
    ? available.length ? (degraded || !['position', 'sog', 'cog'].every(f => available.includes(f)) ? 'DEGRADED' : 'CONNECTED') : degraded ? 'DEGRADED' : 'NO_DATA'
    : status.state === 'RECONNECTING' ? 'CONNECTING' : status.state;
  return { ...candidate, state, protocol: available.length ? 'NMEA0183' : candidate.protocol, instruments: available,
    lastValidAt: received.length ? Math.max(...received) : null,
    reason: `${source} · Servicio ${status.state}; ${available.length ? 'datos validados por los almacenes existentes' : 'sin instrumentos vigentes'}`,
    action: available.length ? 'Revisar disponibilidad por instrumento' : 'Comprobar salida de instrumentos y configuración' };
}
