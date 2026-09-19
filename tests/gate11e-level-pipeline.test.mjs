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
import { join } from 'node:path';
import {
  LEVEL_STAGING_FORMAT_VERSION,
  applyLevelEntriesToSource,
  applyLevelManifestToPath,
  buildLevelPreview,
  buildLevelStagingManifest,
  parseLevelImportText,
  previewLevelLines,
  serializeLevelValue,
  validateLevelSource,
} from '../scripts/level-pipeline.mjs';

function hashFile(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function fixtureSource() {
  return [
    '// preserve-me',
    'var themeFilter = [',
    '  ["測試章", "關卡: TEST-"],',
    '];',
    'var competitionsRaw = {',
    '  "競技場測試": [1, 1, 1, 1, 1],',
    '};',
    'var extraRaw = {};',
    'var tasksRaw = {};',
    'var levelsRaw = {',
    '  "TEST-1": [1, 2, 3, 4, 5],',
    '};',
    'var dreamWeavingRaw = {};',
    'function weightedFilter(tagWhitelist, nameWhitelist, weight) {',
    '  return { tagWhitelist, nameWhitelist, weight, filter: function() {} };',
    '}',
    'function normalFilter(tagWhitelist, nameWhitelist) {',
    '  return weightedFilter(tagWhitelist, nameWhitelist == null ? null : nameWhitelist, 10);',
    '}',
    'var levelFilters = {',
    '  "TEST-1": normalFilter("POP", "運動少年"),',
    '  "legacy-orphan": normalFilter("POP"),',
    '};',
    'function bonusInfo(base, weight, tag, replace) { return { base, weight, tag, replace }; }',
    'function addBonusInfo(base, weight, tag) { return bonusInfo(base, weight, tag, false); }',
    'function replaceBonusInfo(base, weight, tag) { return bonusInfo(base, weight, tag, true); }',
    'var levelBonus = {',
    '  "TEST-1": [addBonusInfo("B", 0.25, "POP")],',
    '};',
    'var addSkillsInfo = {',
    '  "TEST-1": [null, ["微笑"]],',
    '};',
    'var addHintInfo = {',
    '  "TEST-1": [["提示"], ["運動少年"], [""]],',
    '};',
    '',
  ].join('\n');
}

function writeFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'gate11e-'));
  const targetPath = join(dir, 'levels.js');
  const inputPath = join(dir, 'levels-input.json');
  writeFileSync(targetPath, fixtureSource(), 'utf8');
  return { dir, targetPath, inputPath };
}

function makeInput(entries, target = 'main-levels') {
  return JSON.stringify({
    formatVersion: LEVEL_STAGING_FORMAT_VERSION,
    target,
    entries,
  }, null, 2) + '\n';
}

test('Gate 11E validates the current Main and BigUse level sources structurally', () => {
  assert.deepEqual(validateLevelSource('data/levels.js'), []);
  assert.deepEqual(validateLevelSource('data/biguse_levels.js'), []);
});

test('Gate 11E accepts only JSON patch input', () => {
  const parsed = parseLevelImportText(makeInput([]));
  assert.equal(parsed.formatVersion, 1);
  assert.equal(parsed.target, 'main-levels');
  assert.throws(() => parseLevelImportText('var levelsRaw = {};'), /valid JSON/);
});

test('Gate 11E stages unchanged, conflict and new entries across every supported level surface', () => {
  const fx = writeFixture();
  const entries = [
    { table: 'levelsRaw', key: 'TEST-1', value: [1, 2, 3, 4, 5] },
    { table: 'levelBonus', key: 'TEST-1', value: [{ base: 'B', weight: 0.5, tag: 'POP', replace: false }] },
    { table: 'levelsRaw', key: 'TEST-2', value: [1.2, -1.3, 2, 1, 0.7] },
    { table: 'themeFilter', key: '測試二章', value: '關卡: TEST2-' },
    { table: 'levelFilters', key: 'TEST-2', value: { tagWhitelist: 'POP', nameWhitelist: '運動少年', weight: 160 } },
    { table: 'levelBonus', key: 'TEST-2', value: [{ base: 'A', weight: 0.25, tag: 'POP', replace: true }] },
    { table: 'addSkillsInfo', key: 'TEST-2', value: [null, ['微笑', '挑剔']] },
    { table: 'addHintInfo', key: 'TEST-2', value: [['測試提示'], ['運動少年'], ['']] },
  ];
  const inputText = makeInput(entries);
  writeFileSync(fx.inputPath, inputText, 'utf8');

  const manifest = buildLevelStagingManifest({
    inputText,
    inputPath: fx.inputPath,
    targetPathOverride: fx.targetPath,
    createdAt: new Date('2026-09-19T00:00:00.000Z'),
  });

  assert.deepEqual(manifest.summary, {
    totalEntries: 8,
    acceptedEntries: 8,
    newEntries: 6,
    unchangedEntries: 1,
    conflictEntries: 1,
    invalidEntries: 0,
    duplicateEntries: 0,
  });
  assert.equal(manifest.errors.length, 0);
  assert.deepEqual(
    manifest.entries.map(entry => entry.status),
    ['unchanged', 'conflict', 'new', 'new', 'new', 'new', 'new', 'new'],
  );

  const preview = buildLevelPreview(manifest, { targetPath: fx.targetPath });
  assert.equal(preview.stale, false);
  assert.deepEqual(preview.integrityErrors, []);
  assert.match(previewLevelLines(preview).join('\n'), /\[CONFLICT\] levelBonus\|TEST-1/);
  assert.match(previewLevelLines(preview).join('\n'), /\[NEW\] levelsRaw\|TEST-2/);
});

test('Gate 11E blocks invalid weights, duplicate entries, primary collisions, orphan metadata and unknown references', () => {
  const fx = writeFixture();
  const entries = [
    { table: 'levelsRaw', key: 'BAD-WEIGHT', value: [1, 2, 3] },
    { table: 'levelsRaw', key: 'DUP', value: [1, 1, 1, 1, 1] },
    { table: 'levelsRaw', key: 'DUP', value: [2, 2, 2, 2, 2] },
    { table: 'tasksRaw', key: 'TEST-1', value: [1, 1, 1, 1, 1] },
    { table: 'levelBonus', key: 'NO-PRIMARY', value: [{ base: 'B', weight: 0.2, tag: 'POP', replace: false }] },
    { table: 'levelsRaw', key: 'REF-TEST', value: [1, 1, 1, 1, 1] },
    { table: 'levelBonus', key: 'REF-TEST', value: [{ base: 'B', weight: 0.2, tag: 'NOT_A_REAL_TAG', replace: false }] },
    { table: 'levelFilters', key: 'REF-TEST', value: { tagWhitelist: 'POP', nameWhitelist: 'DefinitelyMissingWardrobeName', weight: 10 } },
  ];
  const inputText = makeInput(entries);
  writeFileSync(fx.inputPath, inputText, 'utf8');

  const manifest = buildLevelStagingManifest({
    inputText,
    inputPath: fx.inputPath,
    targetPathOverride: fx.targetPath,
  });

  assert.ok(manifest.summary.invalidEntries >= 5);
  assert.equal(manifest.summary.duplicateEntries, 1);
  const messages = manifest.errors.map(error => error.message).join('\n');
  assert.match(messages, /exactly 5 values/);
  assert.match(messages, /duplicate staged table\/key/);
  assert.match(messages, /primary key collides with another table/);
  assert.match(messages, /does not reference a primary level/);
  assert.match(messages, /unknown wardrobe tag introduced/);
  assert.match(messages, /matches no wardrobe item/);
});

test('Gate 11E allows updating an existing legacy orphan metadata key without creating a new orphan', () => {
  const fx = writeFixture();
  const entries = [
    { table: 'levelFilters', key: 'legacy-orphan', value: { tagWhitelist: 'POP', nameWhitelist: null, weight: 160 } },
  ];
  const inputText = makeInput(entries);
  writeFileSync(fx.inputPath, inputText, 'utf8');

  const manifest = buildLevelStagingManifest({
    inputText,
    inputPath: fx.inputPath,
    targetPathOverride: fx.targetPath,
  });
  assert.equal(manifest.errors.length, 0);
  assert.equal(manifest.summary.conflictEntries, 1);
});

test('Gate 11E serializes filters and bonuses without executable input code', () => {
  assert.equal(
    serializeLevelValue('levelFilters', { tagWhitelist: 'POP', nameWhitelist: null, weight: 10 }),
    'normalFilter("POP")',
  );
  assert.equal(
    serializeLevelValue('levelFilters', { tagWhitelist: 'POP', nameWhitelist: '運動少年', weight: 160 }),
    'weightedFilter("POP", "運動少年", 160)',
  );
  assert.equal(
    serializeLevelValue('levelBonus', [{ base: 'A', weight: 0.25, tag: 'POP', replace: true }]),
    '[replaceBonusInfo("A", 0.25, "POP")]',
  );
});

test('Gate 11E blocks conflict apply without acceptance and atomically applies reviewed changes to a temp source', () => {
  const fx = writeFixture();
  const entries = [
    { table: 'levelBonus', key: 'TEST-1', value: [{ base: 'B', weight: 0.5, tag: 'POP', replace: false }] },
    { table: 'levelsRaw', key: 'TEST-2', value: [1.2, -1.3, 2, 1, 0.7] },
    { table: 'themeFilter', key: '測試章', value: '關卡: TEST-UPDATED-' },
    { table: 'levelFilters', key: 'TEST-2', value: { tagWhitelist: 'POP', nameWhitelist: null, weight: 160 } },
    { table: 'addSkillsInfo', key: 'TEST-2', value: [null, ['微笑']] },
    { table: 'addHintInfo', key: 'TEST-2', value: [['提示'], ['運動少年'], ['']] },
  ];
  const inputText = makeInput(entries);
  writeFileSync(fx.inputPath, inputText, 'utf8');

  const manifest = buildLevelStagingManifest({
    inputText,
    inputPath: fx.inputPath,
    targetPathOverride: fx.targetPath,
  });
  const before = hashFile(fx.targetPath);

  assert.throws(
    () => applyLevelManifestToPath(manifest, fx.targetPath),
    /explicit conflict acceptance/,
  );
  assert.equal(hashFile(fx.targetPath), before);

  const result = applyLevelManifestToPath(manifest, fx.targetPath, { acceptConflicts: true });
  assert.equal(result.applied, true);
  assert.equal(result.updatedEntries, 2);
  assert.equal(result.newEntries, 4);
  assert.notEqual(result.beforeSha256, result.afterSha256);
  assert.deepEqual(validateLevelSource(fx.targetPath), []);

  const output = readFileSync(fx.targetPath, 'utf8');
  assert.match(output, /\/\/ preserve-me/);
  assert.match(output, /"TEST-2": \[1\.2,-1\.3,2,1,0\.7\],/);
  assert.match(output, /weightedFilter\("POP", null, 160\)/);
  assert.match(output, /\["測試章", "關卡: TEST-UPDATED-"\],/);
  assert.equal(readdirSync(fx.dir).some(name => name.includes('.gate11e-')), false);
});

test('Gate 11E rejects stale manifests and leaves a changed target untouched', () => {
  const fx = writeFixture();
  const inputText = makeInput([
    { table: 'levelsRaw', key: 'TEST-2', value: [1, 1, 1, 1, 1] },
  ]);
  writeFileSync(fx.inputPath, inputText, 'utf8');
  const manifest = buildLevelStagingManifest({
    inputText,
    inputPath: fx.inputPath,
    targetPathOverride: fx.targetPath,
  });

  writeFileSync(fx.targetPath, readFileSync(fx.targetPath, 'utf8') + '// external change\n', 'utf8');
  const changed = hashFile(fx.targetPath);
  const preview = buildLevelPreview(manifest, { targetPath: fx.targetPath });
  assert.equal(preview.stale, true);
  assert.throws(() => applyLevelManifestToPath(manifest, fx.targetPath), /stale manifest/);
  assert.equal(hashFile(fx.targetPath), changed);
});

test('Gate 11E no-op apply leaves the level source byte-identical', () => {
  const fx = writeFixture();
  const inputText = makeInput([
    { table: 'levelsRaw', key: 'TEST-1', value: [1, 2, 3, 4, 5] },
  ]);
  writeFileSync(fx.inputPath, inputText, 'utf8');
  const manifest = buildLevelStagingManifest({
    inputText,
    inputPath: fx.inputPath,
    targetPathOverride: fx.targetPath,
  });

  const before = hashFile(fx.targetPath);
  const result = applyLevelManifestToPath(manifest, fx.targetPath);
  assert.equal(result.applied, false);
  assert.equal(result.reason, 'no-changes');
  assert.equal(hashFile(fx.targetPath), before);
});


test('Gate 11E source validator blocks new duplicate properties and changed known duplicate debt', () => {
  const fx = writeFixture();
  const duplicateSource = fixtureSource().replace(
    '  "TEST-1": [1, 2, 3, 4, 5],\n};',
    '  "TEST-1": [1, 2, 3, 4, 5],\n  "TEST-1": [5, 4, 3, 2, 1],\n};',
  );
  writeFileSync(fx.targetPath, duplicateSource, 'utf8');
  assert.ok(validateLevelSource(fx.targetPath).some(error => /levelsRaw duplicate property key: TEST-1/.test(error)));

  const real = readFileSync('data/levels.js', 'utf8');
  const knownLine = "\t'II-12-支3' :[['微笑','挑剔','沉睡','灰姑娘'],['微笑','挑剔','沉睡','灰姑娘']],";
  const changed = real.replace(
    knownLine,
    "\t'II-12-支3' :[['微笑'],['微笑']],",
  );
  const changedPath = join(fx.dir, 'levels-known-debt-changed.js');
  writeFileSync(changedPath, changed, 'utf8');
  assert.ok(
    validateLevelSource(changedPath, {
      baselineSource: 'data/levels.js',
      strictBaseline: false,
    }).some(error => /addSkillsInfo duplicate baseline changed: II-12-支3/.test(error)),
  );
});

test('Gate 11E supports BigUse as an independent level target', () => {
  const inputText = makeInput([
    { table: 'competitionsRaw', key: '海邊派對的搭配', value: [0.67, 1.33, 1, -1.33, 1.33] },
  ], 'biguse-levels');

  const dir = mkdtempSync(join(tmpdir(), 'gate11e-biguse-input-'));
  const inputPath = join(dir, 'input.json');
  writeFileSync(inputPath, inputText, 'utf8');

  const manifest = buildLevelStagingManifest({
    inputText,
    inputPath,
    targetId: 'biguse-levels',
  });
  assert.equal(manifest.target.id, 'biguse-levels');
  assert.equal(manifest.target.path, 'data/biguse_levels.js');
  assert.equal(manifest.errors.length, 0);
  assert.equal(manifest.summary.unchangedEntries, 1);
});

test('Gate 11E preview rejects manifest tampering and changed original input', () => {
  const fx = writeFixture();
  const inputText = makeInput([
    { table: 'levelsRaw', key: 'TEST-2', value: [1, 1, 1, 1, 1] },
  ]);
  writeFileSync(fx.inputPath, inputText, 'utf8');
  const manifest = buildLevelStagingManifest({
    inputText,
    inputPath: fx.inputPath,
    targetPathOverride: fx.targetPath,
  });

  const tampered = JSON.parse(JSON.stringify(manifest));
  tampered.summary.newEntries = 0;
  tampered.summary.unchangedEntries = 1;
  const tamperedPreview = buildLevelPreview(tampered, { targetPath: fx.targetPath });
  assert.ok(tamperedPreview.integrityErrors.some(error => /summary does not match/.test(error)));
  assert.throws(
    () => applyLevelManifestToPath(tampered, fx.targetPath),
    /manifest integrity check failed/,
  );

  writeFileSync(fx.inputPath, inputText + '\n', 'utf8');
  const changedInputPreview = buildLevelPreview(manifest, { targetPath: fx.targetPath });
  assert.ok(changedInputPreview.integrityErrors.some(error => /input SHA-256 no longer matches/.test(error)));
  assert.throws(
    () => applyLevelManifestToPath(manifest, fx.targetPath),
    /manifest integrity check failed/,
  );
});


test('Gate 11E appends a new active property before a trailing block-comment data section', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gate11e-comment-tail-'));
  const path = join(dir, 'levels.js');
  const source = readFileSync('data/levels.js', 'utf8');
  const output = applyLevelEntriesToSource(source, [
    {
      table: 'levelsRaw',
      key: 'UAT-COMMENT-TAIL',
      value: [1, 1, 1, 1, 1],
      status: 'new',
    },
  ]);
  writeFileSync(path, output, 'utf8');

  assert.deepEqual(
    validateLevelSource(path, {
      baselineSource: 'data/levels.js',
      strictBaseline: false,
    }),
    [],
  );

  const inserted = output.indexOf('"UAT-COMMENT-TAIL": [1,1,1,1,1],');
  const commented = output.indexOf("/*'III-4-1'");
  assert.ok(inserted > 0);
  assert.ok(commented > inserted);
  assert.doesNotMatch(output.slice(inserted - 4, inserted + 4), /^,s*"/);
});
