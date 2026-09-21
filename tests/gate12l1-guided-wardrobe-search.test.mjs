import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendFileSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readExternalSourceSnapshot } from '../scripts/external-source-reader.mjs';
import {
  buildGuidedWardrobeSearchModel,
  clearGuidedWardrobeSearchCache,
  resolveGuidedWardrobeBatch,
  searchGuidedWardrobe,
} from '../scripts/guided-wardrobe-search.mjs';
import { createUpdateSession, loadUpdateSession } from '../scripts/update-session.mjs';
import { addWardrobeToUpdate } from '../scripts/update-wardrobe.mjs';

function row(name, type, id, {
  tags = '',
  source = '',
  suit = '',
  version = 'V1',
} = {}) {
  return [
    name, type, id, '5',
    '', 'S', '', 'A', '', 'B', '', 'A', 'C', '',
    tags, source, suit, version,
    'extra-a', 'extra-b',
  ];
}

function levelsSource() {
  return [
    'var themeFilter = [];',
    'var competitionsRaw = {};',
    'var extraRaw = {};',
    'var tasksRaw = {};',
    'var levelsRaw = {"III-90-1": [1,1,1,1,1]};',
    'var dreamWeavingRaw = {};',
    'var levelFilters = {};',
    'var levelBonus = {};',
    'var addSkillsInfo = {};',
    'var addHintInfo = {};',
    '',
  ].join('\n');
}

function wardrobeSource(rows) {
  return [
    'var wardrobe = ' + JSON.stringify(rows) + ';',
    "var wardrobe_lastupd = '2026/9/21';",
    '',
  ].join('\n');
}

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'gate12l1-search-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  clearGuidedWardrobeSearchCache();

  const externalWardrobe = join(root, 'external-wardrobe.js');
  const externalLevels = join(root, 'external-levels.js');
  const canonicalWardrobe = join(root, 'canonical-wardrobe.js');
  const workspace = join(root, 'workspace');

  writeFileSync(externalWardrobe, wardrobeSource([
    row('春樱', '发型', '001', {
      tags: '现代流行',
      source: '活动-限时登录',
      suit: '樱花套装',
      version: 'V1',
    }),
    row('星夜发饰', '发型', '002', {
      tags: '现代流行',
      source: '活动-限时登录',
      suit: '星夜套装',
      version: 'V2',
    }),
    row('月光鞋', '鞋子', '003', {
      tags: '现代流行',
      source: '活动-限时登录',
      suit: '月光套装',
      version: 'V2',
    }),
  ]), 'utf8');
  writeFileSync(externalLevels, levelsSource(), 'utf8');

  writeFileSync(canonicalWardrobe, wardrobeSource([
    row('春櫻', '髮型', '001', {
      tags: 'POP',
      source: '活動·限時登入',
      suit: '櫻花套裝',
      version: 'V1',
    }).slice(0, 18),
  ]), 'utf8');

  const sourceSnapshot = readExternalSourceSnapshot({
    wardrobePath: externalWardrobe,
    levelsPath: externalLevels,
  });
  const created = createUpdateSession({
    name: 'Gate 12L.1 fixture',
    workspace,
    sourceSnapshot,
  });

  return {
    root,
    externalWardrobe,
    externalLevels,
    canonicalWardrobe,
    workspace,
    sessionId: created.id,
    session: loadUpdateSession(created.id, { workspace }),
  };
}

test('Gate 12L.1 bilingual search accepts Traditional input and keeps exact source identity', async t => {
  const f = fixture(t);
  const result = await searchGuidedWardrobe({
    session: f.session,
    canonicalWardrobePath: f.canonicalWardrobe,
    filters: { query: '春櫻' },
  });

  assert.equal(result.total, 1);
  assert.equal(result.items[0].key, '发型|001');
  assert.equal(result.items[0].sourceKey, '发型|001');
  assert.equal(result.items[0].displayKey, '髮型|001');
  assert.equal(result.items[0].category, '髮型');
  assert.equal(result.items[0].name, '春櫻');
  assert.equal(result.items[0].original.name, '春樱');
  assert.equal(result.items[0].hasLocalMatch, true);
});

test('Gate 12L.1 searches source-only rows with the legacy full-dictionary Traditional form', async t => {
  const f = fixture(t);
  const external = [
    row('栗色畅想', '发型', '4280', {
      tags: '童话系',
      source: '充值·奇渊之屿',
      suit: '栗梦心语',
      version: 'V13.3.0',
    }),
  ];
  writeFileSync(f.externalWardrobe, wardrobeSource(external), 'utf8');

  const sourceSnapshot = readExternalSourceSnapshot({
    wardrobePath: f.externalWardrobe,
    levelsPath: f.externalLevels,
  });
  const session = createUpdateSession({
    name: 'Traditional glyph parity',
    workspace: join(f.root, 'glyph-workspace'),
    sourceSnapshot,
  });

  const result = await searchGuidedWardrobe({
    session,
    canonicalWardrobePath: f.canonicalWardrobe,
    filters: { query: '栗夢心語' },
  });

  assert.equal(result.total, 1);
  assert.equal(result.items[0].sourceKey, '发型|4280');
  assert.equal(result.items[0].suit, '栗夢心語');
  assert.equal(result.items[0].original.suit, '栗梦心语');
});

test('Gate 12L.1 converts source-only rows for display and searches converted fields', async t => {
  const f = fixture(t);
  const result = await searchGuidedWardrobe({
    session: f.session,
    canonicalWardrobePath: f.canonicalWardrobe,
    filters: {
      category: '髮型',
      source: '活動',
      query: '星夜',
      cnOnly: true,
    },
  });

  assert.equal(result.total, 1);
  const item = result.items[0];
  assert.equal(item.sourceKey, '发型|002');
  assert.equal(item.category, '髮型');
  assert.equal(item.sourceOnly, true);
  assert.match(item.name, /星夜/);
  assert.match(item.source, /活動/);
  assert.equal(item.tags, 'POP');
  assert.equal(item.original.source, '活动-限时登录');
});

test('Gate 12L.1 paginates display only while batch resolution keeps the full matched set', async t => {
  const f = fixture(t);
  const search = await searchGuidedWardrobe({
    session: f.session,
    canonicalWardrobePath: f.canonicalWardrobe,
    filters: { source: '活動' },
    limit: 1,
  });

  assert.equal(search.total, 3);
  assert.equal(search.items.length, 1);
  assert.equal(search.hasMore, true);
  assert.equal(search.addable, 3);

  const batch = await resolveGuidedWardrobeBatch({
    session: f.session,
    canonicalWardrobePath: f.canonicalWardrobe,
    filters: search.filters,
    searchFingerprint: search.searchFingerprint,
  });

  assert.equal(batch.matched, 3);
  assert.deepEqual(batch.eligibleKeys.sort(), ['发型|001', '发型|002', '鞋子|003'].sort());
  assert.deepEqual(batch.alreadyCollectedKeys, []);
  assert.deepEqual(batch.nonselectableItems, []);
});

test('Gate 12L.1 batch resolution excludes already collected results', async t => {
  const f = fixture(t);
  addWardrobeToUpdate({
    workspace: f.workspace,
    sessionId: f.sessionId,
    keys: ['发型|001'],
  });
  const session = loadUpdateSession(f.sessionId, { workspace: f.workspace });

  const search = await searchGuidedWardrobe({
    session,
    canonicalWardrobePath: f.canonicalWardrobe,
    filters: { source: '活動' },
  });
  assert.equal(search.alreadyCollected, 1);
  assert.equal(search.addable, 2);

  const batch = await resolveGuidedWardrobeBatch({
    session,
    canonicalWardrobePath: f.canonicalWardrobe,
    filters: search.filters,
    searchFingerprint: search.searchFingerprint,
  });
  assert.deepEqual(batch.alreadyCollectedKeys, ['发型|001']);
  assert.deepEqual(batch.eligibleKeys.sort(), ['发型|002', '鞋子|003'].sort());
});

test('Gate 12L.1 rejects an old fingerprint when filters or canonical data change', async t => {
  const f = fixture(t);
  const search = await searchGuidedWardrobe({
    session: f.session,
    canonicalWardrobePath: f.canonicalWardrobe,
    filters: { source: '活動' },
  });

  await assert.rejects(
    resolveGuidedWardrobeBatch({
      session: f.session,
      canonicalWardrobePath: f.canonicalWardrobe,
      filters: { source: '活動', category: '髮型' },
      searchFingerprint: search.searchFingerprint,
    }),
    /搜尋結果已過期/,
  );

  appendFileSync(f.canonicalWardrobe, '// canonical changed\n', 'utf8');
  await assert.rejects(
    resolveGuidedWardrobeBatch({
      session: f.session,
      canonicalWardrobePath: f.canonicalWardrobe,
      filters: search.filters,
      searchFingerprint: search.searchFingerprint,
    }),
    /搜尋結果已過期/,
  );
});

test('Gate 12L.1 rejects pinned external source drift before searching', async t => {
  const f = fixture(t);
  appendFileSync(f.externalWardrobe, '// source changed\n', 'utf8');

  await assert.rejects(
    searchGuidedWardrobe({
      session: f.session,
      canonicalWardrobePath: f.canonicalWardrobe,
      filters: { query: '春櫻' },
    }),
    /source drift/,
  );
});

test('Gate 12L.1 reuses the bilingual model while source and canonical hashes stay unchanged', async t => {
  const f = fixture(t);
  const first = await buildGuidedWardrobeSearchModel({
    session: f.session,
    canonicalWardrobePath: f.canonicalWardrobe,
  });
  const second = await buildGuidedWardrobeSearchModel({
    session: f.session,
    canonicalWardrobePath: f.canonicalWardrobe,
  });
  assert.equal(first, second);
});
