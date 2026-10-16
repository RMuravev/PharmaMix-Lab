import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const checker = new URL('./check-current-boundary.mjs', import.meta.url);

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'pharmamix-boundary-'));
  writeFileSync(join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { module: 'ESNext', moduleResolution: 'Bundler', target: 'ES2022' } }));
  for (const [name, contents] of Object.entries(files)) {
    mkdirSync(join(root, name, '..'), { recursive: true });
    writeFileSync(join(root, name), contents);
  }
  return root;
}

function run(root, entries) {
  const result = spawnSync(process.execPath, [checker.pathname, '--root', root, ...entries.flatMap(entry => ['--entry', entry])], { encoding: 'utf8' });
  return { ok: result.status === 0, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

test('accepts a clean current dependency graph', () => {
  const root = fixture({ 'src/main.ts': "import './application/current';", 'src/application/current.ts': 'export const current = true;' });
  assert.equal(run(root, ['src/main.ts']).ok, true);
});

test('resolves configured TypeScript path aliases before applying the boundary', () => {
  const root = fixture({
    'src/main.ts': "import type { Old } from '@old/pharma'; export type Probe = Old;",
    'src/types/pharma.ts': 'export interface Old { id: string }',
  });
  writeFileSync(join(root, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { module: 'ESNext', moduleResolution: 'Bundler', baseUrl: '.', paths: { '@old/*': ['src/types/*'] } },
  }));
  const result = run(root, ['src/main.ts']);
  assert.equal(result.ok, false);
  assert.match(result.output, /src\/types\/pharma\.ts/);
});

for (const [name, files, entries] of [
  ['direct runtime import', { 'src/main.ts': "import './core/legacy';", 'src/core/legacy.ts': 'export const old = true;' }, ['src/main.ts']],
  ['transitive runtime import', { 'src/main.ts': "import './application/current';", 'src/application/current.ts': "import '../modules/legacy';", 'src/modules/legacy.ts': 'export {};' }, ['src/main.ts']],
  ['type-only import and re-export', { 'src/main.ts': "export type { Old } from './application/current';", 'src/application/current.ts': "export type { PanelRecord as Old } from '../types/pharma';", 'src/types/pharma.ts': 'export interface PanelRecord { id: string }' }, ['src/main.ts']],
  ['new URL worker dependency', { 'src/main.ts': "new Worker(new URL('./application/job.worker.ts', import.meta.url));", 'src/application/job.worker.ts': "import '../utils/legacy';", 'src/utils/legacy.ts': 'export {};' }, ['src/main.ts']],
  ['worker-query dependency', { 'src/main.ts': "import Job from './application/job.worker?worker'; void Job;", 'src/application/job.worker.ts': "import '../workers/legacy';", 'src/workers/legacy.ts': 'export {};' }, ['src/main.ts']],
  ['current worker transitive dependency', { 'src/infrastructure/workers/job.ts': "import '../../core/legacy';", 'src/core/legacy.ts': 'export {};' }, ['src/infrastructure/workers/job.ts']],
  ['E2E dependency', { 'src/main.ts': 'export {};', 'e2e/app.spec.ts': "import '../src/ui/legacy';", 'src/ui/legacy.ts': 'export {};' }, ['src/main.ts', 'e2e/app.spec.ts']],
]) {
  test(`rejects ${name}`, () => {
    const result = run(fixture(files), entries);
    assert.equal(result.ok, false);
    assert.match(result.output, /legacy boundary violation/i);
  });
}
