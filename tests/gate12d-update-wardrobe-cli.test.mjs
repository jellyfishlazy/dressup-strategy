import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseUpdateWardrobeArgs } from '../scripts/update-wardrobe-cli.mjs';
import { readExternalWardrobe } from '../scripts/external-source-reader.mjs';
import { completeUpdateSession, createUpdateSession } from '../scripts/update-session.mjs';

const CLI = fileURLToPath(new URL('../scripts/update-wardrobe-cli.mjs', import.meta.url));

function sourceRow(name, category, id, suit = 'Aurora Set') {
  return [name, category, id, '3', '', 'S', '', 'A', '', 'B', '', 'A', 'C', '', 'POP', 'Store', suit, 'V1', 'extra-a', 'extra-b'];
}

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'gate12d cli '));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const wardrobePath = join(root, 'wardrobe.js');
  const levelsPath = join(root, 'levels.js');
  const workspace = join(root, 'update workspace');
  const rows = [sourceRow('Aurora Hair', 'Hair', '001'), sourceRow('Aurora Shoes', 'Shoes', '002')];
  writeFileSync(wardrobePath, 'var wardrobe = ' + JSON.stringify(rows) + ';\n', 'utf8');
  writeFileSync(levelsPath, '// CLI fixture; level collection is outside Gate 12D.\n', 'utf8');
  const wardrobe = readExternalWardrobe(wardrobePath);
  const snapshot = {
    sourceRoot: root, sameRoot: true,
    files: { wardrobe: wardrobePath, levels: levelsPath },
    hashes: {
      wardrobe: wardrobe.sha256,
      levels: createHash('sha256').update(readFileSync(levelsPath)).digest('hex'),
    },
    wardrobe,
    levels: { counts: { bundles: 0 }, warnings: [] },
    warnings: wardrobe.warnings,
  };
  const session = createUpdateSession({ name: 'CLI update', workspace, sourceSnapshot: snapshot });
  const sessionPath = join(workspace, 'sessions', session.id, 'session.json');
  return { root, workspace, wardrobePath, levelsPath, snapshot, session, sessionPath };
}

function invoke(fx, args) {
  const result = spawnSync(process.execPath, [CLI, ...args, '--workspace=' + fx.workspace], {
    encoding: 'utf8', cwd: fx.root, timeout: 15000,
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

test('Gate 12D CLI parses explicit session, exact source id, filters and pagination', () => {
  assert.deepEqual(parseUpdateWardrobeArgs([
    'search', '--session=update-123', '--source-id=001', '--category=Hair',
    '--name=Aurora Hair', '--offset=2', '--limit=10', '--workspace=./fixture',
  ]), {
    command: 'search', sessionId: 'update-123', sourceId: '001', category: 'Hair',
    name: 'Aurora Hair', offset: 2, limit: 10, workspace: resolve('./fixture'),
  });
  assert.deepEqual(parseUpdateWardrobeArgs([]), { command: 'list' });
});

test('Gate 12D CLI keeps repeated exact keys and validates expected source hash', () => {
  const hash = 'a'.repeat(64);
  assert.deepEqual(parseUpdateWardrobeArgs(['add', '--key=Hair|001', '--key=Shoes|002', '--source-hash=' + hash]), {
    command: 'add', keys: ['Hair|001', 'Shoes|002'], expectedSourceHash: hash,
  });
  assert.throws(() => parseUpdateWardrobeArgs(['add', '--key=Hair|001', '--source-hash=bad']), /SHA-256/);
  assert.deepEqual(parseUpdateWardrobeArgs(['remove', '--key=Hair|001']), { command: 'remove', keys: ['Hair|001'] });
});

test('Gate 12D CLI rejects unknown, duplicate and cross-command options', () => {
  for (const args of [
    ['unknown'], ['list', '--query=x'], ['search', '--key=Hair|001'],
    ['add'], ['remove'], ['add', '--key='], ['list', '--session='],
    ['list', '--workspace='], ['search', '--limit=1', '--limit=2'],
    ['search', '--name', 'Aurora'], ['remove', '--key=Hair|001', '--source-hash=' + 'a'.repeat(64)],
    ['list', '--toString=x'], ['list', '--__proto__=x'],
  ]) assert.throws(() => parseUpdateWardrobeArgs(args), undefined, JSON.stringify(args));
});

test('Gate 12D CLI rejects malformed, fractional, negative and oversized pagination', () => {
  for (const value of ['-1', '1.5', '2x', '1e2', 'Infinity', '9007199254740992', '']) {
    assert.throws(() => parseUpdateWardrobeArgs(['search', '--offset=' + value]));
  }
  for (const value of ['0', '501', '-1', '1.5']) {
    assert.throws(() => parseUpdateWardrobeArgs(['search', '--limit=' + value]));
  }
});

test('Gate 12D CLI help succeeds without reading a session or external source', () => {
  for (const args of [['--help'], ['search', '--help']]) {
    const result = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', timeout: 15000 });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /data:session:wardrobe/);
    assert.match(result.stdout, /--source-id/);
  }
});

test('Gate 12D CLI supports search, batch add, restart, idempotent repeat and removal', t => {
  const fx = fixture(t);
  const sourceBefore = readFileSync(fx.wardrobePath);
  const levelsBefore = readFileSync(fx.levelsPath);
  const found = jsonSuccess(fx, ['search', '--suit=Aurora', '--limit=1']);
  assert.equal(found.total, 2);
  assert.equal(found.items.length, 1);
  assert.equal(found.items[0].key, 'Hair|001');
  assert.equal(found.items[0].collected, false);
  assert.equal(found.items[0].selectable, true);
  const exact = jsonSuccess(fx, ['search', '--category=Hair', '--source-id=001']);
  assert.equal(exact.total, 1);
  assert.equal(jsonSuccess(fx, ['search', '--source-id=1']).total, 0);

  const added = jsonSuccess(fx, ['add', '--key=Hair|001', '--key=Shoes|002', '--source-hash=' + found.sourceHash]);
  assert.deepEqual(added.addedKeys, ['Hair|001', 'Shoes|002']);
  assert.equal(added.session.collection.wardrobe.length, 2);
  assert.equal(added.session.collection.wardrobe[0].row.length, 20);
  const savedBytes = readFileSync(fx.sessionPath);
  const repeat = jsonSuccess(fx, ['add', '--key=Hair|001', '--key=Hair|001']);
  assert.deepEqual(repeat.addedKeys, []);
  assert.deepEqual(readFileSync(fx.sessionPath), savedBytes);
  const listed = jsonSuccess(fx, ['list', '--session=' + fx.session.id]);
  assert.equal(listed.count, 2);
  assert.equal(jsonSuccess(fx, ['search', '--source-id=001']).items[0].collected, true);
  const removed = jsonSuccess(fx, ['remove', '--key=Hair|001']);
  assert.deepEqual(removed.removedKeys, ['Hair|001']);
  assert.equal(jsonSuccess(fx, ['list']).count, 1);
  const afterRemove = readFileSync(fx.sessionPath);
  assert.deepEqual(jsonSuccess(fx, ['remove', '--key=Hair|001']).removedKeys, []);
  assert.deepEqual(readFileSync(fx.sessionPath), afterRemove);
  assert.deepEqual(readFileSync(fx.wardrobePath), sourceBefore);
  assert.deepEqual(readFileSync(fx.levelsPath), levelsBefore);
});

test('Gate 12D CLI reports missing current session as a nonzero error', t => {
  const fx = fixture(t);
  const result = invoke({ ...fx, workspace: join(fx.root, 'missing') }, ['list']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /ERROR/);
});

test('Gate 12D CLI rejects a whole invalid batch and a mismatched source hash', t => {
  const fx = fixture(t);
  const before = readFileSync(fx.sessionPath);
  for (const args of [
    ['add', '--key=Hair|001', '--key=Missing|999'],
    ['add', '--key=Hair|001', '--source-hash=' + 'f'.repeat(64)],
  ]) {
    const result = invoke(fx, args);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /ERROR/);
    assert.deepEqual(readFileSync(fx.sessionPath), before);
  }
});

test('Gate 12D CLI blocks source drift but keeps saved list and draft removal usable offline', t => {
  const fx = fixture(t);
  jsonSuccess(fx, ['add', '--key=Hair|001']);
  const before = readFileSync(fx.sessionPath);
  writeFileSync(fx.wardrobePath, readFileSync(fx.wardrobePath, 'utf8') + '// changed\n', 'utf8');
  for (const args of [['search'], ['add', '--key=Shoes|002']]) {
    const result = invoke(fx, args);
    assert.equal(result.status, 1);
    assert.deepEqual(readFileSync(fx.sessionPath), before);
  }
  rmSync(fx.wardrobePath);
  assert.equal(jsonSuccess(fx, ['list']).count, 1);
  assert.deepEqual(jsonSuccess(fx, ['remove', '--key=Hair|001']).removedKeys, ['Hair|001']);
});

test('Gate 12D CLI allows archived inspection but rejects archived mutations', t => {
  const fx = fixture(t);
  jsonSuccess(fx, ['add', '--key=Hair|001']);
  completeUpdateSession(fx.session.id, { workspace: fx.workspace });
  const before = readFileSync(fx.sessionPath);
  assert.equal(jsonSuccess(fx, ['list', '--session=' + fx.session.id]).count, 1);
  for (const args of [['add', '--key=Shoes|002'], ['remove', '--key=Hair|001']]) {
    const result = invoke(fx, [...args, '--session=' + fx.session.id]);
    assert.equal(result.status, 1);
    assert.deepEqual(readFileSync(fx.sessionPath), before);
  }
});

test('Gate 12D CLI npm entry is wired to the dedicated update-collection command', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts['data:session:wardrobe'], 'node scripts/update-wardrobe-cli.mjs');
});
