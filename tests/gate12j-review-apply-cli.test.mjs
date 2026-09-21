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
import { parseUpdateReviewApplyArgs } from '../scripts/update-review-apply-cli.mjs';

const CLI = fileURLToPath(new URL('../scripts/update-review-apply-cli.mjs', import.meta.url));

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'gate12j-cli-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const wardrobePath = join(root, 'external-wardrobe.js');
  const levelsPath = join(root, 'external-levels.js');
  const localWardrobePath = join(root, 'local-wardrobe.js');
  const localLevelsPath = join(root, 'local-levels.js');
  const workspace = join(root, 'update-workspace');
  const outputRoot = join(root, 'gate12-staging');
  const runRoot = join(root, 'gate12j-runs');

  const wardrobeRow = [
    'New Hair', '发型', '010', '3',
    '', 'S', '', 'A', '', 'B', '', 'A', 'C', '',
    'POP', '', '', '',
    'extra-a', 'extra-b',
  ];
  writeFileSync(
    wardrobePath,
    'var wardrobe = ' + JSON.stringify([wardrobeRow]) + ';\n',
    'utf8',
  );
  writeFileSync(levelsPath, [
    'var themeFilter = [["Chapter 1", "关卡: III-99-"]];',
    'var competitionsRaw = {};',
    'var extraRaw = {};',
    'var tasksRaw = {};',
    'var levelsRaw = {"III-99-1": [1,1,1,1,1]};',
    'var dreamWeavingRaw = {};',
    'var levelFilters = {};',
    'var levelBonus = {};',
    'var addSkillsInfo = {};',
    'var addHintInfo = {};',
    '',
  ].join('\n'), 'utf8');

  writeFileSync(localWardrobePath, [
    'var wardrobe = [];',
    "var lastVersion = 'V1';",
    "var wardrobe_lastupd = '2026/9/20';",
    'var wardrobeTags = [];',
    '',
  ].join('\n'), 'utf8');
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
    name: 'Gate 12J CLI fixture',
    workspace,
    sourceSnapshot: snapshot,
  });
  const options = { workspace, sessionId: session.id };
  addPlannedItems({
    ...options,
    wardrobeKeys: ['发型|010'],
    levelKeys: ['III-99-1'],
  });
  addWardrobeToUpdate({ ...options, keys: ['发型|010'] });
  addLevelsToUpdate({ ...options, keys: ['III-99-1'] });

  return {
    root,
    workspace,
    localWardrobePath,
    localLevelsPath,
    outputRoot,
    runRoot,
  };
}

function commonArgs(fx) {
  return [
    '--workspace=' + fx.workspace,
    '--wardrobe-target=' + fx.localWardrobePath,
    '--levels-target=' + fx.localLevelsPath,
    '--output-root=' + fx.outputRoot,
    '--run-root=' + fx.runRoot,
  ];
}

test('Gate 12J CLI parses preview/apply options and exact confirmation', () => {
  assert.deepEqual(parseUpdateReviewApplyArgs([
    'preview',
    '--session=update-123',
    '--workspace=./workspace',
    '--wardrobe-target=./wardrobe.js',
    '--levels-target=./levels.js',
    '--output-root=./staging',
    '--run-root=./runs',
  ]), {
    command: 'preview',
    apply: false,
    sessionId: 'update-123',
    workspace: resolve('./workspace'),
    wardrobeTargetPath: resolve('./wardrobe.js'),
    levelsTargetPath: resolve('./levels.js'),
    outputRoot: resolve('./staging'),
    runRoot: resolve('./runs'),
  });

  assert.deepEqual(parseUpdateReviewApplyArgs([
    'apply',
    '--confirm=abc123',
  ]), {
    command: 'apply',
    apply: true,
    confirm: 'abc123',
  });

  assert.deepEqual(parseUpdateReviewApplyArgs([]), {
    command: 'preview',
    apply: false,
  });
});

test('Gate 12J CLI rejects unsafe or incompatible options', () => {
  for (const argv of [
    ['unknown'],
    ['apply'],
    ['apply', '--confirm='],
    ['preview', '--confirm=abc'],
    ['preview', '--accept-conflicts'],
    ['preview', '--workspace='],
    ['preview', '--session=a', '--session=b'],
    ['preview', '--run-root'],
  ]) {
    assert.throws(() => parseUpdateReviewApplyArgs(argv), undefined, JSON.stringify(argv));
  }
});

test('Gate 12J CLI help succeeds without session access', () => {
  for (const argv of [['--help'], ['preview', '--help']]) {
    const result = spawnSync(process.execPath, [CLI, ...argv], {
      encoding: 'utf8',
      timeout: 15000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /data:session:apply/);
    assert.match(result.stdout, /confirmFingerprint/);
    assert.match(result.stdout, /不提供 --accept-conflicts/);
  }
});

test('Gate 12J CLI preview emits a ready report and does not write targets', t => {
  const fx = fixture(t);
  const beforeWardrobe = readFileSync(fx.localWardrobePath);
  const beforeLevels = readFileSync(fx.localLevelsPath);

  const result = spawnSync(process.execPath, [
    CLI,
    'preview',
    ...commonArgs(fx),
  ], {
    encoding: 'utf8',
    cwd: fx.root,
    timeout: 20000,
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  const json = JSON.parse(result.stdout.slice(result.stdout.indexOf('{')));
  assert.equal(json.report.status, 'ready');
  assert.equal(json.report.readyForApply, true);
  assert.ok(json.report.confirmFingerprint);
  assert.equal(json.report.gate11.status, 'ready');

  assert.deepEqual(readFileSync(fx.localWardrobePath), beforeWardrobe);
  assert.deepEqual(readFileSync(fx.localLevelsPath), beforeLevels);
});

test('Gate 12J CLI npm entry is wired to review/apply integration', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(
    pkg.scripts['data:session:apply'],
    'node scripts/update-review-apply-cli.mjs',
  );
});
