import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readExternalSourceSnapshot } from '../scripts/external-source-reader.mjs';
import { createUpdateSession } from '../scripts/update-session.mjs';
import { addManualWardrobeToUpdate, addWardrobeToUpdate } from '../scripts/update-wardrobe.mjs';
import { addLevelsToUpdate } from '../scripts/update-levels.mjs';
import { addManualPlannedWardrobe, addPlannedItems } from '../scripts/update-completeness.mjs';
import { buildUpdateDiffPreview } from '../scripts/update-diff-preview.mjs';

function extWardrobeRow(name, type, id, stars = '3') {
  return [
    name, type, id, stars,
    '', 'S', '', 'A', '', 'B', '', 'A', 'C', '',
    'POP', 'Store', 'Set', 'V1',
    'extra-a', 'extra-b',
  ];
}

function localWardrobeRow(name, type, id, stars = '3') {
  return extWardrobeRow(name, type, id, stars).slice(0, 18);
}

function externalLevelsSource() {
  return [
    'var themeFilter = [["Chapter 1", "关卡: 1-"]];',
    'var competitionsRaw = {};',
    'var extraRaw = {};',
    'var tasksRaw = {};',
    'var levelsRaw = {',
    '  "1-1": [1,1,1,1,1],',
    '  "1-2": [2,1,-1,3,0.8],',
    '  "1-3": [3,3,3,3,3],',
    '  "1-4": [4,4,4,4,4]',
    '};',
    'var dreamWeavingRaw = {};',
    'var levelFilters = {};',
    'var levelBonus = {};',
    'var addSkillsInfo = {};',
    'var addHintInfo = {};',
    '',
  ].join('\n');
}

function localLevelsSource() {
  return [
    'var themeFilter = [["Chapter 1", "關卡: I-1-"]];',
    'var competitionsRaw = {};',
    'var extraRaw = {};',
    'var tasksRaw = {"I-1-3": [9,9,9,9,9]};',
    'var levelsRaw = {',
    '  "I-1-2": [1,1,1,1,1],',
    '  "I-1-4": [4,4,4,4,4]',
    '};',
    'var dreamWeavingRaw = {};',
    'var levelFilters = {};',
    'var levelBonus = {};',
    'var addSkillsInfo = {};',
    'var addHintInfo = {};',
    '',
  ].join('\n');
}

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'gate12g-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const wardrobePath = join(root, 'external-wardrobe.js');
  const levelsPath = join(root, 'external-levels.js');
  const localWardrobePath = join(root, 'local-wardrobe.js');
  const localLevelsPath = join(root, 'local-levels.js');
  const workspace = join(root, 'update-workspace');

  const externalWardrobe = [
    extWardrobeRow('New Hair', '发型', '010'),
    extWardrobeRow('Safe Shoes', '鞋子', '002', '5'),
    extWardrobeRow('Source Dress', '连衣裙', '003'),
    extWardrobeRow('Same Coat', '外套', '004'),
    extWardrobeRow('Unplanned Hat', '饰品-头饰·发饰', '099'),
  ];
  writeFileSync(
    wardrobePath,
    'var wardrobe = ' + JSON.stringify(externalWardrobe) + ';\n',
    'utf8',
  );
  writeFileSync(levelsPath, externalLevelsSource(), 'utf8');

  const localWardrobe = [
    localWardrobeRow('Safe Shoes', '鞋子', '002', '4'),
    localWardrobeRow('Localized Dress', '連身裙', '003'),
    localWardrobeRow('Same Coat', '外套', '004'),
  ];
  writeFileSync(
    localWardrobePath,
    'var wardrobe = ' + JSON.stringify(localWardrobe) + ';\n',
    'utf8',
  );
  writeFileSync(localLevelsPath, localLevelsSource(), 'utf8');

  const snapshot = readExternalSourceSnapshot({ wardrobePath, levelsPath });
  const session = createUpdateSession({
    name: 'Gate 12G fixture',
    workspace,
    sourceSnapshot: snapshot,
  });
  const options = { workspace, sessionId: session.id };
  return {
    root,
    workspace,
    wardrobePath,
    levelsPath,
    localWardrobePath,
    localLevelsPath,
    snapshot,
    session,
    options,
  };
}

async function completeFixture(f) {
  const wardrobeKeys = ['发型|010', '鞋子|002', '连衣裙|003', '外套|004'];
  const levelKeys = ['1-1', '1-2', '1-3', '1-4'];
  addPlannedItems({
    ...f.options,
    wardrobeKeys,
    levelKeys,
  });
  addWardrobeToUpdate({
    ...f.options,
    keys: wardrobeKeys,
  });
  addLevelsToUpdate({
    ...f.options,
    keys: levelKeys,
  });
}

test('Gate 12G classifies new, modified, conflict and unchanged across both domains', async t => {
  const f = fixture(t);
  await completeFixture(f);

  const result = await buildUpdateDiffPreview({
    ...f.options,
    wardrobeTargetPath: f.localWardrobePath,
    levelsTargetPath: f.localLevelsPath,
  });

  assert.deepEqual(result.summary, {
    total: 8,
    new: 2,
    modified: 2,
    conflict: 2,
    unchanged: 2,
  });
  assert.equal(result.completeness.complete, true);
  assert.equal(result.readyForNextGate, false);
  assert.equal(result.blockers.filter(item => item.kind === 'diff-conflict').length, 2);

  const wardrobe = Object.fromEntries(result.wardrobe.items.map(item => [item.sourceKey, item]));
  assert.equal(wardrobe['发型|010'].status, 'new');
  assert.equal(wardrobe['发型|010'].targetKey, '髮型|010');
  assert.equal(wardrobe['发型|010'].mappingRule, 'explicit-category-map');

  assert.equal(wardrobe['鞋子|002'].status, 'modified');
  assert.deepEqual(wardrobe['鞋子|002'].differences.map(item => item.field), ['stars']);

  assert.equal(wardrobe['连衣裙|003'].status, 'conflict');
  assert.equal(wardrobe['连衣裙|003'].conflictKind, 'localized-field-difference');
  assert.deepEqual(wardrobe['连衣裙|003'].manualReviewFields, ['name']);

  assert.equal(wardrobe['外套|004'].status, 'unchanged');

  const levels = Object.fromEntries(result.levels.items.map(item => [item.sourceKey, item]));
  assert.equal(levels['1-1'].status, 'new');
  assert.equal(levels['1-1'].targetKey, 'I-1-1');
  assert.equal(levels['1-1'].mappingRule, 'volume-I-prefix');

  assert.equal(levels['1-2'].status, 'modified');
  assert.deepEqual(levels['1-2'].differences.map(item => item.table), ['levelsRaw']);

  assert.equal(levels['1-3'].status, 'conflict');
  assert.equal(levels['1-3'].conflictKind, 'ambiguous-local-primary');
  assert.deepEqual(levels['1-3'].localOwners, ['tasksRaw']);

  assert.equal(levels['1-4'].status, 'unchanged');
});

test('Gate 12G treats manual wardrobe rows as canonical TW input without reconversion', async t => {
  const f = fixture(t);
  const manualRow = localWardrobeRow('手動補鞋', '鞋子', 'M001', '4');
  manualRow[14] = '小動物';
  manualRow[15] = '手動補資料';
  manualRow[16] = '手動套裝';
  manualRow[17] = 'VManual';

  addManualPlannedWardrobe({ ...f.options, row: manualRow });
  addManualWardrobeToUpdate({ ...f.options, row: manualRow });

  const result = await buildUpdateDiffPreview({
    ...f.options,
    wardrobeTargetPath: f.localWardrobePath,
    levelsTargetPath: f.localLevelsPath,
  });

  assert.equal(result.wardrobe.items.length, 1);
  const item = result.wardrobe.items[0];
  assert.equal(item.sourceKey, '鞋子|M001');
  assert.equal(item.targetKey, '鞋子|M001');
  assert.equal(item.mappingRule, 'manual-canonical-identity');
  assert.equal(item.status, 'new');
  assert.deepEqual(item.candidateRow, manualRow);
});

test('Gate 12G requires review when a manual row differs from an existing canonical identity', async t => {
  const f = fixture(t);
  const manualRow = localWardrobeRow('手動覆寫鞋', '鞋子', '002', '5');
  manualRow[15] = '手動補資料';

  addManualPlannedWardrobe({ ...f.options, row: manualRow });
  addManualWardrobeToUpdate({ ...f.options, row: manualRow });

  const result = await buildUpdateDiffPreview({
    ...f.options,
    wardrobeTargetPath: f.localWardrobePath,
    levelsTargetPath: f.localLevelsPath,
  });

  const item = result.wardrobe.items[0];
  assert.equal(item.status, 'conflict');
  assert.equal(item.conflictKind, 'manual-local-difference');
  assert.equal(item.targetKey, '鞋子|002');
  assert.ok(item.manualReviewFields.includes('name'));
  assert.deepEqual(item.candidateRow, manualRow);
});

test('Gate 12G preview blocks missing planned items but still previews collected planned work', async t => {
  const f = fixture(t);
  addPlannedItems({
    ...f.options,
    wardrobeKeys: ['发型|010', '鞋子|002'],
    levelKeys: ['1-1'],
  });
  addWardrobeToUpdate({
    ...f.options,
    keys: ['发型|010'],
  });
  addLevelsToUpdate({
    ...f.options,
    keys: ['1-1'],
  });

  const result = await buildUpdateDiffPreview({
    ...f.options,
    wardrobeTargetPath: f.localWardrobePath,
    levelsTargetPath: f.localLevelsPath,
  });

  assert.equal(result.completeness.complete, false);
  assert.equal(result.summary.total, 2);
  assert.equal(result.summary.new, 2);
  assert.equal(result.readyForNextGate, false);
  assert.ok(result.blockers.some(
    item => item.kind === 'missing-planned-wardrobe' && item.key === '鞋子|002'
  ));
});

test('Gate 12G ignores unplanned collected records in classification and reports them separately', async t => {
  const f = fixture(t);
  addPlannedItems({
    ...f.options,
    wardrobeKeys: ['发型|010'],
  });
  addWardrobeToUpdate({
    ...f.options,
    keys: ['发型|010', '饰品-头饰·发饰|099'],
  });

  const result = await buildUpdateDiffPreview({
    ...f.options,
    wardrobeTargetPath: f.localWardrobePath,
    levelsTargetPath: f.localLevelsPath,
  });

  assert.equal(result.summary.total, 1);
  assert.equal(result.summary.new, 1);
  assert.deepEqual(result.wardrobe.ignoredUnplannedCollected, [{
    key: '饰品-头饰·发饰|099',
    name: 'Unplanned Hat',
    category: '饰品-头饰·发饰',
    id: '099',
  }]);
});

test('Gate 12G preview is read-only for session, external sources and local targets', async t => {
  const f = fixture(t);
  await completeFixture(f);
  const sessionPath = join(f.workspace, 'sessions', f.session.id, 'session.json');
  const paths = [
    sessionPath,
    f.wardrobePath,
    f.levelsPath,
    f.localWardrobePath,
    f.localLevelsPath,
  ];
  const before = paths.map(path => readFileSync(path));

  await buildUpdateDiffPreview({
    ...f.options,
    wardrobeTargetPath: f.localWardrobePath,
    levelsTargetPath: f.localLevelsPath,
  });

  paths.forEach((path, index) => {
    assert.deepEqual(readFileSync(path), before[index], path);
  });
});

test('Gate 12G uses exact II/III local level keys rather than adding I prefix', async t => {
  const f = fixture(t);
  let external = readFileSync(f.levelsPath, 'utf8');
  external = external.replace(
    '"1-4": [4,4,4,4,4]',
    '"1-4": [4,4,4,4,4], "III-4-1": [5,5,5,5,5]',
  );
  writeFileSync(f.levelsPath, external, 'utf8');

  const snapshot = readExternalSourceSnapshot({
    wardrobePath: f.wardrobePath,
    levelsPath: f.levelsPath,
  });
  const workspace = join(f.root, 'volume-workspace');
  const session = createUpdateSession({
    name: 'Volume mapping',
    workspace,
    sourceSnapshot: snapshot,
  });
  const options = { workspace, sessionId: session.id };
  addPlannedItems({ ...options, levelKeys: ['III-4-1'] });
  addLevelsToUpdate({ ...options, keys: ['III-4-1'] });

  const result = await buildUpdateDiffPreview({
    ...options,
    wardrobeTargetPath: f.localWardrobePath,
    levelsTargetPath: f.localLevelsPath,
  });
  assert.equal(result.levels.items[0].targetKey, 'III-4-1');
  assert.equal(result.levels.items[0].mappingRule, 'explicit-volume-key');
  assert.equal(result.levels.items[0].status, 'new');
});
