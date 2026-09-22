import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const wardrobeRow = () => [
  '測試衣', '髮型', '001', '5', 'SS', 'S', 'A', 'B', 'C', 'SS', 'S', 'A', 'B', 'C',
  'POP/小動物', '活動·測試', '測試套裝', 'V1',
];

async function loadMaterialModel(name, overrides = {}) {
  const previous = new Map();
  const globals = {
    wardrobe: [], category: [], skipCategory: [], repelCates: [], typeInfo: {},
    Flist: {}, manualScoring: {}, pattern: [], pattern_extra: null,
    Dom: { inArray: (value, list) => list.indexOf(value) },
    ...overrides,
  };
  for (const [key, value] of Object.entries(globals)) {
    previous.set(key, globalThis[key]);
    globalThis[key] = value;
  }
  try {
    return await import(`../material_model.mjs?${name}-${Date.now()}-${Math.random()}`);
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
}

test('Wardrobe Check uses the ESM wardrobe/inventory boundaries', () => {
  const source = readFileSync(new URL('../wardrobechk.mjs', import.meta.url), 'utf8');
  assert.match(source, /import \{ rowToWardrobeItem \} from '\.\/src\/domain\/wardrobe\/index\.mjs'/);
  assert.match(source, /import \{ createInventory, readBrowser \} from '\.\/src\/domain\/inventory\/index\.mjs'/);
  assert.doesNotMatch(source, /WardrobeDomain|InventoryDomain/);
});

test('Material Clothes uses named wardrobe fields without changing material semantics', async () => {
  const theType = { type: '髮型', mainType: '髮型', score: { SS: 100, S: 80, A: 60, B: 40, C: 20 }, deviation: { SS: 0, S: 0, A: 0, B: 0, C: 0 } };
  const model = await loadMaterialModel('clothes', { typeInfo: { '髮型': theType } });
  const piece = model.Clothes(wardrobeRow());
  assert.equal(piece.name, '測試衣');
  assert.equal(piece.id, '001');
  assert.equal(piece.longid, '10001');
  assert.equal(piece.source, '活動·測試');
  assert.equal(piece.set, '測試套裝');
  assert.equal(piece.version, 'V1');
  assert.deepEqual(Array.from(piece.tags), ['POP', '小動物']);
  assert.deepEqual(Array.from(piece.toCsv()).slice(-4), ['POP/小動物', '活動·測試', '測試套裝', 'V1']);
});

test('Material inventory delegates to shared ESM inventory format', async () => {
  const model = await loadMaterialModel('inventory');
  const mine = model.MyClothes();
  mine.mine = { '髮型': ['001'], '飾品': ['123'] };
  mine.size = 2;
  assert.equal(mine.serialize(), '髮型:001|飾品:123|');
  const restored = model.MyClothes();
  restored.deserialize(mine.serialize());
  assert.equal(restored.size, 2);
  assert.deepEqual(Object.keys(restored.mine), ['髮型', '飾品']);
});

test('secondary entry points no longer parse wardrobe columns by magic index', () => {
  for (const file of ['wardrobechk.mjs', 'material_model.mjs']) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /csv\s*\[\s*\d+\s*\]/, file);
    assert.match(source, /rowToWardrobeItem/, file);
    assert.doesNotMatch(source, /WardrobeDomain|InventoryDomain/, file);
  }
  const exc = readFileSync(new URL('../material_exc.js', import.meta.url), 'utf8');
  assert.match(exc, /^﻿?\/\*[\s\S]*?wardrobe\[i\][\s\S]*?\*\//, 'material_exc magic-index-looking code remains commented/dead');
});
