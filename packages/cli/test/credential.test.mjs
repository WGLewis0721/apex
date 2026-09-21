import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidKeyFormat, classifyVerificationStatus, verifyCredential } from '../dist/index.js';

test('accepts test and live secret key formats', () => {
  assert.equal(isValidKeyFormat('apex_sk_test_abc123'), true);
  assert.equal(isValidKeyFormat('apex_sk_live_abc123'), true);
});

test('rejects publishable-style or malformed keys', () => {
  assert.equal(isValidKeyFormat('apex_pk_test_abc123'), false);
  assert.equal(isValidKeyFormat('not-a-key'), false);
  assert.equal(isValidKeyFormat(''), false);
});

test('classifies /v1/whoami responses: only an authenticated 200 is valid', () => {
  assert.equal(classifyVerificationStatus(200), 'valid');
  assert.equal(classifyVerificationStatus(401), 'invalid');
  assert.equal(classifyVerificationStatus(404), 'unknown');
  assert.equal(classifyVerificationStatus(500), 'unknown');
  assert.equal(classifyVerificationStatus(503), 'unknown');
});

test('verifyCredential calls GET /v1/whoami with the bearer token', async () => {
  let request;
  const fetchStub = async (url, init) => {
    request = { url, init };
    return new Response(JSON.stringify({ workspace_id: 'w', environment_id: 'e', mode: 'test' }), { status: 200 });
  };
  const result = await verifyCredential('apex_sk_test_fake', { fetch: fetchStub });
  assert.equal(result, 'valid');
  assert.match(request.url, /\/v1\/whoami$/);
  assert.equal(request.init.headers.authorization, 'Bearer apex_sk_test_fake');
});

test('verifyCredential maps a real 401 response to invalid without a real key', async () => {
  const fetchStub = async () => new Response(null, { status: 401 });
  const result = await verifyCredential('apex_sk_test_fake', { fetch: fetchStub });
  assert.equal(result, 'invalid');
});

test('verifyCredential treats a server error as unknown, distinct from invalid', async () => {
  const fetchStub = async () => new Response(null, { status: 503 });
  const result = await verifyCredential('apex_sk_test_fake', { fetch: fetchStub });
  assert.equal(result, 'unknown');
});

test('verifyCredential maps a network failure to unknown', async () => {
  const fetchStub = async () => {
    throw new Error('network down');
  };
  const result = await verifyCredential('apex_sk_test_fake', { fetch: fetchStub });
  assert.equal(result, 'unknown');
});

test('verifyCredential respects a base-url override', async () => {
  let requestedUrl;
  const fetchStub = async (url) => {
    requestedUrl = url;
    return new Response(null, { status: 200 });
  };
  await verifyCredential('apex_sk_test_fake', { fetch: fetchStub, baseUrl: 'https://example.test/apex-api' });
  assert.equal(requestedUrl, 'https://example.test/apex-api/v1/whoami');
});
