import test from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
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
import { addPlannedItems } from '../scripts/update-completeness.mjs';
import { saveConflictDecision } from '../scripts/update-conflict-review.mjs';
import { generateApplyReadyStaging } from '../scripts/update-staging.mjs';
import { buildWardrobePreview } from '../scripts/wardrobe-apply.mjs';
import { buildLevelPreview } from '../scripts/level-pipeline.mjs';

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
    '  "1-2": [2,2,2,2,2],',
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
    'var tasksRaw = {};',
    'var levelsRaw = {',
    '  "I-1-2": [1,1,1,1,1],',
    '  "I-1-3": [3,3,3,3,3],',
    '  "I-1-4": [4,4,4,4,4]',
    '};',
    'var dreamWeavingRaw = {};',
    'function weightedFilter(tagWhitelist, nameWhitelist, weight) { return {tagWhitelist,nameWhitelist,weight,filter:function(){}}; }',
    'function normalFilter(tagWhitelist, nameWhitelist) { return weightedFilter(tagWhitelist, nameWhitelist == null ? null : nameWhitelist, 10); }',
    'var levelFilters = {"I-1-3": normalFilter("POP")};',
    'var levelBonus = {};',
    'var addSkillsInfo = {};',
    'var addHintInfo = {};',
    '',
  ].join('\n');
}

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'gate12i-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const wardrobePath = join(root, 'external-wardrobe.js');
  const levelsPath = join(root, 'external-levels.js');
  const localWardrobePath = join(root, 'local-wardrobe.js');
  const localLevelsPath = join(root, 'local-levels.js');
  const workspace = join(root, 'update-workspace');
  const outputRoot = join(root, 'staging');

  writeFileSync(
    wardrobePath,
    'var wardrobe = ' + JSON.stringify([
      extWardrobeRow('New Hair', '发型', '010'),
      extWardrobeRow('Safe Shoes', '鞋子', '002', '5'),
      extWardrobeRow('Source Dress', '连衣裙', '003'),
      extWardrobeRow('Same Coat', '外套', '004'),
    ]) + ';\n',
    'utf8',
  );
  writeFileSync(levelsPath, externalLevelsSource(), 'utf8');

  writeFileSync(
    localWardrobePath,
    'var wardrobe = ' + JSON.stringify([
      localWardrobeRow('Safe Shoes', '鞋子', '002', '4'),
      localWardrobeRow('Localized Dress', '連身裙', '003'),
      localWardrobeRow('Same Coat', '外套', '004'),
    ]) + ';\n',
    'utf8',
  );
  writeFileSync(localLevelsPath, localLevelsSource(), 'utf8');

  const snapshot = readExternalSourceSnapshot({ wardrobePath, levelsPath });
  const session = createUpdateSession({
    name: 'Gate 12I fixture',
    workspace,
    sourceSnapshot: snapshot,
  });
  const options = {
    workspace,
    sessionId: session.id,
    wardrobeTargetPath: localWardrobePath,
    levelsTargetPath: localLevelsPath,
    outputRoot,
  };

  const wardrobeKeys = ['发型|010', '鞋子|002', '连衣裙|003', '外套|004'];
  const levelKeys = ['1-1', '1-2', '1-3', '1-4'];
  addPlannedItems({ ...options, wardrobeKeys, levelKeys });
  addWardrobeToUpdate({ ...options, keys: wardrobeKeys });
  addLevelsToUpdate({ ...options, keys: levelKeys });

  return {
    root,
    wardrobePath,
    levelsPath,
    localWardrobePath,
    localLevelsPath,
    workspace,
    outputRoot,
    session,
    options,
  };
}

async function reviewFixture(f) {
  await saveConflictDecision({
    ...f.options,
    domain: 'wardrobe',
    sourceKey: '连衣裙|003',
    decision: 'use-source',
  });
  await saveConflictDecision({
    ...f.options,
    domain: 'levels',
    sourceKey: '1-3',
    decision: 'keep-local',
  });
}

function snapshotBytes(f) {
  return [
    f.wardrobePath,
    f.levelsPath,
    f.localWardrobePath,
    f.localLevelsPath,
    join(f.workspace, 'sessions', f.session.id, 'session.json'),
  ].map(path => readFileSync(path));
}

test('Gate 12I generates Gate 11 inputs/manifests from new, modified and reviewed conflicts', async t => {
  const f = fixture(t);
  await reviewFixture(f);

  const result = await generateApplyReadyStaging({
    ...f.options,
    now: new Date('2026-09-21T03:00:00.000Z'),
  });

  assert.equal(result.reused, false);
  assert.equal(result.bundle.kind, 'gate12-apply-ready-staging');
  assert.equal(result.bundle.mode, 'staging-only');
  assert.equal(result.bundle.gate12.review.unresolvedCount, 0);
  assert.equal(result.bundle.gate12.review.staleDecisionCount, 0);

  for (const artifact of [
    'bundle.json',
    'wardrobe-input.json',
    'wardrobe-manifest.json',
    'levels-input.json',
    'levels-manifest.json',
  ]) {
    assert.equal(existsSync(join(result.outputDir, artifact)), true, artifact);
  }

  const wardrobeInput = JSON.parse(readFileSync(
    join(result.outputDir, 'wardrobe-input.json'),
    'utf8',
  ));
  assert.equal(wardrobeInput.length, 3);
  assert.deepEqual(
    wardrobeInput.map(row => String(row[1]) + '|' + String(row[2])),
    ['髮型|010', '鞋子|002', '連身裙|003'],
  );

  const wardrobeManifest = JSON.parse(readFileSync(
    join(result.outputDir, 'wardrobe-manifest.json'),
    'utf8',
  ));
  assert.deepEqual(wardrobeManifest.summary, {
    totalRows: 3,
    acceptedRows: 3,
    newRows: 1,
    unchangedRows: 0,
    conflictRows: 2,
    invalidRows: 0,
    duplicateRows: 0,
    parseErrors: 0,
  });
  assert.deepEqual(
    result.bundle.gate11.wardrobe.approvedConflictKeys,
    ['鞋子|002', '連身裙|003'],
  );
  assert.equal(result.bundle.gate11.wardrobe.requiresConflictAcceptance, true);

  const levelInput = JSON.parse(readFileSync(
    join(result.outputDir, 'levels-input.json'),
    'utf8',
  ));
  assert.deepEqual(
    levelInput.entries.map(entry => entry.table + '|' + entry.key),
    ['levelsRaw|I-1-1', 'themeFilter|Chapter 1', 'levelsRaw|I-1-2'],
  );

  const levelManifest = JSON.parse(readFileSync(
    join(result.outputDir, 'levels-manifest.json'),
    'utf8',
  ));
  assert.equal(levelManifest.summary.newEntries, 1);
  assert.equal(levelManifest.summary.unchangedEntries, 1);
  assert.equal(levelManifest.summary.conflictEntries, 1);
  assert.deepEqual(
    result.bundle.gate11.levels.approvedConflictEntries,
    [{ table: 'levelsRaw', key: 'I-1-2' }],
  );
  assert.equal(result.bundle.gate11.levels.requiresConflictAcceptance, true);

  const keepLocal = result.bundle.gate12.levelActions.find(
    item => item.sourceKey === '1-3',
  );
  assert.equal(keepLocal.action, 'skip-keep-local');
  assert.equal(keepLocal.decision, 'keep-local');

  assert.ok(result.bundle.gate12.wardrobeActions.some(
    item => item.sourceKey === '外套|004' && item.action === 'skip-unchanged'
  ));
  assert.ok(result.bundle.gate12.levelActions.some(
    item => item.sourceKey === '1-4' && item.action === 'skip-unchanged'
  ));
});

test('Gate 12I artifacts pass Gate 11 preview integrity using their persisted input files', async t => {
  const f = fixture(t);
  await reviewFixture(f);
  const result = await generateApplyReadyStaging(f.options);

  const wardrobeManifest = JSON.parse(readFileSync(
    join(result.outputDir, 'wardrobe-manifest.json'),
    'utf8',
  ));
  const levelManifest = JSON.parse(readFileSync(
    join(result.outputDir, 'levels-manifest.json'),
    'utf8',
  ));

  const wardrobePreview = buildWardrobePreview(wardrobeManifest, {
    targetPath: f.localWardrobePath,
  });
  assert.deepEqual(wardrobePreview.integrityErrors, []);
  assert.equal(wardrobePreview.stale, false);
  assert.equal(wardrobePreview.manifestBlockingErrors, false);
  assert.deepEqual(wardrobePreview.ambiguousTargetKeys, []);

  const levelPreview = buildLevelPreview(levelManifest, {
    targetPath: f.localLevelsPath,
  });
  assert.deepEqual(levelPreview.integrityErrors, []);
  assert.equal(levelPreview.stale, false);
  assert.deepEqual(levelPreview.blockingErrors, []);
});

test('Gate 12I refuses generation until every current conflict is reviewed', async t => {
  const f = fixture(t);

  await assert.rejects(
    generateApplyReadyStaging(f.options),
    /Gate 12H review is not ready/,
  );
  assert.equal(existsSync(f.outputRoot), false);
});

test('Gate 12I refuses stale decisions after a canonical target change', async t => {
  const f = fixture(t);
  await reviewFixture(f);

  writeFileSync(
    f.localWardrobePath,
    'var wardrobe = ' + JSON.stringify([
      localWardrobeRow('Safe Shoes', '鞋子', '002', '4'),
      localWardrobeRow('Different Local Dress', '連身裙', '003'),
      localWardrobeRow('Same Coat', '外套', '004'),
    ]) + ';\n',
    'utf8',
  );

  await assert.rejects(
    generateApplyReadyStaging(f.options),
    /Gate 12H review is not ready|stale/,
  );
  assert.equal(existsSync(f.outputRoot), false);
});

test('Gate 12I is idempotent and reuses byte-identical staging for unchanged state', async t => {
  const f = fixture(t);
  await reviewFixture(f);

  const first = await generateApplyReadyStaging({
    ...f.options,
    now: new Date('2026-09-21T03:01:00.000Z'),
  });
  const files = [
    'bundle.json',
    'wardrobe-input.json',
    'wardrobe-manifest.json',
    'levels-input.json',
    'levels-manifest.json',
  ];
  const before = files.map(name => readFileSync(join(first.outputDir, name)));

  const second = await generateApplyReadyStaging({
    ...f.options,
    now: new Date('2026-09-21T04:00:00.000Z'),
  });
  assert.equal(second.reused, true);
  assert.equal(second.outputDir, first.outputDir);
  files.forEach((name, index) => {
    assert.deepEqual(readFileSync(join(second.outputDir, name)), before[index], name);
  });
});

test('Gate 12I does not mutate session, external sources or canonical targets', async t => {
  const f = fixture(t);
  await reviewFixture(f);
  const before = snapshotBytes(f);

  await generateApplyReadyStaging(f.options);

  const after = snapshotBytes(f);
  after.forEach((bytes, index) => assert.deepEqual(bytes, before[index]));
});

test('Gate 12I rejects completed sessions even when their review history is complete', async t => {
  const f = fixture(t);
  await reviewFixture(f);
  completeUpdateSession(f.session.id, { workspace: f.workspace });

  await assert.rejects(
    generateApplyReadyStaging(f.options),
    /requires a draft update session/,
  );
  assert.equal(existsSync(f.outputRoot), false);
});
