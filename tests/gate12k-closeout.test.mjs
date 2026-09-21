import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readExternalSourceSnapshot } from '../scripts/external-source-reader.mjs';
import {
  createUpdateSession,
  getCurrentSession,
  loadUpdateSession,
  saveUpdateSession,
} from '../scripts/update-session.mjs';
import { addWardrobeToUpdate } from '../scripts/update-wardrobe.mjs';
import { addLevelsToUpdate } from '../scripts/update-levels.mjs';
import { addPlannedItems } from '../scripts/update-completeness.mjs';
import { runSessionReviewApply } from '../scripts/update-review-apply.mjs';
import {
  completePostApplyCloseout,
  verifyPostApplyCloseout,
} from '../scripts/update-closeout.mjs';

function externalWardrobeRow() {
  return [
    'Gate 12K Hair', '发型', 'G12K-001', '5',
    '', 'S', '', 'A', '', 'B', '', 'A', 'C', '',
    'POP', '', '', '',
    'extra-a', 'extra-b',
  ];
}

function externalLevelsSource() {
  return [
    'var themeFilter = [["Gate 12K", "关卡: III-98-"]];',
    'var competitionsRaw = {};',
    'var extraRaw = {};',
    'var tasksRaw = {};',
    'var levelsRaw = {"III-98-1": [1,1,1,1,1]};',
    'var dreamWeavingRaw = {};',
    'var levelFilters = {};',
    'var levelBonus = {};',
    'var addSkillsInfo = {};',
    'var addHintInfo = {};',
    '',
  ].join('\n');
}

function localWardrobeSource() {
  return [
    'var wardrobe = [];',
    "var lastVersion = 'V1';",
    "var wardrobe_lastupd = '2026/9/20';",
    'var wardrobeTags = [];',
    '',
  ].join('\n');
}

function localLevelsSource() {
  return [
    'var themeFilter = [];',
    'var competitionsRaw = {};',
    'var extraRaw = {};',
    'var tasksRaw = {};',
    'var levelsRaw = {};',
    'var dreamWeavingRaw = {};',
    'var levelFilters = {};',
    'var levelBonus = {};',
    'var addSkillsInfo = {};',
    'var addHintInfo = {};',
    '',
  ].join('\n');
}

function applyServices() {
  return {
    regressionRunner: async () => ({ status: 'pass' }),
    derivedRebuilder: async () => [],
    derivedChecker: () => [],
  };
}

function closeoutServices() {
  return {
    regressionRunner: async () => ({ status: 'pass' }),
    freshnessChecker: async () => [],
  };
}

async function fixture(t, { apply = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'gate12k-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const externalWardrobe = join(root, 'external-wardrobe.js');
  const externalLevels = join(root, 'external-levels.js');
  const targetWardrobe = join(root, 'wardrobe.js');
  const targetLevels = join(root, 'levels.js');
  const workspace = join(root, 'workspace');
  const outputRoot = join(root, 'staging');
  const runRoot = join(root, 'runs');

  writeFileSync(
    externalWardrobe,
    'var wardrobe = ' + JSON.stringify([externalWardrobeRow()]) + ';\n',
    'utf8',
  );
  writeFileSync(externalLevels, externalLevelsSource(), 'utf8');
  writeFileSync(targetWardrobe, localWardrobeSource(), 'utf8');
  writeFileSync(targetLevels, localLevelsSource(), 'utf8');

  const sourceSnapshot = readExternalSourceSnapshot({
    wardrobePath: externalWardrobe,
    levelsPath: externalLevels,
  });
  const session = createUpdateSession({
    name: 'Gate 12K fixture',
    workspace,
    sourceSnapshot,
  });
  const base = {
    workspace,
    sessionId: session.id,
    wardrobeTargetPath: targetWardrobe,
    levelsTargetPath: targetLevels,
    outputRoot,
    runRoot,
  };

  addPlannedItems({
    ...base,
    wardrobeKeys: ['发型|G12K-001'],
    levelKeys: ['III-98-1'],
  });
  addWardrobeToUpdate({
    ...base,
    keys: ['发型|G12K-001'],
  });
  addLevelsToUpdate({
    ...base,
    keys: ['III-98-1'],
  });

  const preview = await runSessionReviewApply({
    ...base,
    apply: false,
    now: new Date('2026-09-21T05:00:00.000Z'),
  });

  let run = preview;
  if (apply) {
    run = await runSessionReviewApply({
      ...base,
      apply: true,
      confirm: preview.report.confirmFingerprint,
      now: new Date('2026-09-21T05:01:00.000Z'),
    }, applyServices());
  }

  return {
    root,
    externalWardrobe,
    externalLevels,
    targetWardrobe,
    targetLevels,
    workspace,
    outputRoot,
    runRoot,
    session,
    base,
    preview,
    run,
  };
}

test('Gate 12K verifies a successful Gate 12J apply and writes durable closeout evidence', async t => {
  const f = await fixture(t);
  const result = await verifyPostApplyCloseout({
    workspace: f.workspace,
    applyReportPath: f.run.reportPath,
    now: new Date('2026-09-21T05:02:00.000Z'),
  }, closeoutServices());

  assert.equal(result.readyToComplete, true);
  assert.match(result.closeoutFingerprint, /^[0-9a-f]{64}$/);
  assert.equal(result.report.status, 'verified');
  assert.equal(result.report.sessionId, f.session.id);
  assert.equal(result.report.completeness.complete, true);
  assert.equal(result.report.completeness.overall.missing, 0);
  assert.equal(result.report.semantics.wardrobe.stagedRowsVerified, 1);
  assert.equal(result.report.semantics.levels.stagedEntriesVerified, 2);

  const persisted = JSON.parse(readFileSync(result.reportPath, 'utf8'));
  assert.equal(persisted.closeoutFingerprint, result.closeoutFingerprint);
  assert.equal(loadUpdateSession(f.session.id, { workspace: f.workspace }).status, 'draft');
  assert.equal(getCurrentSession({ workspace: f.workspace }).id, f.session.id);
});

test('Gate 12K completes only with the exact current closeout fingerprint and clears current session', async t => {
  const f = await fixture(t);
  const verified = await verifyPostApplyCloseout({
    workspace: f.workspace,
    applyReportPath: f.run.reportPath,
  }, closeoutServices());

  const completed = await completePostApplyCloseout({
    workspace: f.workspace,
    applyReportPath: f.run.reportPath,
    confirm: verified.closeoutFingerprint,
    now: new Date('2026-09-21T05:03:00.000Z'),
  }, closeoutServices());

  assert.equal(completed.session.status, 'completed');
  assert.equal(completed.session.closeout.closeoutFingerprint, verified.closeoutFingerprint);
  assert.equal(completed.session.closeout.reportPath, completed.reportPath);
  assert.equal(completed.report.status, 'completed');
  assert.equal(completed.report.sessionCompletion.status, 'completed');
  assert.equal(getCurrentSession({ workspace: f.workspace }), null);

  const persisted = JSON.parse(readFileSync(completed.reportPath, 'utf8'));
  assert.equal(persisted.status, 'completed');
  assert.equal(persisted.sessionCompletion.completedAt, completed.session.completedAt);
});

test('Gate 12K rejects a wrong closeout confirmation and keeps the session draft', async t => {
  const f = await fixture(t);

  await assert.rejects(
    completePostApplyCloseout({
      workspace: f.workspace,
      applyReportPath: f.run.reportPath,
      confirm: '0'.repeat(64),
    }, closeoutServices()),
    /confirmation fingerprint does not match/,
  );

  assert.equal(loadUpdateSession(f.session.id, { workspace: f.workspace }).status, 'draft');
});

test('Gate 12K rejects Gate 12J preview reports because no apply occurred', async t => {
  const f = await fixture(t, { apply: false });

  await assert.rejects(
    verifyPostApplyCloseout({
      workspace: f.workspace,
      applyReportPath: f.preview.reportPath,
    }, closeoutServices()),
    /requires a successful Gate 12J apply report/,
  );
  assert.equal(loadUpdateSession(f.session.id, { workspace: f.workspace }).status, 'draft');
});

test('Gate 12K rejects targets changed after Gate 12J apply', async t => {
  const f = await fixture(t);
  appendFileSync(f.targetLevels, '// changed after apply\n', 'utf8');

  await assert.rejects(
    verifyPostApplyCloseout({
      workspace: f.workspace,
      applyReportPath: f.run.reportPath,
    }, closeoutServices()),
    /levels target changed after Gate 12J apply/,
  );
  assert.equal(loadUpdateSession(f.session.id, { workspace: f.workspace }).status, 'draft');
});

test('Gate 12K rejects a session changed after Gate 12I staging / Gate 12J apply', async t => {
  const f = await fixture(t);
  const session = loadUpdateSession(f.session.id, { workspace: f.workspace });
  session.note = 'changed after apply';
  saveUpdateSession(session, {
    workspace: f.workspace,
    now: new Date('2026-09-21T05:04:00.000Z'),
  });

  await assert.rejects(
    verifyPostApplyCloseout({
      workspace: f.workspace,
      applyReportPath: f.run.reportPath,
    }, closeoutServices()),
    /session changed after Gate 12I staging/,
  );
});

test('Gate 12K rechecks generated freshness and repository regression before completion', async t => {
  const f = await fixture(t);

  await assert.rejects(
    verifyPostApplyCloseout({
      workspace: f.workspace,
      applyReportPath: f.run.reportPath,
    }, {
      freshnessChecker: async () => [{
        source: 'cn-search-index',
        fresh: false,
        staleReasons: ['test-stale'],
      }],
      regressionRunner: async () => ({ status: 'pass' }),
    }),
    /freshness recheck found stale/,
  );

  await assert.rejects(
    verifyPostApplyCloseout({
      workspace: f.workspace,
      applyReportPath: f.run.reportPath,
    }, {
      freshnessChecker: async () => [],
      regressionRunner: async () => ({ status: 'fail' }),
    }),
    /repository regression did not pass/,
  );

  assert.equal(loadUpdateSession(f.session.id, { workspace: f.workspace }).status, 'draft');
});

test('Gate 12K rejects tampered Gate 12J report evidence', async t => {
  const f = await fixture(t);
  const report = JSON.parse(readFileSync(f.run.reportPath, 'utf8'));
  report.gate11.changedSourceIds = ['wardrobe'];
  writeFileSync(f.run.reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

  await assert.rejects(
    verifyPostApplyCloseout({
      workspace: f.workspace,
      applyReportPath: f.run.reportPath,
    }, closeoutServices()),
    /Gate 11 run report no longer matches Gate 12J embedded evidence/,
  );
});

test('Gate 12K prevents repeated completion of an already completed session', async t => {
  const f = await fixture(t);
  const verified = await verifyPostApplyCloseout({
    workspace: f.workspace,
    applyReportPath: f.run.reportPath,
  }, closeoutServices());

  await completePostApplyCloseout({
    workspace: f.workspace,
    applyReportPath: f.run.reportPath,
    confirm: verified.closeoutFingerprint,
  }, closeoutServices());

  await assert.rejects(
    completePostApplyCloseout({
      workspace: f.workspace,
      applyReportPath: f.run.reportPath,
      confirm: verified.closeoutFingerprint,
    }, closeoutServices()),
    /verification requires the update session to remain draft/,
  );
});
