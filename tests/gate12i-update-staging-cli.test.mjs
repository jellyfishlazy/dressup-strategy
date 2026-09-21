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
import { saveConflictDecision } from '../scripts/update-conflict-review.mjs';
import { parseUpdateStagingArgs } from '../scripts/update-staging-cli.mjs';

const CLI = fileURLToPath(new URL('../scripts/update-staging-cli.mjs', import.meta.url));

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

function fixture(t, { review = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'gate12i-cli-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const wardrobePath = join(root, 'external-wardrobe.js');
  const levelsPath = join(root, 'external-levels.js');
  const localWardrobePath = join(root, 'local-wardrobe.js');
  const localLevelsPath = join(root, 'local-levels.js');
  const workspace = join(root, 'update-workspace');
  const outputRoot = join(root, 'staging');

  writeFileSync(
    wardrobePath,
    'var wardrobe = ' + JSON.stringify([
      extWardrobeRow('Source Dress', '连衣裙', '003'),
      extWardrobeRow('New Hair', '发型', '010'),
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
    name: 'Gate 12I CLI fixture',
    workspace,
    sourceSnapshot: snapshot,
  });
  const options = {
    workspace,
    sessionId: session.id,
    wardrobeTargetPath: localWardrobePath,
    levelsTargetPath: localLevelsPath,
    outputRoot,
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

  if (review) {
    return saveConflictDecision({
      ...options,
      domain: 'wardrobe',
      sourceKey: '连衣裙|003',
      decision: 'keep-local',
    }).then(() => ({
      root,
      workspace,
      session,
      localWardrobePath,
      localLevelsPath,
      outputRoot,
    }));
  }

  return Promise.resolve({
    root,
    workspace,
    session,
    localWardrobePath,
    localLevelsPath,
    outputRoot,
  });
}

function args(fx) {
  return [
    '--workspace=' + fx.workspace,
    '--wardrobe-target=' + fx.localWardrobePath,
    '--levels-target=' + fx.localLevelsPath,
    '--output-root=' + fx.outputRoot,
  ];
}

function invoke(fx, extra = []) {
  const result = spawnSync(process.execPath, [CLI, 'generate', ...extra, ...args(fx)], {
    encoding: 'utf8',
    cwd: fx.root,
    timeout: 20000,
  });
  assert.equal(result.error, undefined, result.error?.message);
  return result;
}

test('Gate 12I CLI parses strict staging options', () => {
  assert.deepEqual(parseUpdateStagingArgs([
    'generate',
    '--session=update-123',
    '--workspace=./workspace',
    '--wardrobe-target=./wardrobe.js',
    '--levels-target=./levels.js',
    '--output-root=./staging',
  ]), {
    command: 'generate',
    sessionId: 'update-123',
    workspace: resolve('./workspace'),
    wardrobeTargetPath: resolve('./wardrobe.js'),
    levelsTargetPath: resolve('./levels.js'),
    outputRoot: resolve('./staging'),
  });
  assert.deepEqual(parseUpdateStagingArgs([]), { command: 'generate' });
});

test('Gate 12I CLI rejects unknown, duplicate and malformed options', () => {
  for (const argv of [
    ['unknown'],
    ['generate', '--session='],
    ['generate', '--workspace='],
    ['generate', '--bad=x'],
    ['generate', '--session=a', '--session=b'],
    ['generate', '--output-root'],
  ]) {
    assert.throws(() => parseUpdateStagingArgs(argv), undefined, JSON.stringify(argv));
  }
});

test('Gate 12I CLI help succeeds without session access', () => {
  for (const argv of [['--help'], ['generate', '--help']]) {
    const result = spawnSync(process.execPath, [CLI, ...argv], {
      encoding: 'utf8',
      timeout: 15000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /data:session:stage/);
    assert.match(result.stdout, /bundle\.json/);
    assert.match(result.stdout, /keep-local/);
  }
});

test('Gate 12I CLI generates apply-ready bundle and reuses it on rerun', async t => {
  const fx = await fixture(t);
  const first = invoke(fx);
  assert.equal(first.status, 0, first.stderr);
  const one = JSON.parse(first.stdout);
  assert.equal(one.reused, false);
  assert.equal(one.bundle.kind, 'gate12-apply-ready-staging');
  assert.equal(one.bundle.gate12.review.unresolvedCount, 0);

  const second = invoke(fx);
  assert.equal(second.status, 0, second.stderr);
  const two = JSON.parse(second.stdout);
  assert.equal(two.reused, true);
  assert.equal(two.outputDir, one.outputDir);
});

test('Gate 12I CLI exits nonzero while conflicts remain unresolved', async t => {
  const fx = await fixture(t, { review: false });
  const result = invoke(fx);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Gate 12H review is not ready/);
});

test('Gate 12I CLI npm entry is wired to the staging command', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(
    pkg.scripts['data:session:stage'],
    'node scripts/update-staging-cli.mjs',
  );
});
