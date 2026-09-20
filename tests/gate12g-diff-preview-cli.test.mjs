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
import { parseUpdateDiffArgs } from '../scripts/update-diff-preview-cli.mjs';

const CLI = fileURLToPath(new URL('../scripts/update-diff-preview-cli.mjs', import.meta.url));

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'gate12g-cli-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const wardrobePath = join(root, 'external-wardrobe.js');
  const levelsPath = join(root, 'external-levels.js');
  const localWardrobePath = join(root, 'local-wardrobe.js');
  const localLevelsPath = join(root, 'local-levels.js');
  const workspace = join(root, 'update-workspace');

  writeFileSync(
    wardrobePath,
    'var wardrobe = ' + JSON.stringify([[
      'New Hair', '发型', '010', '3',
      '', 'S', '', 'A', '', 'B', '', 'A', 'C', '',
      'POP', 'Store', 'Set', 'V1',
      'x', 'y',
    ]]) + ';\n',
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

  writeFileSync(localWardrobePath, 'var wardrobe = [];\n', 'utf8');
  writeFileSync(localLevelsPath, [
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
  ].join('\n'), 'utf8');

  const snapshot = readExternalSourceSnapshot({ wardrobePath, levelsPath });
  const session = createUpdateSession({
    name: 'Gate 12G CLI',
    workspace,
    sourceSnapshot: snapshot,
  });
  const options = { workspace, sessionId: session.id };
  addPlannedItems({
    ...options,
    wardrobeKeys: ['发型|010'],
    levelKeys: ['1-1'],
  });
  addWardrobeToUpdate({ ...options, keys: ['发型|010'] });
  addLevelsToUpdate({ ...options, keys: ['1-1'] });

  return {
    root,
    workspace,
    session,
    localWardrobePath,
    localLevelsPath,
  };
}

function invoke(fx, args) {
  const result = spawnSync(process.execPath, [
    CLI,
    ...args,
    '--workspace=' + fx.workspace,
    '--wardrobe-target=' + fx.localWardrobePath,
    '--levels-target=' + fx.localLevelsPath,
  ], {
    encoding: 'utf8',
    cwd: fx.root,
    timeout: 15000,
  });
  assert.equal(result.error, undefined, result.error?.message);
  return result;
}

test('Gate 12G CLI parses explicit session and read-only target overrides', () => {
  assert.deepEqual(parseUpdateDiffArgs([
    'preview',
    '--session=update-123',
    '--workspace=./fixture',
    '--wardrobe-target=./wardrobe.js',
    '--levels-target=./levels.js',
  ]), {
    command: 'preview',
    sessionId: 'update-123',
    workspace: resolve('./fixture'),
    wardrobeTargetPath: resolve('./wardrobe.js'),
    levelsTargetPath: resolve('./levels.js'),
  });
  assert.deepEqual(parseUpdateDiffArgs([]), { command: 'preview' });
});

test('Gate 12G CLI rejects unknown, duplicate and malformed options', () => {
  for (const args of [
    ['unknown'],
    ['preview', '--session='],
    ['preview', '--workspace='],
    ['preview', '--bad=x'],
    ['preview', '--session=a', '--session=b'],
    ['preview', '--workspace'],
  ]) {
    assert.throws(() => parseUpdateDiffArgs(args), undefined, JSON.stringify(args));
  }
});

test('Gate 12G CLI help succeeds without session access', () => {
  for (const args of [['--help'], ['preview', '--help']]) {
    const result = spawnSync(process.execPath, [CLI, ...args], {
      encoding: 'utf8',
      timeout: 15000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /data:session:diff/);
    assert.match(result.stdout, /new/);
    assert.match(result.stdout, /modified/);
    assert.match(result.stdout, /conflict/);
  }
});

test('Gate 12G CLI emits read-only JSON preview for both domains', t => {
  const fx = fixture(t);
  const result = invoke(fx, ['preview']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');

  const json = JSON.parse(result.stdout);
  assert.deepEqual(json.summary, {
    total: 2,
    new: 2,
    modified: 0,
    conflict: 0,
    unchanged: 0,
  });
  assert.equal(json.readyForNextGate, true);
  assert.equal(json.wardrobe.items[0].targetKey, '髮型|010');
  assert.equal(json.levels.items[0].targetKey, 'I-1-1');
});

test('Gate 12G CLI npm entry is wired to the diff preview command', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(
    pkg.scripts['data:session:diff'],
    'node scripts/update-diff-preview-cli.mjs',
  );
});
