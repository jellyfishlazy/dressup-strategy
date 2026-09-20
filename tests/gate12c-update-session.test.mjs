import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  UPDATE_SESSION_FORMAT_VERSION,
  UPDATE_SESSION_KIND,
  cancelUpdateSession,
  completeUpdateSession,
  createUpdateSession,
  getCurrentSession,
  listUpdateSessions,
  loadUpdateSession,
  sessionValidationErrors,
  setCurrentSession,
} from '../scripts/update-session.mjs';

function hashBytes(value) {
  return createHash('sha256').update(value).digest('hex');
}

function fakeSourceSnapshot() {
  return {
    sourceRoot: 'C:/fixture/source',
    sameRoot: true,
    files: {
      wardrobe: 'C:/fixture/source/wardrobe.js',
      levels: 'C:/fixture/source/levels.js',
    },
    hashes: {
      wardrobe: 'a'.repeat(64),
      levels: 'b'.repeat(64),
    },
    wardrobe: {
      count: 10,
      columnLengths: { 20: 10 },
      lastUpdated: '2026/9/20',
      warnings: [],
    },
    levels: {
      counts: {
        themeFilter: 2,
        competitionsRaw: 0,
        extraRaw: 0,
        tasksRaw: 0,
        levelsRaw: 3,
        dreamWeavingRaw: 0,
        levelFilters: 1,
        levelBonus: 1,
        addSkillsInfo: 3,
        addHintInfo: 2,
        bundles: 3,
        orphanMetadata: 0,
      },
      warnings: [],
    },
    warnings: [],
  };
}

function fixtureExternalSource() {
  const dir = mkdtempSync(join(tmpdir(), 'gate12c-source-'));
  const wardrobePath = join(dir, 'wardrobe.js');
  const levelsPath = join(dir, 'levels.js');
  const row = [
    'Hair', 'Hair', '001', '3',
    '', 'S', '', 'A', '', 'B', '', 'A', 'C', '',
    'POP', 'Store', '', 'V1',
    'extra-a', 'extra-b',
  ];

  writeFileSync(
    wardrobePath,
    [
      'var wardrobe = ' + JSON.stringify([row]) + ';',
      "var wardrobe_lastupd = '2026/9/20';",
      '',
    ].join('\n'),
    'utf8',
  );

  writeFileSync(
    levelsPath,
    [
      'var themeFilter = [["Chapter", "Stage: 1-"]];',
      'var competitionsRaw = {};',
      'var extraRaw = {};',
      'var tasksRaw = {};',
      'var levelsRaw = {"1-1": [1, 2, 3, 1, 0.5]};',
      'var dreamWeavingRaw = {};',
      'function weightedFilter(tagWhitelist, nameWhitelist, weight) { return {tagWhitelist,nameWhitelist,weight,filter:function(){}}; }',
      'function normalFilter(tagWhitelist, nameWhitelist) { return weightedFilter(tagWhitelist, nameWhitelist == null ? null : nameWhitelist, 10); }',
      'var levelFilters = {};',
      'function bonusInfo(base, weight, tag, replace) { return {base,weight,tag,replace}; }',
      'function addBonusInfo(base, weight, tag) { return bonusInfo(base, weight, tag, false); }',
      'function replaceBonusInfo(base, weight, tag) { return bonusInfo(base, weight, tag, true); }',
      'var levelBonus = {};',
      'var addSkillsInfo = {"1-1": [null, ["Smile"]]};',
      'var addHintInfo = {"1-1": [["Hint"], [""], [""]]};',
      '',
    ].join('\n'),
    'utf8',
  );

  return { dir, wardrobePath, levelsPath };
}

test('Gate 12C creates a persistent draft session and makes it current', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'gate12c-workspace-'));
  const now = new Date('2026-09-20T10:20:30.000Z');
  const session = createUpdateSession({
    name: '2026/09/20 遊戲更新',
    note: 'first session',
    now,
    workspace,
    sourceSnapshot: fakeSourceSnapshot(),
  });

  assert.equal(session.formatVersion, UPDATE_SESSION_FORMAT_VERSION);
  assert.equal(session.kind, UPDATE_SESSION_KIND);
  assert.equal(session.status, 'draft');
  assert.equal(session.name, '2026/09/20 遊戲更新');
  assert.match(session.id, /^20260920102030-2026-09-20-[0-9a-f]{8}$/);
  assert.deepEqual(session.plan, { wardrobe: [], levels: [] });
  assert.deepEqual(session.collection, { wardrobe: [], levels: [] });

  const current = getCurrentSession({ workspace });
  assert.equal(current.id, session.id);
  assert.ok(existsSync(join(workspace, 'sessions', session.id, 'session.json')));
  assert.ok(existsSync(join(workspace, 'current.json')));
});

test('Gate 12C Chinese session names receive distinct stable fingerprints', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'gate12c-workspace-'));
  const now = new Date('2026-09-20T10:20:30.000Z');

  const first = createUpdateSession({
    name: '遊戲更新甲',
    now,
    workspace,
    sourceSnapshot: fakeSourceSnapshot(),
  });
  const second = createUpdateSession({
    name: '遊戲更新乙',
    now,
    workspace,
    sourceSnapshot: fakeSourceSnapshot(),
  });

  assert.notEqual(first.id, second.id);
  assert.match(first.id, /-update-[0-9a-f]{8}$/);
  assert.match(second.id, /-update-[0-9a-f]{8}$/);
  assert.equal(getCurrentSession({ workspace }).id, second.id);
});

test('Gate 12C lists sessions newest-first and can switch the current draft', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'gate12c-workspace-'));
  const first = createUpdateSession({
    name: 'First',
    now: new Date('2026-09-20T10:00:00.000Z'),
    workspace,
    sourceSnapshot: fakeSourceSnapshot(),
  });
  const second = createUpdateSession({
    name: 'Second',
    now: new Date('2026-09-20T11:00:00.000Z'),
    workspace,
    sourceSnapshot: fakeSourceSnapshot(),
  });

  assert.deepEqual(listUpdateSessions({ workspace }).map(session => session.id), [second.id, first.id]);
  assert.equal(getCurrentSession({ workspace }).id, second.id);

  setCurrentSession(first.id, { workspace });
  assert.equal(getCurrentSession({ workspace }).id, first.id);
});

test('Gate 12C completed and cancelled sessions clear current state and cannot be reactivated', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'gate12c-workspace-'));
  const first = createUpdateSession({
    name: 'Complete Me',
    now: new Date('2026-09-20T10:00:00.000Z'),
    workspace,
    sourceSnapshot: fakeSourceSnapshot(),
  });

  const completed = completeUpdateSession(first.id, {
    workspace,
    now: new Date('2026-09-20T12:00:00.000Z'),
  });
  assert.equal(completed.status, 'completed');
  assert.equal(completed.completedAt, '2026-09-20T12:00:00.000Z');
  assert.equal(getCurrentSession({ workspace }), null);
  assert.throws(() => setCurrentSession(first.id, { workspace }), /only draft sessions can be current/);

  const second = createUpdateSession({
    name: 'Cancel Me',
    now: new Date('2026-09-20T13:00:00.000Z'),
    workspace,
    sourceSnapshot: fakeSourceSnapshot(),
  });
  const cancelled = cancelUpdateSession(second.id, {
    workspace,
    now: new Date('2026-09-20T14:00:00.000Z'),
  });
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.cancelledAt, '2026-09-20T14:00:00.000Z');
  assert.equal(getCurrentSession({ workspace }), null);
});

test('Gate 12C captures an external source snapshot without copying the full source dataset', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'gate12c-workspace-'));
  const source = fixtureExternalSource();

  const wardrobeBefore = hashBytes(readFileSync(source.wardrobePath));
  const levelsBefore = hashBytes(readFileSync(source.levelsPath));

  const session = createUpdateSession({
    name: 'Source Snapshot',
    now: new Date('2026-09-20T15:00:00.000Z'),
    workspace,
    sourceOptions: {
      wardrobePath: source.wardrobePath,
      levelsPath: source.levelsPath,
    },
  });

  assert.equal(session.sourceSnapshot.hashes.wardrobe, wardrobeBefore);
  assert.equal(session.sourceSnapshot.hashes.levels, levelsBefore);
  assert.equal(session.sourceSnapshot.wardrobe.count, 1);
  assert.equal(session.sourceSnapshot.levels.counts.bundles, 1);
  assert.equal('items' in session.sourceSnapshot.wardrobe, false);
  assert.equal('bundles' in session.sourceSnapshot.levels, false);
  assert.equal(hashBytes(readFileSync(source.wardrobePath)), wardrobeBefore);
  assert.equal(hashBytes(readFileSync(source.levelsPath)), levelsBefore);
});

test('Gate 12C does not silently overwrite a session with the same id', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'gate12c-workspace-'));
  const options = {
    name: 'Same Update',
    now: new Date('2026-09-20T16:00:00.000Z'),
    workspace,
    sourceSnapshot: fakeSourceSnapshot(),
  };

  const first = createUpdateSession(options);
  assert.throws(() => createUpdateSession(options), /already exists/);
  assert.equal(loadUpdateSession(first.id, { workspace }).name, 'Same Update');
});

test('Gate 12C rejects malformed persisted sessions instead of treating them as current work', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'gate12c-workspace-'));
  const session = createUpdateSession({
    name: 'Tamper Test',
    now: new Date('2026-09-20T17:00:00.000Z'),
    workspace,
    sourceSnapshot: fakeSourceSnapshot(),
  });

  const path = join(workspace, 'sessions', session.id, 'session.json');
  const tampered = JSON.parse(readFileSync(path, 'utf8'));
  tampered.sourceSnapshot.hashes.levels = 'bad';
  writeFileSync(path, JSON.stringify(tampered), 'utf8');

  assert.ok(sessionValidationErrors(tampered).some(error => error.includes('invalid source hash: levels')));
  assert.throws(() => loadUpdateSession(session.id, { workspace }), /invalid update session/);
});

test('Gate 12C session writes leave no temporary atomic-write files behind', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'gate12c-workspace-'));
  const session = createUpdateSession({
    name: 'Atomic Session',
    now: new Date('2026-09-20T18:00:00.000Z'),
    workspace,
    sourceSnapshot: fakeSourceSnapshot(),
  });

  const sessionDir = join(workspace, 'sessions', session.id);
  const names = [
    ...readdirSync(workspace),
    ...readdirSync(sessionDir),
  ];
  assert.equal(names.some(name => name.includes('.tmp-')), false);
});
