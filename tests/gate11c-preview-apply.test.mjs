import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  STAGING_FORMAT_VERSION,
  STAGING_KIND,
  buildWardrobeStagingManifest,
  identityKey,
  sha256Text,
} from '../scripts/wardrobe-staging.mjs';
import {
  applyWardrobeManifestToPath,
  buildWardrobePreview,
  previewLines,
  readWardrobeStagingManifest,
  rowFieldDiffs,
  validateManifestIntegrity,
} from '../scripts/wardrobe-apply.mjs';
import { rowToWardrobeLine } from '../cn-search/src/staging.mjs';
import { loadWardrobe } from '../scripts/validate-data.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const canonicalPath = join(repoRoot, 'data', 'wardrobe.js');
const reviewCli = join(repoRoot, 'scripts', 'review-wardrobe-staging.mjs');

function hashFile(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function makeRow(name, type, id, version = 'V1') {
  return [
    name, type, id, '3',
    '', 'S', '', 'A', '', 'B', '', 'A', 'C', '',
    'POP', '店·金幣', '', version,
  ];
}

function fixtureText(rows) {
  return [
    'var wardrobe = [',
    ...rows.map(rowToWardrobeLine),
    '',
    '];',
    "var lastVersion = 'V9.9.9';",
    "var wardrobe_lastupd = '2026/1/1';",
    "var category = ['髮型','鞋子'];",
    "var wardrobeTags = ['POP'];",
    'var skipCategory=[];',
    'var repelCates=[];',
    '',
  ].join('\n');
}

function summaryFor(entries, errors = []) {
  const count = status => entries.filter(entry => entry.status === status).length;
  return {
    totalRows: entries.length,
    acceptedRows: entries.filter(entry => !['invalid', 'duplicate'].includes(entry.status)).length,
    newRows: count('new'),
    unchangedRows: count('unchanged'),
    conflictRows: count('conflict'),
    invalidRows: count('invalid'),
    duplicateRows: count('duplicate'),
    parseErrors: errors.filter(error => error.kind === 'parse').length,
  };
}

function writeFixtureWithManifest() {
  const dir = mkdtempSync(join(tmpdir(), 'gate11c-'));
  const targetPath = join(dir, 'wardrobe.js');
  const inputPath = join(dir, 'input.js');

  const rowA = makeRow('Alpha', '髮型', '001');
  const rowB = makeRow('Beta', '髮型', '002');
  const conflict = rowB.slice();
  conflict[0] = 'Beta Updated';
  conflict[15] = '設·圖';
  conflict[17] = 'V2';
  const fresh = makeRow('Gamma', '鞋子', '003', 'V2');

  const targetText = fixtureText([rowA, rowB]);
  writeFileSync(targetPath, targetText, 'utf8');
  const inputText = [
    rowToWardrobeLine(rowA),
    rowToWardrobeLine(conflict),
    rowToWardrobeLine(fresh),
  ].join('\n') + '\n';
  writeFileSync(inputPath, inputText, 'utf8');

  const entries = [
    { index: 0, key: identityKey(rowA), status: 'unchanged', row: rowA, baselineRow: rowA.slice() },
    { index: 1, key: identityKey(conflict), status: 'conflict', row: conflict, baselineRow: rowB.slice() },
    { index: 2, key: identityKey(fresh), status: 'new', row: fresh },
  ];
  const manifest = {
    formatVersion: STAGING_FORMAT_VERSION,
    kind: STAGING_KIND,
    createdAt: '2026-09-18T00:00:00.000Z',
    target: {
      id: 'wardrobe',
      path: 'data/wardrobe.js',
      role: 'canonical',
      sha256: sha256Text(targetText),
    },
    input: {
      path: inputPath,
      format: 'cn-search-snippet',
      sha256: sha256Text(inputText),
    },
    summary: summaryFor(entries),
    errors: [],
    entries,
  };

  return { dir, targetPath, inputPath, targetText, rowA, rowB, conflict, fresh, manifest };
}

test('Gate 11C preview recomputes classification and exposes field-level conflict diffs', () => {
  const fx = writeFixtureWithManifest();
  const preview = buildWardrobePreview(fx.manifest, { targetPath: fx.targetPath });

  assert.equal(preview.stale, false);
  assert.deepEqual(preview.integrityErrors, []);
  assert.deepEqual(preview.summary, {
    newRows: 1,
    unchangedRows: 1,
    conflictRows: 1,
    invalidRows: 0,
    duplicateRows: 0,
  });
  assert.deepEqual(preview.entries.map(entry => entry.derivedStatus), ['unchanged', 'conflict', 'new']);

  const diffs = preview.entries[1].fieldDiffs;
  assert.deepEqual(diffs.map(diff => diff.field), ['name', 'source', 'version']);
  assert.deepEqual(rowFieldDiffs(fx.rowB, fx.conflict).map(diff => diff.field), ['name', 'source', 'version']);

  const text = previewLines(preview).join('\n');
  assert.match(text, /\[NEW\] 鞋子\|003 Gamma/);
  assert.match(text, /\[CONFLICT\] 髮型\|002 Beta Updated fields: name, source, version/);
});

test('Gate 11C refuses conflicts without explicit acceptance and leaves target byte-identical', () => {
  const fx = writeFixtureWithManifest();
  const before = hashFile(fx.targetPath);

  assert.throws(
    () => applyWardrobeManifestToPath(fx.manifest, fx.targetPath),
    /explicit conflict acceptance/,
  );
  assert.equal(hashFile(fx.targetPath), before);
});

test('Gate 11C applies reviewed conflict in place, appends new rows, and preserves file tail metadata', () => {
  const fx = writeFixtureWithManifest();
  const result = applyWardrobeManifestToPath(fx.manifest, fx.targetPath, {
    acceptConflicts: true,
    updatedAt: new Date(2026, 8, 18, 12, 0, 0),
  });

  assert.equal(result.applied, true);
  assert.equal(result.addedRows, 1);
  assert.equal(result.updatedRows, 1);
  assert.equal(result.rowCount, 3);
  assert.notEqual(result.beforeSha256, result.afterSha256);

  const rows = loadWardrobe(fx.targetPath);
  assert.equal(JSON.stringify(rows[0]), JSON.stringify(fx.rowA));
  assert.equal(JSON.stringify(rows[1]), JSON.stringify(fx.conflict));
  assert.equal(JSON.stringify(rows[2]), JSON.stringify(fx.fresh));

  const output = readFileSync(fx.targetPath, 'utf8');
  assert.match(output, /var lastVersion = 'V9\.9\.9';/);
  assert.match(output, /var wardrobe_lastupd = '2026\/9\/18';/);
  assert.match(output, /var wardrobeTags = \['POP'\];/);
  assert.match(output, /var repelCates=\[\];/);
  assert.equal(readdirSync(fx.dir).some(name => name.includes('.gate11c-')), false);
});

test('Gate 11C blocks stale target SHA and does not perform an additional write', () => {
  const fx = writeFixtureWithManifest();
  writeFileSync(fx.targetPath, fx.targetText + '// external change\n', 'utf8');
  const changedHash = hashFile(fx.targetPath);

  const preview = buildWardrobePreview(fx.manifest, { targetPath: fx.targetPath });
  assert.equal(preview.stale, true);
  assert.throws(
    () => applyWardrobeManifestToPath(fx.manifest, fx.targetPath, { acceptConflicts: true }),
    /stale manifest/,
  );
  assert.equal(hashFile(fx.targetPath), changedHash);
});

test('Gate 11C rejects tampered manifest summary, status, and missing original input provenance', () => {
  const fx = writeFixtureWithManifest();

  const summaryTamper = globalThis.structuredClone(fx.manifest);
  summaryTamper.summary.conflictRows = 0;
  assert.ok(validateManifestIntegrity(summaryTamper).some(error => /summary mismatch/.test(error)));
  assert.throws(
    () => applyWardrobeManifestToPath(summaryTamper, fx.targetPath, { acceptConflicts: true }),
    /integrity check failed/,
  );

  const statusTamper = globalThis.structuredClone(fx.manifest);
  statusTamper.entries[1].status = 'unchanged';
  statusTamper.summary = summaryFor(statusTamper.entries);
  const statusPreview = buildWardrobePreview(statusTamper, { targetPath: fx.targetPath });
  assert.ok(statusPreview.integrityErrors.some(error => /declared status unchanged does not match derived status conflict/.test(error)));

  const missingInput = globalThis.structuredClone(fx.manifest);
  missingInput.input.path = join(fx.dir, 'gone.js');
  const provenancePreview = buildWardrobePreview(missingInput, { targetPath: fx.targetPath });
  assert.ok(provenancePreview.integrityErrors.some(error => /input file is missing/.test(error)));
});

test('Gate 11C rejects a manifest whose original input changed after staging', () => {
  const fx = writeFixtureWithManifest();
  writeFileSync(fx.inputPath, readFileSync(fx.inputPath, 'utf8') + '// changed\n', 'utf8');

  const preview = buildWardrobePreview(fx.manifest, { targetPath: fx.targetPath });
  assert.ok(preview.integrityErrors.some(error => /input SHA-256 no longer matches/.test(error)));
  assert.throws(
    () => applyWardrobeManifestToPath(fx.manifest, fx.targetPath, { acceptConflicts: true }),
    /integrity check failed/,
  );
});

test('Gate 11C no-op apply leaves target byte-identical including wardrobe_lastupd', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gate11c-noop-'));
  const targetPath = join(dir, 'wardrobe.js');
  const inputPath = join(dir, 'input.js');
  const row = makeRow('Alpha', '髮型', '001');
  const targetText = fixtureText([row]);
  const inputText = rowToWardrobeLine(row) + '\n';
  writeFileSync(targetPath, targetText, 'utf8');
  writeFileSync(inputPath, inputText, 'utf8');

  const entries = [
    { index: 0, key: identityKey(row), status: 'unchanged', row, baselineRow: row.slice() },
  ];
  const manifest = {
    formatVersion: STAGING_FORMAT_VERSION,
    kind: STAGING_KIND,
    createdAt: '2026-09-18T00:00:00.000Z',
    target: { id: 'wardrobe', path: 'data/wardrobe.js', role: 'canonical', sha256: sha256Text(targetText) },
    input: { path: inputPath, format: 'cn-search-snippet', sha256: sha256Text(inputText) },
    summary: summaryFor(entries),
    errors: [],
    entries,
  };

  const before = hashFile(targetPath);
  const result = applyWardrobeManifestToPath(manifest, targetPath, {
    updatedAt: new Date(2030, 0, 1),
  });
  assert.equal(result.applied, false);
  assert.equal(result.reason, 'no-changes');
  assert.equal(hashFile(targetPath), before);
  assert.equal(readFileSync(targetPath, 'utf8'), targetText);
});

test('Gate 11C CLI preview is read-only against a real Gate 11B manifest', () => {
  const contextRows = loadWardrobe(canonicalPath);
  const inputDir = mkdtempSync(join(tmpdir(), 'gate11c-cli-'));
  const inputPath = join(inputDir, 'unchanged.js');
  const manifestPath = join(inputDir, 'manifest.json');
  const inputText = rowToWardrobeLine(contextRows[0]) + '\n';
  writeFileSync(inputPath, inputText, 'utf8');

  const manifest = buildWardrobeStagingManifest({
    inputText,
    inputPath,
    targetId: 'wardrobe',
    createdAt: new Date('2026-09-18T00:00:00.000Z'),
  });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  const before = hashFile(canonicalPath);
  const result = spawnSync(process.execPath, [reviewCli, manifestPath], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  const after = hashFile(canonicalPath);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(after, before);
  assert.match(result.stdout, /target SHA: .* \[MATCH\]/);
  assert.match(result.stdout, /READY/);
  assert.equal(readWardrobeStagingManifest(manifestPath).summary.unchangedRows, 1);
});


test('Gate 11C honors documented duplicate baseline when applying to a Material temp copy', () => {
  const sourcePath = join(repoRoot, 'data', 'material_wardrobe.js');
  const dir = mkdtempSync(join(tmpdir(), 'gate11c-material-'));
  const targetPath = join(dir, 'material_wardrobe.js');
  const inputPath = join(dir, 'input.js');
  const sourceText = readFileSync(sourcePath, 'utf8');
  writeFileSync(targetPath, sourceText, 'utf8');

  const fresh = makeRow('Gate 11C Material Item', '髮型', 'GATE11C-MATERIAL', 'VTEST');
  const inputText = rowToWardrobeLine(fresh) + '\n';
  writeFileSync(inputPath, inputText, 'utf8');

  const entries = [
    { index: 0, key: identityKey(fresh), status: 'new', row: fresh },
  ];
  const manifest = {
    formatVersion: STAGING_FORMAT_VERSION,
    kind: STAGING_KIND,
    createdAt: '2026-09-18T00:00:00.000Z',
    target: {
      id: 'material-wardrobe',
      path: 'data/material_wardrobe.js',
      role: 'independent',
      sha256: sha256Text(sourceText),
    },
    input: {
      path: inputPath,
      format: 'cn-search-snippet',
      sha256: sha256Text(inputText),
    },
    summary: summaryFor(entries),
    errors: [],
    entries,
  };

  const result = applyWardrobeManifestToPath(manifest, targetPath, {
    updatedAt: new Date(2026, 8, 18, 12, 0, 0),
  });
  assert.equal(result.applied, true);
  assert.equal(result.addedRows, 1);

  const rows = loadWardrobe(targetPath);
  assert.equal(JSON.stringify(rows.at(-1)), JSON.stringify(fresh));
});


test('Gate 11C re-derives invalid and duplicate blockers even if manifest errors were cleared', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gate11c-redrive-'));
  const targetPath = join(dir, 'wardrobe.js');
  const inputPath = join(dir, 'input.js');
  const row = makeRow('Alpha', '髮型', '001');
  const invalid = makeRow('Broken', '鞋子', '999').slice(0, 17);
  const targetText = fixtureText([row]);
  writeFileSync(targetPath, targetText, 'utf8');

  const inputText = [
    rowToWardrobeLine(row),
    rowToWardrobeLine(row),
    JSON.stringify(invalid) + ',',
  ].join('\n') + '\n';
  writeFileSync(inputPath, inputText, 'utf8');

  const entries = [
    { index: 0, key: identityKey(row), status: 'unchanged', row, baselineRow: row.slice() },
    { index: 1, key: identityKey(row), status: 'duplicate', row: row.slice() },
    { index: 2, key: null, status: 'invalid', row: invalid },
  ];
  const manifest = {
    formatVersion: STAGING_FORMAT_VERSION,
    kind: STAGING_KIND,
    createdAt: '2026-09-18T00:00:00.000Z',
    target: {
      id: 'wardrobe',
      path: 'data/wardrobe.js',
      role: 'canonical',
      sha256: sha256Text(targetText),
    },
    input: {
      path: inputPath,
      format: 'cn-search-snippet',
      sha256: sha256Text(inputText),
    },
    summary: summaryFor(entries),
    errors: [],
    entries,
  };

  const preview = buildWardrobePreview(manifest, { targetPath });
  assert.equal(preview.summary.duplicateRows, 1);
  assert.equal(preview.summary.invalidRows, 1);
  assert.throws(
    () => applyWardrobeManifestToPath(manifest, targetPath),
    /blocking staging errors/,
  );
});
