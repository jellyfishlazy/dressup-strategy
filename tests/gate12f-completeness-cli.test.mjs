import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readExternalSourceSnapshot } from '../scripts/external-source-reader.mjs';
import { createUpdateSession } from '../scripts/update-session.mjs';
import { addWardrobeToUpdate } from '../scripts/update-wardrobe.mjs';
import { addLevelsToUpdate } from '../scripts/update-levels.mjs';
import { parseUpdateCompletenessArgs } from '../scripts/update-completeness-cli.mjs';

const CLI = fileURLToPath(new URL('../scripts/update-completeness-cli.mjs', import.meta.url));

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'gate12f-cli-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const wardrobePath = join(root, 'wardrobe.js');
  const levelsPath = join(root, 'levels.js');
  const workspace = join(root, 'update-workspace');

  const wardrobe = [
    ['Alpha Hair', 'Hair', '001', 3, '', 'S', '', 'A', '', 'B', '', 'A', 'C', '', 'POP', 'Store', '', 'V1', 'x', 'y'],
    ['Alpha Shoes', 'Shoes', '002', 3, '', 'S', '', 'A', '', 'B', '', 'A', 'C', '', 'POP', 'Store', '', 'V1', 'x', 'y'],
  ];
  writeFileSync(wardrobePath, 'var wardrobe = ' + JSON.stringify(wardrobe) + ';\n', 'utf8');
  writeFileSync(levelsPath, [
    'var themeFilter = [["Chapter 1", "关卡: 1-"]];',
    'var competitionsRaw = {};',
    'var extraRaw = {};',
    'var tasksRaw = {};',
    'var levelsRaw = {"1-1": [1,-2,3,1,0.5], "1-2": [2,1,-1,3,0.8]};',
    'var dreamWeavingRaw = {};',
    'function weightedFilter(tagWhitelist, nameWhitelist, weight) { return {tagWhitelist,nameWhitelist,weight,filter:function(){}}; }',
    'function normalFilter(tagWhitelist, nameWhitelist) { return weightedFilter(tagWhitelist, nameWhitelist == null ? null : nameWhitelist, 10); }',
    'var levelFilters = {"1-1": normalFilter("POP")};',
    'function bonusInfo(base, weight, tag, replace) { return {base,weight,tag,replace}; }',
    'function addBonusInfo(base, weight, tag) { return bonusInfo(base, weight, tag, false); }',
    'function replaceBonusInfo(base, weight, tag) { return bonusInfo(base, weight, tag, true); }',
    'var levelBonus = {};',
    'var addSkillsInfo = {};',
    'var addHintInfo = {};',
    '',
  ].join('\n'), 'utf8');

  const snapshot = readExternalSourceSnapshot({ wardrobePath, levelsPath });
  const session = createUpdateSession({
    name: 'Gate 12F CLI',
    workspace,
    sourceSnapshot: snapshot,
  });
  return {
    root,
    workspace,
    snapshot,
    session,
  };
}

function invoke(fx, args) {
  const result = spawnSync(process.execPath, [CLI, ...args, '--workspace=' + fx.workspace], {
    encoding: 'utf8',
    cwd: fx.root,
    timeout: 15000,
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

test('Gate 12F CLI parses plan keys, hashes, explicit session and workspace', () => {
  const wardrobeHash = 'a'.repeat(64);
  const levelsHash = 'b'.repeat(64);
  assert.deepEqual(parseUpdateCompletenessArgs([
    'plan-add',
    '--session=update-123',
    '--wardrobe-key=Hair|001',
    '--wardrobe-key=Shoes|002',
    '--level-key=1-1',
    '--wardrobe-source-hash=' + wardrobeHash,
    '--levels-source-hash=' + levelsHash,
    '--workspace=./fixture',
  ]), {
    command: 'plan-add',
    sessionId: 'update-123',
    wardrobeKeys: ['Hair|001', 'Shoes|002'],
    levelKeys: ['1-1'],
    expectedWardrobeSourceHash: wardrobeHash,
    expectedLevelsSourceHash: levelsHash,
    workspace: resolve('./fixture'),
  });
  assert.deepEqual(parseUpdateCompletenessArgs([]), { command: 'check' });
});

test('Gate 12F CLI rejects unknown, duplicate, malformed and cross-command options', () => {
  for (const args of [
    ['unknown'],
    ['check', '--wardrobe-key=Hair|001'],
    ['plan-list', '--level-key=1-1'],
    ['plan-add'],
    ['plan-remove'],
    ['plan-add', '--wardrobe-key='],
    ['plan-add', '--level-key='],
    ['check', '--session='],
    ['check', '--workspace='],
    ['plan-add', '--wardrobe-key=Hair|001', '--wardrobe-source-hash=bad'],
    ['plan-add', '--wardrobe-key=Hair|001', '--levels-source-hash=bad'],
    ['check', '--session=a', '--session=b'],
  ]) {
    assert.throws(() => parseUpdateCompletenessArgs(args), undefined, JSON.stringify(args));
  }
});

test('Gate 12F CLI help succeeds without session or source access', () => {
  for (const args of [['--help'], ['check', '--help']]) {
    const result = spawnSync(process.execPath, [CLI, ...args], {
      encoding: 'utf8',
      timeout: 15000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /data:session:completeness/);
    assert.match(result.stdout, /missing/);
    assert.match(result.stdout, /unplannedCollected/);
  }
});

test('Gate 12F CLI plans both domains and reports exact missing planned items', t => {
  const fx = fixture(t);

  const added = jsonSuccess(fx, [
    'plan-add',
    '--wardrobe-key=Hair|001',
    '--wardrobe-key=Shoes|002',
    '--level-key=1-1',
    '--level-key=1-2',
    '--wardrobe-source-hash=' + fx.snapshot.hashes.wardrobe,
    '--levels-source-hash=' + fx.snapshot.hashes.levels,
  ]);
  assert.deepEqual(added.added, {
    wardrobe: ['Hair|001', 'Shoes|002'],
    levels: ['1-1', '1-2'],
  });

  const options = { workspace: fx.workspace, sessionId: fx.session.id };
  addWardrobeToUpdate({ ...options, keys: ['Hair|001'] });
  addLevelsToUpdate({ ...options, keys: ['1-1'] });

  const result = jsonSuccess(fx, ['check']);
  assert.equal(result.complete, false);
  assert.equal(result.overall.percent, 50);
  assert.deepEqual(result.wardrobe.missingItems.map(item => item.key), ['Shoes|002']);
  assert.deepEqual(result.levels.missingItems.map(item => item.key), ['1-2']);

  const plan = jsonSuccess(fx, ['plan-list']);
  assert.equal(plan.wardrobe.length, 2);
  assert.equal(plan.levels.length, 2);
});

test('Gate 12F CLI plan-remove updates denominator and can reach complete', t => {
  const fx = fixture(t);
  jsonSuccess(fx, [
    'plan-add',
    '--wardrobe-key=Hair|001',
    '--level-key=1-1',
  ]);

  const options = { workspace: fx.workspace, sessionId: fx.session.id };
  addWardrobeToUpdate({ ...options, keys: ['Hair|001'] });

  let result = jsonSuccess(fx, ['check']);
  assert.equal(result.overall.percent, 50);
  assert.equal(result.complete, false);

  const removed = jsonSuccess(fx, ['plan-remove', '--level-key=1-1']);
  assert.deepEqual(removed.removed, { wardrobe: [], levels: ['1-1'] });

  result = jsonSuccess(fx, ['check']);
  assert.equal(result.overall.percent, 100);
  assert.equal(result.complete, true);
});

test('Gate 12F CLI reports empty plan as undefined completeness instead of 100 percent', t => {
  const fx = fixture(t);
  const result = jsonSuccess(fx, ['check']);
  assert.equal(result.planDefined, false);
  assert.equal(result.complete, false);
  assert.equal(result.overall.percent, null);
});

test('Gate 12F CLI npm entry is wired to the completeness command', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(
    pkg.scripts['data:session:completeness'],
    'node scripts/update-completeness-cli.mjs',
  );
});
