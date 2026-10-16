import { build } from 'esbuild';
import { readdir } from 'node:fs/promises';

const LEGACY_PREFIXES = [
  'src/App.tsx',
  'src/pharma_engine.ts',
  'src/core/',
  'src/modules/',
  'src/types/',
  'src/ui/',
  'src/utils/',
  'src/workers/',
];

async function inspect(label, entryPoints, platform) {
  const result = await build({
    entryPoints,
    bundle: true,
    write: false,
    outdir: `boundary-check-output/${label}`,
    metafile: true,
    platform,
    format: 'esm',
    packages: 'external',
    loader: { '.css': 'empty' },
    plugins: [{
      name: 'vite-worker-query',
      setup(build) {
        build.onResolve({ filter: /\?worker$/ }, args => ({ path: args.path, external: true }));
      },
    }],
    logLevel: 'silent',
  });
  const inputs = Object.keys(result.metafile.inputs).map(path => path.replaceAll('\\', '/'));
  const violations = inputs.filter(path => LEGACY_PREFIXES.some(prefix =>
    prefix.endsWith('/') ? path.startsWith(prefix) : path === prefix,
  ));
  if (violations.length) {
    console.error(`Current ${label} graph reaches legacy runtime modules:`);
    for (const path of violations.sort()) console.error(`- ${path}`);
    process.exit(1);
  }
  return inputs.filter(path => path.startsWith('src/')).length;
}

const productionCount = await inspect('production', [
  'src/main.tsx',
  'src/infrastructure/workers/marketingOptimization.worker.ts',
], 'browser');
const currentRoots = ['src/app', 'src/application', 'src/domain', 'src/infrastructure', 'src/pages', 'src/shared'];
const testEntries = [];
for (const root of currentRoots) {
  for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.test.ts')) testEntries.push(`${entry.parentPath}/${entry.name}`);
  }
}
const testCount = await inspect('tests', testEntries, 'node');
console.log(`Current architecture boundary verified (production ${productionCount}, tests ${testCount} source modules; 0 legacy modules).`);
