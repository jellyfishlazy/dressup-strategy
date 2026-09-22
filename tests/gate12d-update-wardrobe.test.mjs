import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, unlinkSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readExternalWardrobe } from '../scripts/external-source-reader.mjs';
import {
  createUpdateSession, loadUpdateSession, saveUpdateSession, completeUpdateSession, cancelUpdateSession,
} from '../scripts/update-session.mjs';
import {
  searchUpdateWardrobe as search, addWardrobeToUpdate as add,
  listUpdateWardrobe as list, removeWardrobeFromUpdate as remove,
} from '../scripts/update-wardrobe.mjs';

function row(name = 'Blue Moon', category = '发型', id = '001') {
  return [name, category, id, '3', '', 'S', '', 'A', '', 'B', '', 'A', 'C', '',
    'POP Cool', 'Event Shop', 'Moon Set', 'V1.2', 'extra-a', 'extra-b', 'extra-c'];
}

function fixture(t, rows = [row(), row('Red Sun', '发型', '002'), row('Blue Star', '髮型', '001')]) {
  const root = mkdtempSync(resolve('.gate12d-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const wardrobe = join(root, 'wardrobe.js');
  const levels = join(root, 'levels.js');
  writeFileSync(wardrobe, 'var wardrobe = ' + JSON.stringify(rows) + ';');
  writeFileSync(levels, '// fixture levels are not read by Gate 12D');
  const source = readExternalWardrobe(wardrobe);
  const workspace = join(root, 'workspace');
  const session = createUpdateSession({ workspace, name: 'Core fixture', sourceSnapshot: {
    sourceRoot: root, sameRoot: true, files: { wardrobe, levels },
    hashes: { wardrobe: source.sha256, levels: 'a'.repeat(64) },
    wardrobe: source, levels: { counts: {}, warnings: [] }, warnings: [],
  } });
  const path = join(workspace, 'sessions', session.id, 'session.json');
  return { root, wardrobe, levels, workspace, session, path, options: { workspace },
    bytes: () => readFileSync(path, 'utf8') };
}

test('filters use source text, AND tokens, exact category/id and stable strict pagination', t => {
  const f = fixture(t);
  const o = f.options;
  assert.equal(search(o).total, 3);
  assert.deepEqual(search({ ...o, name: 'MOON blue', suit: 'set moon', source: 'SHOP event', tag: 'cool pop', version: 'v1 .2' }).items.map(x => x.key), ['发型|001']);
  assert.equal(search({ ...o, name: 'blue sun' }).total, 0);
  assert.equal(search({ ...o, query: 'BLUE shop 001 cool' }).total, 2);
  assert.equal(search({ ...o, category: '髮型', sourceId: '001' }).items[0].name, 'Blue Star');
  assert.equal(search({ ...o, sourceId: '1' }).total, 0);
  assert.equal(search({ ...o, category: ' 发型' }).total, 0);
  assert.deepEqual(search({ ...o, offset: 1, limit: 1 }).items.map(x => x.index), [1]);
  assert.equal(search({ ...o, offset: 99, limit: 500 }).items.length, 0);
  assert.equal(search(o).limit, 50);
  for (const offset of [-1, 0.5, '0', null, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => search({ ...o, offset }), /offset/);
  }
  for (const limit of [0, -1, 501, 1.5, '50', null, NaN, Infinity]) {
    assert.throws(() => search({ ...o, limit }), /limit/);
  }
  for (const field of ['query', 'name', 'category', 'sourceId', 'suit', 'source', 'tag', 'version']) {
    assert.throws(() => search({ ...o, [field]: 1 }), /invalid/);
  }
  assert.doesNotThrow(() => JSON.stringify(search(o)));
});

test('source debt stays searchable but every ambiguous/invalid selection is blocked atomically', t => {
  const invalid = row('Invalid', '发型', '004'); invalid[19] = {};
  const f = fixture(t, [row(), row('Duplicate'), ['Short', '发型', '003'], invalid,
    row('', '发型', '005'), row('Missing', '', '006'), row('Missing ID', '发型', ''),
    row('Good', '发型', '007')]);
  const result = search(f.options);
  assert.equal(result.total, 8);
  assert.ok(result.items.slice(0, 7).every(x => !x.selectable && x.warnings.length));
  assert.equal(result.items[7].selectable, true);
  const before = f.bytes();
  for (const key of ['发型|001', '发型|003', '发型|004', '发型|005', '|006', '发型|', '发型|999']) {
    assert.throws(() => add({ ...f.options, keys: ['发型|007', key] }));
    assert.equal(f.bytes(), before);
  }
  for (const keys of [[], null, '发型|007', [1], ['bad'], ['a|b|c'], Array(1)]) {
    assert.throws(() => add({ ...f.options, keys }));
    assert.throws(() => remove({ ...f.options, keys }));
    assert.equal(f.bytes(), before);
  }
});

test('multi-add preserves full rows, provenance, plan and levels; repeats and removal are idempotent', t => {
  const f = fixture(t);
  const original = loadUpdateSession(f.session.id, f.options);
  original.plan = { wardrobe: ['planned'], levels: ['planned level'] };
  original.collection.levels = [{ key: 'saved level' }];
  saveUpdateSession(original, f.options);
  const result = add({ ...f.options, keys: ['发型|001', '发型|002', '发型|001'], expectedSourceHash: f.session.sourceSnapshot.hashes.wardrobe });
  assert.deepEqual(result.addedKeys, ['发型|001', '发型|002']);
  assert.deepEqual(result.skippedKeys, ['发型|001']);
  const item = result.session.collection.wardrobe[0];
  assert.deepEqual(item.row, row());
  assert.deepEqual(item.coreRow, row().slice(0, 18));
  assert.deepEqual(item.extraColumns, ['extra-a', 'extra-b', 'extra-c']);
  assert.equal(item.index, 0);
  assert.equal(item.sourcePath, f.wardrobe);
  assert.equal(item.sourceHash, f.session.sourceSnapshot.hashes.wardrobe);
  assert.deepEqual(result.session.plan, original.plan);
  assert.deepEqual(result.session.collection.levels, original.collection.levels);
  assert.deepEqual(result.session.sourceSnapshot, original.sourceSnapshot);
  assert.equal(result.session.createdAt, original.createdAt);
  assert.equal(result.session.status, 'draft');
  assert.deepEqual(result.session, loadUpdateSession(f.session.id, f.options));
  const before = f.bytes();
  assert.deepEqual(add({ ...f.options, keys: ['发型|001'] }).addedKeys, []);
  assert.equal(f.bytes(), before);
  assert.deepEqual(list(f.options).items, result.session.collection.wardrobe);
  assert.deepEqual(search(f.options).items.map(x => x.collected), [true, true, false]);
  const removed = remove({ ...f.options, keys: ['发型|001', '发型|001', '发型|999'] });
  assert.deepEqual(removed.removedKeys, ['发型|001']);
  assert.deepEqual(removed.skippedKeys, ['发型|001', '发型|999']);
  assert.deepEqual(removed.session.plan, original.plan);
  assert.deepEqual(removed.session.collection.levels, original.collection.levels);
  const after = f.bytes();
  remove({ ...f.options, keys: ['发型|001'] });
  assert.equal(f.bytes(), after);
  assert.equal(list(f.options).count, 1);
});

test('hash mismatch/drift fail closed; offline list and remove need neither source', t => {
  const f = fixture(t);
  const before = f.bytes();
  assert.throws(() => add({ ...f.options, keys: ['发型|001'], expectedSourceHash: 'b'.repeat(64) }), /hash mismatch/);
  assert.equal(f.bytes(), before);
  add({ ...f.options, keys: ['发型|001', '发型|002'] });
  const collected = f.bytes();
  writeFileSync(f.wardrobe, 'var wardrobe = [];');
  assert.throws(() => search(f.options), /drift/);
  assert.throws(() => add({ ...f.options, keys: ['发型|001'] }), /drift/);
  assert.equal(f.bytes(), collected);
  assert.equal(list(f.options).count, 2);
  remove({ ...f.options, keys: ['发型|001'] });
  unlinkSync(f.wardrobe); unlinkSync(f.levels);
  const offline = f.bytes();
  assert.throws(() => search(f.options));
  assert.throws(() => add({ ...f.options, keys: ['发型|002'] }));
  assert.equal(f.bytes(), offline);
  assert.equal(list(f.options).count, 1);
  remove({ ...f.options, keys: ['发型|002'] });
  assert.equal(list(f.options).count, 0);
});

test('no current, unsafe session IDs and terminal lifecycle guards', t => {
  const f = fixture(t);
  for (const sessionId of ['../escape', '..', '.', 'a/b', 'a\\b', 'C:\\escape', '', null]) {
    for (const fn of [search, list, add, remove]) assert.throws(() => fn({ ...f.options, sessionId, keys: ['发型|001'] }), /session id/);
  }
  const pointer = join(f.workspace, 'current.json');
  writeFileSync(pointer, JSON.stringify({ kind: 'current-game-update-session', id: '../escape' }));
  assert.throws(() => list(f.options), /session id/);
  unlinkSync(pointer);
  for (const fn of [search, list, add, remove]) assert.throws(() => fn({ ...f.options, keys: ['发型|001'] }), /no current/);
  for (const finish of [completeUpdateSession, cancelUpdateSession]) {
    const g = fixture(t);
    add({ ...g.options, keys: ['发型|001'] });
    finish(g.session.id, g.options);
    const opts = { ...g.options, sessionId: g.session.id, keys: ['发型|001'] };
    const bytes = g.bytes();
    assert.throws(() => add(opts), /only draft/);
    assert.throws(() => remove(opts), /only draft/);
    assert.equal(list(opts).count, 1);
    assert.equal(search(opts).total, 3);
    assert.equal(g.bytes(), bytes);
  }
});

test('persisted corrupt records are rejected without reading source or modifying bytes', t => {
  const f = fixture(t);
  assert.equal(list(f.options).count, 0); // Gate 12C empty collection compatibility.
  add({ ...f.options, keys: ['发型|001'] });
  const good = JSON.parse(f.bytes());
  unlinkSync(f.wardrobe);
  const changes = [
    x => { x.key = 'other|001'; }, x => { x.name = 'wrong'; },
    x => { x.category = '髮型'; }, x => { x.id = '1'; },
    x => { x.index = -1; }, x => { x.index = '0'; }, x => { x.index = 99; },
    x => { x.row[20] = {}; }, x => { x.row = null; },
    x => { x.coreRow[0] = 'wrong'; }, x => { x.extraColumns = []; },
    x => { x.sourceHash = 'b'.repeat(64); }, x => { x.sourcePath = 'wrong'; },
    x => { x.collectedAt = 'yesterday'; }, x => { x.collectedAt = 1; },
  ];
  for (const change of changes) {
    const bad = JSON.parse(JSON.stringify(good)); change(bad.collection.wardrobe[0]);
    writeFileSync(f.path, JSON.stringify(bad));
    const bytes = f.bytes();
    assert.throws(() => list(f.options), /invalid persisted/);
    assert.throws(() => remove({ ...f.options, keys: ['发型|001'] }), /invalid persisted/);
    assert.equal(f.bytes(), bytes);
  }
  good.collection.wardrobe.push(good.collection.wardrobe[0]);
  writeFileSync(f.path, JSON.stringify(good));
  assert.throws(() => list(f.options), /invalid persisted/);
});

test('exclusive save lock and stale revisions protect collection and lifecycle writers', t => {
  const f = fixture(t);
  const stale = loadUpdateSession(f.session.id, f.options);
  add({ ...f.options, keys: ['发型|001'] });
  const bytes = f.bytes();
  stale.status = 'completed'; stale.completedAt = new Date().toISOString();
  assert.throws(() => saveUpdateSession(stale, f.options), /stale/);
  assert.equal(f.bytes(), bytes);
  assert.equal(existsSync(f.path + '.lock'), false);
  assert.throws(() => saveUpdateSession(JSON.parse(bytes), f.options), /freshly loaded/);
  const lock = f.path + '.lock';
  writeFileSync(lock, 'another writer owns this lock', { flag: 'wx' });
  for (const fn of [
    () => add({ ...f.options, keys: ['发型|002'] }),
    () => remove({ ...f.options, keys: ['发型|001'] }),
    () => completeUpdateSession(f.session.id, f.options),
    () => cancelUpdateSession(f.session.id, f.options),
  ]) {
    assert.throws(fn, /EEXIST/);
    assert.equal(readFileSync(lock, 'utf8'), 'another writer owns this lock');
    assert.equal(f.bytes(), bytes);
  }
  unlinkSync(lock);
  const oldDraft = loadUpdateSession(f.session.id, f.options);
  completeUpdateSession(f.session.id, f.options);
  assert.throws(() => saveUpdateSession(oldDraft, f.options), /stale/);
});

test('canonical and fixture external source bytes remain unchanged', t => {
  const f = fixture(t);
  const paths = [f.wardrobe, f.levels, resolve('data/wardrobe.js')];
  const before = paths.map(path => readFileSync(path));
  search(f.options); add({ ...f.options, keys: ['发型|001'] }); list(f.options);
  remove({ ...f.options, keys: ['发型|001'] });
  paths.forEach((path, i) => assert.deepEqual(readFileSync(path), before[i]));
});
