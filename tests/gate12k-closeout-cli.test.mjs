import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseUpdateCloseoutArgs } from '../scripts/update-closeout-cli.mjs';

const CLI = fileURLToPath(new URL('../scripts/update-closeout-cli.mjs', import.meta.url));

test('Gate 12K CLI parses verify and complete options', () => {
  assert.deepEqual(parseUpdateCloseoutArgs([
    'verify',
    '--report=./gate12j-report.json',
    '--session=update-123',
    '--workspace=./workspace',
  ]), {
    command: 'verify',
    applyReportPath: resolve('./gate12j-report.json'),
    sessionId: 'update-123',
    workspace: resolve('./workspace'),
  });

  assert.deepEqual(parseUpdateCloseoutArgs([
    'complete',
    '--report=./gate12j-report.json',
    '--confirm=' + 'a'.repeat(64),
  ]), {
    command: 'complete',
    applyReportPath: resolve('./gate12j-report.json'),
    confirm: 'a'.repeat(64),
  });
});

test('Gate 12K CLI rejects missing, duplicate and incompatible options', () => {
  for (const argv of [
    [],
    ['unknown'],
    ['verify'],
    ['verify', '--report='],
    ['verify', '--confirm=x', '--report=a.json'],
    ['complete', '--report=a.json'],
    ['complete', '--report=a.json', '--confirm='],
    ['verify', '--report=a.json', '--report=b.json'],
    ['verify', '--report=a.json', '--workspace'],
  ]) {
    assert.throws(() => parseUpdateCloseoutArgs(argv), undefined, JSON.stringify(argv));
  }
});

test('Gate 12K CLI help succeeds without report/session access', () => {
  for (const argv of [['--help'], ['verify', '--help']]) {
    const result = spawnSync(process.execPath, [CLI, ...argv], {
      encoding: 'utf8',
      timeout: 15000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /data:session:closeout/);
    assert.match(result.stdout, /closeoutFingerprint/);
    assert.match(result.stdout, /generated data/);
    assert.match(result.stdout, /completed/);
  }
});

test('Gate 12K CLI exits nonzero for a missing apply report', () => {
  const result = spawnSync(process.execPath, [
    CLI,
    'verify',
    '--report=definitely-missing-gate12j-report.json',
  ], {
    encoding: 'utf8',
    timeout: 15000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Gate 12J apply report not found/);
});

test('Gate 12K CLI npm entry is wired to closeout command', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(
    pkg.scripts['data:session:closeout'],
    'node scripts/update-closeout-cli.mjs',
  );
});
