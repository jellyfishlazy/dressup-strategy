import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function loadScript(file, context = {}) {
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), context, { filename: file, timeout: 10000 });
  return context;
}

function loadBridges(context) {
  loadScript('src/domain/wardrobe/runtime.js', context);
  loadScript('src/domain/inventory/runtime.js', context);
  return context;
}

const wardrobeRow = () => [
  '測試衣', '髮型', '001', '5', 'SS', 'S', 'A', 'B', 'C', 'SS', 'S', 'A', 'B', 'C',
  'POP/小動物', '活動·測試', '測試套裝', 'V1',
];

test('Wardrobe Check uses the ESM wardrobe/inventory boundaries', () => {
  const source = readFileSync(new URL('../wardrobechk.mjs', import.meta.url), 'utf8');
  assert.match(source, /import \{ rowToWardrobeItem \} from '\.\/src\/domain\/wardrobe\/index\.mjs'/);
  assert.match(source, /import \{ createInventory, readBrowser \} from '\.\/src\/domain\/inventory\/index\.mjs'/);
  assert.match(source, /rowToWardrobeItem\(csv\)/);
  assert.match(source, /createInventory\(\{/);
  assert.match(source, /readBrowser\(storage, document\)/);
  assert.doesNotMatch(source, /WardrobeDomain|InventoryDomain/);
});

test('Material Clothes uses named wardrobe fields without changing material semantics', () => {
  const theType = { type: '髮型', mainType: '髮型', score: { SS: 100, S: 80, A: 60, B: 40, C: 20 }, deviation: { SS: 0, S: 0, A: 0, B: 0, C: 0 } };
  const context = loadBridges({
    wardrobe: [], category: [], skipCategory: [], repelCates: [], typeInfo: { '髮型': theType },
    Flist: {}, manualScoring: {}, pattern_extra: null,
    $: { inArray: (value, list) => list.indexOf(value) },
  });
  loadScript('material_model.js', context);
  const piece = context.Clothes(wardrobeRow());
  assert.equal(piece.name, '測試衣');
  assert.equal(piece.id, '001');
  assert.equal(piece.longid, '10001');
  assert.equal(piece.source, '活動·測試');
  assert.equal(piece.set, '測試套裝');
  assert.equal(piece.version, 'V1');
  assert.deepEqual(Array.from(piece.tags), ['POP', '小動物']);
  assert.deepEqual(Array.from(piece.toCsv()).slice(-4), ['POP/小動物', '活動·測試', '測試套裝', 'V1']);
});

test('Material inventory delegates to shared InventoryDomain format', () => {
  const context = loadBridges({ wardrobe: [], category: [], skipCategory: [], repelCates: [], typeInfo: {}, Flist: {}, manualScoring: {} });
  loadScript('material_model.js', context);
  const mine = context.MyClothes();
  mine.mine = { '髮型': ['001'], '飾品': ['123'] };
  mine.size = 2;
  assert.equal(mine.serialize(), '髮型:001|飾品:123|');
  const restored = context.MyClothes();
  restored.deserialize(mine.serialize());
  assert.equal(restored.size, 2);
  assert.deepEqual(Object.keys(restored.mine), ['髮型', '飾品']);
});

test('secondary entry points no longer parse wardrobe columns by magic index', () => {
  const wardrobeCheck = readFileSync(new URL('../wardrobechk.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(wardrobeCheck, /csv\s*\[\s*\d+\s*\]/);
  assert.match(wardrobeCheck, /rowToWardrobeItem\(csv\)/);
  const materialSource = readFileSync(new URL('../material_model.js', import.meta.url), 'utf8');
  assert.doesNotMatch(materialSource, /csv\s*\[\s*\d+\s*\]/);
  assert.match(materialSource, /WardrobeDomain\.rowToWardrobeItem/);
  assert.match(materialSource, /InventoryDomain\.(?:serialize|deserialize|read)/);
  const exc = readFileSync(new URL('../material_exc.js', import.meta.url), 'utf8');
  assert.match(exc, /^﻿?\/\*[\s\S]*?wardrobe\[i\][\s\S]*?\*\//, 'material_exc magic-index-looking code remains commented/dead');
});
