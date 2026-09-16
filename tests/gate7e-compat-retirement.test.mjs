import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

const RETIRED = [
  'model.js', 'ui.js', 'nikki.js', 'onekeystrategy.js', 'onekeystrategy_lan.js', 'clock.js', 'sharewardrobe.js',
  'biguse_model.js', 'biguse_ui.js', 'biguse_nikki.js',
  'src/domain/wardrobe/runtime.js', 'src/domain/inventory/runtime.js', 'src/domain/biguse/runtime.js',
];

test('BigUse consumes the ESM graph instead of classic runtime scripts', () => {
  const html = read('biguse.html');
  assert.match(html, /src=['"]src\/legacy\/main-actions\.js['"]/);
  assert.match(html, /<script type=['"]module['"] src=['"]biguse\.mjs['"]><\/script>/);
  assert.doesNotMatch(html, /(?:model|ui|nikki|onekeystrategy|onekeystrategy_lan|clock|sharewardrobe|biguse_model|biguse_ui|biguse_nikki)\.js/);
  assert.doesNotMatch(html, /src\/domain\/(?:wardrobe|inventory|biguse)\/runtime\.js/);
});

test('BigUse makes former late-binding overrides explicit through runtime hooks', () => {
  const entry = read('biguse.mjs');
  const controller = read('nikki.mjs');
  assert.match(entry, /configureRuntimeHooks\(\{[\s\S]*drawTable,[\s\S]*chooseAccessories,[\s\S]*switchCate/);
  assert.match(controller, /runtimeHooks = \{ drawTable: null, chooseAccessories: null, switchCate: null \}/);
  assert.match(controller, /invokeDrawTable/);
  assert.match(controller, /invokeChooseAccessories/);
  assert.match(controller, /invokeSwitchCate/);
});

test('classic Main, BigUse and domain compatibility files are retired', () => {
  for (const file of RETIRED) assert.equal(existsSync(new URL(`../${file}`, import.meta.url)), false, file);
});

test('active ESM runtimes contain no classic domain globals', () => {
  for (const file of ['model.mjs', 'nikki.mjs', 'biguse.mjs', 'biguse_model.mjs', 'biguse_ui.mjs', 'biguse_nikki.mjs', 'material_model.mjs', 'material.mjs', 'wardrobechk.mjs']) {
    assert.doesNotMatch(read(file), /WardrobeDomain|InventoryDomain/, file);
  }
});
