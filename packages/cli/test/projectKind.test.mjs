import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectProjectKind, envFileNameFor } from '../dist/index.js';

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'apex-cli-kind-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('detects Next.js from the next dependency', () => {
  withTempDir((dir) => {
    assert.equal(detectProjectKind(dir, { dependencies: { next: '^15.0.0' } }), 'next');
  });
});

test('detects Vite from the vite dependency', () => {
  withTempDir((dir) => {
    assert.equal(detectProjectKind(dir, { devDependencies: { vite: '^5.0.0', react: '^18.0.0' } }), 'vite');
  });
});

test('detects Vite from a vite.config file even without the dependency listed yet', () => {
  withTempDir((dir) => {
    writeFileSync(join(dir, 'vite.config.ts'), 'export default {}');
    assert.equal(detectProjectKind(dir, {}), 'vite');
  });
});

test('falls back to generic Node when nothing matches', () => {
  withTempDir((dir) => {
    assert.equal(detectProjectKind(dir, { dependencies: { express: '^4.0.0' } }), 'node');
  });
});

test('Next.js takes priority when both next and vite are present', () => {
  withTempDir((dir) => {
    assert.equal(detectProjectKind(dir, { dependencies: { next: '^15.0.0', vite: '^5.0.0' } }), 'next');
  });
});

test('maps project kind to the right env file', () => {
  assert.equal(envFileNameFor('next'), '.env.local');
  assert.equal(envFileNameFor('vite'), '.env.local');
  assert.equal(envFileNameFor('node'), '.env');
});
