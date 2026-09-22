import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readExternalSourceSnapshot } from '../scripts/external-source-reader.mjs';
import {
  completeUpdateSession,
  createUpdateSession,
} from '../scripts/update-session.mjs';
import { addWardrobeToUpdate } from '../scripts/update-wardrobe.mjs';
import { addLevelsToUpdate } from '../scripts/update-levels.mjs';
import {
  addPlannedItems,
  checkUpdateCompleteness,
  listUpdatePlan,
  removePlannedItems,
} from '../scripts/update-completeness.mjs';

function wardrobeRows() {
  return [
    ['Alpha Hair', 'Hair', '001', 3, '', 'S', '', 'A', '', 'B', '', 'A', 'C', '', 'POP', 'Store', 'Alpha Set', 'V1', 'x', 'y'],
    ['Alpha Shoes', 'Shoes', '002', 3, '', 'S', '', 'A', '', 'B', '', 'A', 'C', '', 'POP', 'Store', 'Alpha Set', 'V1', 'x', 'y'],
    ['Extra Coat', 'Coat', '003', 4, 'S', '', 'A', '', 'B', '', 'A', '', 'C', '', 'FORMAL', 'Event', '', 'V1', 'x', 'y'],
  ];
}

function levelsSource() {
  return [
    'var themeFilter = [["Chapter 1", "关卡: 1-"]];',
    'var competitionsRaw = {};',
    'var extraRaw = {};',
    'var tasksRaw = {};',
    'var levelsRaw = {"1-1": [1,-2,3,1,0.5], "1-2": [2,1,-1,3,0.8], "9-9": [1,1,1,1,1]};',
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
  ].join('\n');
}

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'gate12f-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const wardrobePath = join(root, 'wardrobe.js');
  const levelsPath = join(root, 'levels.js');
  const workspace = join(root, 'update-workspace');

  writeFileSync(
    wardrobePath,
    'var wardrobe = ' + JSON.stringify(wardrobeRows()) + ';\n',
    'utf8',
  );
  writeFileSync(levelsPath, levelsSource(), 'utf8');

  const snapshot = readExternalSourceSnapshot({ wardrobePath, levelsPath });
  const session = createUpdateSession({
    name: 'Gate 12F fixture',
    workspace,
    sourceSnapshot: snapshot,
  });
  const options = { workspace, sessionId: session.id };
  const sessionPath = join(workspace, 'sessions', session.id, 'session.json');
  return {
    root,
    wardrobePath,
    levelsPath,
    workspace,
    snapshot,
    session,
    options,
    sessionPath,
  };
}

test('Gate 12F empty plan is not reported as 100 percent complete', t => {
  const f = fixture(t);
  const result = checkUpdateCompleteness(f.options);

  assert.equal(result.planDefined, false);
  assert.equal(result.complete, false);
  assert.deepEqual(result.overall, {
    planned: 0,
    completed: 0,
    missing: 0,
    percent: null,
  });
  assert.equal(result.wardrobe.percent, null);
  assert.equal(result.levels.percent, null);
});

test('Gate 12F adds persistent wardrobe and level plan items with source provenance', t => {
  const f = fixture(t);
  const result = addPlannedItems({
    ...f.options,
    wardrobeKeys: ['Hair|001', 'Shoes|002'],
    levelKeys: ['1-1', '1-2'],
    expectedWardrobeSourceHash: f.snapshot.hashes.wardrobe,
    expectedLevelsSourceHash: f.snapshot.hashes.levels,
  });

  assert.deepEqual(result.added, {
    wardrobe: ['Hair|001', 'Shoes|002'],
    levels: ['1-1', '1-2'],
  });
  assert.deepEqual(result.skipped, { wardrobe: [], levels: [] });

  const plan = listUpdatePlan(f.options);
  assert.deepEqual(plan.wardrobe.map(item => item.key), ['Hair|001', 'Shoes|002']);
  assert.deepEqual(plan.levels.map(item => item.key), ['1-1', '1-2']);
  assert.equal(plan.wardrobe[0].name, 'Alpha Hair');
  assert.equal(plan.wardrobe[0].sourceHash, f.snapshot.hashes.wardrobe);
  assert.equal(plan.levels[0].runtimeLabel, '关卡: 1-1');
  assert.deepEqual(plan.levels[0].themeFilter, [{ name: 'Chapter 1', prefix: '关卡: 1-' }]);
  assert.equal(plan.levels[0].sourceHash, f.snapshot.hashes.levels);

  const before = readFileSync(f.sessionPath);
  const repeat = addPlannedItems({
    ...f.options,
    wardrobeKeys: ['Hair|001', 'Hair|001'],
    levelKeys: ['1-1'],
  });
  assert.deepEqual(repeat.added, { wardrobe: [], levels: [] });
  assert.deepEqual(repeat.skipped, {
    wardrobe: ['Hair|001', 'Hair|001'],
    levels: ['1-1'],
  });
  assert.deepEqual(readFileSync(f.sessionPath), before);
});

test('Gate 12F reports planned missing items and keeps unplanned collected items separate', t => {
  const f = fixture(t);
  addPlannedItems({
    ...f.options,
    wardrobeKeys: ['Hair|001', 'Shoes|002'],
    levelKeys: ['1-1', '1-2'],
  });

  addWardrobeToUpdate({ ...f.options, keys: ['Hair|001', 'Coat|003'] });
  addLevelsToUpdate({ ...f.options, keys: ['1-1', '9-9'] });

  const result = checkUpdateCompleteness(f.options);
  assert.equal(result.planDefined, true);
  assert.equal(result.complete, false);
  assert.deepEqual(result.overall, {
    planned: 4,
    completed: 2,
    missing: 2,
    percent: 50,
  });

  assert.equal(result.wardrobe.planned, 2);
  assert.equal(result.wardrobe.completed, 1);
  assert.equal(result.wardrobe.missing, 1);
  assert.deepEqual(result.wardrobe.missingItems.map(item => item.key), ['Shoes|002']);
  assert.deepEqual(result.wardrobe.unplannedCollectedItems, [{
    key: 'Coat|003',
    name: 'Extra Coat',
    category: 'Coat',
    id: '003',
  }]);

  assert.equal(result.levels.planned, 2);
  assert.equal(result.levels.completed, 1);
  assert.equal(result.levels.missing, 1);
  assert.deepEqual(result.levels.missingItems.map(item => item.key), ['1-2']);
  assert.deepEqual(result.levels.unplannedCollectedItems, [{
    key: '9-9',
    runtimeLabel: '关卡: 9-9',
  }]);
});

test('Gate 12F reaches complete only when every planned item is collected', t => {
  const f = fixture(t);
  addPlannedItems({
    ...f.options,
    wardrobeKeys: ['Hair|001', 'Shoes|002'],
    levelKeys: ['1-1'],
  });
  addWardrobeToUpdate({ ...f.options, keys: ['Hair|001', 'Shoes|002'] });

  let result = checkUpdateCompleteness(f.options);
  assert.equal(result.complete, false);
  assert.equal(result.overall.percent, 66.67);
  assert.deepEqual(result.levels.missingItems.map(item => item.key), ['1-1']);

  addLevelsToUpdate({ ...f.options, keys: ['1-1'] });
  result = checkUpdateCompleteness(f.options);
  assert.equal(result.complete, true);
  assert.deepEqual(result.overall, {
    planned: 3,
    completed: 3,
    missing: 0,
    percent: 100,
  });
  assert.equal(result.wardrobe.complete, true);
  assert.equal(result.levels.complete, true);
});

test('Gate 12F plan add is all-or-nothing and source-hash pinned', t => {
  const f = fixture(t);
  const before = readFileSync(f.sessionPath);

  assert.throws(
    () => addPlannedItems({
      ...f.options,
      wardrobeKeys: ['Hair|001'],
      levelKeys: ['missing'],
    }),
    /unknown or nonselectable level plan key/,
  );
  assert.deepEqual(readFileSync(f.sessionPath), before);

  assert.throws(
    () => addPlannedItems({
      ...f.options,
      wardrobeKeys: ['Hair|001'],
      expectedWardrobeSourceHash: 'f'.repeat(64),
    }),
    /expected wardrobe source hash mismatch/,
  );
  assert.deepEqual(readFileSync(f.sessionPath), before);

  writeFileSync(f.wardrobePath, readFileSync(f.wardrobePath, 'utf8') + '// drift\n', 'utf8');
  assert.throws(
    () => addPlannedItems({ ...f.options, wardrobeKeys: ['Hair|001'] }),
    /source drift/,
  );
  assert.deepEqual(readFileSync(f.sessionPath), before);
});

test('Gate 12F completeness and plan removal work offline, while terminal plan mutation is blocked', t => {
  const f = fixture(t);
  addPlannedItems({
    ...f.options,
    wardrobeKeys: ['Hair|001'],
    levelKeys: ['1-1'],
  });
  addWardrobeToUpdate({ ...f.options, keys: ['Hair|001'] });

  unlinkSync(f.wardrobePath);
  unlinkSync(f.levelsPath);

  const offline = checkUpdateCompleteness(f.options);
  assert.equal(offline.overall.planned, 2);
  assert.equal(offline.overall.completed, 1);
  assert.deepEqual(offline.levels.missingItems.map(item => item.key), ['1-1']);

  const removed = removePlannedItems({
    ...f.options,
    levelKeys: ['1-1'],
  });
  assert.deepEqual(removed.removed, { wardrobe: [], levels: ['1-1'] });
  assert.equal(checkUpdateCompleteness(f.options).complete, true);

  completeUpdateSession(f.session.id, { workspace: f.workspace });
  const archived = { workspace: f.workspace, sessionId: f.session.id };
  assert.equal(checkUpdateCompleteness(archived).complete, true);
  assert.throws(
    () => removePlannedItems({ ...archived, wardrobeKeys: ['Hair|001'] }),
    /only draft/,
  );
});

test('Gate 12F rejects corrupt persisted plan data', t => {
  const f = fixture(t);
  addPlannedItems({ ...f.options, wardrobeKeys: ['Hair|001'], levelKeys: ['1-1'] });

  const badHash = JSON.parse(readFileSync(f.sessionPath, 'utf8'));
  badHash.plan.wardrobe[0].sourceHash = '0'.repeat(64);
  writeFileSync(f.sessionPath, JSON.stringify(badHash, null, 2) + '\n', 'utf8');
  assert.throws(() => checkUpdateCompleteness(f.options), /invalid wardrobe plan/);

  const g = fixture(t);
  addPlannedItems({ ...g.options, levelKeys: ['1-1'] });
  const duplicate = JSON.parse(readFileSync(g.sessionPath, 'utf8'));
  duplicate.plan.levels.push(duplicate.plan.levels[0]);
  writeFileSync(g.sessionPath, JSON.stringify(duplicate, null, 2) + '\n', 'utf8');
  assert.throws(() => listUpdatePlan(g.options), /duplicate planned level key/);
});

test('Gate 12F plan remove is idempotent and no-op removal preserves session bytes', t => {
  const f = fixture(t);
  addPlannedItems({ ...f.options, wardrobeKeys: ['Hair|001', 'Shoes|002'] });

  const removed = removePlannedItems({
    ...f.options,
    wardrobeKeys: ['Hair|001'],
  });
  assert.deepEqual(removed.removed, { wardrobe: ['Hair|001'], levels: [] });
  assert.deepEqual(listUpdatePlan(f.options).wardrobe.map(item => item.key), ['Shoes|002']);

  const before = readFileSync(f.sessionPath);
  const noop = removePlannedItems({
    ...f.options,
    wardrobeKeys: ['Hair|001'],
  });
  assert.deepEqual(noop.removed, { wardrobe: [], levels: [] });
  assert.deepEqual(noop.skipped, { wardrobe: ['Hair|001'], levels: [] });
  assert.deepEqual(readFileSync(f.sessionPath), before);
});
