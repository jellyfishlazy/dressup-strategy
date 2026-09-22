import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  externalLevelsCandidates,
  resolveExternalDataSource,
} from '../scripts/external-data-source.mjs';
import { dataSourceById } from '../scripts/data-source-contract.mjs';
import {
  EXTERNAL_WARDROBE_CORE_COLUMNS,
  readExternalLevels,
  readExternalSourceSnapshot,
  readExternalWardrobe,
} from '../scripts/external-source-reader.mjs';

function sha(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'gate12b-'));
  const wardrobePath = join(dir, 'wardrobe.js');
  const levelsPath = join(dir, 'levels.js');

  const rowA = [
    'Source Hair', 'Hair', '001', '3',
    '', 'S', '', 'A', '', 'B', '', 'A', 'C', '',
    'POP', 'Store', '', 'V1',
    'extra-a', 'extra-b',
  ];
  const rowB = [
    'Source Dress', 'Dress', '002', '4',
    'S', '', 'A', '', 'B', '', 'A', '', 'C', '',
    'Formal', 'Event', 'Suit', 'V1',
    'extra-c', '',
  ];

  writeFileSync(
    wardrobePath,
    [
      'var wardrobe = ' + JSON.stringify([rowA, rowB]) + ';',
      "var wardrobe_lastupd = '2026/9/20';",
      '',
    ].join('\n'),
    'utf8',
  );

  writeFileSync(
    levelsPath,
    [
      'var themeFilter = [["Chapter 1", "Stage: 1-"]];',
      'var competitionsRaw = {};',
      'var extraRaw = {};',
      'var tasksRaw = {};',
      'var levelsRaw = {"1-1": [1, -2, 3, 1, 0.5]};',
      'var dreamWeavingRaw = {};',
      'function weightedFilter(tagWhitelist, nameWhitelist, weight) { return {tagWhitelist,nameWhitelist,weight,filter:function(){}}; }',
      'function normalFilter(tagWhitelist, nameWhitelist) { return weightedFilter(tagWhitelist, nameWhitelist == null ? null : nameWhitelist, 10); }',
      'var levelFilters = {"1-1": normalFilter("POP")};',
      'function bonusInfo(base, weight, tag, replace) { return {base,weight,tag,replace}; }',
      'function addBonusInfo(base, weight, tag) { return bonusInfo(base, weight, tag, false); }',
      'function replaceBonusInfo(base, weight, tag) { return bonusInfo(base, weight, tag, true); }',
      'var levelBonus = {"1-1": [addBonusInfo("B", 0.25, "POP")]};',
      'var addSkillsInfo = {"1-1": [null, ["Smile", "Critic"]]};',
      'var addHintInfo = {"1-1": [["Hint"], ["Allowed"], ["Forbidden"]]};',
      '',
    ].join('\n'),
    'utf8',
  );

  return { dir, wardrobePath, levelsPath, rowA, rowB };
}

test('Gate 12B declares both external source contracts', () => {
  assert.equal(dataSourceById('external-cn-wardrobe')?.format, 'external-wardrobe-20');
  assert.equal(dataSourceById('external-cn-levels')?.format, 'legacy-levels-js');
  assert.equal(dataSourceById('external-cn-levels')?.role, 'external-input');
});

test('Gate 12B resolves wardrobe and levels as one external source root', () => {
  const fx = fixture();
  const resolved = resolveExternalDataSource({
    wardrobePath: fx.wardrobePath,
    levelsPath: fx.levelsPath,
  });

  assert.equal(resolved.sameRoot, true);
  assert.equal(resolved.sourceRoot, fx.dir);
  assert.equal(resolved.wardrobePath, fx.wardrobePath);
  assert.equal(resolved.levelsPath, fx.levelsPath);

  const candidates = externalLevelsCandidates({ wardrobePath: fx.wardrobePath });
  assert.equal(candidates[0], fx.levelsPath);
});

test('Gate 12B preserves 20-column wardrobe rows and separates the 18-column core', () => {
  const fx = fixture();
  const wardrobe = readExternalWardrobe(fx.wardrobePath);

  assert.equal(EXTERNAL_WARDROBE_CORE_COLUMNS, 18);
  assert.equal(wardrobe.count, 2);
  assert.deepEqual(wardrobe.columnLengths, { 20: 2 });
  assert.equal(wardrobe.lastUpdated, '2026/9/20');
  assert.deepEqual(wardrobe.warnings, []);

  const item = wardrobe.items[0];
  assert.equal(item.key, 'Hair|001');
  assert.deepEqual(item.row, fx.rowA);
  assert.deepEqual(item.coreRow, fx.rowA.slice(0, 18));
  assert.deepEqual(item.extraColumns, ['extra-a', 'extra-b']);
});

test('Gate 12B assembles one level bundle from all related source tables', () => {
  const fx = fixture();
  const levels = readExternalLevels(fx.levelsPath);

  assert.equal(levels.counts.bundles, 1);
  assert.equal(levels.counts.orphanMetadata, 0);
  assert.deepEqual(levels.warnings, []);

  const bundle = levels.bundles[0];
  assert.equal(bundle.key, '1-1');
  assert.equal(bundle.primaryTable, 'levelsRaw');
  assert.equal(bundle.runtimeLabel, '关卡: 1-1');
  assert.deepEqual(bundle.weights, [1, -2, 3, 1, 0.5]);
  assert.deepEqual(bundle.filter, {
    tagWhitelist: 'POP',
    nameWhitelist: null,
    weight: 10,
  });
  assert.deepEqual(bundle.bonus, [{
    base: 'B',
    weight: 0.25,
    tag: 'POP',
    replace: false,
  }]);
  assert.deepEqual(bundle.skills, [null, ['Smile', 'Critic']]);
  assert.deepEqual(bundle.hint, [['Hint'], ['Allowed'], ['Forbidden']]);
  assert.deepEqual(bundle.metadataPresence, {
    levelFilters: true,
    levelBonus: true,
    addSkillsInfo: true,
    addHintInfo: true,
  });
});

test('Gate 12B reports duplicate source properties instead of silently hiding them', () => {
  const fx = fixture();
  let source = readFileSync(fx.levelsPath, 'utf8');
  source = source.replace(
    'var addSkillsInfo = {"1-1": [null, ["Smile", "Critic"]]};',
    'var addSkillsInfo = {"1-1": [null, ["Old"]], "1-1": [null, ["New"]]};',
  );
  writeFileSync(fx.levelsPath, source, 'utf8');

  const levels = readExternalLevels(fx.levelsPath);
  assert.ok(levels.warnings.some(
    warning =>
      warning.kind === 'level-duplicate-key' &&
      warning.table === 'addSkillsInfo' &&
      warning.key === '1-1',
  ));
  assert.deepEqual(levels.bundles[0].skills, [null, ['New']]);
});

test('Gate 12B reports metadata that has no primary source row', () => {
  const fx = fixture();
  let source = readFileSync(fx.levelsPath, 'utf8');
  source = source.replace(
    'var addHintInfo = {"1-1": [["Hint"], ["Allowed"], ["Forbidden"]]};',
    'var addHintInfo = {"1-1": [["Hint"], ["Allowed"], ["Forbidden"]], "ghost": [[""], [""], [""]]};',
  );
  writeFileSync(fx.levelsPath, source, 'utf8');

  const levels = readExternalLevels(fx.levelsPath);
  assert.equal(levels.counts.orphanMetadata, 1);
  assert.deepEqual(levels.orphanMetadata, [{ table: 'addHintInfo', key: 'ghost' }]);
});

test('Gate 12B snapshot is read-only and records exact source hashes', () => {
  const fx = fixture();
  const wardrobeBefore = sha(fx.wardrobePath);
  const levelsBefore = sha(fx.levelsPath);

  const snapshot = readExternalSourceSnapshot({
    wardrobePath: fx.wardrobePath,
    levelsPath: fx.levelsPath,
  });

  assert.equal(snapshot.hashes.wardrobe, wardrobeBefore);
  assert.equal(snapshot.hashes.levels, levelsBefore);
  assert.equal(sha(fx.wardrobePath), wardrobeBefore);
  assert.equal(sha(fx.levelsPath), levelsBefore);
});
