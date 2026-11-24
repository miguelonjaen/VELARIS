import { networkInterfaces } from 'node:os';
import { createConnection } from 'node:net';
import { NMEALineSplitter, validateConnectionTarget, type NMEAService } from '../../../NMEAService';
import { NMEAParser } from '../../core/services/NMEAParser';
import { LIMITS, type Candidate } from '../../features/nmea/startupDiagnostics/contracts';
import { StartupDiagnosticsService } from './StartupDiagnosticsService';
import { discoverSignalK, eligibleInterface } from './signalKDiscovery';

export function configuredCandidate(target: unknown): Candidate | null {
  const validation = validateConnectionTarget(target);
  if (validation.ok === false) return null;
  const t = validation.target;
  return { id: '', transport: t.transport, ...(t.transport === 'tcp' ? { host: t.host.toLowerCase().replace(/\.$/, ''), port: t.port } : { path: t.path }), configured: true, state: 'NOT_CONFIGURED', protocol: 'UNKNOWN', lastValidAt: null, instruments: [], reason: 'Destino configurado; pendiente de comprobación', action: 'Revisar configuración' };
}

export function probeTcp(candidate: Candidate, signal: AbortSignal): Promise<Candidate> {
  return new Promise(resolve => {
    if (signal.aborted) { resolve(candidate); return; }
    const socket = createConnection({ host: candidate.host!, port: candidate.port! });
    const parser = new NMEAParser(), splitter = new NMEALineSplitter();
    let settled = false, compatible = false;
    let identify: ReturnType<typeof setTimeout> | undefined, telemetry: ReturnType<typeof setTimeout> | undefined;
    const finish = (state: Candidate['state'], reason: string, valid = false) => {
      if (settled) return; settled = true;
      clearTimeout(connect); clearTimeout(identify); clearTimeout(telemetry); signal.removeEventListener('abort', cancel);
      socket.destroy();
      resolve({ ...candidate, state, reason, protocol: compatible ? 'NMEA0183' : 'UNKNOWN', lastValidAt: valid ? Date.now() : null, action: valid ? 'Conectar desde configuración para validar instrumentos y caducidad' : 'Comprobar alimentación, dirección y salida del gateway' });
    };
    const cancel = () => finish('DISCONNECTED', 'Comprobación cancelada');
    const connect = setTimeout(() => finish('ERROR', 'Timeout TCP (2 s)'), LIMITS.tcp);
    signal.addEventListener('abort', cancel, { once: true });
    socket.once('connect', () => {
      clearTimeout(connect);
      identify = setTimeout(() => { if (!compatible) finish('NO_DATA', 'TCP accesible; protocolo sin identificar (3 s)'); }, LIMITS.identification);
      telemetry = setTimeout(() => finish('NO_DATA', 'Protocolo identificado sin telemetría decodificable (5 s)'), LIMITS.telemetry);
    });
    socket.on('data', chunk => {
      for (const line of splitter.push(chunk.toString('utf8'))) {
        const message = parser.parse(line);
        if (message.type === 'NMEA_INVALID' || !/^[!$][A-Z0-9]{5},/.test(line)) continue;
        compatible = true;
        // RAW (including undecoded AIS) cannot prove valid instruments.
        if (message.type !== 'RAW' && message.type !== 'AIS') { finish('CONNECTED', 'NMEA 0183 decodificado; disponibilidad real en instrumentos activos', true); return; }
      }
    });
    socket.once('error', () => finish('ERROR', 'No se pudo acceder al endpoint configurado'));
    socket.once('close', () => finish('DISCONNECTED', 'El gateway cerró el transporte'));
  });
}

export function createDesktopDiagnostics(service: () => NMEAService | undefined): StartupDiagnosticsService {
  return new StartupDiagnosticsService({
    interfaces: async () => Object.entries(networkInterfaces()).flatMap(([name, addresses]) => (addresses ?? []).filter(a => a.family === 'IPv4').map(a => ({ name, address: a.address, netmask: a.netmask, eligible: eligibleInterface(name, a.address, a.internal) }))),
    serial: async () => (await service()?.listPorts() ?? []).map(p => p.path),
    configured: configuredCandidate,
    active: () => {
      const status = service()?.getStatus();
      if (!status?.transport) return null;
      const candidate = configuredCandidate(status.transport === 'tcp' ? { transport: 'tcp', host: status.host, port: status.port, source: status.source } : { transport: 'serial', path: status.portPath });
      if (!candidate) return null;
      return { ...candidate, state: status.state === 'CONNECTED' ? 'NO_DATA' : status.state === 'RECONNECTING' ? 'CONNECTING' : status.state, reason: 'Conexión gestionada por NMEAService; ver datos validados abajo', action: 'Consultar instrumentos activos; no se abre otra conexión' };
    },
    discover: discoverSignalK,
    probe: probeTcp
  });
}
