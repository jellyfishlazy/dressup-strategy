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

test('Wardrobe Check parses rows through WardrobeDomain and preserves inventory format', () => {
  const document = {};
  const context = loadBridges({
    document,
    wardrobe: [wardrobeRow()],
    category: ['髮型'],
    $: selector => selector === document ? { ready() {} } : {},
  });
  loadScript('wardrobechk.js', context);
  const piece = context.clothes[0];
  assert.deepEqual(
    { name: piece.name, type: piece.type, mainType: piece.mainType, id: piece.id },
    { name: '測試衣', type: '髮型', mainType: '髮型', id: '001' },
  );
  const mine = context.MyClothes();
  mine.mine = { '髮型': ['001', '010'] };
  mine.size = 2;
  assert.equal(mine.serialize(), '髮型:001,010|');
  const restored = context.MyClothes();
  restored.deserialize('髮型:001,010|');
  assert.equal(restored.size, 2);
  assert.deepEqual(Array.from(restored.mine['髮型']), ['001', '010']);
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
  for (const file of ['wardrobechk.js', 'material_model.js']) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /csv\s*\[\s*\d+\s*\]/, file);
    assert.match(source, /WardrobeDomain\.rowToWardrobeItem/, file);
    assert.match(source, /InventoryDomain\.(?:serialize|deserialize|read)/, file);
  }
  const exc = readFileSync(new URL('../material_exc.js', import.meta.url), 'utf8');
  assert.match(exc, /^﻿?\/\*[\s\S]*?wardrobe\[i\][\s\S]*?\*\//, 'material_exc magic-index-looking code remains commented/dead');
});
