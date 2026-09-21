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

test('classifies hosted-service auth responses', () => {
  assert.equal(classifyVerificationStatus(401), 'invalid');
  assert.equal(classifyVerificationStatus(404), 'valid');
  assert.equal(classifyVerificationStatus(500), 'unknown');
  assert.equal(classifyVerificationStatus(200), 'unknown');
});

test('verifyCredential maps a real 401 response to invalid without a real key', async () => {
  const fetchStub = async (url, init) => {
    assert.equal(init.headers.authorization, 'Bearer apex_sk_test_fake');
    return new Response(null, { status: 401 });
  };
  const result = await verifyCredential('apex_sk_test_fake', { fetch: fetchStub });
  assert.equal(result, 'invalid');
});

test('verifyCredential maps a 404 (authenticated, no such route) to valid', async () => {
  const fetchStub = async () => new Response(null, { status: 404 });
  const result = await verifyCredential('apex_sk_test_fake', { fetch: fetchStub });
  assert.equal(result, 'valid');
});

test('verifyCredential maps a network failure to unknown', async () => {
  const fetchStub = async () => {
    throw new Error('network down');
  };
  const result = await verifyCredential('apex_sk_test_fake', { fetch: fetchStub });
  assert.equal(result, 'unknown');
});
