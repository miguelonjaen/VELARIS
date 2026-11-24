import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createServer, createConnection, type Socket } from 'node:net';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { AntaresDecoder, AntaresTrackStore, antaresBearing, parseAntaresTrack } from './antares';
import { AntaresClient } from '../../main/radar/AntaresClient';
const fixture = (stamp = Date.UTC(2026,10,2,10,0,0)): string => {
  const d = new Date(stamp);
  return [1,d.getUTCFullYear(),d.getUTCMonth()+1,d.getUTCDate(),d.getUTCHours(),d.getUTCMinutes(),d.getUTCSeconds(),d.getUTCMilliseconds(),'CA','TARGET','',0,0,500,0,4,-72,5,-1,0,0,0,0,0,0].join(',');
};
const waitFor = async (condition: () => boolean): Promise<void> => {
  const end = Date.now()+2000;
  while (!condition()) { if (Date.now()>end) throw new Error('Timed out waiting for test TCP event'); await delay(10); }
};
test('ANTARES East/CCW radians convert to nautical clockwise/north', () => {
  assert.equal(antaresBearing(0),90);
  assert.equal(antaresBearing(Math.PI/2),0);
  assert.equal(antaresBearing(-Math.PI/2),180);
  assert.equal(antaresBearing(Math.PI),270);
  assert.equal(parseAntaresTrack(fixture())?.source,'RADAR_SIM');
  assert.equal(parseAntaresTrack(fixture())?.rangeM,500);
});
test('strict CSV rejects malformed, nonfinite, wrong dates and out-of-domain values', () => {
  const fields = fixture().split(',');
  for (const [index, value] of [[13,'NaN'],[13,'Infinity'],[13,''],[13,'0xFF'],[14,'99'],[15,'91'],[0,'1.2'],[3,'31'],[8,'UNKNOWN'],[19,'31']] as const) {
    const bad = [...fields]; bad[index]=value; assert.equal(parseAntaresTrack(bad.join(',')),null,`${index}:${value}`);
  }
  assert.equal(parseAntaresTrack(fixture()+',extra'),null);
});
test('TCP fragmentation, coalescing, CRLF and oversized line resynchronization', () => {
  const decoder = new AntaresDecoder(), line=fixture();
  assert.deepEqual(decoder.feed(line.slice(0,15)),[]);
  assert.equal(decoder.feed(line.slice(15)+'\r\n'+line+'\n').length,2);
  assert.deepEqual(decoder.feed('x'.repeat(3000)),[]);
  assert.equal(decoder.feed('\n'+line+'\n').length,1);
  assert.equal(decoder.rejected,1);
  assert.deepEqual(decoder.feed('x'.repeat(70000)),[]);
  assert.equal(decoder.feed('\n'+line+'\n').length,1);
});
test('track store rejects replay and BOAT, expires and bounds memory', () => {
  const store=new AntaresTrackStore(), track=parseAntaresTrack(fixture())!;
  assert.equal(store.ingest(track,0),true);
  assert.equal(store.ingest(track,1),false);
  assert.equal(store.ingest({...track, source:'BOAT' as 'RADAR_SIM'},1),false);
  Object.assign(store.snapshot(0)[0], { id: 99 });
  assert.equal(store.snapshot(0)[0].id,1); // Snapshot mutation cannot corrupt the store.
  assert.equal(store.snapshot(3001).length,0);
  for (let id=0;id<600;id++) store.ingest({...track,id},4000);
  assert.equal(store.snapshot(4000).length,512);
  store.clear(); assert.equal(store.snapshot(4000).length,0);
});
test('receive-only TCP integration: connect, idle, fragmented CSV, stale input, EOF, reset', {timeout:5000}, async () => {
  let peer: Socket | null = null;
  const server=createServer(s=> { peer=s; });
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  const address=server.address(); assert.ok(address && typeof address !== 'string');
  const client=new AntaresClient(()=>createConnection({host:'127.0.0.1',port:address.port}));
  try {
    assert.equal(client.connect().state,'connecting');
    await waitFor(()=>client.snapshot().state==='connected' && peer!==null);
    assert.equal(client.snapshot().tracks.length,0);
    const line=fixture(Date.now());
    (peer as unknown as Socket).write(line.slice(0,20));
    (peer as unknown as Socket).write(line.slice(20)+'\n');
    await waitFor(()=>client.snapshot().tracks.length===1);
    assert.equal(client.snapshot().tracks[0].source,'RADAR_SIM');
    (peer as unknown as Socket).write(fixture(Date.now()-20000)+'\n');
    await waitFor(()=>client.snapshot().rejected>0);
    (peer as unknown as Socket).destroy();
    await waitFor(()=>client.snapshot().state==='error');
    assert.equal(client.snapshot().tracks.length,0);
    client.disconnect(); assert.equal(client.snapshot().state,'disconnected');
  } finally {
    client.disconnect(); (peer as unknown as Socket | null)?.destroy();
    await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
  }
});
test('receiver and preload expose only dedicated SIM channels, no NMEA or AIS outputs', () => {
  const receiver=readFileSync(new URL('../../main/radar/AntaresClient.ts',import.meta.url),'utf8');
  assert.doesNotMatch(receiver,/vessel-telemetry|simulator-telemetry|SharedNavigation|TelemetryService|AisCollision|\.write\(/);
  assert.match(receiver,/host: '127.0.0.1', port: 17396/);
  assert.doesNotMatch(receiver,/17394/);
  const preload=readFileSync(new URL('../../../electron-preload.js',import.meta.url),'utf8').split("exposeInMainWorld('radarAntares'")[1];
  assert.match(preload,/radar-sim:antares-connect/);
  assert.doesNotMatch(preload,/hw:|ais:|vessel-telemetry/);
});
