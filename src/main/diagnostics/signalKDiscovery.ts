import { createSocket } from 'node:dgram';
import { isIP } from 'node:net';
import type { Candidate, LocalInterface } from '../../features/nmea/startupDiagnostics/contracts';
import { LIMITS } from '../../features/nmea/startupDiagnostics/contracts';

export const SERVICE = '_signalk-http._tcp.local';
const ipv4 = (address: string): number => address.split('.').reduce((n, octet) => ((n << 8) | Number(octet)) >>> 0, 0);
export function sameLink(address: string, iface: LocalInterface): boolean {
  return isIP(address) === 4 && ((ipv4(address) & ipv4(iface.netmask)) >>> 0) === ((ipv4(iface.address) & ipv4(iface.netmask)) >>> 0);
}
export function eligibleInterface(name: string, address: string, internal: boolean): boolean {
  return !internal && isIP(address) === 4 && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(address)
    && !/vpn|virtual|vmware|vbox|hyper-v|vethernet|tailscale|zerotier|tun|tap|docker|wsl|loopback|wireguard/i.test(name);
}
interface RecordEntry { name: string; type: number; ttl: number; value?: string; host?: string; port?: number }
/** Bounded DNS name decoder, including compression pointer cycle detection. */
export function records(packet: Buffer): RecordEntry[] {
  if (packet.length < 12 || packet.length > 9000 || !(packet.readUInt16BE(2) & 0x8000)) return [];
  function name(start: number): { value: string; end: number } {
    let pos = start, end = -1;
    const labels: string[] = [], visited = new Set<number>();
    for (let steps = 0; steps < 128; steps++) {
      if (pos >= packet.length || visited.has(pos)) throw new Error('DNS name');
      visited.add(pos);
      const size = packet[pos++];
      if (size === 0) return { value: labels.join('.').toLowerCase(), end: end < 0 ? pos : end };
      if ((size & 0xc0) === 0xc0) {
        if (pos >= packet.length) throw new Error('DNS pointer');
        if (end < 0) end = pos + 1;
        pos = ((size & 0x3f) << 8) | packet[pos];
      } else {
        if (size > 63 || pos + size > packet.length) throw new Error('DNS label');
        labels.push(packet.toString('utf8', pos, pos + size)); pos += size;
        if (labels.join('.').length > 253) throw new Error('DNS length');
      }
    }
    throw new Error('DNS depth');
  }
  try {
    let offset = 12;
    const count = packet.readUInt16BE(6) + packet.readUInt16BE(8) + packet.readUInt16BE(10);
    const questions = packet.readUInt16BE(4);
    if (count > 128 || questions > 32) return [];
    for (let i = 0; i < questions; i++) offset = name(offset).end + 4;
    const result: RecordEntry[] = [];
    for (let i = 0; i < count; i++) {
      const owner = name(offset); offset = owner.end;
      const type = packet.readUInt16BE(offset), klass = packet.readUInt16BE(offset + 2) & 0x7fff;
      const ttl = packet.readUInt32BE(offset + 4), length = packet.readUInt16BE(offset + 8);
      offset += 10; const end = offset + length;
      if (end > packet.length) return [];
      const record: RecordEntry = { name: owner.value, type, ttl };
      if (klass === 1 && ttl > 0) {
        if (type === 12) { const n = name(offset); if (n.end > end) return []; record.value = n.value; }
        if (type === 33 && length >= 7) { record.port = packet.readUInt16BE(offset + 4); const n = name(offset + 6); if (n.end > end) return []; record.host = n.value; }
        if (type === 1 && length === 4) record.value = Array.from(packet.subarray(offset, end)).join('.');
        result.push(record);
      }
      offset = end;
    }
    return result;
  } catch { return []; }
}

/** Legacy unicast-response mDNS query from an ephemeral socket bound to one authorized IPv4.
 * No HTTP requests, DNS resolution, port sweeps, retries or automatic connections.
 */
export function discoverSignalK(iface: LocalInterface, signal: AbortSignal): Promise<Candidate[]> {
  return new Promise((resolve, reject) => {
    const socket = createSocket('udp4');
    const cache: RecordEntry[] = [];
    let done = false;
    const finish = (error?: Error) => {
      if (done) return; done = true; clearTimeout(timer); signal.removeEventListener('abort', cancel);
      try { socket.close(); } catch { /* May be cancelled before bind completes. */ }
      if (error) { reject(error); return; }
      const candidates: Candidate[] = [];
      for (const ptr of cache.filter(r => r.type === 12 && r.name === SERVICE)) {
        for (const srv of cache.filter(r => r.type === 33 && r.name === ptr.value && r.host?.endsWith('.local') && r.port)) {
          for (const a of cache.filter(r => r.type === 1 && r.name === srv.host && r.value && sameLink(r.value, iface))) {
            candidates.push({ id: '', transport: 'signalk', host: a.value, port: srv.port, configured: false, state: 'DETECTED', protocol: 'UNKNOWN', lastValidAt: null, instruments: [], reason: 'Signal K anunciado por mDNS; protocolo y origen NMEA 2000 sin verificar', action: 'Confirmar gateway en configuración; adaptador Signal K pendiente' });
            if (candidates.length >= LIMITS.candidates) { resolve(candidates); return; }
          }
        }
      }
      resolve(candidates);
    };
    const cancel = () => finish();
    const timer = setTimeout(() => finish(), LIMITS.mdns - 25);
    signal.addEventListener('abort', cancel, { once: true });
    socket.on('error', finish);
    socket.on('message', (packet, remote) => {
      if (!done && remote.port === 5353 && sameLink(remote.address, iface) && cache.length < 256) cache.push(...records(packet).slice(0, 256 - cache.length));
    });
    if (signal.aborted) { finish(); return; }
    socket.bind(0, iface.address, () => {
      if (done) { try { socket.close(); } catch {} return; }
      try { socket.setMulticastInterface(iface.address); socket.setMulticastTTL(255); } catch (error) { finish(error instanceof Error ? error : new Error('mDNS interface')); return; }
      const header = Buffer.alloc(12); header.writeUInt16BE(1, 4);
      const qname = Buffer.concat(SERVICE.split('.').map(label => Buffer.concat([Buffer.from([label.length]), Buffer.from(label)])));
      socket.send(Buffer.concat([header, qname, Buffer.from([0, 0, 12, 0, 1])]), 5353, '224.0.0.251', error => { if (error) finish(error); });
    });
  });
}
