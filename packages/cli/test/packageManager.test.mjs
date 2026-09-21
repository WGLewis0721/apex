import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectPackageManager, installCommandFor, detectFrameworkHint } from '../dist/index.js';

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'apex-cli-pm-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('defaults to npm when no lockfile is present', () => {
  withTempDir((dir) => {
    assert.equal(detectPackageManager(dir), 'npm');
  });
});

test('detects pnpm, yarn, and bun from their lockfiles', () => {
  withTempDir((dir) => {
    writeFileSync(join(dir, 'pnpm-lock.yaml'), '');
    assert.equal(detectPackageManager(dir), 'pnpm');
  });
  withTempDir((dir) => {
    writeFileSync(join(dir, 'yarn.lock'), '');
    assert.equal(detectPackageManager(dir), 'yarn');
  });
  withTempDir((dir) => {
    writeFileSync(join(dir, 'bun.lockb'), '');
    assert.equal(detectPackageManager(dir), 'bun');
  });
});

test('builds the right install invocation per package manager', () => {
  assert.deepEqual(installCommandFor('npm', '@wlgewis-gmtc/apex-sdk'), { command: 'npm', args: ['install', '@wlgewis-gmtc/apex-sdk'] });
  assert.deepEqual(installCommandFor('pnpm', '@wlgewis-gmtc/apex-sdk'), { command: 'pnpm', args: ['add', '@wlgewis-gmtc/apex-sdk'] });
  assert.deepEqual(installCommandFor('yarn', '@wlgewis-gmtc/apex-sdk'), { command: 'yarn', args: ['add', '@wlgewis-gmtc/apex-sdk'] });
  assert.deepEqual(installCommandFor('bun', '@wlgewis-gmtc/apex-sdk'), { command: 'bun', args: ['add', '@wlgewis-gmtc/apex-sdk'] });
});

test('hints at a known framework when one is a dependency', () => {
  assert.equal(detectFrameworkHint({ dependencies: { express: '^4.0.0' } }), 'express');
  assert.equal(detectFrameworkHint({ devDependencies: { next: '^15.0.0' } }), 'next');
  assert.equal(detectFrameworkHint({ dependencies: { lodash: '^4.0.0' } }), null);
});
