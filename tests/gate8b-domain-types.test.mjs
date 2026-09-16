import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('Gate 8B defines explicit wardrobe, inventory and BigUse domain contracts', () => {
  const wardrobe = read('src/domain/wardrobe/types.d.ts');
  const inventory = read('src/domain/inventory/types.d.ts');
  const biguse = read('src/domain/biguse/types.d.ts');

  assert.match(wardrobe, /export interface WardrobeItem/);
  assert.match(wardrobe, /export type WardrobeRow = readonly \[/);
  assert.match(wardrobe, /export type RatingField/);
  assert.match(inventory, /export interface Inventory<.*InventoryClothing/s);
  assert.match(inventory, /export type InventoryMine = Record<string, string\[\]>/);
  assert.match(biguse, /export interface BigUseComparison/);
  assert.match(biguse, /export interface AutocompleteSuggestion<T>/);
});

test('domain implementations consume their contracts without runtime TypeScript imports', () => {
  for (const file of [
    'src/domain/wardrobe/schema.mjs',
    'src/domain/wardrobe/adapter.mjs',
    'src/domain/inventory/index.mjs',
    'src/domain/biguse/index.mjs',
  ]) {
    const source = read(file);
    assert.match(source, /import\('\.\/types\.d\.ts'\)/, file);
    assert.doesNotMatch(source, /^import .*types\.d\.ts/m, file);
  }
});

test('Gate 8B reduces the baseline and leaves domain files diagnostic-free', () => {
  const baseline = JSON.parse(read('typecheck-baseline.json'));
  assert.equal(baseline.diagnostic_count, 75);
  assert.equal(baseline.diagnostics.some(item => item.file.startsWith('src/domain/')), false);
});

test('inventory cookie expiry uses the standard Date API', () => {
  const source = read('src/domain/inventory/index.mjs');
  assert.match(source, /toUTCString\(\)/);
  assert.doesNotMatch(source, /toGMTString\(\)/);
});
