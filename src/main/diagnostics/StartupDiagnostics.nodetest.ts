import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { StartupDiagnosticsService, bounded, type DiagnosticDependencies } from './StartupDiagnosticsService';
import { configuredCandidate, probeTcp } from './desktopDiagnostics';
import { eligibleInterface, records, sameLink } from './signalKDiscovery';
import { LIMITS, candidateKey, type Candidate } from '../../features/nmea/startupDiagnostics/contracts';

const candidate = (port = 10110): Candidate => configuredCandidate({ transport: 'tcp', host: '127.0.0.1', port })!;
const defaults = (): DiagnosticDependencies => ({ interfaces: async () => [], serial: async () => [], configured: () => null, active: () => null, discover: async () => [], probe: async c => c });
test('operational limits are fixed', () => assert.deepEqual(LIMITS, { interfaces: 1000, serial: 2000, mdns: 3000, tcp: 2000, identification: 3000, telemetry: 5000, global: 10000, cancellation: 1000, candidates: 16, network: 4 }));
test('startup without connections completes', async () => { const r = await new StartupDiagnosticsService(defaults()).run(); assert.equal(r.phase, 'COMPLETE'); assert.equal(r.candidates.length, 0); });
test('deduplication and cap apply across transports', async () => {
  const d = defaults(); d.serial = async () => [...Array.from({ length: 40 }, (_, i) => `COM${i}`), 'com1'];
  const r = await new StartupDiagnosticsService(d).run(); assert.equal(r.candidates.length, 16);
  assert.equal(new Set(r.candidates.map(c => c.id)).size, 16);
  assert.equal(candidateKey({ transport: 'tcp', host: 'BOAT.Local.', port: 1 }), 'tcp:boat.local:1');
});
test('only authorized eligible interfaces; four network workers maximum', async () => {
  const d = defaults(); let concurrent = 0, peak = 0, calls = 0;
  d.interfaces = async () => Array.from({ length: 10 }, (_, i) => ({ name: `Ethernet${i}`, address: `192.168.1.${i + 1}`, netmask: '255.255.255.0', eligible: i !== 0 }));
  d.discover = async () => { concurrent++; calls++; peak = Math.max(peak, concurrent); await new Promise(r => setTimeout(r, 5)); concurrent--; return [candidate()]; };
  const service = new StartupDiagnosticsService(d);
  await service.run(); assert.equal(calls, 0);
  await service.run({ authorizedInterfaces: Array.from({ length: 7 }, (_, i) => `192.168.1.${i + 1}`) });
  assert.equal(calls, 6); assert.equal(peak, 4);
});
test('active endpoint is reused without probing', async () => {
  const d = defaults(); let probes = 0;
  d.active = () => ({ ...candidate(), state: 'NO_DATA' }); d.configured = () => candidate(); d.probe = async c => { probes++; return c; };
  assert.equal((await new StartupDiagnosticsService(d).run()).candidates.length, 1); assert.equal(probes, 0);
});
test('single flight, cancellation under one second, late results discarded, repeat allowed', async () => {
  const d = defaults(); let late: ((p: string[]) => void) | undefined;
  d.serial = () => new Promise(resolve => { late = resolve; });
  const service = new StartupDiagnosticsService(d); const first = service.run(); assert.equal(service.run(), first);
  await new Promise(r => setTimeout(r, 5)); const start = Date.now(); service.cancel();
  const r = await first; assert.equal(r.phase, 'CANCELLED'); assert.ok(Date.now() - start < 1000);
  late?.(['COM99']); await new Promise(r => setTimeout(r, 5)); assert.equal(r.candidates.length, 0);
  d.serial = async () => []; assert.equal((await service.run()).sessionId, 2);
});
test('global deadline returns partial results and cancels child', async () => {
  const d = defaults(); let cancelled = false;
  d.serial = signal => new Promise(() => { signal.addEventListener('abort', () => { cancelled = true; }); });
  d.active = () => candidate(); const r = await new StartupDiagnosticsService(d, 20).run();
  assert.equal(r.phase, 'TIMEOUT'); assert.equal(r.candidates.length, 1); assert.equal(cancelled, true);
});
test('per-operation timeout aborts work', async () => {
  let aborted = false; await assert.rejects(bounded(new AbortController().signal, 5, s => new Promise(() => s.addEventListener('abort', () => { aborted = true; })))); assert.equal(aborted, true);
});
test('VPN/virtual/public/loopback excluded; discovered addresses restricted to local subnet', () => {
  for (const name of ['Tailscale', 'VPN', 'vEthernet', 'WireGuard', 'Docker']) assert.equal(eligibleInterface(name, '192.168.1.5', false), false);
  assert.equal(eligibleInterface('Ethernet', '8.8.8.8', false), false); assert.equal(eligibleInterface('Ethernet', '192.168.1.5', false), true);
  const iface = { name: 'Ethernet', address: '192.168.1.5', netmask: '255.255.255.0', eligible: true };
  assert.equal(sameLink('192.168.1.9', iface), true); assert.equal(sameLink('192.168.2.9', iface), false);
  assert.deepEqual(records(Buffer.from([0xc0, 0])), []);
});
for (const [label, line, expected] of [
  ['valid NMEA', '$GPHDT,123.4,T\r\n', 'CONNECTED'],
  ['malformed data', 'not NMEA\r\n', 'NO_DATA'],
  ['open TCP without data', '', 'NO_DATA']
] as const) test(label, async () => {
  const sockets = new Set<import('node:net').Socket>();
  const server = createServer(socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); if (line) socket.write(line); });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  try {
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    const r = await probeTcp(candidate(address.port), new AbortController().signal);
    assert.equal(r.state, expected); assert.equal(r.protocol, expected === 'CONNECTED' ? 'NMEA0183' : 'UNKNOWN');
  } finally { for (const s of sockets) s.destroy(); await new Promise<void>(r => server.close(() => r())); }
});
test('gateway closes transport during identification', async () => {
  const server = createServer(socket => socket.end()); await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  try { const address = server.address(); assert.ok(address && typeof address !== 'string'); assert.equal((await probeTcp(candidate(address.port), new AbortController().signal)).state, 'DISCONNECTED'); }
  finally { await new Promise<void>(r => server.close(() => r())); }
});
test('gateway powered off reports error', async () => {
  const server = createServer(); await new Promise<void>(r => server.listen(0, '127.0.0.1', r)); const address = server.address(); assert.ok(address && typeof address !== 'string'); await new Promise<void>(r => server.close(() => r()));
  assert.equal((await probeTcp(candidate(address.port), new AbortController().signal)).state, 'ERROR');
});
test('DNS compression cycles and truncated records are rejected; Signal K SRV parsed', () => {
  const encode = (s: string) => Buffer.concat([...s.split('.').map(label => Buffer.concat([Buffer.from([label.length]), Buffer.from(label)])), Buffer.from([0])]);
  const header = Buffer.alloc(12); header.writeUInt16BE(0x8400, 2); header.writeUInt16BE(1, 6);
  const body = Buffer.concat([Buffer.from([0, 0, 0, 0, 0x0b, 0xb8]), encode('boat.local')]);
  const rr = Buffer.alloc(10); rr.writeUInt16BE(33, 0); rr.writeUInt16BE(1, 2); rr.writeUInt32BE(120, 4); rr.writeUInt16BE(body.length, 8);
  const packet = Buffer.concat([header, encode('boat._signalk-http._tcp.local'), rr, body]);
  const parsed = records(packet); assert.equal(parsed[0]?.port, 3000); assert.equal(parsed[0]?.host, 'boat.local');
  assert.deepEqual(records(packet.subarray(0, packet.length - 1)), []);
  assert.deepEqual(records(Buffer.concat([header, Buffer.from([0xc0, 12]), rr, body])), []);
});
test('TCP cancellation destroys temporary socket without affecting server', async () => {
  let socket: import('node:net').Socket | undefined;
  const server = createServer(s => { socket = s; }); await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const controller = new AbortController();
  try {
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    const pending = probeTcp(candidate(address.port), controller.signal);
    await new Promise(r => setTimeout(r, 20)); controller.abort();
    assert.equal((await pending).state, 'DISCONNECTED');
    await new Promise(r => setTimeout(r, 20)); assert.ok(!socket || socket.destroyed);
    assert.equal(server.listening, true);
  } finally { socket?.destroy(); await new Promise<void>(r => server.close(() => r())); }
});
