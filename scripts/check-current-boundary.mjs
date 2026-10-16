import { build } from 'esbuild';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

const FORBIDDEN = [
  'src/App.tsx', 'src/pharma_engine.ts', 'src/core/', 'src/modules/',
  'src/types/', 'src/ui/', 'src/utils/', 'src/workers/',
];
const normalize = path => path.replaceAll('\\', '/');
const isForbidden = path => FORBIDDEN.some(prefix => prefix.endsWith('/') ? path.startsWith(prefix) : path === prefix);

function parseArguments() {
  const args = process.argv.slice(2), entries = [];
  let root = process.cwd();
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--root') root = resolve(args[++index]);
    else if (args[index] === '--entry') entries.push(args[++index]);
    else throw new Error(`Unknown argument: ${args[index]}`);
  }
  return { root, entries };
}

function readResolverOptions(root) {
  const configPath = resolve(root, 'tsconfig.json');
  if (!existsSync(configPath)) throw new Error(`tsconfig.json not found under ${root}`);
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  return { baseUrl: resolve(root, config.compilerOptions?.baseUrl ?? '.'), paths: config.compilerOptions?.paths ?? {} };
}

function moduleReferences(source) {
  const references = new Set(), patterns = [
    /\b(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bnew\s+URL\s*\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g,
  ];
  for (const pattern of patterns) for (const match of source.matchAll(pattern)) references.add(match[1]);
  return references;
}

function resolveCandidate(candidate) {
  for (const suffix of ['', '.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '/index.ts', '/index.tsx']) {
    if (existsSync(`${candidate}${suffix}`)) return `${candidate}${suffix}`;
  }
  return null;
}

function resolveReference(specifier, containingFile, options) {
  const clean = specifier.replace(/[?#].*$/, '');
  if (clean.startsWith('.')) return resolveCandidate(resolve(dirname(containingFile), clean));
  for (const [pattern, targets] of Object.entries(options.paths)) {
    const star = pattern.indexOf('*');
    const prefix = star < 0 ? pattern : pattern.slice(0, star), suffix = star < 0 ? '' : pattern.slice(star + 1);
    if (!clean.startsWith(prefix) || !clean.endsWith(suffix)) continue;
    const match = clean.slice(prefix.length, clean.length - suffix.length || undefined);
    for (const target of targets) {
      const found = resolveCandidate(resolve(options.baseUrl, target.replace('*', match)));
      if (found) return found;
    }
  }
  return null;
}

function inspectTypeScriptGraph(root, entries) {
  const options = readResolverOptions(root), queue = entries.map(entry => isAbsolute(entry) ? entry : resolve(root, entry));
  const visited = new Set(), violations = new Set();
  while (queue.length) {
    const file = queue.pop();
    if (!file || visited.has(file) || !existsSync(file)) continue;
    visited.add(file);
    const path = normalize(relative(root, file));
    if (isForbidden(path)) violations.add(path);
    if (!/\.[cm]?[jt]sx?$/.test(file) || normalize(file).includes('/node_modules/')) continue;
    const source = readFileSync(file, 'utf8');
    for (const specifier of moduleReferences(source)) {
      const dependency = resolveReference(specifier, file, options);
      if (dependency && normalize(dependency).startsWith(`${normalize(root)}/`)) queue.push(dependency);
    }
  }
  if (violations.size) {
    console.error('Legacy boundary violation: the supported TypeScript graph reaches forbidden modules:');
    for (const path of [...violations].sort()) console.error(`- ${path}`);
    process.exitCode = 1;
  }
  return { modules: visited.size, violations: violations.size };
}

async function inspectRuntimeBundle(root, entries) {
  const result = await build({ absWorkingDir: root, entryPoints: entries, bundle: true, write: false,
    outdir: 'boundary-check-output', metafile: true, platform: 'browser', format: 'esm', packages: 'external',
    loader: { '.css': 'empty' }, logLevel: 'silent' });
  const inputs = Object.keys(result.metafile.inputs).map(normalize), violations = inputs.filter(isForbidden);
  if (violations.length) {
    console.error('Legacy boundary violation: the production bundle reaches forbidden modules:');
    for (const path of violations.sort()) console.error(`- ${path}`);
    process.exitCode = 1;
  }
  return inputs.filter(path => path.startsWith('src/')).length;
}

function filesBelow(root, directory, predicate) {
  const base = resolve(root, directory), files = [];
  if (!existsSync(base)) return files;
  const walk = path => { for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = resolve(path, entry.name);
    if (entry.isDirectory()) walk(child); else if (predicate(entry.name)) files.push(normalize(relative(root, child)));
  } };
  walk(base);
  return files;
}

const { root, entries: requestedEntries } = parseArguments();
const fixtureMode = requestedEntries.length > 0;
const productionEntries = fixtureMode ? requestedEntries : ['src/main.tsx', 'src/infrastructure/workers/marketingOptimization.worker.ts'];
const currentTests = fixtureMode ? [] : ['src/app', 'src/application', 'src/domain', 'src/infrastructure', 'src/pages', 'src/shared']
  .flatMap(directory => filesBelow(root, directory, name => name.endsWith('.test.ts') || name.endsWith('.test.tsx')));
const browserTests = fixtureMode ? [] : filesBelow(root, 'e2e', name => /\.[cm]?[jt]sx?$/.test(name));
const graph = inspectTypeScriptGraph(root, [...new Set([...productionEntries, ...currentTests, ...browserTests])]);
const bundled = fixtureMode ? null : await inspectRuntimeBundle(root, productionEntries);
if (process.exitCode) process.exit(process.exitCode);
console.log(`Current architecture boundary verified (TypeScript graph ${graph.modules} modules; production bundle ${bundled ?? 'fixture'} modules; 0 legacy modules).`);
