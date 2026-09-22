import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rowToWardrobeLine } from '../cn-search/src/staging.mjs';
import { loadWardrobe } from '../scripts/validate-data.mjs';
import {
  runDataUpdate,
} from '../scripts/data-update.mjs';

function hashFile(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function wardrobeRow(name, type, id) {
  return [
    name, type, id, '3',
    '', 'S', '', 'A', '', 'B', '', 'A', 'C', '',
    'POP', '店·金幣', '', 'V1',
  ];
}

function wardrobeSource(rows) {
  return [
    'var wardrobe = [',
    ...rows.map(rowToWardrobeLine),
    '',
    '];',
    "var lastVersion = 'V1';",
    "var wardrobe_lastupd = '2026/1/1';",
    "var category = ['髮型','鞋子'];",
    "var wardrobeTags = ['POP'];",
    'var skipCategory=[];',
    'var repelCates=[];',
    '',
  ].join('\n');
}

function levelSource() {
  return [
    '// keep-level-comment',
    'var themeFilter = [["測試章", "關卡: TEST-"]];',
    'var competitionsRaw = {"競技場測試": [1,1,1,1,1]};',
    'var extraRaw = {};',
    'var tasksRaw = {};',
    'var levelsRaw = {"TEST-1": [1,2,3,4,5]};',
    'var dreamWeavingRaw = {};',
    'function weightedFilter(tagWhitelist, nameWhitelist, weight) { return {tagWhitelist, nameWhitelist, weight, filter:function(){}}; }',
    'function normalFilter(tagWhitelist, nameWhitelist) { return weightedFilter(tagWhitelist, nameWhitelist == null ? null : nameWhitelist, 10); }',
    'var levelFilters = {"TEST-1": normalFilter("POP")};',
    'function bonusInfo(base, weight, tag, replace) { return {base,weight,tag,replace}; }',
    'function addBonusInfo(base, weight, tag) { return bonusInfo(base, weight, tag, false); }',
    'function replaceBonusInfo(base, weight, tag) { return bonusInfo(base, weight, tag, true); }',
    'var levelBonus = {"TEST-1": [addBonusInfo("B", 0.25, "POP")]};',
    'var addSkillsInfo = {"TEST-1": [null, ["微笑"]]};',
    'var addHintInfo = {"TEST-1": [["提示"],[""],[""]]};',
    '',
  ].join('\n');
}

function makeFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'gate11f-'));
  const wardrobePath = join(dir, 'wardrobe.js');
  const levelPath = join(dir, 'levels.js');
  const generatedPath = join(dir, 'cn_search_index.json');
  const wardrobeInput = join(dir, 'wardrobe-input.js');
  const levelInput = join(dir, 'levels-input.json');
  const runDir = join(dir, 'run');

  const baseWardrobe = wardrobeRow('Alpha', '髮型', '001');
  writeFileSync(wardrobePath, wardrobeSource([baseWardrobe]), 'utf8');
  writeFileSync(levelPath, levelSource(), 'utf8');
  writeFileSync(generatedPath, '{"old":true}\n', 'utf8');

  return {
    dir,
    wardrobePath,
    levelPath,
    generatedPath,
    wardrobeInput,
    levelInput,
    runDir,
    baseWardrobe,
  };
}

function writeLevelInput(path, entries, target = 'main-levels') {
  writeFileSync(
    path,
    JSON.stringify({ formatVersion: 1, target, entries }, null, 2) + '\n',
    'utf8',
  );
}

function noopHooks() {
  return {
    derivedRebuilder: async () => [],
    derivedChecker: () => [{ source: 'cn-search-index', fresh: true, staleReasons: [] }],
    regressionRunner: async () => ({ status: 'pass' }),
  };
}

test('Gate 11F preview stages both domains without writing either target', async () => {
  const fx = makeFixture();
  writeFileSync(fx.wardrobeInput, rowToWardrobeLine(fx.baseWardrobe) + '\n', 'utf8');
  writeLevelInput(fx.levelInput, [
    { table: 'levelsRaw', key: 'TEST-1', value: [1, 2, 3, 4, 5] },
  ]);

  const wardrobeBefore = hashFile(fx.wardrobePath);
  const levelBefore = hashFile(fx.levelPath);

  const result = await runDataUpdate({
    wardrobeInput: fx.wardrobeInput,
    levelInput: fx.levelInput,
    levelTarget: 'main-levels',
    apply: false,
    runDir: fx.runDir,
    targetOverrides: {
      wardrobe: fx.wardrobePath,
      'main-levels': fx.levelPath,
    },
    generatedTargetOverrides: {
      'cn-search-index': fx.generatedPath,
    },
    now: new Date('2026-09-19T00:00:00.000Z'),
  }, noopHooks());

  assert.equal(result.ok, true);
  assert.equal(result.report.status, 'ready');
  assert.equal(hashFile(fx.wardrobePath), wardrobeBefore);
  assert.equal(hashFile(fx.levelPath), levelBefore);
  assert.ok(existsSync(join(fx.runDir, 'wardrobe-manifest.json')));
  assert.ok(existsSync(join(fx.runDir, 'level-manifest.json')));
  assert.ok(existsSync(join(fx.runDir, 'run-report.json')));
});

test('Gate 11F preflights every input before any formal write', async () => {
  const fx = makeFixture();
  const conflict = fx.baseWardrobe.slice();
  conflict[0] = 'Alpha Changed';
  writeFileSync(fx.wardrobeInput, rowToWardrobeLine(conflict) + '\n', 'utf8');
  writeLevelInput(fx.levelInput, [
    { table: 'levelsRaw', key: 'TEST-2', value: [1, 1, 1, 1, 1] },
  ]);

  const wardrobeBefore = readFileSync(fx.wardrobePath, 'utf8');
  const levelBefore = readFileSync(fx.levelPath, 'utf8');

  await assert.rejects(
    runDataUpdate({
      wardrobeInput: fx.wardrobeInput,
      levelInput: fx.levelInput,
      levelTarget: 'main-levels',
      apply: true,
      runDir: fx.runDir,
      targetOverrides: {
        wardrobe: fx.wardrobePath,
        'main-levels': fx.levelPath,
      },
      generatedTargetOverrides: {
        'cn-search-index': fx.generatedPath,
      },
    }, noopHooks()),
    /preflight blocked/,
  );

  assert.equal(readFileSync(fx.wardrobePath, 'utf8'), wardrobeBefore);
  assert.equal(readFileSync(fx.levelPath, 'utf8'), levelBefore);
  const report = JSON.parse(readFileSync(join(fx.runDir, 'run-report.json'), 'utf8'));
  assert.equal(report.status, 'blocked');
});

test('Gate 11F applies wardrobe and level updates in one run and forwards actual changed source ids', async () => {
  const fx = makeFixture();
  const freshWardrobe = wardrobeRow('Beta', '鞋子', '002');
  writeFileSync(fx.wardrobeInput, rowToWardrobeLine(freshWardrobe) + '\n', 'utf8');
  writeLevelInput(fx.levelInput, [
    { table: 'levelsRaw', key: 'TEST-2', value: [1.2, -1.3, 2, 1, 0.7] },
  ]);

  let derivedIds = null;
  let regressionCalls = 0;
  const hooks = {
    derivedRebuilder: async ids => {
      derivedIds = [...ids];
      return [{ source: 'cn-search-index', rebuilt: true, reason: 'stale' }];
    },
    derivedChecker: () => [{ source: 'cn-search-index', fresh: true, staleReasons: [] }],
    regressionRunner: async () => {
      regressionCalls++;
      return { status: 'pass' };
    },
  };

  const result = await runDataUpdate({
    wardrobeInput: fx.wardrobeInput,
    levelInput: fx.levelInput,
    levelTarget: 'main-levels',
    apply: true,
    runDir: fx.runDir,
    targetOverrides: {
      wardrobe: fx.wardrobePath,
      'main-levels': fx.levelPath,
    },
    generatedTargetOverrides: {
      'cn-search-index': fx.generatedPath,
    },
    now: new Date('2026-09-19T00:00:00.000Z'),
  }, hooks);

  assert.equal(result.report.status, 'applied');
  assert.deepEqual(derivedIds.sort(), ['main-levels', 'wardrobe']);
  assert.equal(regressionCalls, 1);

  const wardrobe = loadWardrobe(fx.wardrobePath);
  assert.equal(wardrobe.length, 2);
  assert.equal(wardrobe[1][0], 'Beta');

  const levelText = readFileSync(fx.levelPath, 'utf8');
  assert.match(levelText, /"TEST-2": \[1\.2,-1\.3,2,1,0\.7\],/);
  assert.equal(result.report.applies.wardrobe.applied, true);
  assert.equal(result.report.applies.levels.applied, true);
});

test('Gate 11F rolls back a successful level apply when final regression fails', async () => {
  const fx = makeFixture();
  writeLevelInput(fx.levelInput, [
    { table: 'levelsRaw', key: 'TEST-2', value: [1, 1, 1, 1, 1] },
  ]);
  const before = readFileSync(fx.levelPath, 'utf8');

  const hooks = {
    derivedRebuilder: async () => [],
    derivedChecker: () => [{ source: 'cn-search-index', fresh: true, staleReasons: [] }],
    regressionRunner: async () => {
      throw new Error('simulated regression failure');
    },
  };

  await assert.rejects(
    runDataUpdate({
      levelInput: fx.levelInput,
      levelTarget: 'main-levels',
      apply: true,
      runDir: fx.runDir,
      targetOverrides: {
        'main-levels': fx.levelPath,
      },
      generatedTargetOverrides: {
        'cn-search-index': fx.generatedPath,
      },
    }, hooks),
    /simulated regression failure/,
  );

  assert.equal(readFileSync(fx.levelPath, 'utf8'), before);
  const report = JSON.parse(readFileSync(join(fx.runDir, 'run-report.json'), 'utf8'));
  assert.equal(report.status, 'rolled-back');
  assert.equal(report.rollback.success, true);
});

test('Gate 11F rolls back both canonical input and generated artifact when derived rebuild fails', async () => {
  const fx = makeFixture();
  const freshWardrobe = wardrobeRow('Beta', '鞋子', '002');
  writeFileSync(fx.wardrobeInput, rowToWardrobeLine(freshWardrobe) + '\n', 'utf8');

  const wardrobeBefore = readFileSync(fx.wardrobePath, 'utf8');
  const generatedBefore = readFileSync(fx.generatedPath, 'utf8');

  const hooks = {
    derivedRebuilder: async (_ids, context) => {
      writeFileSync(context.generatedTargetOverrides['cn-search-index'], '{"new":true}\n', 'utf8');
      throw new Error('simulated derived failure');
    },
    derivedChecker: () => {
      throw new Error('should not reach derived checker');
    },
    regressionRunner: async () => {
      throw new Error('should not reach regression');
    },
  };

  await assert.rejects(
    runDataUpdate({
      wardrobeInput: fx.wardrobeInput,
      apply: true,
      runDir: fx.runDir,
      targetOverrides: {
        wardrobe: fx.wardrobePath,
      },
      generatedTargetOverrides: {
        'cn-search-index': fx.generatedPath,
      },
    }, hooks),
    /simulated derived failure/,
  );

  assert.equal(readFileSync(fx.wardrobePath, 'utf8'), wardrobeBefore);
  assert.equal(readFileSync(fx.generatedPath, 'utf8'), generatedBefore);
  const report = JSON.parse(readFileSync(join(fx.runDir, 'run-report.json'), 'utf8'));
  assert.equal(report.status, 'rolled-back');
  assert.equal(report.rollback.success, true);
});

test('Gate 11F no-op apply still performs freshness and regression gates without rewriting data', async () => {
  const fx = makeFixture();
  writeFileSync(fx.wardrobeInput, rowToWardrobeLine(fx.baseWardrobe) + '\n', 'utf8');
  const before = hashFile(fx.wardrobePath);
  let checked = 0;
  let regressions = 0;

  const result = await runDataUpdate({
    wardrobeInput: fx.wardrobeInput,
    apply: true,
    runDir: fx.runDir,
    targetOverrides: {
      wardrobe: fx.wardrobePath,
    },
    generatedTargetOverrides: {
      'cn-search-index': fx.generatedPath,
    },
  }, {
    derivedRebuilder: async ids => {
      assert.deepEqual(ids, []);
      return [];
    },
    derivedChecker: () => {
      checked++;
      return [{ source: 'cn-search-index', fresh: true, staleReasons: [] }];
    },
    regressionRunner: async () => {
      regressions++;
      return { status: 'pass' };
    },
  });

  assert.equal(result.report.applies.wardrobe.applied, false);
  assert.equal(hashFile(fx.wardrobePath), before);
  assert.equal(checked, 1);
  assert.equal(regressions, 1);
});
