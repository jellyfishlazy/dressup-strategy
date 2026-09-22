import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readExternalSourceSnapshot } from '../scripts/external-source-reader.mjs';
import { completeUpdateSession, createUpdateSession } from '../scripts/update-session.mjs';
import { parseUpdateLevelsArgs } from '../scripts/update-levels-cli.mjs';

const CLI = fileURLToPath(new URL('../scripts/update-levels-cli.mjs', import.meta.url));

function source() {
  return [
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
    'var levelBonus = {"1-1": [addBonusInfo("B", 0.25, "POP")]};',
    'var addSkillsInfo = {"1-1": [null, ["Smile", "Critic"]]};',
    'var addHintInfo = {"1-1": [["Hint"], ["Allowed"], ["Forbidden"]]};',
    '',
  ].join('\n');
}

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'gate12e-cli-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const wardrobePath = join(root, 'wardrobe.js');
  const levelsPath = join(root, 'levels.js');
  const workspace = join(root, 'update-workspace');
  writeFileSync(
    wardrobePath,
    'var wardrobe = [["Item","Hair","001",1,"S","","A","","B","","C","","A","","POP","Store","","V1"]];\n',
    'utf8',
  );
  writeFileSync(levelsPath, source(), 'utf8');
  const snapshot = readExternalSourceSnapshot({ wardrobePath, levelsPath });
  const session = createUpdateSession({
    name: 'CLI Gate 12E',
    workspace,
    sourceSnapshot: snapshot,
  });
  const sessionPath = join(workspace, 'sessions', session.id, 'session.json');
  return { root, workspace, wardrobePath, levelsPath, snapshot, session, sessionPath };
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

test('Gate 12E CLI parses search filters, session, pagination and repeated add keys', () => {
  assert.deepEqual(parseUpdateLevelsArgs([
    'search',
    '--session=update-123',
    '--source-key=1-1',
    '--theme=Chapter 1',
    '--label=1-1',
    '--offset=2',
    '--limit=10',
    '--workspace=./fixture',
  ]), {
    command: 'search',
    sessionId: 'update-123',
    sourceKey: '1-1',
    theme: 'Chapter 1',
    label: '1-1',
    offset: 2,
    limit: 10,
    workspace: resolve('./fixture'),
  });

  const hash = 'a'.repeat(64);
  assert.deepEqual(parseUpdateLevelsArgs([
    'add', '--key=1-1', '--key=1-2', '--source-hash=' + hash,
  ]), {
    command: 'add',
    keys: ['1-1', '1-2'],
    expectedSourceHash: hash,
  });
  assert.deepEqual(parseUpdateLevelsArgs([]), { command: 'list' });
});

test('Gate 12E CLI rejects unknown, duplicate, malformed and cross-command options', () => {
  for (const args of [
    ['unknown'],
    ['list', '--query=x'],
    ['search', '--key=1-1'],
    ['add'],
    ['remove'],
    ['add', '--key='],
    ['list', '--session='],
    ['list', '--workspace='],
    ['search', '--limit=1', '--limit=2'],
    ['search', '--name=x'],
    ['remove', '--key=1-1', '--source-hash=' + 'a'.repeat(64)],
    ['add', '--key=1-1', '--source-hash=bad'],
  ]) {
    assert.throws(() => parseUpdateLevelsArgs(args), undefined, JSON.stringify(args));
  }

  for (const value of ['-1', '1.5', '2x', '1e2', 'Infinity', '9007199254740992', '']) {
    assert.throws(() => parseUpdateLevelsArgs(['search', '--offset=' + value]));
  }
  for (const value of ['0', '501', '-1', '1.5']) {
    assert.throws(() => parseUpdateLevelsArgs(['search', '--limit=' + value]));
  }
});

test('Gate 12E CLI help succeeds without session or source access', () => {
  for (const args of [['--help'], ['search', '--help']]) {
    const result = spawnSync(process.execPath, [CLI, ...args], {
      encoding: 'utf8',
      timeout: 15000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /data:session:levels/);
    assert.match(result.stdout, /levelsRaw/);
    assert.match(result.stdout, /themeFilter/);
  }
});

test('Gate 12E CLI searches, auto-collects all related fields, persists across restart and removes', t => {
  const fx = fixture(t);
  const found = jsonSuccess(fx, ['search', '--source-key=1-1']);
  assert.equal(found.total, 1);
  assert.equal(found.items[0].key, '1-1');
  assert.equal(found.items[0].collected, false);

  const added = jsonSuccess(fx, [
    'add',
    '--key=1-1',
    '--source-hash=' + found.sourceHash,
  ]);
  assert.deepEqual(added.addedKeys, ['1-1']);
  const item = added.session.collection.levels[0];
  assert.deepEqual(item.levelsRaw, [1, -2, 3, 1, 0.5]);
  assert.deepEqual(item.levelFilters, {
    tagWhitelist: 'POP',
    nameWhitelist: null,
    weight: 10,
  });
  assert.deepEqual(item.levelBonus, [{
    base: 'B', weight: 0.25, tag: 'POP', replace: false,
  }]);
  assert.deepEqual(item.skills, [null, ['Smile', 'Critic']]);
  assert.deepEqual(item.hint, [['Hint'], ['Allowed'], ['Forbidden']]);
  assert.deepEqual(item.themeFilter, [{ name: 'Chapter 1', prefix: '关卡: 1-' }]);

  const saved = readFileSync(fx.sessionPath);
  const repeat = jsonSuccess(fx, ['add', '--key=1-1']);
  assert.deepEqual(repeat.addedKeys, []);
  assert.deepEqual(readFileSync(fx.sessionPath), saved);

  assert.equal(jsonSuccess(fx, ['list']).count, 1);
  assert.equal(jsonSuccess(fx, ['search', '--source-key=1-1']).items[0].collected, true);

  const removed = jsonSuccess(fx, ['remove', '--key=1-1']);
  assert.deepEqual(removed.removedKeys, ['1-1']);
  assert.equal(jsonSuccess(fx, ['list']).count, 0);
});

test('Gate 12E CLI fails whole add batch on unknown key or source hash mismatch', t => {
  const fx = fixture(t);
  const before = readFileSync(fx.sessionPath);
  for (const args of [
    ['add', '--key=1-1', '--key=missing'],
    ['add', '--key=1-1', '--source-hash=' + 'f'.repeat(64)],
  ]) {
    const result = invoke(fx, args);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /ERROR/);
    assert.deepEqual(readFileSync(fx.sessionPath), before);
  }
});

test('Gate 12E CLI blocks drift, keeps saved list/remove offline and rejects archived mutations', t => {
  const fx = fixture(t);
  jsonSuccess(fx, ['add', '--key=1-1']);
  const before = readFileSync(fx.sessionPath);

  writeFileSync(fx.levelsPath, readFileSync(fx.levelsPath, 'utf8') + '// changed\n', 'utf8');
  for (const args of [['search'], ['add', '--key=1-2']]) {
    const result = invoke(fx, args);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /ERROR/);
    assert.deepEqual(readFileSync(fx.sessionPath), before);
  }

  rmSync(fx.levelsPath);
  assert.equal(jsonSuccess(fx, ['list']).count, 1);
  assert.deepEqual(jsonSuccess(fx, ['remove', '--key=1-1']).removedKeys, ['1-1']);

  const archivedFx = fixture(t);
  jsonSuccess(archivedFx, ['add', '--key=1-1']);
  completeUpdateSession(archivedFx.session.id, { workspace: archivedFx.workspace });
  const archivedBefore = readFileSync(archivedFx.sessionPath);
  assert.equal(jsonSuccess(archivedFx, ['list', '--session=' + archivedFx.session.id]).count, 1);

  for (const args of [
    ['add', '--key=1-2', '--session=' + archivedFx.session.id],
    ['remove', '--key=1-1', '--session=' + archivedFx.session.id],
  ]) {
    const result = invoke(archivedFx, args);
    assert.equal(result.status, 1);
    assert.deepEqual(readFileSync(archivedFx.sessionPath), archivedBefore);
  }
});

test('Gate 12E CLI npm entry is wired to the level collection command', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts['data:session:levels'], 'node scripts/update-levels-cli.mjs');
});
