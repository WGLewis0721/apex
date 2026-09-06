import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
const output = '.test-build';
try {
  mkdirSync(output, { recursive: true });
  writeFileSync(`${output}/package.json`, '{"type":"commonjs"}');
  execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', 'src/lib/controlPlane.ts', 'src/lib/assurance.ts', '--target', 'ES2022', '--module', 'commonjs', '--skipLibCheck', '--strict', '--outDir', output], { stdio: 'inherit' });
  execFileSync(process.execPath, ['--test', 'tests/assurance.test.cjs'], { stdio: 'inherit' });
} finally { rmSync(output, { recursive: true, force: true }); }
