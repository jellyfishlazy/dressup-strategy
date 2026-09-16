import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('Wardrobe Check entry point is an ES module with direct domain imports', () => {
  const html = read('wardrobechk.html');
  const source = read('wardrobechk.mjs');

  assert.match(html, /<script type="module" src="wardrobechk\.mjs"><\/script>/);
  assert.doesNotMatch(html, /src\/domain\/(?:wardrobe|inventory)\/runtime\.js/);
  assert.doesNotMatch(html, /wardrobechk\.js/);
  assert.equal(existsSync(new URL('../wardrobechk.js', import.meta.url)), false);

  assert.match(source, /from '\.\/src\/domain\/wardrobe\/index\.mjs'/);
  assert.match(source, /from '\.\/src\/domain\/inventory\/index\.mjs'/);
  assert.doesNotMatch(source, /WardrobeDomain|InventoryDomain/);
});

test('Wardrobe Check module does not regenerate inline category handlers', () => {
  const source = read('wardrobechk.mjs');
  assert.match(source, /data-wardrobe-category/);
  assert.match(source, /addEventListener\('click'/);
  assert.doesNotMatch(source, /on(?:click|change|input|error)\s*=/i);
  assert.doesNotMatch(source, /javascript:void\(0\)/i);
});

test('Wardrobe Check remains in lint while classic bridge consumers keep shrinking', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.match(pkg.scripts.lint, /wardrobechk\.mjs/);
  assert.doesNotMatch(pkg.scripts.lint, /wardrobechk\.js/);

  const model = read('model.js');
  assert.match(model, /WardrobeDomain\.rowToWardrobeItem/);
  assert.match(model, /InventoryDomain\./);
  assert.doesNotMatch(read('wardrobechk.mjs'), /WardrobeDomain|InventoryDomain/);
});
