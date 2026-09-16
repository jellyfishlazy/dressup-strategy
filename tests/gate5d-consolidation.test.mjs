import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function loadRuntime() {
  const context = { escape, unescape };
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL('../src/domain/inventory/runtime.js', import.meta.url), 'utf8'), context);
  return context.InventoryDomain;
}

test('shared inventory factory preserves matcher/material semantics', () => {
  const domain = loadRuntime();
  const inv = domain.createInventory({ typeOf: item => item.type.mainType });
  const clothes = [
    { own: true, type: { mainType: '1' }, id: '001' },
    { own: false, type: { mainType: '1' }, id: '002' },
    { own: true, type: { mainType: '8' }, id: '010' },
  ];
  inv.filter(clothes);
  assert.equal(inv.size, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(inv.mine)), { 1: ['001'], 8: ['010'] });
  assert.equal(inv.serialize(), '1:001|8:010|');
  const restored = domain.createInventory({ typeOf: item => item.type.mainType });
  restored.deserialize('1:002|8:010|');
  restored.update(clothes);
  assert.equal(clothes[0].own, false);
  assert.equal(clothes[1].own, true);
  assert.equal(clothes[2].own, true);
});

test('shared inventory factory supports wardrobe-check clothing shape', () => {
  const domain = loadRuntime();
  const inv = domain.createInventory({ typeOf: item => item.mainType });
  const clothes = [{ own: true, mainType: '髮型', id: '001' }, { own: false, mainType: '鞋子', id: '002' }];
  inv.filter(clothes);
  assert.equal(inv.serialize(), '髮型:001|');
  inv.deserialize('鞋子:002|');
  inv.update(clothes);
  assert.equal(clothes[0].own, false);
  assert.equal(clothes[1].own, true);
});

test('browser storage helpers preserve localStorage precedence and cookie fallback', () => {
  const domain = loadRuntime();
  const storage = { myClothesNew: '1:001|', myClothes: 'legacy' };
  assert.deepEqual(JSON.parse(JSON.stringify(domain.readBrowser(storage, { cookie: 'mine2=cookie' }))), { current: '1:001|', legacy: 'legacy' });
  domain.writeBrowser(storage, { cookie: '' }, '8:002|');
  assert.equal(storage.myClothesNew, '8:002|');

  const doc = { cookie: 'mine2=1%3A001%7C; mine=OldName' };
  assert.deepEqual(JSON.parse(JSON.stringify(domain.readBrowser(null, doc))), { current: '1:001|', legacy: 'OldName' });
  const outDoc = { cookie: '' };
  domain.writeBrowser(null, outDoc, '1:001|');
  assert.match(outDoc.cookie, /^mine2=1%3A001%7C; expires=/);
});

test('inventory consumers delegate to shared boundaries and are lint-covered', () => {
  for (const file of ['model.mjs', 'material_model.mjs', 'wardrobechk.mjs']) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.match(source, /from '\.\/src\/domain\/inventory\/index\.mjs'/, file);
    assert.doesNotMatch(source, /InventoryDomain|function (?:getCookie|setCookie)\(/, file);
  }

  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  for (const file of ['model.mjs', 'main.mjs', 'biguse_model.js', 'biguse_ui.js', 'material_model.mjs', 'material.mjs', 'wardrobechk.mjs']) {
    assert.match(pkg.scripts.lint, new RegExp(file.replace('.', '\\.')));
  }
});
