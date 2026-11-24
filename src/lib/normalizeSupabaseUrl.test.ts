import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { normalizeSupabaseUrl } from './normalizeSupabaseUrl';

function createMockClient(requestedUrls: string[]) {
  const mockFetch: typeof fetch = async (input) => {
    const requestUrl = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
    requestedUrls.push(requestUrl);

    const isAuthRequest = new URL(requestUrl).pathname.startsWith('/auth/v1/');
    return new Response(isAuthRequest ? '{"msg":"test request captured"}' : '[]', {
      status: isAuthRequest ? 400 : 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  return createClient(
    normalizeSupabaseUrl('https://project.example.supabase.co/rest/v1/'),
    'sb_publishable_test_only',
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: { fetch: mockFetch },
    }
  );
}

test('password sign-in uses the Supabase Auth endpoint, not a REST-prefixed path', async () => {
  const requestedUrls: string[] = [];
  const client = createMockClient(requestedUrls);

  await client.auth.signInWithPassword({
    email: 'captain@example.invalid',
    password: 'test-only-not-a-real-password',
  });

  assert.equal(requestedUrls.length, 1);
  const authUrl = new URL(requestedUrls[0]);
  assert.equal(authUrl.pathname, '/auth/v1/token');
  assert.equal(authUrl.searchParams.get('grant_type'), 'password');
});

test('PostgREST requests keep exactly one /rest/v1 prefix', async () => {
  const requestedUrls: string[] = [];
  const client = createMockClient(requestedUrls);

  await client.from('usuarios').select('id');

  assert.equal(requestedUrls.length, 1);
  const restUrl = new URL(requestedUrls[0]);
  assert.equal(restUrl.pathname, '/rest/v1/usuarios');
  assert.equal(restUrl.searchParams.get('select'), 'id');
});