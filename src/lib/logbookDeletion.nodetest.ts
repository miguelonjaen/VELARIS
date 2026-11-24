import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { deleteLogbookEntries, logbookDate, isPersistentLogEntry } from './logbookDeletion';

function fixture(body: unknown, status = 200) {
  const requests: {url: URL; method: string}[] = [];
  const client = createClient('https://example.invalid', 'test-key', {
    auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false},
    global: {fetch: async (input, init) => {
      requests.push({url: new URL(String(input)), method: init?.method || 'GET'});
      return new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}});
    }},
  });
  return {client, requests};
}

test('journal day takes precedence over insertion day, including midnight and DST', () => {
  assert.equal(logbookDate({fecha: '2026-10-25', created_at: '2026-10-26T00:15:00Z'}), '2026-10-25');
  assert.equal(logbookDate({fecha: '2026-03-29', created_at: '2026-03-28T23:15:00Z'}), '2026-03-29');
  assert.equal(logbookDate({fecha: '', created_at: 'invalid'}), '');
});

test('delete request only targets confirmed IDs and vessel in bitacora', async () => {
  const {client, requests} = fixture([{id: 'a'}]);
  assert.deepEqual(await deleteLogbookEntries(client, 'ship-a', ['a', 'a', 'b']), ['a']);
  assert.equal(requests.length, 1);
  const request = requests[0];
  assert.equal(request.method, 'DELETE');
  assert.equal(request.url.pathname, '/rest/v1/bitacora');
  assert.equal(request.url.searchParams.get('barco_id'), 'eq.ship-a');
  assert.equal(request.url.searchParams.get('id'), 'in.(a,b)');
  assert.equal(request.url.searchParams.get('select'), 'id');
  assert.equal(request.url.searchParams.has('created_at'), false);
});

test('RLS zero-row response is an actionable failure', async () => {
  const {client} = fixture([]);
  await assert.rejects(deleteLogbookEntries(client, 'ship', ['a']), /RLS/);
});

test('server errors are preserved for the operator', async () => {
  const {client} = fixture({message: 'permission denied', code: '42501'}, 403);
  await assert.rejects(deleteLogbookEntries(client, 'ship', ['a']), /permission denied/);
});

test('offline errors propagate instead of claiming success', async () => {
  const client = createClient('https://example.invalid', 'test-key', {
    auth: {persistSession: false, autoRefreshToken: false},
    global: {fetch: async () => {throw new Error('offline');}},
  });
  await assert.rejects(deleteLogbookEntries(client, 'ship', ['a']), /offline/);
});

test('empty selection and local identities never reach persistence', async () => {
  const {client, requests} = fixture([]);
  for (const id of ['link:track', 'trial:route', 'auto:event']) {
    assert.equal(isPersistentLogEntry(id), false);
    await assert.rejects(deleteLogbookEntries(client, 'ship', [id]), /inválida/);
  }
  await assert.rejects(deleteLogbookEntries(client, 'ship', []), /inválida/);
  await assert.rejects(deleteLogbookEntries(client, '', ['a']), /inválida/);
  assert.equal(requests.length, 0);
});
