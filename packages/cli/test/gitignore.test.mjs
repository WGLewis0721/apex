import assert from 'node:assert/strict';
import test from 'node:test';
import { ensureGitignoreEntry } from '../dist/index.js';

test('creates a .gitignore when none exists', () => {
  const result = ensureGitignoreEntry(null, '.env');
  assert.equal(result.action, 'created');
  assert.equal(result.content, '.env\n');
});

test('appends .env when a .gitignore exists without it', () => {
  const result = ensureGitignoreEntry('node_modules\ndist\n', '.env');
  assert.equal(result.action, 'appended');
  assert.equal(result.content, 'node_modules\ndist\n.env\n');
});

test('is a no-op when .env is already ignored', () => {
  const existing = 'node_modules\n.env\ndist\n';
  const result = ensureGitignoreEntry(existing, '.env');
  assert.equal(result.action, 'unchanged');
  assert.equal(result.content, existing);
});

test('adds a trailing newline before appending if missing', () => {
  const result = ensureGitignoreEntry('node_modules', '.env');
  assert.equal(result.content, 'node_modules\n.env\n');
});
