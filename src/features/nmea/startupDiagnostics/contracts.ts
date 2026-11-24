export const LIMITS = { interfaces: 1000, serial: 2000, mdns: 3000, tcp: 2000, identification: 3000, telemetry: 5000, global: 10000, cancellation: 1000, candidates: 16, network: 4 } as const;
export type DiagnosticState = 'NOT_CONFIGURED' | 'SEARCHING' | 'DETECTED' | 'CONNECTING' | 'CONNECTED' | 'NO_DATA' | 'DEGRADED' | 'DISCONNECTED' | 'ERROR';
export interface Candidate {
  id: string; transport: 'tcp' | 'serial' | 'signalk'; host?: string; port?: number; path?: string;
  configured: boolean; state: DiagnosticState; protocol: 'NMEA0183' | 'UNKNOWN';
  lastValidAt: number | null; instruments: string[]; reason: string; action: string;
}
export interface LocalInterface { name: string; address: string; netmask: string; eligible: boolean }
export interface DiagnosticReport { sessionId: number; phase: 'RUNNING' | 'COMPLETE' | 'CANCELLED' | 'TIMEOUT'; candidates: Candidate[]; interfaces: LocalInterface[]; issues: string[] }
export interface DiagnosticRequest { target?: unknown; authorizedInterfaces?: string[] }
export interface DiagnosticApi {
  run(request: DiagnosticRequest): Promise<DiagnosticReport>;
  cancel(): Promise<void>;
}
export function candidateKey(c: Pick<Candidate, 'transport' | 'host' | 'port' | 'path'>): string {
  return c.transport === 'serial' ? `serial:${c.path?.trim().toLowerCase()}` : `${c.transport}:${c.host?.trim().toLowerCase().replace(/\.$/, '')}:${c.port}`;
}
