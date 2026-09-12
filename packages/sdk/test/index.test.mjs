import assert from 'node:assert/strict';
import test from 'node:test';
import { ApexClient, ApexError } from '../dist/index.js';

const key = 'apex_sk_test_example';
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

test('reads a customer balance with server authorization', async () => {
  let request;
  const client = new ApexClient({ apiKey: key, fetch: async (url, init) => {
    request = { url, init };
    return json({ remaining: 250, version: 3, as_of: '2026-09-12T00:00:00Z' });
  }});
  assert.equal((await client.balance('customer id')).remaining, 250);
  assert.match(request.url, /customer%20id\/balance$/);
  assert.equal(request.init.headers.authorization, `Bearer ${key}`);
});

test('consume sends the idempotency key and validates integer amounts', async () => {
  let body;
  const client = new ApexClient({ apiKey: key, fetch: async (_url, init) => {
    body = JSON.parse(init.body);
    return json({ allowed: true, consumed: 10, remaining: 90, version: 2, as_of: 'now', replayed: false });
  }});
  assert.equal((await client.consume('11111111-1111-4111-8111-111111111111', 10, 'job-1')).remaining, 90);
  assert.deepEqual(body, { amount: 10, idempotency_key: 'job-1' });
  assert.throws(() => client.consume('id', 1.5, 'job'), /positive integer/);
});

test('retries transient responses and returns structured terminal errors', async () => {
  let calls = 0;
  const client = new ApexClient({ apiKey: key, maxRetries: 1, fetch: async () => {
    calls += 1;
    return calls === 1 ? json({ error: 'busy' }, 503) : json({ error: 'invalid customer' }, 404, { 'x-request-id': 'req_123' });
  }});
  await assert.rejects(client.balance('missing'), (error) => {
    assert.ok(error instanceof ApexError);
    assert.equal(error.status, 404);
    assert.equal(error.requestId, 'req_123');
    return true;
  });
  assert.equal(calls, 2);
});

test('rejects browser-style or malformed credentials', () => {
  assert.throws(() => new ApexClient({ apiKey: 'pk_test_public' }), /server-side/);
});
