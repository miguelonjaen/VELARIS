'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const {
  createAISCredentialStore,
} = require('../aisCredentials');

const KEY_A = 'test-ais-credential-1234567890';
const KEY_B = 'test-ais-credential-0987654321';

function fixture(t, options = {}) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'gaulos-ais-test-')
  );

  t.after(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const filename = path.join(directory, 'aisstream-credential.bin');
  const encryptionKey = crypto.randomBytes(32);

  const storage = {
    isEncryptionAvailable: () => options.available !== false,

    getSelectedStorageBackend: () =>
      options.backend || 'test-encrypted',

    encryptString(value) {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv(
        'aes-256-gcm', encryptionKey, iv
      );

      const encrypted = Buffer.concat([
        cipher.update(value, 'utf8'),
        cipher.final(),
      ]);

      return Buffer.concat([
        iv,
        cipher.getAuthTag(),
        encrypted,
      ]);
    },

    decryptString(value) {
      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        encryptionKey,
        value.subarray(0, 12)
      );

      decipher.setAuthTag(value.subarray(12, 28));

      return Buffer.concat([
        decipher.update(value.subarray(28)),
        decipher.final(),
      ]).toString('utf8');
    },
  };

  return {
    directory,
    filename,
    storage,
    store: createAISCredentialStore(filename, storage),
  };
}

test('no credential exists on first startup', t => {
  const { store } = fixture(t);
  assert.equal(store.load(), null);
});

test('credential is encrypted on disk', t => {
  const { store, filename } = fixture(t);

  store.save(KEY_A);

  assert.equal(store.load(), KEY_A);
  assert.equal(fs.existsSync(filename), true);
  assert.equal(
    fs.readFileSync(filename).includes(Buffer.from(KEY_A)),
    false
  );
});

test('credential persists after recreating the store', t => {
  const { store, filename, storage } = fixture(t);

  store.save(KEY_A);

  const reopened = createAISCredentialStore(filename, storage);

  assert.equal(reopened.load(), KEY_A);
});

test('credential replacement preserves the new value', t => {
  const { store, directory } = fixture(t);

  store.save(KEY_A);
  store.save(KEY_B);

  assert.equal(store.load(), KEY_B);
  assert.equal(
    fs.readdirSync(directory).filter(f => f.endsWith('.tmp')).length,
    0
  );
});

test('invalid credentials never overwrite valid credentials', t => {
  const { store } = fixture(t);

  store.save(KEY_A);

  for (const invalid of [
    null,
    undefined,
    '',
    'short',
    'invalid credential with spaces',
    'a'.repeat(513),
  ]) {
    assert.throws(() => store.save(invalid));
    assert.equal(store.load(), KEY_A);
  }
});

test('unavailable encryption prevents credential storage', t => {
  const { store, filename } = fixture(t, {
    available: false,
  });

  assert.equal(store.available(), false);
  assert.throws(() => store.save(KEY_A));
  assert.equal(fs.existsSync(filename), false);
});

test('basic_text backend is rejected', t => {
  const { store, filename } = fixture(t, {
    backend: 'basic_text',
  });

  assert.equal(store.available(), false);
  assert.throws(() => store.save(KEY_A));
  assert.equal(fs.existsSync(filename), false);
});

test('corrupted credentials are rejected', t => {
  const { store, filename } = fixture(t);

  store.save(KEY_A);
  fs.writeFileSync(filename, Buffer.alloc(64));

  assert.throws(() => store.load());
});

test('credential removal is persistent and idempotent', t => {
  const { store, filename } = fixture(t);

  store.save(KEY_A);
  store.remove();
  store.remove();

  assert.equal(store.load(), null);
  assert.equal(fs.existsSync(filename), false);
});