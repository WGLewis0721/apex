import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from '../dist/index.js';

async function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'apex-cli-init-'));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function baseOptions(dir, overrides = {}) {
  return {
    cwd: dir,
    env: {},
    log: () => {},
    runInstall: () => ({ status: 0 }),
    verify: async () => 'valid',
    checkResolvable: () => ({ resolvable: true }),
    ...overrides,
  };
}

test('fails clearly on a directory that is not a Node project', async () => {
  await withTempDir(async (dir) => {
    const report = await runInit(baseOptions(dir));
    assert.equal(report.success, false);
    assert.equal(report.steps[0].name, 'project');
    assert.equal(report.steps.length, 1);
  });
});

test('a fresh project: installs, writes .env, ignores it, verifies', async () => {
  await withTempDir(async (dir) => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'demo-app' }));
    let installCalls = 0;
    const report = await runInit(
      baseOptions(dir, {
        env: { APEX_SECRET_KEY: 'apex_sk_test_abc123' },
        runInstall: (command, args, opts) => {
          installCalls += 1;
          assert.equal(command, 'npm');
          assert.deepEqual(args, ['install', '@wlgewis-gmtc/apex-sdk']);
          assert.equal(opts.cwd, dir);
          return { status: 0 };
        },
      }),
    );
    assert.equal(report.success, true);
    assert.equal(installCalls, 1);
    assert.equal(readFileSync(join(dir, '.env'), 'utf8'), 'APEX_SECRET_KEY=apex_sk_test_abc123\n');
    assert.equal(readFileSync(join(dir, '.gitignore'), 'utf8'), '.env\n');
    assert.ok(report.steps.every((s) => s.status === 'ok'));
  });
});

test('skips install when the SDK is already a declared dependency', async () => {
  await withTempDir(async (dir) => {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'demo-app', dependencies: { '@wlgewis-gmtc/apex-sdk': '^0.1.0' } }),
    );
    let installCalls = 0;
    const report = await runInit(
      baseOptions(dir, {
        env: { APEX_SECRET_KEY: 'apex_sk_test_abc123' },
        runInstall: () => {
          installCalls += 1;
          return { status: 0 };
        },
      }),
    );
    assert.equal(installCalls, 0);
    const installStep = report.steps.find((s) => s.name === 'install');
    assert.match(installStep.detail, /already a dependency/);
  });
});

test('re-running with an existing valid .env reuses it and never prompts', async () => {
  await withTempDir(async (dir) => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'demo-app', dependencies: { '@wlgewis-gmtc/apex-sdk': '^0.1.0' } }));
    writeFileSync(join(dir, '.env'), 'DATABASE_URL=postgres://localhost\nAPEX_SECRET_KEY=apex_sk_test_existing\n');
    writeFileSync(join(dir, '.gitignore'), 'node_modules\n.env\n');
    let promptCalls = 0;
    const report = await runInit(
      baseOptions(dir, {
        promptForSecret: async () => {
          promptCalls += 1;
          return 'should-not-be-used';
        },
      }),
    );
    assert.equal(promptCalls, 0);
    assert.equal(report.success, true);
    assert.equal(
      readFileSync(join(dir, '.env'), 'utf8'),
      'DATABASE_URL=postgres://localhost\nAPEX_SECRET_KEY=apex_sk_test_existing\n',
    );
    const envStep = report.steps.find((s) => s.name === 'env-file');
    assert.match(envStep.detail, /already has the right/);
    const gitignoreStep = report.steps.find((s) => s.name === 'gitignore');
    assert.match(gitignoreStep.detail, /already ignores/);
  });
});

test('falls back to an interactive prompt when nothing else provides a key', async () => {
  await withTempDir(async (dir) => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'demo-app', dependencies: { '@wlgewis-gmtc/apex-sdk': '^0.1.0' } }));
    const report = await runInit(
      baseOptions(dir, {
        promptForSecret: async () => 'apex_sk_test_fromprompt',
      }),
    );
    assert.equal(report.success, true);
    assert.equal(readFileSync(join(dir, '.env'), 'utf8'), 'APEX_SECRET_KEY=apex_sk_test_fromprompt\n');
  });
});

test('fails clearly when there is no key and no interactive terminal', async () => {
  await withTempDir(async (dir) => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'demo-app', dependencies: { '@wlgewis-gmtc/apex-sdk': '^0.1.0' } }));
    const report = await runInit(
      baseOptions(dir, {
        promptForSecret: async () => {
          throw new Error('NOT_INTERACTIVE');
        },
      }),
    );
    assert.equal(report.success, false);
    const step = report.steps.find((s) => s.name === 'credential');
    assert.match(step.detail, /no interactive terminal/);
  });
});

test('rejects an obviously malformed key from the environment', async () => {
  await withTempDir(async (dir) => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'demo-app', dependencies: { '@wlgewis-gmtc/apex-sdk': '^0.1.0' } }));
    const report = await runInit(baseOptions(dir, { env: { APEX_SECRET_KEY: 'not-a-real-key' } }));
    assert.equal(report.success, false);
    const step = report.steps.find((s) => s.name === 'credential');
    assert.match(step.detail, /not a valid APEX key/);
  });
});

test('stops after a failed install without touching .env or .gitignore', async () => {
  await withTempDir(async (dir) => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'demo-app' }));
    const report = await runInit(
      baseOptions(dir, {
        env: { APEX_SECRET_KEY: 'apex_sk_test_abc123' },
        runInstall: () => ({ status: 1 }),
      }),
    );
    assert.equal(report.success, false);
    assert.equal(report.steps.find((s) => s.name === 'install').status, 'error');
    assert.equal(report.steps.some((s) => s.name === 'env-file'), false);
  });
});

test('surfaces an invalid credential from the hosted service as an error', async () => {
  await withTempDir(async (dir) => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'demo-app', dependencies: { '@wlgewis-gmtc/apex-sdk': '^0.1.0' } }));
    const report = await runInit(
      baseOptions(dir, {
        env: { APEX_SECRET_KEY: 'apex_sk_test_abc123' },
        verify: async () => 'invalid',
      }),
    );
    assert.equal(report.success, false);
    assert.equal(report.steps.find((s) => s.name === 'verify').status, 'error');
  });
});

test('an unreachable hosted service warns but does not fail the run', async () => {
  await withTempDir(async (dir) => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'demo-app', dependencies: { '@wlgewis-gmtc/apex-sdk': '^0.1.0' } }));
    const report = await runInit(
      baseOptions(dir, {
        env: { APEX_SECRET_KEY: 'apex_sk_test_abc123' },
        verify: async () => 'unknown',
      }),
    );
    assert.equal(report.success, true);
    assert.equal(report.steps.find((s) => s.name === 'verify').status, 'warn');
  });
});

test('an unresolvable SDK import warns but does not fail the run', async () => {
  await withTempDir(async (dir) => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'demo-app', dependencies: { '@wlgewis-gmtc/apex-sdk': '^0.1.0' } }));
    const report = await runInit(
      baseOptions(dir, {
        env: { APEX_SECRET_KEY: 'apex_sk_test_abc123' },
        checkResolvable: () => ({ resolvable: false, detail: 'not found' }),
      }),
    );
    assert.equal(report.success, true);
    assert.equal(report.steps.find((s) => s.name === 'import').status, 'warn');
  });
});

test('never writes the secret anywhere other than .env', async () => {
  await withTempDir(async (dir) => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'demo-app', dependencies: { '@wlgewis-gmtc/apex-sdk': '^0.1.0' } }));
    const lines = [];
    const report = await runInit(
      baseOptions(dir, {
        env: { APEX_SECRET_KEY: 'apex_sk_test_shouldnotleak' },
        log: (line) => lines.push(line),
      }),
    );
    assert.equal(report.success, true);
    for (const step of report.steps) assert.doesNotMatch(step.detail, /apex_sk_test_shouldnotleak/);
    for (const line of lines) assert.doesNotMatch(line, /apex_sk_test_shouldnotleak/);
  });
});
