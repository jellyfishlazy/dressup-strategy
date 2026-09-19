import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import {
  DATA_SOURCES,
  DATA_SOURCE_ROLES,
  absoluteDataSourcePath,
  canonicalWritableSources,
  generatedSources,
} from '../scripts/data-source-contract.mjs';

function read(path) {
  return readFileSync(new URL('../' + path, import.meta.url), 'utf8');
}

function loadWardrobe(path) {
  const context = {};
  vm.runInNewContext(read(path), context, { filename: path, timeout: 10_000 });
  return {
    rows: context.wardrobe,
    lastUpdated: context.wardrobe_lastupd || null,
  };
}

test('Gate 11A declares one canonical TW wardrobe and explicit non-canonical lookalikes', () => {
  assert.equal(DATA_SOURCES.wardrobe.path, 'data/wardrobe.js');
  assert.equal(DATA_SOURCES.wardrobe.role, DATA_SOURCE_ROLES.CANONICAL);
  assert.equal(DATA_SOURCES.wardrobe.writable, true);

  assert.equal(DATA_SOURCES.rootWardrobeSnapshot.role, DATA_SOURCE_ROLES.LEGACY_SNAPSHOT);
  assert.equal(DATA_SOURCES.rootWardrobeSnapshot.writable, false);
  assert.equal(DATA_SOURCES.legacyBigUseWardrobeSnapshot.role, DATA_SOURCE_ROLES.LEGACY_SNAPSHOT);
  assert.equal(DATA_SOURCES.legacyBigUseWardrobeSnapshot.writable, false);

  const canonicalWardrobes = canonicalWritableSources().filter(source => source.format === 'wardrobe-18');
  assert.deepEqual(canonicalWardrobes.map(source => source.id), ['wardrobe']);
});

test('Gate 11A contract paths exist and generated data declares builder inputs', () => {
  for (const source of Object.values(DATA_SOURCES)) {
    assert.ok(existsSync(absoluteDataSourcePath(source.id)), source.path);
  }

  const generated = generatedSources();
  assert.deepEqual(generated.map(source => source.id), ['cn-search-index']);
  assert.equal(DATA_SOURCES.cnSearchIndex.builder, 'cn-search/scripts/build-cn-search-index.mjs');
  assert.deepEqual(DATA_SOURCES.cnSearchIndex.inputs, ['external-cn-wardrobe', 'wardrobe']);
});

test('Gate 11A runtime ownership matches active HTML entry points', () => {
  const main = read('index.html');
  const biguse = read('biguse.html');
  const wardrobeCheck = read('wardrobechk.html');
  const material = read('material.html');
  const cnSearch = read('cn-search/index.html');

  assert.match(main, /src=['"]data\/wardrobe\.js['"]/);
  assert.match(biguse, /src=['"]data\/wardrobe\.js['"]/);
  assert.match(biguse, /src=['"]biguse_wardrobe\.js['"]/);
  assert.match(wardrobeCheck, /src=['"]data\/wardrobe\.js['"]/);
  assert.match(cnSearch, /src=['"]\.\.\/data\/wardrobe\.js['"]/);
  assert.match(material, /src=['"]data\/material_wardrobe\.js['"]/);

  for (const html of [main, biguse, wardrobeCheck, material, cnSearch]) {
    assert.doesNotMatch(html, /src=['"](?:\.\.\/)?wardrobe\.js['"]/);
    assert.doesNotMatch(html, /src=['"](?:\.\.\/)?data\/biguse_wardrobe\.js['"]/);
  }
});

test('Gate 11A canonical wardrobe is newer and a strict identity superset of root snapshot', () => {
  const canonical = loadWardrobe('data/wardrobe.js');
  const rootSnapshot = loadWardrobe('wardrobe.js');

  assert.ok(Array.isArray(canonical.rows));
  assert.ok(Array.isArray(rootSnapshot.rows));
  assert.ok(canonical.rows.length > rootSnapshot.rows.length);

  const canonicalKeys = new Set(canonical.rows.map(row => row[1] + '|' + row[2]));
  for (const row of rootSnapshot.rows) {
    assert.ok(canonicalKeys.has(row[1] + '|' + row[2]), row[1] + '|' + row[2]);
  }

  const canonicalDate = Date.parse(canonical.lastUpdated);
  const snapshotDate = Date.parse(rootSnapshot.lastUpdated);
  assert.ok(Number.isFinite(canonicalDate));
  assert.ok(Number.isFinite(snapshotDate));
  assert.ok(canonicalDate > snapshotDate);
});

test('Gate 11A CN index builder consumes canonical TW wardrobe and emits the declared artifact', () => {
  const builder = read(DATA_SOURCES.cnSearchIndex.builder);

  assert.match(builder, /twPath = join\(REPO_ROOT, 'data', 'wardrobe\.js'\)/);
  assert.match(builder, /outPath = join\(CN_SEARCH_ROOT, 'data', 'cn_search_index\.json'\)/);
  assert.match(builder, /'external-cn-wardrobe': cnCtx\.sha256/);
  assert.match(builder, /wardrobe: twCtx\.sha256/);
});
