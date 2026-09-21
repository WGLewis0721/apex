import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkSdkResolvable } from '../dist/index.js';

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'apex-cli-resolve-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('reports resolvable when the package exports ApexClient', () => {
  withTempDir((dir) => {
    const pkgDir = join(dir, 'node_modules', 'fake-apex-sdk');
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({ name: 'fake-apex-sdk', type: 'module', main: 'index.js' }));
    writeFileSync(join(pkgDir, 'index.js'), 'export function ApexClient() {}\n');
    const result = checkSdkResolvable(dir, 'fake-apex-sdk');
    assert.equal(result.resolvable, true);
  });
});

test('reports not resolvable when the package is missing', () => {
  withTempDir((dir) => {
    const result = checkSdkResolvable(dir, 'does-not-exist-anywhere');
    assert.equal(result.resolvable, false);
    assert.match(result.detail, /could not be imported/);
  });
});

test('reports not resolvable when ApexClient is missing from the export', () => {
  withTempDir((dir) => {
    const pkgDir = join(dir, 'node_modules', 'wrong-shape');
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({ name: 'wrong-shape', type: 'module', main: 'index.js' }));
    writeFileSync(join(pkgDir, 'index.js'), 'export const notIt = true;\n');
    const result = checkSdkResolvable(dir, 'wrong-shape');
    assert.equal(result.resolvable, false);
    assert.match(result.detail, /does not export ApexClient/);
  });
});
