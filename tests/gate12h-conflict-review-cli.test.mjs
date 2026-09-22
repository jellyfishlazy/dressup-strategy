import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readExternalSourceSnapshot } from '../scripts/external-source-reader.mjs';
import { createUpdateSession } from '../scripts/update-session.mjs';
import { addWardrobeToUpdate } from '../scripts/update-wardrobe.mjs';
import { addLevelsToUpdate } from '../scripts/update-levels.mjs';
import { addPlannedItems } from '../scripts/update-completeness.mjs';
import { parseUpdateConflictReviewArgs } from '../scripts/update-conflict-review-cli.mjs';

const CLI = fileURLToPath(new URL('../scripts/update-conflict-review-cli.mjs', import.meta.url));

function extWardrobeRow(name, type, id) {
  return [
    name, type, id, '3',
    '', 'S', '', 'A', '', 'B', '', 'A', 'C', '',
    'POP', 'Store', 'Set', 'V1',
    'extra-a', 'extra-b',
  ];
}

function localWardrobeRow(name, type, id) {
  return extWardrobeRow(name, type, id).slice(0, 18);
}

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'gate12h-cli-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const wardrobePath = join(root, 'external-wardrobe.js');
  const levelsPath = join(root, 'external-levels.js');
  const localWardrobePath = join(root, 'local-wardrobe.js');
  const localLevelsPath = join(root, 'local-levels.js');
  const workspace = join(root, 'update-workspace');

  writeFileSync(
    wardrobePath,
    'var wardrobe = ' + JSON.stringify([
      extWardrobeRow('Source Dress', '连衣裙', '003'),
    ]) + ';\n',
    'utf8',
  );
  writeFileSync(levelsPath, [
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
  ].join('\n'), 'utf8');

  writeFileSync(
    localWardrobePath,
    'var wardrobe = ' + JSON.stringify([
      localWardrobeRow('Localized Dress', '連身裙', '003'),
    ]) + ';\n',
    'utf8',
  );
  writeFileSync(localLevelsPath, [
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
  ].join('\n'), 'utf8');

  const snapshot = readExternalSourceSnapshot({ wardrobePath, levelsPath });
  const session = createUpdateSession({
    name: 'Gate 12H CLI fixture',
    workspace,
    sourceSnapshot: snapshot,
  });
  const options = { workspace, sessionId: session.id };
  addPlannedItems({
    ...options,
    wardrobeKeys: ['连衣裙|003'],
    levelKeys: ['1-1'],
  });
  addWardrobeToUpdate({ ...options, keys: ['连衣裙|003'] });
  addLevelsToUpdate({ ...options, keys: ['1-1'] });

  return {
    root,
    workspace,
    session,
    localWardrobePath,
    localLevelsPath,
  };
}

function targetArgs(fx) {
  return [
    '--workspace=' + fx.workspace,
    '--wardrobe-target=' + fx.localWardrobePath,
    '--levels-target=' + fx.localLevelsPath,
  ];
}

function invoke(fx, args) {
  const result = spawnSync(process.execPath, [CLI, ...args, ...targetArgs(fx)], {
    encoding: 'utf8',
    cwd: fx.root,
    timeout: 20000,
  });
  assert.equal(result.error, undefined, result.error?.message);
  return result;
}

function jsonSuccess(fx, args) {
  const result = invoke(fx, args);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stderr, '');
  return JSON.parse(result.stdout);
}

test('Gate 12H CLI parses review commands and strict options', () => {
  assert.deepEqual(parseUpdateConflictReviewArgs([
    'set',
    '--domain=wardrobe',
    '--source-key=连衣裙|003',
    '--decision=manual-resolution',
    '--note=reviewed',
    '--resolution-file=./resolution.json',
    '--session=update-123',
    '--workspace=./workspace',
    '--wardrobe-target=./wardrobe.js',
    '--levels-target=./levels.js',
  ]), {
    command: 'set',
    domain: 'wardrobe',
    sourceKey: '连衣裙|003',
    decision: 'manual-resolution',
    note: 'reviewed',
    resolutionFile: resolve('./resolution.json'),
    sessionId: 'update-123',
    workspace: resolve('./workspace'),
    wardrobeTargetPath: resolve('./wardrobe.js'),
    levelsTargetPath: resolve('./levels.js'),
  });
  assert.deepEqual(parseUpdateConflictReviewArgs([]), { command: 'conflicts' });
});

test('Gate 12H CLI rejects unknown, duplicate and incompatible options', () => {
  for (const args of [
    ['unknown'],
    ['set', '--domain=wardrobe', '--source-key=x'],
    ['set', '--domain=bad', '--source-key=x', '--decision=keep-local'],
    ['set', '--domain=wardrobe', '--source-key=x', '--decision=bad'],
    ['set', '--domain=wardrobe', '--source-key=x', '--decision=manual-resolution'],
    ['set', '--domain=wardrobe', '--source-key=x', '--decision=keep-local', '--resolution-file=a.json'],
    ['show', '--domain=wardrobe'],
    ['remove', '--source-key=x'],
    ['list', '--domain=wardrobe'],
    ['clear', '--source-key=x'],
    ['list', '--session=a', '--session=b'],
    ['conflicts', '--workspace'],
  ]) {
    assert.throws(() => parseUpdateConflictReviewArgs(args), undefined, JSON.stringify(args));
  }
});

test('Gate 12H CLI help succeeds without session access', () => {
  for (const args of [['--help'], ['conflicts', '--help']]) {
    const result = spawnSync(process.execPath, [CLI, ...args], {
      encoding: 'utf8',
      timeout: 15000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /data:session:review/);
    assert.match(result.stdout, /keep-local/);
    assert.match(result.stdout, /manual-resolution/);
    assert.match(result.stdout, /stale/);
  }
});

test('Gate 12H CLI persists, lists, shows and removes a conflict decision', t => {
  const fx = fixture(t);

  let conflicts = jsonSuccess(fx, ['conflicts']);
  assert.equal(conflicts.conflictCount, 2);
  assert.equal(conflicts.reviewedCount, 0);

  const set = jsonSuccess(fx, [
    'set',
    '--domain=wardrobe',
    '--source-key=连衣裙|003',
    '--decision=keep-local',
    '--note=keep localized value',
  ]);
  assert.equal(set.changed, true);
  assert.equal(set.decision.decision, 'keep-local');

  const list = jsonSuccess(fx, ['list']);
  assert.equal(list.count, 1);
  assert.equal(list.decisions[0].state, 'current');

  const shown = jsonSuccess(fx, [
    'show',
    '--domain=wardrobe',
    '--source-key=连衣裙|003',
  ]);
  assert.equal(shown.note, 'keep localized value');

  conflicts = jsonSuccess(fx, ['conflicts']);
  assert.equal(conflicts.reviewedCount, 1);
  assert.equal(conflicts.unresolvedCount, 1);

  const removed = jsonSuccess(fx, [
    'remove',
    '--domain=wardrobe',
    '--source-key=连衣裙|003',
  ]);
  assert.equal(removed.removed, true);
  assert.equal(jsonSuccess(fx, ['list']).count, 0);
});

test('Gate 12H CLI loads and validates manual resolution JSON', t => {
  const fx = fixture(t);
  const resolutionPath = join(fx.root, 'resolution.json');
  writeFileSync(resolutionPath, JSON.stringify({
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
  }), 'utf8');

  const set = jsonSuccess(fx, [
    'set',
    '--domain=levels',
    '--source-key=1-1',
    '--decision=manual-resolution',
    '--resolution-file=' + resolutionPath,
  ]);
  assert.equal(set.decision.resolvedPayload.kind, 'level-entries');
  assert.equal(set.decision.resolvedTargetKey, 'I-1-1');

  const cleared = jsonSuccess(fx, ['clear']);
  assert.equal(cleared.removedCount, 1);
  assert.equal(jsonSuccess(fx, ['list']).count, 0);
});

test('Gate 12H CLI rejects use-source for unsafe level deletion conflict', t => {
  const fx = fixture(t);
  const result = invoke(fx, [
    'set',
    '--domain=levels',
    '--source-key=1-1',
    '--decision=use-source',
  ]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /cannot safely represent source metadata deletion/);
});

test('Gate 12H CLI npm entry is wired to the review command', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(
    pkg.scripts['data:session:review'],
    'node scripts/update-conflict-review-cli.mjs',
  );
});
