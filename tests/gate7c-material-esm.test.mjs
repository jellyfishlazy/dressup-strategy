import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('Material entry point is an ES module with direct domain imports', () => {
  const html = read('material.html');
  const ui = read('material.mjs');
  const model = read('material_model.mjs');

  assert.match(html, /<script type="module" src="material\.mjs"><\/script>/);
  assert.doesNotMatch(html, /src\/domain\/(?:wardrobe|inventory)\/runtime\.js/);
  assert.doesNotMatch(html, /material_model\.js|material\.js/);
  assert.equal(existsSync(new URL('../material_model.js', import.meta.url)), false);
  assert.equal(existsSync(new URL('../material.js', import.meta.url)), false);

  assert.match(ui, /from '\.\/material_model\.mjs'/);
  assert.match(model, /from '\.\/src\/domain\/wardrobe\/index\.mjs'/);
  assert.match(model, /from '\.\/src\/domain\/inventory\/index\.mjs'/);
  assert.doesNotMatch(ui + model, /WardrobeDomain|InventoryDomain/);
});

test('Material delegated actions use an explicit module registry', () => {
  const bridge = read('src/legacy/material-actions.js');
  const ui = read('material.mjs');
  assert.match(bridge, /function register\(actions\)/);
  assert.match(bridge, /registry\[match\[1\]\]/);
  assert.match(ui, /MaterialActions\.register\(\{/);
  assert.doesNotMatch(bridge, /\beval\s*\(|new Function/);
});

test('classic wardrobe and inventory bridges now remain only for the main matcher chain', () => {
  const model = read('model.js');
  assert.match(model, /WardrobeDomain\.rowToWardrobeItem/);
  assert.match(model, /InventoryDomain\./);
  for (const file of ['material_model.mjs', 'material.mjs', 'wardrobechk.mjs']) {
    assert.doesNotMatch(read(file), /WardrobeDomain|InventoryDomain/, file);
  }
});
