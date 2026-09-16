import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('Gate 8A adds check-only TypeScript without changing runtime file extensions', () => {
  const config = JSON.parse(read('tsconfig.json'));
  assert.equal(config.compilerOptions.allowJs, true);
  assert.equal(config.compilerOptions.checkJs, true);
  assert.equal(config.compilerOptions.noEmit, true);
  assert.equal(config.compilerOptions.strict, false);
  assert.equal(config.compilerOptions.noImplicitAny, false);
  for (const file of ['main', 'model', 'nikki', 'biguse', 'material', 'wardrobechk']) {
    assert.equal(existsSync(new URL(`../${file}.ts`, import.meta.url)), false, `${file}.ts should not exist in Gate 8A`);
  }
});

test('TypeScript baseline is explicit and version-locked', () => {
  const pkg = JSON.parse(read('package.json'));
  const baseline = JSON.parse(read('typecheck-baseline.json'));
  assert.equal(pkg.devDependencies.typescript, '7.0.2');
  assert.equal(baseline.typescript_version, '7.0.2');
  assert.ok(baseline.diagnostic_count >= 0);
  assert.equal(baseline.diagnostics.length, baseline.diagnostic_count);
  assert.equal(Object.keys(baseline.summary_by_code).length > 0, baseline.diagnostic_count > 0);
  for (const diagnostic of baseline.diagnostics) {
    assert.equal(typeof diagnostic.file, 'string');
    assert.equal(typeof diagnostic.code, 'number');
    assert.equal(typeof diagnostic.message, 'string');
    assert.equal(typeof diagnostic.source, 'string');
  }
});

test('repository check and CI enforce the baseline-aware typecheck', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts.typecheck, 'node scripts/typecheck-baseline.mjs');
  assert.equal(pkg.scripts['typecheck:raw'], 'tsc -p tsconfig.json --pretty false');
  assert.equal(pkg.scripts['typecheck:update'], 'node scripts/typecheck-baseline.mjs --update');
  assert.match(pkg.scripts.check, /npm run typecheck/);
  assert.match(read('.github/workflows/main.yml'), /run: npm run check/);
  const checker = read('scripts/typecheck-baseline.mjs');
  assert.match(checker, /TypeScript baseline mismatch/);
  assert.match(checker, /typecheck:update/);
});
