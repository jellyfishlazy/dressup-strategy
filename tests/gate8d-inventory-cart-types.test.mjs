import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('Gate 8D defines explicit shopping-cart contracts', () => {
  const types = read('src/domain/shopping-cart/types.d.ts');
  assert.match(types, /export interface ShoppingCartTotal/);
  assert.match(types, /export interface ShoppingCartBase/);
  assert.match(types, /export interface MatcherShoppingCart/);
  assert.match(types, /export interface MaterialShoppingCart/);
  assert.match(types, /totalScore: ShoppingCartTotal \| null/);
});

test('Main, Material and BigUse consume shopping-cart/inventory contracts', () => {
  const main = read('model.mjs');
  const material = read('material_model.mjs');
  const biguse = read('biguse_model.mjs');
  const wardrobeCheck = read('wardrobechk.mjs');

  assert.match(main, /shopping-cart\/types\.d\.ts/);
  assert.match(main, /@returns \{MatcherCart\}/);
  assert.match(main, /@returns \{ClothesInventory\}/);
  assert.match(material, /shopping-cart\/types\.d\.ts/);
  assert.match(material, /@type \{MaterialCart\}/);
  assert.match(material, /@returns \{ClothesInventory\}/);
  assert.match(biguse, /@type \{MatcherCart\}/);
  assert.match(wardrobeCheck, /WardrobeInventory/);
});

test('inventory toggle accepts legacy UI trigger without leaking it into behavior', () => {
  const source = read('nikki.mjs');
  assert.match(source, /@param \{HTMLElement \| null\} \[_triggerElement\]/);
  assert.match(source, /function toggleInventory\(type, id, _triggerElement\)/);
});

test('Gate 8D reduces baseline and removes cart/inventory signature diagnostics', () => {
  const baseline = JSON.parse(read('typecheck-baseline.json'));
  assert.ok(baseline.diagnostic_count < 57);
  assert.equal(baseline.diagnostics.some(item =>
    (item.file === 'ui.mjs' || item.file === 'biguse_ui.mjs') && item.code === 2554), false);
  assert.equal(baseline.diagnostics.some(item =>
    ['model.mjs', 'material_model.mjs', 'biguse_model.mjs'].includes(item.file)), false);
});
