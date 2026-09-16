import { spawnSync } from 'node:child_process';
import { resolve, relative, sep } from 'node:path';

const root = process.cwd();
const tsc = resolve(root, 'node_modules/typescript/bin/tsc');
const result = spawnSync(process.execPath, [tsc, '-p', 'tsconfig.no-implicit-any.json', '--pretty', 'false'], {
  cwd: root,
  encoding: 'utf8',
});

if (result.error) throw result.error;

const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
const enforcedFiles = new Set([
  'clock.mjs',
  'main.mjs',
  'biguse.mjs',
  'biguse_nikki.mjs',
  'sharewardrobe.mjs',
  'wardrobechk.mjs',
  'biguse_ui.mjs',
  'ui.mjs',
  'onekeystrategy.mjs',
  'model.mjs',
  'onekeystrategy_lan.mjs',
  'material_model.mjs',
]);
const normalized = file => relative(root, resolve(root, file)).split(sep).join('/');
const isEnforcedFile = file => file.startsWith('src/domain/') || file.startsWith('cn-search/src/') || enforcedFiles.has(file);

const diagnostics = [];
let current = null;
for (const line of output.split(/\r?\n/)) {
  const match = line.match(/^(.+)\((\d+),(\d+)\): error (TS\d+): (.*)$/);
  if (match) {
    current = {
      file: normalized(match[1]),
      lines: [line],
    };
    diagnostics.push(current);
  } else if (current && line) {
    current.lines.push(line);
  }
}

const nonFileErrors = output
  .split(/\r?\n/)
  .filter(line => /^error TS\d+:/.test(line));
if (nonFileErrors.length) {
  console.error(nonFileErrors.join('\n'));
  process.exit(1);
}

const enforcedDiagnostics = diagnostics.filter(diagnostic => isEnforcedFile(diagnostic.file));
if (enforcedDiagnostics.length) {
  console.error(enforcedDiagnostics.flatMap(diagnostic => diagnostic.lines).join('\n'));
  console.error(`noImplicitAny staged gate FAIL: ${enforcedDiagnostics.length} diagnostic(s) in enforced files.`);
  process.exit(1);
}

console.log(
  `noImplicitAny staged gate PASS: 0 diagnostics in src/domain/** + cn-search/src/** + ${enforcedFiles.size} app/UI modules; ` +
  `${diagnostics.length} diagnostic(s) remain outside the enforced scope.`
);