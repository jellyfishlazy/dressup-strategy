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
import {
  readExternalSourceSnapshot,
} from '../scripts/external-source-reader.mjs';
import {
  completeUpdateSession,
  createUpdateSession,
  loadUpdateSession,
} from '../scripts/update-session.mjs';
import {
  addLevelsToUpdate,
  listUpdateLevels,
  removeLevelsFromUpdate,
  searchUpdateLevels,
} from '../scripts/update-levels.mjs';

function levelsSource() {
  return [
    'var themeFilter = [["Chapter 1", "关卡: 1-"], ["Chapter 2", "关卡: 2-"]];',
    'var competitionsRaw = {"Arena": [1,1,1,1,1]};',
    'var extraRaw = {};',
    'var tasksRaw = {};',
    'var levelsRaw = {"1-1": [1,-2,3,1,0.5], "1-2": [2,1,-1,3,0.8], "2-1": [1,1,1,1,1]};',
    'var dreamWeavingRaw = {};',
    'function weightedFilter(tagWhitelist, nameWhitelist, weight) { return {tagWhitelist,nameWhitelist,weight,filter:function(){}}; }',
    'function normalFilter(tagWhitelist, nameWhitelist) { return weightedFilter(tagWhitelist, nameWhitelist == null ? null : nameWhitelist, 10); }',
    'var levelFilters = {"1-1": normalFilter("POP"), "1-2": weightedFilter("FORMAL", null, 20)};',
    'function bonusInfo(base, weight, tag, replace) { return {base,weight,tag,replace}; }',
    'function addBonusInfo(base, weight, tag) { return bonusInfo(base, weight, tag, false); }',
    'function replaceBonusInfo(base, weight, tag) { return bonusInfo(base, weight, tag, true); }',
    'var levelBonus = {"1-1": [addBonusInfo("B", 0.25, "POP")]};',
    'var addSkillsInfo = {"1-1": [null, ["Smile", "Critic"]], "1-2": [["Smile"], null]};',
    'var addHintInfo = {"1-1": [["Hint"], ["Allowed"], ["Forbidden"]]};',
    '',
  ].join('\n');
}

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'gate12e-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const wardrobePath = join(root, 'wardrobe.js');
  const levelsPath = join(root, 'levels.js');
  const workspace = join(root, 'update-workspace');

  writeFileSync(
    wardrobePath,
    'var wardrobe = [["Item","Hair","001",1,"S","","A","","B","","C","","A","","POP","Store","","V1"]];\n',
    'utf8',
  );
  writeFileSync(levelsPath, levelsSource(), 'utf8');

  const snapshot = readExternalSourceSnapshot({ wardrobePath, levelsPath });
  const session = createUpdateSession({
    name: 'Gate 12E fixture',
    workspace,
    sourceSnapshot: snapshot,
  });
  const options = { workspace, sessionId: session.id };
  const sessionPath = join(workspace, 'sessions', session.id, 'session.json');
  return { root, wardrobePath, levelsPath, workspace, snapshot, session, options, sessionPath };
}

test('Gate 12E searches only levelsRaw with exact key, theme, query and stable pagination', t => {
  const f = fixture(t);
  const all = searchUpdateLevels(f.options);
  assert.equal(all.total, 3);
  assert.deepEqual(all.items.map(item => item.key), ['1-1', '1-2', '2-1']);
  assert.ok(!all.items.some(item => item.key === 'Arena'));

  const exact = searchUpdateLevels({ ...f.options, sourceKey: '1-1' });
  assert.equal(exact.total, 1);
  assert.equal(exact.items[0].runtimeLabel, '关卡: 1-1');

  const chapter = searchUpdateLevels({ ...f.options, theme: 'Chapter 1' });
  assert.deepEqual(chapter.items.map(item => item.key), ['1-1', '1-2']);

  const metadata = searchUpdateLevels({ ...f.options, query: 'Smile POP' });
  assert.deepEqual(metadata.items.map(item => item.key), ['1-1']);

  const page = searchUpdateLevels({ ...f.options, offset: 1, limit: 1 });
  assert.equal(page.total, 3);
  assert.deepEqual(page.items.map(item => item.key), ['1-2']);

  assert.throws(() => searchUpdateLevels({ ...f.options, offset: -1 }), /offset/);
  assert.throws(() => searchUpdateLevels({ ...f.options, limit: 501 }), /limit/);
});

test('Gate 12E add automatically collects levelsRaw, filter, bonus, skills, hint and themeFilter', t => {
  const f = fixture(t);
  const found = searchUpdateLevels({ ...f.options, sourceKey: '1-1' }).items[0];
  assert.equal(found.selectable, true);

  const result = addLevelsToUpdate({
    ...f.options,
    keys: ['1-1'],
    expectedSourceHash: f.snapshot.hashes.levels,
  });
  assert.deepEqual(result.addedKeys, ['1-1']);

  const item = result.session.collection.levels[0];
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
  assert.deepEqual(item.metadataPresence, {
    levelFilters: true,
    levelBonus: true,
    addSkillsInfo: true,
    addHintInfo: true,
  });
  assert.equal(item.sourceHash, f.snapshot.hashes.levels);
  assert.equal(item.sourcePath, f.levelsPath);
});

test('Gate 12E preserves missing optional metadata as null while still collecting matching themeFilter', t => {
  const f = fixture(t);
  const result = addLevelsToUpdate({ ...f.options, keys: ['2-1'] });
  const item = result.session.collection.levels[0];

  assert.deepEqual(item.levelsRaw, [1, 1, 1, 1, 1]);
  assert.equal(item.levelFilters, null);
  assert.equal(item.levelBonus, null);
  assert.equal(item.skills, null);
  assert.equal(item.hint, null);
  assert.deepEqual(item.metadataPresence, {
    levelFilters: false,
    levelBonus: false,
    addSkillsInfo: false,
    addHintInfo: false,
  });
  assert.deepEqual(item.themeFilter, [{ name: 'Chapter 2', prefix: '关卡: 2-' }]);
});

test('Gate 12E repeat add and removal are idempotent and leave no-op session bytes unchanged', t => {
  const f = fixture(t);
  addLevelsToUpdate({ ...f.options, keys: ['1-1', '1-2'] });
  const beforeRepeat = readFileSync(f.sessionPath);

  const repeat = addLevelsToUpdate({ ...f.options, keys: ['1-1', '1-1'] });
  assert.deepEqual(repeat.addedKeys, []);
  assert.deepEqual(repeat.skippedKeys, ['1-1', '1-1']);
  assert.deepEqual(readFileSync(f.sessionPath), beforeRepeat);

  const removed = removeLevelsFromUpdate({ ...f.options, keys: ['1-1'] });
  assert.deepEqual(removed.removedKeys, ['1-1']);
  assert.equal(listUpdateLevels(f.options).count, 1);

  const beforeNoop = readFileSync(f.sessionPath);
  const noop = removeLevelsFromUpdate({ ...f.options, keys: ['1-1'] });
  assert.deepEqual(noop.removedKeys, []);
  assert.deepEqual(readFileSync(f.sessionPath), beforeNoop);
});

test('Gate 12E rejects source drift and mismatched expected hash but allows offline list/remove', t => {
  const f = fixture(t);
  addLevelsToUpdate({ ...f.options, keys: ['1-1'] });
  const before = readFileSync(f.sessionPath);

  assert.throws(
    () => addLevelsToUpdate({ ...f.options, keys: ['1-2'], expectedSourceHash: 'f'.repeat(64) }),
    /expected source hash mismatch/,
  );
  assert.deepEqual(readFileSync(f.sessionPath), before);

  writeFileSync(f.levelsPath, readFileSync(f.levelsPath, 'utf8') + '// changed\n', 'utf8');
  assert.throws(() => searchUpdateLevels(f.options), /source drift/);
  assert.throws(() => addLevelsToUpdate({ ...f.options, keys: ['1-2'] }), /source drift/);
  assert.deepEqual(readFileSync(f.sessionPath), before);

  unlinkSync(f.levelsPath);
  assert.equal(listUpdateLevels(f.options).count, 1);
  assert.deepEqual(removeLevelsFromUpdate({ ...f.options, keys: ['1-1'] }).removedKeys, ['1-1']);
});

test('Gate 12E blocks invalid or ambiguous source bundles atomically', t => {
  const f = fixture(t);
  let source = readFileSync(f.levelsPath, 'utf8');
  source = source.replace(
    'var levelsRaw = {"1-1": [1,-2,3,1,0.5], "1-2": [2,1,-1,3,0.8], "2-1": [1,1,1,1,1]};',
    'var levelsRaw = {"1-1": [1,-2,3,1,0.5], "1-1": [2,2,2,2,2], "1-2": [2,1,-1,3,0.8], "2-1": [1,1,1,1,1]};',
  );
  writeFileSync(f.levelsPath, source, 'utf8');

  const snapshot = readExternalSourceSnapshot({
    wardrobePath: f.wardrobePath,
    levelsPath: f.levelsPath,
  });
  const isolatedWorkspace = join(f.root, 'ambiguous-workspace');
  const session = createUpdateSession({
    name: 'Ambiguous source',
    workspace: isolatedWorkspace,
    sourceSnapshot: snapshot,
  });
  const options = { workspace: isolatedWorkspace, sessionId: session.id };
  const sessionPath = join(isolatedWorkspace, 'sessions', session.id, 'session.json');
  const before = readFileSync(sessionPath);

  const found = searchUpdateLevels({ ...options, sourceKey: '1-1' });
  assert.equal(found.items[0].selectable, false);
  assert.ok(found.items[0].warnings.some(warning => warning.kind === 'level-duplicate-key'));
  assert.throws(() => addLevelsToUpdate({ ...options, keys: ['1-2', '1-1'] }), /nonselectable/);
  assert.deepEqual(readFileSync(sessionPath), before);
});

test('Gate 12E rejects corrupt persisted collections and terminal-session mutations', t => {
  const f = fixture(t);
  addLevelsToUpdate({ ...f.options, keys: ['1-1'] });

  const persisted = JSON.parse(readFileSync(f.sessionPath, 'utf8'));
  persisted.collection.levels[0].levelsRaw = [1, 2, 3];
  writeFileSync(f.sessionPath, JSON.stringify(persisted, null, 2) + '\n', 'utf8');
  assert.throws(() => listUpdateLevels(f.options), /invalid persisted level collection/);

  const clean = fixture(t);
  addLevelsToUpdate({ ...clean.options, keys: ['1-1'] });
  completeUpdateSession(clean.session.id, { workspace: clean.workspace });
  const archived = { workspace: clean.workspace, sessionId: clean.session.id };
  assert.equal(listUpdateLevels(archived).count, 1);
  assert.throws(() => addLevelsToUpdate({ ...archived, keys: ['1-2'] }), /only draft/);
  assert.throws(() => removeLevelsFromUpdate({ ...archived, keys: ['1-1'] }), /only draft/);
});

test('Gate 12E does not modify external source bytes', t => {
  const f = fixture(t);
  const wardrobeBefore = readFileSync(f.wardrobePath);
  const levelsBefore = readFileSync(f.levelsPath);

  searchUpdateLevels(f.options);
  addLevelsToUpdate({ ...f.options, keys: ['1-1', '2-1'] });
  listUpdateLevels(f.options);
  removeLevelsFromUpdate({ ...f.options, keys: ['1-1'] });

  assert.deepEqual(readFileSync(f.wardrobePath), wardrobeBefore);
  assert.deepEqual(readFileSync(f.levelsPath), levelsBefore);
  assert.equal(loadUpdateSession(f.session.id, { workspace: f.workspace }).collection.levels.length, 1);
});
