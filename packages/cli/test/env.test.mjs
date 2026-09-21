import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeEnvFile } from '../dist/index.js';

test('creates a new .env when none exists', () => {
  const result = mergeEnvFile(null, 'APEX_SECRET_KEY', 'apex_sk_test_abc');
  assert.equal(result.action, 'created');
  assert.equal(result.content, 'APEX_SECRET_KEY=apex_sk_test_abc\n');
});

test('appends to an existing .env without touching other lines', () => {
  const existing = 'DATABASE_URL=postgres://localhost\nPORT=3000\n';
  const result = mergeEnvFile(existing, 'APEX_SECRET_KEY', 'apex_sk_test_abc');
  assert.equal(result.action, 'appended');
  assert.equal(result.content, 'DATABASE_URL=postgres://localhost\nPORT=3000\nAPEX_SECRET_KEY=apex_sk_test_abc\n');
});

test('updates an existing key in place, preserving order and neighbors', () => {
  const existing = 'PORT=3000\nAPEX_SECRET_KEY=apex_sk_test_old\nOTHER=1\n';
  const result = mergeEnvFile(existing, 'APEX_SECRET_KEY', 'apex_sk_test_new');
  assert.equal(result.action, 'updated');
  assert.equal(result.content, 'PORT=3000\nAPEX_SECRET_KEY=apex_sk_test_new\nOTHER=1\n');
});

test('is a no-op when the value already matches', () => {
  const existing = 'APEX_SECRET_KEY=apex_sk_test_same\n';
  const result = mergeEnvFile(existing, 'APEX_SECRET_KEY', 'apex_sk_test_same');
  assert.equal(result.action, 'unchanged');
  assert.equal(result.content, existing);
});

test('handles a file with no trailing newline', () => {
  const existing = 'PORT=3000';
  const result = mergeEnvFile(existing, 'APEX_SECRET_KEY', 'apex_sk_test_abc');
  assert.equal(result.content, 'PORT=3000\nAPEX_SECRET_KEY=apex_sk_test_abc\n');
});
