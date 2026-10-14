'use strict';

/** Cliente de pruebas que se comporta como VELARISdroid frente al servidor. */

const WebSocket = require('ws');
const protocol = require('../protocol');

class TestClient {
  constructor(port, deviceId, deviceName = 'Pixel 7') {
    this.port = port;
    this.deviceId = deviceId;
    this.deviceName = deviceName;
    this.received = [];
    this.waiters = [];
    this.closed = false;
    this.closeCode = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`ws://127.0.0.1:${this.port}`);
      this.ws.on('open', resolve);
      this.ws.on('error', reject);
      this.ws.on('close', (code) => {
        this.closed = true;
        this.closeCode = code;
        for (const w of this.waiters.splice(0)) w.reject(new Error('socket cerrado'));
      });
      this.ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        this.received.push(message);
        const index = this.waiters.findIndex((w) => w.predicate(message));
        if (index >= 0) this.waiters.splice(index, 1)[0].resolve(message);
      });
    });
  }

  send(type, payload, options = {}) {
    const message = protocol.createMessage(type, options.src ?? this.deviceId, payload, options);
    this.ws.send(JSON.stringify(message));
    return message;
  }

  sendRaw(text) {
    this.ws.send(text);
  }

  waitFor(predicate, timeoutMs = 3000) {
    const existing = this.received.find(predicate);
    if (existing) {
      this.received.splice(this.received.indexOf(existing), 1);
      return Promise.resolve(existing);
    }
    if (this.closed) return Promise.reject(new Error('socket cerrado'));
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve: (m) => { clearTimeout(timer); this.received.splice(this.received.indexOf(m), 1); resolve(m); }, reject };
      const timer = setTimeout(() => {
        this.waiters.splice(this.waiters.indexOf(waiter), 1);
        reject(new Error('timeout esperando mensaje'));
      }, timeoutMs);
      this.waiters.push(waiter);
    });
  }

  waitType(type, timeoutMs) {
    return this.waitFor((m) => m.type === type, timeoutMs);
  }

  waitClosed(timeoutMs = 3000) {
    if (this.closed) return Promise.resolve(this.closeCode);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no se cerró')), timeoutMs);
      this.ws.once('close', (code) => { clearTimeout(timer); resolve(code); });
    });
  }

  async hello(paired) {
    this.send('HELLO', {
      deviceName: this.deviceName, platform: 'android', app: 'test', versions: [1],
      caps: ['position.v1', 'track.v1', 'logbook.v1'], paired
    });
    const challenge = await this.waitType('CHALLENGE');
    this.nonce = challenge.payload.nonce;
    this.desktopId = challenge.payload.desktopId;
    return challenge;
  }

  async auth(token) {
    const proof = protocol.computeProof(token, this.nonce, this.desktopId, this.deviceId);
    this.send('AUTH', { proof });
    return this.waitFor((m) => m.type === 'WELCOME' || m.type === 'ERROR');
  }

  close() {
    try { this.ws.close(); } catch { /* */ }
  }

  kill() {
    try { this.ws.terminate(); } catch { /* */ }
  }
}

const point = (seq, base = 1792000000000) => ({
  seq, t: base + seq * 1000, lat: 36.72 + seq * 1e-5, lon: -3.52 - seq * 1e-5, acc: 4.5, sog: 2.8, cog: 181, hdg: null, src: 'phone_gps'
});

const meta = (rev, state, extra = {}) => ({
  rev, name: 'Paseo de prueba', state, startedAt: 1792000000000, endedAt: state === 'FINISHED' ? 1792003600000 : null,
  lastSeq: 0, source: 'phone_gps', deviceName: 'Pixel 7', distanceNm: 0, durationMs: 0, ...extra
});

module.exports = { TestClient, point, meta };
