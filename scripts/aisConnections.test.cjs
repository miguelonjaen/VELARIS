const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

function setup() {
  const sockets = [], sent = [];
  class Socket extends EventEmitter {
    constructor() { super(); sockets.push(this); }
    send(value) { this.subscription = JSON.parse(value); }
    terminate() { this.terminated = true; }
  }
  const context = { module: { exports: {} }, require: name => { assert.equal(name, 'ws'); return Socket; }, console };
  vm.runInNewContext(readFileSync(join(__dirname, '..', 'aisBridge.js'), 'utf8'), context);
  const window = { isDestroyed: () => false, webContents: { send: (channel, value) => sent.push({ channel, value }) } };
  return { api: context.module.exports, window, sockets, sent };
}
test('one stream socket, explicit disconnect, queued events ignored, manual reconnect', () => {
  const { api, window, sockets, sent } = setup();
  api.connectAIS(window, 'test-key'); api.connectAIS(window, 'test-key');
  assert.equal(sockets.length, 1);
  sockets[0].emit('open');
  assert.equal(api.getAISConnections().streamStatus, 'connected');
  assert.equal(sockets[0].subscription.APIKey, 'test-key');
  sockets[0].emit('message', Buffer.from('{"MessageType":"PositionReport"}'));
  assert.equal(sent.filter(x => x.channel === 'ais-message').length, 1);
  api.setAISConnection(window, 'test-key', 'stream', false);
  assert.equal(sockets[0].terminated, true);
  sockets[0].emit('message', Buffer.from('{}'));
  sockets[0].emit('open'); sockets[0].emit('error', new Error('late'));
  api.connectAIS(window, 'test-key');
  assert.equal(sockets.length, 1);
  assert.equal(sent.filter(x => x.channel === 'ais-message').length, 1);
  api.setAISConnection(window, 'test-key', 'stream', true);
  sockets[1].emit('open'); sockets[0].emit('close');
  assert.equal(api.getAISConnections().streamStatus, 'connected');
});
test('remote close permits retry, errors and missing keys have explicit status', () => {
  const { api, window, sockets } = setup();
  api.connectAIS(window, null);
  assert.equal(api.getAISConnections().streamStatus, 'missing-key');
  assert.equal(sockets.length, 0);
  api.connectAIS(window, 'test-key');
  sockets[0].emit('error', new Error('network')); sockets[0].emit('close');
  assert.equal(api.getAISConnections().streamStatus, 'error');
  api.connectAIS(window, 'test-key');
  assert.equal(sockets.length, 2);
});
test('NMEA AIS gate preserves every other instrument and stream state', () => {
  const { api, window, sockets } = setup();
  api.connectAIS(window, 'test-key'); sockets[0].emit('open');
  for (const enabled of [false, true, false, true]) {
    api.setAISConnection(window, 'test-key', 'nmea', enabled);
    assert.equal(api.shouldForwardNmea({ type: 'AIS' }), enabled);
    for (const type of ['GPS', 'HEADING', 'WATER_SPEED', 'WIND', 'DEPTH', 'ENGINE_RPM', 'TRANSDUCER', 'RAW', 'NMEA_INVALID']) {
      const message = { type, value: 17 };
      assert.equal(api.shouldForwardNmea(message), true, type);
      assert.equal(message.value, 17);
    }
    assert.equal(api.getAISConnections().streamStatus, 'connected');
    assert.equal(sockets.length, 1);
  }
  api.setAISConnection(window, 'test-key', 'stream', false);
  assert.equal(api.shouldForwardNmea({ type: 'AIS' }), true);
});
test('production NMEA callback gates only AIS before sending boat or simulator telemetry', () => {
  const { api, window } = setup();
  const source = readFileSync(join(__dirname, '..', 'electron-main.js'), 'utf8');
  const start = source.indexOf('nmeaService = new NMEAService((message, origin) => {');
  const end = source.indexOf('\n});', start);
  const forwarded = [], boat = [];
  class NMEAService { constructor(handler) { this.handler = handler; } }
  const context = { NMEAService, shouldForwardNmea: api.shouldForwardNmea,
    boatDataFeed: { ingest: message => boat.push(message) },
    mainWindow: { isDestroyed: () => false, webContents: { send: (channel, data) => forwarded.push({ channel, data }) } } };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end + 4), context);
  api.setAISConnection(window, null, 'nmea', false);
  for (const source of ['BOAT', 'SIMULATOR']) {
    for (const type of ['AIS', 'GPS', 'WIND', 'DEPTH', 'HEADING', 'ENGINE_RPM']) context.nmeaService.handler({ type }, { source, sourceId: 'test' });
  }
  assert.equal(forwarded.length, 10);
  assert.equal(boat.length, 5);
  assert.equal(forwarded.some(x => (x.data.message ?? x.data).type === 'AIS'), false);
  api.setAISConnection(window, null, 'nmea', true);
  context.nmeaService.handler({ type: 'AIS' }, { source: 'BOAT' });
  assert.equal(forwarded.at(-1).data.type, 'AIS');
});
test('reject invalid control requests without changing connections', () => {
  const { api, window } = setup();
  assert.throws(() => api.setAISConnection(window, null, 'gps', false));
  assert.throws(() => api.setAISConnection(window, null, 'nmea', 'false'));
  assert.equal(api.getAISConnections().nmeaEnabled, true);
});
