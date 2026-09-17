import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('Gate 9B keeps model collection exports concrete', () => {
  const model = read('model.mjs');
  const materialModel = read('material_model.mjs');

  assert.match(model, /@type \{ModelClothing\[\]\} \*\/\s*var clothes = typedClothes;/);
  assert.match(model, /@type \{Record<string, Record<string, ModelClothing>>\} \*\/\s*var clothesSet = typedClothesSet;/);
  assert.doesNotMatch(model, /@type \{any\[\]\} \*\/\s*var clothes = typedClothes;/);
  assert.match(materialModel, /@returns \{MaterialClothing\}/);
  assert.match(materialModel, /@type \{MaterialClothing\[\]\} \*\/\s*var clothes = function/);
  assert.match(materialModel, /@type \{Record<string, Record<string, MaterialClothing>>\} \*\/\s*var clothesSet = function/);
});

test('Gate 9C types stable action, hook and category boundaries without widening native DOM', () => {
  const material = read('material.mjs');
  const nikki = read('nikki.mjs');
  const lazy = read('onekeystrategy_lan.mjs');

  assert.match(material, /MaterialActions: \{ register\(actions: Record<string, \(\.\.\.args: never\[\]\) => unknown>\): void \}/);
  assert.match(nikki, /@typedef \{\(\.\.\.args: never\[\]\) => unknown\} RuntimeHook/);
  assert.doesNotMatch(nikki, /RuntimeHook[^\n]*any/);
  assert.match(nikki, /@type \{Record<string, string\[\]>\} \*\/\s*const CATEGORY_HIERARCHY = categoryHierarchy;/);
  assert.match(lazy, /category: string\[\]/);
  assert.match(lazy, /skipCategory: string\[\]/);
  assert.match(lazy, /repelCates: string\[\]\[\]/);
  assert.match(lazy, /clone: <T>\(value: T\) => T/);
});

test('Gate 9C gives Material global ingress concrete table contracts while preserving an explicit legacy dense view', () => {
  const material = read('material.mjs');

  for (const contract of [
    'MaterialPatternRow',
    'MaterialSetCategoryRow',
    'MaterialConvertRow',
    'MaterialConstructRow',
    'MaterialMerchantRow',
    'MaterialConvertPrice',
    'MaterialPatternPriceRow',
  ]) {
    assert.match(material, new RegExp(`@typedef \\{[^\\n]+\\} ${contract}`));
  }

  assert.match(material, /patternSource[^\n]*pattern: MaterialPatternRow\[\]/);
  assert.match(material, /setcategorySource[^\n]*setcategory: MaterialSetCategoryRow\[\]/);
  assert.match(material, /convertSource[^\n]*convert: MaterialConvertRow\[\]/);
  assert.match(material, /constructSource[^\n]*construct: MaterialConstructRow\[\]/);
  assert.match(material, /merchantSource[^\n]*merchant: MaterialMerchantRow\[\]/);
  assert.match(material, /convertPriceSource[^\n]*convertPrice: Record<string, MaterialConvertPrice>/);
  assert.match(material, /patternPriceSource[^\n]*patternPrice: MaterialPatternPriceRow\[\]/);
  assert.match(material, /@type \{LegacyDict\} \*\/\s*const pattern = patternSource;/);
});


test('Gate 9D retires dead global fallbacks while keeping active legacy bridges explicit', () => {
  const pageEvents = read('src/legacy/page-events.js');
  const materialActions = read('src/legacy/material-actions.js');
  const nativeDom = read('src/legacy/native-dom.js');
  const nikki = read('nikki.mjs');
  const material = read('material.mjs');

  assert.doesNotMatch(pageEvents, /root\[name\]/);
  assert.match(pageEvents, /MainActions\.run\(name\)/);
  assert.doesNotMatch(materialActions, /registry\[match\[1\]\] \|\| root\[match\[1\]\]/);
  assert.match(materialActions, /var fn = registry\[match\[1\]\];/);
  assert.match(nativeDom, /shared by the active matcher, BigUse, and Material runtimes/);
  assert.doesNotMatch(nikki, /legacyClothes(?:Set)?/);
  assert.match(nikki, /clothesSet as modelClothesSet, clothes as modelClothes/);
  assert.doesNotMatch(material, /legacyClothes(?:Set)?/);
  assert.match(material, /clothes as modelClothes, clothesSet as modelClothesSet/);
});
