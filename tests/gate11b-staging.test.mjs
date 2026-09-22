import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { rowToWardrobeLine } from '../cn-search/src/staging.mjs';
import {
  buildWardrobeStagingManifest,
  manifestHasBlockingErrors,
  parseWardrobeImportText,
  parseWardrobeRowLiteral,
  resolveWardrobeTarget,
} from '../scripts/wardrobe-staging.mjs';

const repoRoot = resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const canonicalPath = join(repoRoot, 'data', 'wardrobe.js');
const cliPath = join(repoRoot, 'scripts', 'stage-wardrobe-import.mjs');

function canonicalRows() {
  const context = {};
  vm.runInNewContext(readFileSync(canonicalPath, 'utf8'), context, { filename: canonicalPath, timeout: 10_000 });
  return context.wardrobe;
}

function hashFile(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

test('Gate 11B parses CN Search row literals without executing JavaScript', () => {
  const row = parseWardrobeRowLiteral("['O\\'Brien','髮型','900001','5','','S','','A','','B','','C','','SS','','source','suit','V1'],");
  assert.equal(row.length, 18);
  assert.equal(row[0], "O'Brien");
  assert.equal(row[2], '900001');

  const malicious = parseWardrobeImportText("[(globalThis.pwned=true)]");
  assert.equal(malicious.rows.length, 0);
  assert.equal(malicious.parseErrors.length, 1);
  assert.equal(globalThis.pwned, undefined);
});

test('Gate 11B classifies unchanged, conflict and new rows against canonical target', () => {
  const rows = canonicalRows();
  const unchanged = rows[0].slice();
  const conflict = rows[1].slice();
  conflict[0] = conflict[0] + ' Gate11B';
  const fresh = rows[0].slice();
  fresh[0] = 'Gate 11B New Item';
  fresh[2] = 'GATE11B-NEW';

  const snippet = [
    '// CN Search staging sample',
    rowToWardrobeLine(unchanged),
    rowToWardrobeLine(conflict),
    rowToWardrobeLine(fresh),
  ].join('\n');

  const manifest = buildWardrobeStagingManifest({
    inputText: snippet,
    inputPath: 'sample.js',
    createdAt: new Date('2026-09-18T00:00:00.000Z'),
  });

  assert.equal(manifest.formatVersion, 1);
  assert.equal(manifest.target.id, 'wardrobe');
  assert.match(manifest.target.sha256, /^[0-9a-f]{64}$/);
  assert.match(manifest.input.sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(manifest.summary, {
    totalRows: 3,
    acceptedRows: 3,
    newRows: 1,
    unchangedRows: 1,
    conflictRows: 1,
    invalidRows: 0,
    duplicateRows: 0,
    parseErrors: 0,
  });
  assert.deepEqual(manifest.entries.map(entry => entry.status), ['unchanged', 'conflict', 'new']);
  assert.equal(manifestHasBlockingErrors(manifest), false);
  assert.ok(Array.isArray(manifest.entries[1].baselineRow));
});

test('Gate 11B blocks malformed rows and duplicate staged identities', () => {
  const rows = canonicalRows();
  const valid = rows[0].slice();
  const malformed = rows[1].slice(0, 17);
  const snippet = [rowToWardrobeLine(valid), rowToWardrobeLine(valid), JSON.stringify(malformed) + ','].join('\n');

  const manifest = buildWardrobeStagingManifest({ inputText: snippet, inputPath: 'bad.js' });

  assert.equal(manifest.summary.duplicateRows, 1);
  assert.equal(manifest.summary.invalidRows, 1);
  assert.equal(manifestHasBlockingErrors(manifest), true);
  assert.ok(manifest.errors.some(error => error.kind === 'duplicate'));
  assert.ok(manifest.errors.some(error => error.kind === 'row'));
});

test('Gate 11B contract guard rejects read-only and non-wardrobe targets', () => {
  assert.throws(() => resolveWardrobeTarget('root-wardrobe-snapshot'), /read-only/);
  assert.throws(() => resolveWardrobeTarget('cn-search-index'), /not a wardrobe-18/);
  assert.equal(resolveWardrobeTarget('material-wardrobe').path, 'data/material_wardrobe.js');
});

test('Gate 11B CLI writes only a local manifest and leaves canonical wardrobe byte-identical', () => {
  const rows = canonicalRows();
  const fresh = rows[0].slice();
  fresh[0] = 'Gate 11B CLI Item';
  fresh[2] = 'GATE11B-CLI';

  const dir = mkdtempSync(join(tmpdir(), 'gate11b-'));
  const input = join(dir, 'input.js');
  const output = join(dir, 'manifest.json');
  writeFileSync(input, rowToWardrobeLine(fresh) + '\n', 'utf8');

  const before = hashFile(canonicalPath);
  const result = spawnSync(process.execPath, [cliPath, input, '--output=' + output], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  const after = hashFile(canonicalPath);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(after, before);
  assert.match(result.stdout, /new 1/);
  assert.match(result.stdout, /READY/);

  const manifest = JSON.parse(readFileSync(output, 'utf8'));
  assert.equal(manifest.summary.newRows, 1);
  assert.equal(manifest.target.path, 'data/wardrobe.js');
});


test('Gate 11B accepts JSON row arrays without changing classification semantics', () => {
  const rows = canonicalRows();
  const parsed = parseWardrobeImportText(JSON.stringify([rows[0]]));
  assert.equal(parsed.format, 'json');
  assert.equal(parsed.parseErrors.length, 0);
  assert.equal(parsed.rows.length, 1);

  const manifest = buildWardrobeStagingManifest({
    inputText: JSON.stringify({ rows: [rows[0]] }),
    inputPath: 'rows.json',
  });
  assert.equal(manifest.input.format, 'json');
  assert.equal(manifest.summary.unchangedRows, 1);
  assert.equal(manifestHasBlockingErrors(manifest), false);
});

test('Gate 11B CLI exits non-zero for blocking duplicate input while still writing the manifest', () => {
  const rows = canonicalRows();
  const dir = mkdtempSync(join(tmpdir(), 'gate11b-blocked-'));
  const input = join(dir, 'duplicate.js');
  const output = join(dir, 'blocked-manifest.json');
  const line = rowToWardrobeLine(rows[0]);
  writeFileSync(input, line + '\n' + line + '\n', 'utf8');

  const result = spawnSync(process.execPath, [cliPath, input, '--output=' + output], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /BLOCKED/);
  const manifest = JSON.parse(readFileSync(output, 'utf8'));
  assert.equal(manifest.summary.duplicateRows, 1);
  assert.ok(manifest.errors.some(error => error.kind === 'duplicate'));
});
