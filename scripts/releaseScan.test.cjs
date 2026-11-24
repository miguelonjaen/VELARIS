'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { scanAsciiFile } = require('./releaseScan.cjs');

test('finds a credential marker split between chunks', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gaulos-scan-'));
  const filename = path.join(directory, 'archive.bin');
  context.after(() => { fs.unlinkSync(filename); fs.rmdirSync(directory); });
  const marker = 'sb_secret_FAKE_TEST_MARKER_123456789';
  fs.writeFileSync(filename, Buffer.concat([Buffer.alloc(60, 0), Buffer.from(marker), Buffer.alloc(70, 0)]));
  let found = false;
  let longest = 0;
  scanAsciiFile(filename, (text) => {
    longest = Math.max(longest, text.length);
    found ||= /sb_secret_[A-Za-z0-9_-]+/.test(text);
  }, 64, 48);
  assert.equal(found, true);
  assert.ok(longest <= 112);
});

test('finds an ASCII URL across a binary chunk boundary', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gaulos-scan-'));
  const filename = path.join(directory, 'archive.bin');
  context.after(() => { fs.unlinkSync(filename); fs.rmdirSync(directory); });
  const marker = 'api.openweathermap.org';
  fs.writeFileSync(filename, Buffer.concat([Buffer.alloc(30, 255), Buffer.from(marker)]));
  let found = false;
  scanAsciiFile(filename, (text) => { found ||= text.includes(marker); }, 32, 24);
  assert.equal(found, true);
});
