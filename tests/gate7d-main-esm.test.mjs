import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const MAIN_MODULES = [
  'main.mjs', 'model.mjs', 'ui.mjs', 'nikki.mjs', 'onekeystrategy.mjs',
  'onekeystrategy_lan.mjs', 'sharewardrobe.mjs', 'clock.mjs',
];

test('Main Matcher entry point is a single ESM graph with direct domain imports', () => {
  const html = read('index.html');
  assert.match(html, /<script type=['"]module['"] src=['"]main\.mjs['"]><\/script>/);
  assert.match(html, /src=['"]src\/legacy\/main-actions\.js['"]/);
  assert.doesNotMatch(html, /src\/domain\/(?:wardrobe|inventory)\/runtime\.js/);
  for (const old of ['model.js', 'ui.js', 'nikki.js', 'onekeystrategy.js', 'onekeystrategy_lan.js', 'sharewardrobe.js', 'clock.js']) {
    assert.equal(existsSync(new URL(`../${old}`, import.meta.url)), true, old);
    assert.doesNotMatch(html, new RegExp(`src=['\"]${old.replace('.', '\\.')}['\"]`), old);
  }

  const model = read('model.mjs');
  assert.match(model, /from '\.\/src\/domain\/wardrobe\/index\.mjs'/);
  assert.match(model, /from '\.\/src\/domain\/inventory\/index\.mjs'/);
  assert.doesNotMatch(model, /WardrobeDomain|InventoryDomain/);
});

test('Main Matcher modules use explicit imports instead of classic runtime globals', () => {
  for (const file of MAIN_MODULES) {
    const source = read(file);
    assert.doesNotMatch(source, /WardrobeDomain|InventoryDomain/, file);
  }
  assert.match(read('ui.mjs'), /from '\.\/model\.mjs'/);
  assert.match(read('nikki.mjs'), /from '\.\/model\.mjs'/);
  assert.match(read('nikki.mjs'), /from '\.\/ui\.mjs'/);
  assert.match(read('onekeystrategy.mjs'), /from '\.\/nikki\.mjs'/);
  assert.match(read('onekeystrategy_lan.mjs'), /from '\.\/onekeystrategy\.mjs'/);
});

test('pure accMul helper belongs to the model module after migration', () => {
  const model = read('model.mjs');
  const nikki = read('nikki.mjs');
  assert.match(model, /function accMul\(arg1, arg2\)/);
  assert.match(nikki, /import \{[^}]*accMul[^}]*\} from '\.\/model\.mjs'/s);
  assert.doesNotMatch(nikki, /function accMul\(arg1, arg2\)/);
});

test('MainActions registry bridges legacy page events without eval or window leaks', () => {
  const bridge = read('src/legacy/main-actions.js');
  assert.match(bridge, /function register\(actions\)/);
  assert.match(bridge, /registry\[name\]/);
  assert.doesNotMatch(bridge, /\beval\s*\(|new Function/);
  assert.match(read('main.mjs'), /MainActions\.register\(\{/);
  assert.match(read('src/legacy/page-events.js'), /MainActions\.run\(name\)/);

  const context = { globalThis: {} };
  context.globalThis.globalThis = context.globalThis;
  vm.createContext(context.globalThis);
  vm.runInContext(bridge, context.globalThis);
  let calls = 0;
  context.globalThis.MainActions.register({ sample() { calls++; return 7; } });
  assert.equal(context.globalThis.MainActions.run('sample'), 7);
  assert.equal(calls, 1);
  assert.equal(context.globalThis.MainActions.run('missing'), undefined);
});

test('modernized entry chains are bridge-free while classic compatibility is isolated to BigUse', () => {
  for (const html of ['index.html', 'material.html', 'wardrobechk.html']) {
    assert.doesNotMatch(read(html), /src\/domain\/(?:wardrobe|inventory)\/runtime\.js/, html);
  }
  for (const file of [...MAIN_MODULES, 'material.mjs', 'material_model.mjs', 'wardrobechk.mjs']) {
    assert.doesNotMatch(read(file), /WardrobeDomain|InventoryDomain/, file);
  }

  const biguse = read('biguse.html');
  assert.match(biguse, /src\/domain\/wardrobe\/runtime\.js/);
  assert.match(biguse, /src\/domain\/inventory\/runtime\.js/);
  for (const file of ['model.js', 'ui.js', 'nikki.js', 'onekeystrategy.js', 'clock.js', 'sharewardrobe.js']) {
    assert.match(biguse, new RegExp(`src=['\"]${file.replace('.', '\\.')}['\"]`), file);
  }
});
