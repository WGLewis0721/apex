import assert from 'node:assert/strict';
import test from 'node:test';
import { parseInitArgs } from '../dist/index.js';

test('normal usage passes no flags', () => {
  assert.deepEqual(parseInitArgs([]), {});
});

test('parses --base-url with a separate value', () => {
  assert.deepEqual(parseInitArgs(['--base-url', 'https://example.test']), { baseUrl: 'https://example.test' });
});

test('parses --base-url=value form', () => {
  assert.deepEqual(parseInitArgs(['--base-url=https://example.test']), { baseUrl: 'https://example.test' });
});

test('ignores unrelated flags', () => {
  assert.deepEqual(parseInitArgs(['--verbose', '--base-url', 'https://example.test', '--foo', 'bar']), {
    baseUrl: 'https://example.test',
  });
});
