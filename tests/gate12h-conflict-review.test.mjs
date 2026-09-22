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
import {
  completeUpdateSession,
  createUpdateSession,
} from '../scripts/update-session.mjs';
import { addWardrobeToUpdate } from '../scripts/update-wardrobe.mjs';
import { addLevelsToUpdate } from '../scripts/update-levels.mjs';
import { addPlannedItems } from '../scripts/update-completeness.mjs';
import {
  clearConflictDecisions,
  listConflictDecisions,
  listConflictReview,
  removeConflictDecision,
  saveConflictDecision,
  showConflictDecision,
} from '../scripts/update-conflict-review.mjs';

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
    'var levelsRaw = {"1-1": [1,1,1,1,1]};',
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
    'var levelsRaw = {"I-1-1": [1,1,1,1,1]};',
    'var dreamWeavingRaw = {};',
    'function weightedFilter(tagWhitelist, nameWhitelist, weight) { return {tagWhitelist,nameWhitelist,weight,filter:function(){}}; }',
    'function normalFilter(tagWhitelist, nameWhitelist) { return weightedFilter(tagWhitelist, nameWhitelist == null ? null : nameWhitelist, 10); }',
    'var levelFilters = {"I-1-1": normalFilter("POP")};',
    'var levelBonus = {};',
    'var addSkillsInfo = {};',
    'var addHintInfo = {};',
    '',
  ].join('\n');
}

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'gate12h-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const wardrobePath = join(root, 'external-wardrobe.js');
  const levelsPath = join(root, 'external-levels.js');
  const localWardrobePath = join(root, 'local-wardrobe.js');
  const localLevelsPath = join(root, 'local-levels.js');
  const workspace = join(root, 'update-workspace');

  const externalWardrobe = [
    extWardrobeRow('Source Dress', '连衣裙', '003'),
    extWardrobeRow('New Hair', '发型', '010'),
  ];
  writeFileSync(
    wardrobePath,
    'var wardrobe = ' + JSON.stringify(externalWardrobe) + ';\n',
    'utf8',
  );
  writeFileSync(levelsPath, externalLevelsSource(), 'utf8');

  const localWardrobe = [
    localWardrobeRow('Localized Dress', '連身裙', '003'),
  ];
  writeFileSync(
    localWardrobePath,
    'var wardrobe = ' + JSON.stringify(localWardrobe) + ';\n',
    'utf8',
  );
  writeFileSync(localLevelsPath, localLevelsSource(), 'utf8');

  const snapshot = readExternalSourceSnapshot({ wardrobePath, levelsPath });
  const session = createUpdateSession({
    name: 'Gate 12H fixture',
    workspace,
    sourceSnapshot: snapshot,
  });
  const options = {
    workspace,
    sessionId: session.id,
    wardrobeTargetPath: localWardrobePath,
    levelsTargetPath: localLevelsPath,
  };

  addPlannedItems({
    ...options,
    wardrobeKeys: ['连衣裙|003', '发型|010'],
    levelKeys: ['1-1'],
  });
  addWardrobeToUpdate({
    ...options,
    keys: ['连衣裙|003', '发型|010'],
  });
  addLevelsToUpdate({
    ...options,
    keys: ['1-1'],
  });

  const sessionPath = join(workspace, 'sessions', session.id, 'session.json');
  return {
    root,
    wardrobePath,
    levelsPath,
    localWardrobePath,
    localLevelsPath,
    workspace,
    session,
    options,
    sessionPath,
  };
}

test('Gate 12H lists current conflicts and saves keep-local decisions', async t => {
  const f = fixture(t);

  let review = await listConflictReview(f.options);
  assert.equal(review.completeness.complete, true);
  assert.equal(review.conflictCount, 2);
  assert.equal(review.reviewedCount, 0);
  assert.equal(review.unresolvedCount, 2);
  assert.equal(review.readyForNextGate, false);

  const saved = await saveConflictDecision({
    ...f.options,
    domain: 'wardrobe',
    sourceKey: '连衣裙|003',
    decision: 'keep-local',
    note: 'keep existing localized copy',
    now: new Date('2026-09-21T02:00:00.000Z'),
  });
  assert.equal(saved.changed, true);
  assert.equal(saved.decision.decision, 'keep-local');
  assert.equal(saved.decision.resolvedPayload, null);
  assert.equal(saved.decision.previewTargetKey, '連身裙|003');

  review = await listConflictReview(f.options);
  const wardrobe = review.conflicts.find(item => item.domain === 'wardrobe');
  assert.equal(wardrobe.reviewed, true);
  assert.equal(wardrobe.decision.state, 'current');
  assert.equal(review.reviewedCount, 1);
  assert.equal(review.unresolvedCount, 1);
});

test('Gate 12H rejects decisions for non-conflict preview items', async t => {
  const f = fixture(t);
  await assert.rejects(
    saveConflictDecision({
      ...f.options,
      domain: 'wardrobe',
      sourceKey: '发型|010',
      decision: 'keep-local',
    }),
    /current Gate 12G conflict/,
  );
});

test('Gate 12H use-source stores a resolved wardrobe payload when safe', async t => {
  const f = fixture(t);
  const saved = await saveConflictDecision({
    ...f.options,
    domain: 'wardrobe',
    sourceKey: '连衣裙|003',
    decision: 'use-source',
    now: new Date('2026-09-21T02:01:00.000Z'),
  });

  assert.equal(saved.decision.resolvedTargetKey, '連身裙|003');
  assert.equal(saved.decision.resolvedPayload.kind, 'wardrobe-row');
  assert.equal(saved.decision.resolvedPayload.targetKey, '連身裙|003');
  assert.equal(saved.decision.resolvedPayload.row.length, 18);
  assert.equal(saved.decision.resolvedPayload.row[1], '連身裙');
  assert.equal(saved.decision.resolvedPayload.row[2], '003');
});

test('Gate 12H blocks use-source when a level conflict implies source metadata deletion', async t => {
  const f = fixture(t);
  await assert.rejects(
    saveConflictDecision({
      ...f.options,
      domain: 'levels',
      sourceKey: '1-1',
      decision: 'use-source',
    }),
    /cannot safely represent source metadata deletion/,
  );
});

test('Gate 12H accepts validated manual wardrobe and level resolutions', async t => {
  const f = fixture(t);

  const wardrobe = await saveConflictDecision({
    ...f.options,
    domain: 'wardrobe',
    sourceKey: '连衣裙|003',
    decision: 'manual-resolution',
    resolvedPayload: {
      kind: 'wardrobe-row',
      targetKey: '連身裙|003',
      row: localWardrobeRow('Reviewed Dress', '連身裙', '003'),
    },
    now: new Date('2026-09-21T02:02:00.000Z'),
  });
  assert.equal(wardrobe.decision.resolvedPayload.row[0], 'Reviewed Dress');

  const levels = await saveConflictDecision({
    ...f.options,
    domain: 'levels',
    sourceKey: '1-1',
    decision: 'manual-resolution',
    resolvedPayload: {
      kind: 'level-entries',
      targetKey: 'I-1-1',
      entries: [
        { table: 'levelsRaw', key: 'I-1-1', value: [1, 1, 1, 1, 1] },
        {
          table: 'levelFilters',
          key: 'I-1-1',
          value: { tagWhitelist: 'POP', nameWhitelist: null, weight: 10 },
        },
      ],
    },
    now: new Date('2026-09-21T02:03:00.000Z'),
  });
  assert.equal(levels.decision.resolvedTargetKey, 'I-1-1');
  assert.equal(levels.decision.resolvedPayload.entries.length, 2);

  const review = await listConflictReview(f.options);
  assert.equal(review.reviewedCount, 2);
  assert.equal(review.unresolvedCount, 0);
  assert.equal(review.staleDecisionCount, 0);
  assert.equal(review.readyForNextGate, true);
});

test('Gate 12H rejects malformed manual resolutions atomically', async t => {
  const f = fixture(t);
  const before = readFileSync(f.sessionPath);

  await assert.rejects(
    saveConflictDecision({
      ...f.options,
      domain: 'wardrobe',
      sourceKey: '连衣裙|003',
      decision: 'manual-resolution',
      resolvedPayload: {
        kind: 'wardrobe-row',
        targetKey: '連身裙|003',
        row: ['too', 'short'],
      },
    }),
    /invalid manual resolution/,
  );
  assert.deepEqual(readFileSync(f.sessionPath), before);

  await assert.rejects(
    saveConflictDecision({
      ...f.options,
      domain: 'levels',
      sourceKey: '1-1',
      decision: 'manual-resolution',
      resolvedPayload: {
        kind: 'level-entries',
        targetKey: 'I-1-1',
        entries: [
          { table: 'levelFilters', key: 'I-1-1', value: { tagWhitelist: 'POP', nameWhitelist: null, weight: 10 } },
        ],
      },
    }),
    /requires one levelsRaw entry/,
  );
  assert.deepEqual(readFileSync(f.sessionPath), before);
});

test('Gate 12H repeated identical decision is a true no-op', async t => {
  const f = fixture(t);
  const options = {
    ...f.options,
    domain: 'wardrobe',
    sourceKey: '连衣裙|003',
    decision: 'keep-local',
    note: 'reviewed',
  };

  const first = await saveConflictDecision({
    ...options,
    now: new Date('2026-09-21T02:04:00.000Z'),
  });
  assert.equal(first.changed, true);
  const before = readFileSync(f.sessionPath);

  const repeat = await saveConflictDecision({
    ...options,
    now: new Date('2026-09-21T02:05:00.000Z'),
  });
  assert.equal(repeat.changed, false);
  assert.deepEqual(readFileSync(f.sessionPath), before);
});

test('Gate 12H marks saved decisions stale when the canonical target changes', async t => {
  const f = fixture(t);
  await saveConflictDecision({
    ...f.options,
    domain: 'wardrobe',
    sourceKey: '连衣裙|003',
    decision: 'keep-local',
  });

  writeFileSync(
    f.localWardrobePath,
    'var wardrobe = ' + JSON.stringify([
      localWardrobeRow('Different Local Name', '連身裙', '003'),
    ]) + ';\n',
    'utf8',
  );

  const listed = await listConflictDecisions(f.options);
  assert.equal(listed.decisions.length, 1);
  assert.equal(listed.decisions[0].state, 'stale');
  assert.ok(listed.decisions[0].staleReasons.includes('conflict fingerprint changed'));
  assert.ok(listed.decisions[0].staleReasons.includes('target SHA-256 changed'));

  const review = await listConflictReview(f.options);
  assert.equal(review.reviewedCount, 0);
  assert.equal(review.unresolvedCount, 2);
  assert.equal(review.staleDecisionCount, 1);
  assert.equal(review.readyForNextGate, false);
});

test('Gate 12H show/remove/clear manage decisions and terminal sessions are read-only', async t => {
  const f = fixture(t);
  await saveConflictDecision({
    ...f.options,
    domain: 'wardrobe',
    sourceKey: '连衣裙|003',
    decision: 'keep-local',
  });
  await saveConflictDecision({
    ...f.options,
    domain: 'levels',
    sourceKey: '1-1',
    decision: 'manual-resolution',
    resolvedPayload: {
      kind: 'level-entries',
      targetKey: 'I-1-1',
      entries: [{ table: 'levelsRaw', key: 'I-1-1', value: [1, 1, 1, 1, 1] }],
    },
  });

  const shown = await showConflictDecision({
    ...f.options,
    domain: 'wardrobe',
    sourceKey: '连衣裙|003',
  });
  assert.equal(shown.decision, 'keep-local');

  const removed = removeConflictDecision({
    ...f.options,
    domain: 'wardrobe',
    sourceKey: '连衣裙|003',
  });
  assert.equal(removed.removed, true);
  assert.equal((await listConflictDecisions(f.options)).count, 1);

  const cleared = clearConflictDecisions(f.options);
  assert.equal(cleared.removedCount, 1);
  const afterClear = readFileSync(f.sessionPath);
  assert.equal(clearConflictDecisions(f.options).removedCount, 0);
  assert.deepEqual(readFileSync(f.sessionPath), afterClear);

  await saveConflictDecision({
    ...f.options,
    domain: 'wardrobe',
    sourceKey: '连衣裙|003',
    decision: 'keep-local',
  });
  completeUpdateSession(f.session.id, { workspace: f.workspace });

  const archived = { ...f.options, sessionId: f.session.id };
  assert.equal((await listConflictDecisions(archived)).count, 1);
  assert.throws(
    () => removeConflictDecision({
      ...archived,
      domain: 'wardrobe',
      sourceKey: '连衣裙|003',
    }),
    /only draft/,
  );
  assert.throws(
    () => clearConflictDecisions(archived),
    /only draft/,
  );
  await assert.rejects(
    saveConflictDecision({
      ...archived,
      domain: 'wardrobe',
      sourceKey: '连衣裙|003',
      decision: 'keep-local',
    }),
    /only draft/,
  );
});

test('Gate 12H rejects corrupt persisted review decisions', async t => {
  const f = fixture(t);
  await saveConflictDecision({
    ...f.options,
    domain: 'wardrobe',
    sourceKey: '连衣裙|003',
    decision: 'keep-local',
  });

  const persisted = JSON.parse(readFileSync(f.sessionPath, 'utf8'));
  persisted.review.conflictDecisions[0].previewFingerprint = 'bad';
  writeFileSync(f.sessionPath, JSON.stringify(persisted, null, 2) + '\n', 'utf8');

  await assert.rejects(
    listConflictDecisions(f.options),
    /invalid update session|invalid conflict review container/,
  );
});
