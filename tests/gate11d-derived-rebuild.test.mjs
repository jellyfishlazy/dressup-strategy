import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  REPO_ROOT,
  cnWardrobeCandidates,
  firstExistingFile,
  sha256File,
} from '../cn-search/scripts/cn-wardrobe-source.mjs';
import {
  buildCnSearchIndex,
  validateCnSearchIndex,
} from '../cn-search/scripts/build-cn-search-index.mjs';
import {
  affectedGeneratedSources,
  inspectGeneratedSource,
  rebuildGeneratedSource,
  selectGeneratedSources,
} from '../scripts/derived-rebuild.mjs';
import { rowToWardrobeLine } from '../cn-search/src/staging.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function makeRow(name, type, id, tags = '') {
  return [
    name, type, id, '3',
    '', 'S', '', 'A', '', 'B', '', 'A', 'C', '',
    tags, 'source', '', 'V1',
  ];
}

function wardrobeText(rows, lastUpdated) {
  return [
    'var wardrobe = [',
    ...rows.map(rowToWardrobeLine),
    '',
    '];',
    "var wardrobe_lastupd = '" + lastUpdated + "';",
    '',
  ].join('\n');
}

function makeFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'gate11d-'));
  const cnPath = join(dir, 'cn-wardrobe.js');
  const twPath = join(dir, 'tw-wardrobe.js');
  const targetPath = join(dir, 'cn_search_index.json');

  const cn = makeRow('运动少年', '发型', '004', '中性风');
  const tw = makeRow('運動少年', '髮型', '004', '中性風');
  writeFileSync(cnPath, wardrobeText([cn], '2026/9/1'), 'utf8');
  writeFileSync(twPath, wardrobeText([tw], '2026/9/2'), 'utf8');

  return { dir, cnPath, twPath, targetPath, cn, tw };
}

test('Gate 11D external source resolver includes workspace-aware fallback and first-existing selection', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gate11d-source-'));
  const found = join(dir, 'wardrobe.js');
  writeFileSync(found, 'x', 'utf8');

  assert.equal(firstExistingFile([join(dir, 'missing.js'), found]), resolve(found));

  const candidates = cnWardrobeCandidates('');
  assert.ok(candidates.includes(resolve(REPO_ROOT, '..', '..', 'nikkiup2u3_data-gh-pages', 'wardrobe.js')));
});

test('Gate 11D dependency planner selects generated outputs from contract inputs', () => {
  assert.deepEqual(
    affectedGeneratedSources(['wardrobe']).map(source => source.id),
    ['cn-search-index'],
  );
  assert.deepEqual(
    affectedGeneratedSources(['external-cn-wardrobe']).map(source => source.id),
    ['cn-search-index'],
  );
  assert.deepEqual(affectedGeneratedSources(['main-levels']).map(source => source.id), []);
  assert.deepEqual(selectGeneratedSources({ changedSourceIds: ['wardrobe'] }).map(source => source.id), ['cn-search-index']);
});

test('Gate 11D builder emits valid input hashes from the exact parsed source bytes', async () => {
  const fx = makeFixture();
  const generatedAt = new Date('2026-09-19T00:00:00.000Z');

  await buildCnSearchIndex({
    cnPath: fx.cnPath,
    twPath: fx.twPath,
    outPath: fx.targetPath,
    generatedAt,
  });

  const data = JSON.parse(readFileSync(fx.targetPath, 'utf8'));
  assert.deepEqual(validateCnSearchIndex(data), []);
  assert.equal(data.generatedAt, generatedAt.toISOString());
  assert.equal(data.count, 1);
  assert.equal(data.rows[0].tagsTw, '中性風');
  assert.equal(data.inputHashes['external-cn-wardrobe'], sha256File(fx.cnPath));
  assert.equal(data.inputHashes.wardrobe, sha256File(fx.twPath));
  assert.equal(data.inputLastUpdated.wardrobe, '2026/9/2');
});

test('Gate 11D freshness inspection detects legacy missing hashes and changed inputs', async () => {
  const fx = makeFixture();

  writeFileSync(
    fx.targetPath,
    JSON.stringify({
      schema: 3,
      generatedAt: '2026-09-01T00:00:00.000Z',
      count: 0,
      rows: [],
    }),
    'utf8',
  );
  let inspection = inspectGeneratedSource('cn-search-index', {
    targetPath: fx.targetPath,
    inputOverrides: {
      'external-cn-wardrobe': fx.cnPath,
      wardrobe: fx.twPath,
    },
  });
  assert.equal(inspection.fresh, false);
  assert.ok(inspection.staleReasons.includes('missing-input-hashes'));

  await buildCnSearchIndex({
    cnPath: fx.cnPath,
    twPath: fx.twPath,
    outPath: fx.targetPath,
    generatedAt: new Date('2026-09-19T00:00:00.000Z'),
  });
  inspection = inspectGeneratedSource('cn-search-index', {
    targetPath: fx.targetPath,
    inputOverrides: {
      'external-cn-wardrobe': fx.cnPath,
      wardrobe: fx.twPath,
    },
  });
  assert.equal(inspection.fresh, true);

  const changedTw = fx.tw.slice();
  changedTw[14] = 'POP';
  writeFileSync(fx.twPath, wardrobeText([changedTw], '2026/9/3'), 'utf8');

  inspection = inspectGeneratedSource('cn-search-index', {
    targetPath: fx.targetPath,
    inputOverrides: {
      'external-cn-wardrobe': fx.cnPath,
      wardrobe: fx.twPath,
    },
  });
  assert.equal(inspection.fresh, false);
  assert.ok(inspection.staleReasons.includes('input-changed:wardrobe'));
});

test('Gate 11D atomically rebuilds a stale temp fixture and leaves no rebuild temp files', async () => {
  const fx = makeFixture();

  await buildCnSearchIndex({
    cnPath: fx.cnPath,
    twPath: fx.twPath,
    outPath: fx.targetPath,
    generatedAt: new Date('2026-09-18T00:00:00.000Z'),
  });
  const before = readFileSync(fx.targetPath, 'utf8');

  const changedTw = fx.tw.slice();
  changedTw[14] = 'POP';
  writeFileSync(fx.twPath, wardrobeText([changedTw], '2026/9/3'), 'utf8');

  const result = await rebuildGeneratedSource('cn-search-index', {
    targetPath: fx.targetPath,
    inputOverrides: {
      'external-cn-wardrobe': fx.cnPath,
      wardrobe: fx.twPath,
    },
    generatedAt: new Date('2026-09-19T00:00:00.000Z'),
  });

  assert.equal(result.rebuilt, true);
  assert.equal(result.after.fresh, true);

  const after = readFileSync(fx.targetPath, 'utf8');
  assert.notEqual(after, before);
  const data = JSON.parse(after);
  assert.equal(data.rows[0].tagsTw, 'POP');
  assert.equal(data.inputHashes.wardrobe, sha256File(fx.twPath));
  assert.equal(readdirSync(fx.dir).some(name => name.includes('.gate11d-')), false);
});

test('Gate 11D skips an already-fresh generated artifact unless forced', async () => {
  const fx = makeFixture();
  await buildCnSearchIndex({
    cnPath: fx.cnPath,
    twPath: fx.twPath,
    outPath: fx.targetPath,
    generatedAt: new Date('2026-09-19T00:00:00.000Z'),
  });
  const before = readFileSync(fx.targetPath, 'utf8');

  const result = await rebuildGeneratedSource('cn-search-index', {
    targetPath: fx.targetPath,
    inputOverrides: {
      'external-cn-wardrobe': fx.cnPath,
      wardrobe: fx.twPath,
    },
  });

  assert.equal(result.rebuilt, false);
  assert.equal(result.reason, 'fresh');
  assert.equal(readFileSync(fx.targetPath, 'utf8'), before);
});


test('Gate 11D keeps CN build and tag-sync on the shared external source resolver', () => {
  const sync = readFileSync(
    join(repoRoot, 'cn-search', 'scripts', 'sync-wardrobe-tags-from-cn.mjs'),
    'utf8',
  );
  const builder = readFileSync(
    join(repoRoot, 'cn-search', 'scripts', 'build-cn-search-index.mjs'),
    'utf8',
  );

  assert.match(sync, /import \{ findCnWardrobe \} from '\.\/cn-wardrobe-source\.mjs';/);
  assert.doesNotMatch(sync, /function findCnWardrobe\(/);
  assert.match(builder, /from '\.\/cn-wardrobe-source\.mjs';/);
});
