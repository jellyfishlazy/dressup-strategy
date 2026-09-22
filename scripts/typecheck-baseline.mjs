import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = path.join(repoRoot, 'typecheck-baseline.json');
const tscPath = path.join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc');
const update = process.argv.includes('--update');

const run = spawnSync(process.execPath, [tscPath, '-p', 'tsconfig.json', '--pretty', 'false'], {
  cwd: repoRoot,
  encoding: 'utf8',
});

if (run.error) throw run.error;
const output = `${run.stdout || ''}${run.stderr || ''}`;
const diagnosticPattern = /^(.*)\((\d+),(\d+)\): error TS(\d+): (.*)$/gm;
const diagnostics = [];
for (const match of output.matchAll(diagnosticPattern)) {
  const rawFile = match[1];
  const line = Number(match[2]);
  const file = path.relative(repoRoot, path.resolve(repoRoot, rawFile)).replaceAll('\\', '/');
  let source = '';
  try {
    source = readFileSync(path.join(repoRoot, file), 'utf8').split(/\r?\n/)[line - 1]?.trim() || '';
  } catch {
    source = '';
  }
  diagnostics.push({
    file,
    code: Number(match[4]),
    message: match[5].trim(),
    source,
  });
}

diagnostics.sort((a, b) =>
  a.file.localeCompare(b.file) ||
  a.code - b.code ||
  a.message.localeCompare(b.message) ||
  a.source.localeCompare(b.source)
);

if (run.status !== 0 && diagnostics.length === 0) {
  process.stderr.write(output || `TypeScript exited with status ${run.status}\n`);
  process.exit(run.status || 1);
}

const typescriptVersion = JSON.parse(readFileSync(path.join(repoRoot, 'node_modules', 'typescript', 'package.json'), 'utf8')).version;
const summaryByCode = Object.fromEntries(
  [...new Set(diagnostics.map(item => item.code))]
    .sort((a, b) => a - b)
    .map(code => [String(code), diagnostics.filter(item => item.code === code).length])
);

const current = {
  typescript_version: typescriptVersion,
  diagnostic_count: diagnostics.length,
  summary_by_code: summaryByCode,
  diagnostics,
};

if (update) {
  writeFileSync(baselinePath, `${JSON.stringify(current, null, 2)}\n`, 'utf8');
  console.log(`Updated TypeScript baseline: ${diagnostics.length} diagnostics (TypeScript ${typescriptVersion}).`);
  process.exit(0);
}

let baseline;
try {
  baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
} catch {
  console.error('TypeScript baseline is missing or invalid. Run: npm run typecheck:update');
  process.exit(1);
}

const fingerprint = value => JSON.stringify(value);
const counts = list => {
  const map = new Map();
  for (const item of list) map.set(fingerprint(item), (map.get(fingerprint(item)) || 0) + 1);
  return map;
};
const expected = counts(baseline.diagnostics || []);
const actual = counts(diagnostics);
const added = [];
const removed = [];
for (const [key, count] of actual) {
  const delta = count - (expected.get(key) || 0);
  if (delta > 0) for (let i = 0; i < delta; i++) added.push(JSON.parse(key));
}
for (const [key, count] of expected) {
  const delta = count - (actual.get(key) || 0);
  if (delta > 0) for (let i = 0; i < delta; i++) removed.push(JSON.parse(key));
}

if (added.length || removed.length || baseline.typescript_version !== typescriptVersion) {
  console.error(`TypeScript baseline mismatch. Expected ${baseline.diagnostic_count ?? (baseline.diagnostics || []).length}, found ${diagnostics.length}.`);
  if (baseline.typescript_version !== typescriptVersion) {
    console.error(`TypeScript version changed: baseline ${baseline.typescript_version}, current ${typescriptVersion}.`);
  }
  for (const item of added.slice(0, 20)) console.error(`+ ${item.file} TS${item.code}: ${item.message} :: ${item.source}`);
  if (added.length > 20) console.error(`+ ... ${added.length - 20} more new diagnostics`);
  for (const item of removed.slice(0, 20)) console.error(`- ${item.file} TS${item.code}: ${item.message} :: ${item.source}`);
  if (removed.length > 20) console.error(`- ... ${removed.length - 20} more resolved/stale diagnostics`);
  console.error('Review the change, then run npm run typecheck:update only when the baseline change is intentional.');
  process.exit(1);
}

console.log(`TypeScript baseline PASS: ${diagnostics.length} known diagnostics, 0 new (TypeScript ${typescriptVersion}).`);
