import assert from 'node:assert/strict';
import test from 'node:test';
import { buildExampleContent, EXAMPLE_FILE_NAME } from '../dist/index.js';

test('example content imports the real SDK and shows entitlements/consume', () => {
  const content = buildExampleContent('.env');
  assert.match(content, /import \{ ApexClient \} from "@wlgewis-gmtc\/apex-sdk";/);
  assert.match(content, /apex\.entitlements\(customerId\)/);
  assert.match(content, /\/\/ const result = await apex\.consume\(/);
});

test('example content references the actual env file it was generated for', () => {
  assert.match(buildExampleContent('.env.local'), /--env-file=\.env\.local/);
  assert.match(buildExampleContent('.env'), /--env-file=\.env /);
});

test('never hardcodes a real-looking secret', () => {
  assert.doesNotMatch(buildExampleContent('.env'), /apex_sk_(test|live)_[A-Za-z0-9_]{6,}/);
});

test('exports a stable file name', () => {
  assert.equal(EXAMPLE_FILE_NAME, 'apex-example.mjs');
});
