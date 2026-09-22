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
import vm from 'node:vm';
import { readExternalSourceSnapshot } from '../scripts/external-source-reader.mjs';
import {
  createUpdateSession,
  loadUpdateSession,
} from '../scripts/update-session.mjs';
import { addWardrobeToUpdate } from '../scripts/update-wardrobe.mjs';
import { addLevelsToUpdate } from '../scripts/update-levels.mjs';
import { addPlannedItems } from '../scripts/update-completeness.mjs';
import { saveConflictDecision } from '../scripts/update-conflict-review.mjs';
import { generateApplyReadyStaging } from '../scripts/update-staging.mjs';
import { runSessionReviewApply } from '../scripts/update-review-apply.mjs';
import { readNormalizedLevelTables } from '../scripts/level-pipeline.mjs';

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

function wardrobeFile(rows) {
  return [
    'var wardrobe = [',
    rows.map(row => '  ' + JSON.stringify(row) + ',').join('\n'),
    '];',
    "var lastVersion = 'V1';",
    "var wardrobe_lastupd = '2026/9/20';",
    'var wardrobeTags = [];',
    '',
  ].join('\n');
}

function externalLevelsSource() {
  return [
    'var themeFilter = [["Chapter 1", "关卡: 1-"]];',
    'var competitionsRaw = {};',
    'var extraRaw = {};',
    'var tasksRaw = {};',
    'var levelsRaw = {',
    '  "1-1": [1,1,1,1,1],',
    '  "1-2": [2,2,2,2,2]',
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
    'var levelsRaw = {"I-1-2": [1,1,1,1,1]};',
    'var dreamWeavingRaw = {};',
    'var levelFilters = {};',
    'var levelBonus = {};',
    'var addSkillsInfo = {};',
    'var addHintInfo = {};',
    '',
  ].join('\n');
}

function loadWardrobeRows(path) {
  const context = {};
  vm.runInNewContext(readFileSync(path, 'utf8'), context, {
    filename: path,
    timeout: 10000,
  });
  return context.wardrobe;
}

async function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'gate12j-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const wardrobePath = join(root, 'external-wardrobe.js');
  const levelsPath = join(root, 'external-levels.js');
  const localWardrobePath = join(root, 'local-wardrobe.js');
  const localLevelsPath = join(root, 'local-levels.js');
  const workspace = join(root, 'update-workspace');
  const outputRoot = join(root, 'gate12-staging');
  const runRoot = join(root, 'gate12j-runs');
  const generatedPath = join(root, 'generated-cn-index.json');

  writeFileSync(
    wardrobePath,
    'var wardrobe = ' + JSON.stringify([
      extWardrobeRow('New Hair', '发型', '010'),
      extWardrobeRow('Safe Shoes', '鞋子', '002', '5'),
      extWardrobeRow('Source Dress', '连衣裙', '003'),
    ]) + ';\n',
    'utf8',
  );
  writeFileSync(levelsPath, externalLevelsSource(), 'utf8');

  writeFileSync(
    localWardrobePath,
    wardrobeFile([
      localWardrobeRow('Safe Shoes', '鞋子', '002', '4'),
      localWardrobeRow('Localized Dress', '連身裙', '003'),
    ]),
    'utf8',
  );
  writeFileSync(localLevelsPath, localLevelsSource(), 'utf8');

  const snapshot = readExternalSourceSnapshot({ wardrobePath, levelsPath });
  const session = createUpdateSession({
    name: 'Gate 12J fixture',
    workspace,
    sourceSnapshot: snapshot,
  });
  const options = {
    workspace,
    sessionId: session.id,
    wardrobeTargetPath: localWardrobePath,
    levelsTargetPath: localLevelsPath,
    outputRoot,
    runRoot,
    generatedTargetOverrides: {
      'cn-search-index': generatedPath,
    },
  };

  const wardrobeKeys = ['发型|010', '鞋子|002', '连衣裙|003'];
  const levelKeys = ['1-1', '1-2'];
  addPlannedItems({ ...options, wardrobeKeys, levelKeys });
  addWardrobeToUpdate({ ...options, keys: wardrobeKeys });
  addLevelsToUpdate({ ...options, keys: levelKeys });
  await saveConflictDecision({
    ...options,
    domain: 'wardrobe',
    sourceKey: '连衣裙|003',
    decision: 'use-source',
  });

  return {
    root,
    wardrobePath,
    levelsPath,
    localWardrobePath,
    localLevelsPath,
    workspace,
    outputRoot,
    runRoot,
    generatedPath,
    session,
    options,
  };
}

function applyServices({ regressionFails = false } = {}) {
  return {
    regressionRunner: async () => {
      if (regressionFails) throw new Error('forced Gate 12J regression failure');
      return { status: 'pass' };
    },
    derivedRebuilder: async () => [],
    derivedChecker: () => [],
  };
}

test('Gate 12J preview reuses Gate 12I and authorizes only the exact Gate 11 conflict set', async t => {
  const f = await fixture(t);
  const wardrobeBefore = readFileSync(f.localWardrobePath);
  const levelsBefore = readFileSync(f.localLevelsPath);

  const result = await runSessionReviewApply({
    ...f.options,
    apply: false,
    now: new Date('2026-09-21T04:00:00.000Z'),
  });

  assert.equal(result.report.status, 'ready');
  assert.equal(result.report.readyForApply, true);
  assert.equal(
    result.report.confirmFingerprint,
    result.staging.bundle.generationFingerprint,
  );
  assert.equal(result.gate11.report.status, 'review-required');

  assert.deepEqual(
    result.report.authorization.wardrobe.actual,
    ['連身裙|003', '鞋子|002'],
  );
  assert.deepEqual(
    result.report.authorization.wardrobe.approved,
    ['連身裙|003', '鞋子|002'],
  );
  assert.deepEqual(
    result.report.authorization.levels.actual,
    ['levelsRaw|I-1-2'],
  );
  assert.deepEqual(
    result.report.authorization.levels.approved,
    ['levelsRaw|I-1-2'],
  );

  assert.deepEqual(readFileSync(f.localWardrobePath), wardrobeBefore);
  assert.deepEqual(readFileSync(f.localLevelsPath), levelsBefore);
  assert.equal(loadUpdateSession(f.session.id, { workspace: f.workspace }).status, 'draft');
});

test('Gate 12J apply requires the exact current generation fingerprint', async t => {
  const f = await fixture(t);
  const preview = await runSessionReviewApply({
    ...f.options,
    apply: false,
  });

  await assert.rejects(
    runSessionReviewApply({
      ...f.options,
      apply: true,
    }, applyServices()),
    /requires explicit --confirm/,
  );

  await assert.rejects(
    runSessionReviewApply({
      ...f.options,
      apply: true,
      confirm: '0'.repeat(64),
    }, applyServices()),
    /confirmation fingerprint does not match/,
  );

  assert.ok(preview.report.confirmFingerprint);
});

test('Gate 12J applies reviewed data through Gate 11F and leaves session draft for Gate 12K', async t => {
  const f = await fixture(t);
  const preview = await runSessionReviewApply({
    ...f.options,
    apply: false,
  });
  const confirm = preview.report.confirmFingerprint;

  const result = await runSessionReviewApply({
    ...f.options,
    apply: true,
    confirm,
    now: new Date('2026-09-21T04:05:00.000Z'),
  }, applyServices());

  assert.equal(result.report.status, 'applied');
  assert.equal(result.gate11.report.status, 'applied');
  assert.equal(result.gate11.report.applies.wardrobe.applied, true);
  assert.equal(result.gate11.report.applies.levels.applied, true);
  assert.deepEqual(result.gate11.report.changedSourceIds.sort(), ['main-levels', 'wardrobe']);

  const wardrobe = loadWardrobeRows(f.localWardrobePath);
  const byKey = new Map(wardrobe.map(row => [String(row[1]) + '|' + String(row[2]), row]));
  assert.equal(byKey.get('髮型|010')[0], 'New Hair');
  assert.equal(String(byKey.get('鞋子|002')[3]), '5');
  assert.equal(byKey.get('連身裙|003')[0], 'Source Dress');

  const levels = readNormalizedLevelTables(f.localLevelsPath);
  assert.deepEqual(levels.levelsRaw['I-1-1'], [1, 1, 1, 1, 1]);
  assert.deepEqual(levels.levelsRaw['I-1-2'], [2, 2, 2, 2, 2]);

  assert.equal(loadUpdateSession(f.session.id, { workspace: f.workspace }).status, 'draft');
});

test('Gate 12J rejects a tampered Gate 12I approved-conflict set before Gate 11 apply', async t => {
  const f = await fixture(t);
  const staging = await generateApplyReadyStaging(f.options);
  const bundlePath = staging.bundlePath;
  const bundle = JSON.parse(readFileSync(bundlePath, 'utf8'));
  bundle.gate11.wardrobe.approvedConflictKeys = ['連身裙|003'];
  writeFileSync(bundlePath, JSON.stringify(bundle, null, 2) + '\n', 'utf8');

  await assert.rejects(
    runSessionReviewApply({
      ...f.options,
      apply: false,
    }),
    /wardrobe Gate 11 conflict set does not match Gate 12I authorization/,
  );
});

test('Gate 12J Gate 11 rollback restores both targets when final regression fails', async t => {
  const f = await fixture(t);
  const preview = await runSessionReviewApply({
    ...f.options,
    apply: false,
  });
  const beforeWardrobe = readFileSync(f.localWardrobePath);
  const beforeLevels = readFileSync(f.localLevelsPath);

  await assert.rejects(
    runSessionReviewApply({
      ...f.options,
      apply: true,
      confirm: preview.report.confirmFingerprint,
    }, applyServices({ regressionFails: true })),
    /forced Gate 12J regression failure/,
  );

  assert.deepEqual(readFileSync(f.localWardrobePath), beforeWardrobe);
  assert.deepEqual(readFileSync(f.localLevelsPath), beforeLevels);
  assert.equal(loadUpdateSession(f.session.id, { workspace: f.workspace }).status, 'draft');
});

test('Gate 12J old confirmation becomes invalid when reviewed staging state changes', async t => {
  const f = await fixture(t);
  const preview = await runSessionReviewApply({
    ...f.options,
    apply: false,
  });
  const oldFingerprint = preview.report.confirmFingerprint;

  await saveConflictDecision({
    ...f.options,
    domain: 'wardrobe',
    sourceKey: '连衣裙|003',
    decision: 'keep-local',
    note: 'changed after preview',
  });

  await assert.rejects(
    runSessionReviewApply({
      ...f.options,
      apply: true,
      confirm: oldFingerprint,
    }, applyServices()),
    /confirmation fingerprint does not match/,
  );
});

test('Gate 12J preview persists an authorization report without applying', async t => {
  const f = await fixture(t);
  const result = await runSessionReviewApply({
    ...f.options,
    apply: false,
  });

  const auth = JSON.parse(readFileSync(
    join(result.runDir, 'gate12j-authorization.json'),
    'utf8',
  ));
  assert.equal(auth.generationFingerprint, result.report.confirmFingerprint);
  assert.deepEqual(auth.authorization.wardrobe.actual, auth.authorization.wardrobe.approved);

  const report = JSON.parse(readFileSync(result.reportPath, 'utf8'));
  assert.equal(report.kind, 'gate12-review-apply');
  assert.equal(report.mode, 'preview');
  assert.equal(report.status, 'ready');
});
