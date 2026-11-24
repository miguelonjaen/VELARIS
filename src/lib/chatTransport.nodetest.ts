import test from 'node:test';
import assert from 'node:assert/strict';
import { requestChat, ChatFailure } from './chatTransport';
const endpoint = 'http://127.0.0.1:8089/api/chat';
const request = { prompt: 'Motril, 1 NM a costa', isJson: false, tools: [] };
for (const [status, body, code] of [
  [503, { error: 'GEMINI_API_KEY no está configurada en el backend' }, 'CONFIGURATION'],
  [401, { error: 'secret-provider-body' }, 'AUTH'],
  [403, {}, 'AUTH'], [429, {code:'AI_BILLING_LIMIT'}, 'BILLING'], [429, {}, 'QUOTA'], [503, {}, 'HTTP'],
  [400, {}, 'HTTP'], [200, {}, 'INVALID_RESPONSE'],
] as const) test(`diagnostic ${status} ${code}`, async () => {
  let count = 0;
  const fetcher = (async () => { count++; return new Response(JSON.stringify(body), { status }); }) as typeof fetch;
  await assert.rejects(requestChat(endpoint, request, fetcher), (e: unknown) => e instanceof ChatFailure && e.code === code && !e.message.includes('secret-provider-body') && e.message.includes('No se ha calculado'));
  assert.equal(count, 1);
});
test('network failure preserves category', async () => {
  await assert.rejects(requestChat(endpoint, request, (async () => { throw new TypeError('fetch failed'); }) as typeof fetch), (e: unknown) => e instanceof ChatFailure && e.code === 'NETWORK');
});
test('timeout includes stalled body, not only headers', async () => {
  const fetcher = (async () => ({ ok: true, status: 200, json: () => new Promise(() => {}) })) as unknown as typeof fetch;
  await assert.rejects(requestChat(endpoint, request, fetcher, 10), (e: unknown) => e instanceof ChatFailure && e.code === 'TIMEOUT');
});
test('structured plan and text response', async () => {
  const fetcher = (async () => new Response(JSON.stringify({ text: 'plan', data: { topics: ['chart'] } }))) as typeof fetch;
  assert.deepEqual((await requestChat(endpoint, { ...request, isJson: true }, fetcher)).data, { topics: ['chart'] });
  await assert.rejects(requestChat(endpoint, { ...request, isJson: true }, (async () => new Response('{"text":"not a plan"}')) as typeof fetch), (e: unknown) => e instanceof ChatFailure && e.code === 'INVALID_RESPONSE');
});
