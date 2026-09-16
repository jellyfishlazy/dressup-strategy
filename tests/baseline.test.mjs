import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { CN2TW_CATEGORY, CN_TAG_OVERRIDE, splitPreserveSeg } from '../cn-search/scripts/cn-tag-map.mjs';
import { importOpencc } from '../cn-search/scripts/shared-deps.mjs';
import { validateRows } from '../scripts/validate-data.mjs';

function loadScript(file, context = {}) {
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), context, { filename: file, timeout: 10000 });
  return context;
}

function loadMatcherModel(context = {}) {
  const model = context;
  loadScript('src/domain/wardrobe/runtime.js', model);
  loadScript('src/domain/inventory/runtime.js', model);
  return loadScript('model.js', model);
}

test('clone copies nested arrays/objects without sharing mutable children', () => {
  const context = loadScript('tool.js');
  assert.equal(vm.runInContext(`
    var original = {items: [{name: '春櫻'}], empty: null, enabled: false};
    var copied = clone(original);
    copied.items[0].name = 'changed';
    original.items[0].name === '春櫻' && copied.empty === null && copied.enabled === false
      && Array.isArray(copied.items);
  `, context), true);
});

test('accessory scoring preserves thresholds and applies the floor', () => {
  const model = loadMatcherModel({ wardrobe: [], category: [], skipCategory: [] });
  assert.equal(model.accScore(100, 3), 100);
  assert.equal(model.accScore(100, 4), 95);
  assert.equal(model.accScore(100, 16), 40);
  assert.equal(model.accScore(100, 30), 40);
  assert.equal(model.accSumScore({ tmpScore: 100, bonusScore: 20 }, 4), 115);
});

test('domain IDs retain category prefixes and leading zeroes', () => {
  const model = loadMatcherModel({ wardrobe: [], category: [], skipCategory: [] });
  assert.equal(model.clotonum('髮型', '001'), '10001');
  assert.equal(model.clotonum('飾品-手持·右', '1234'), '81234');
  assert.equal(model.clotonum('螢光之靈', '081'), 'A0081');
});

test('CN mappings and mixed tag separators preserve established semantics', () => {
  assert.equal(CN2TW_CATEGORY['连衣裙'], '連身裙');
  assert.equal(CN_TAG_OVERRIDE['现代流行'], 'POP');
  assert.deepEqual(splitPreserveSeg('POP/动物系,舞者，泳装'), ['POP', '/', '动物系', ',', '舞者', '，', '泳装']);
});

test('OpenCC resolves from repository dependencies and converts CN to TW', async () => {
  const mod = await importOpencc();
  assert.equal(mod.Converter({ from: 'cn', to: 'tw' })('头发'), '頭髮');
});

const row = () => ['name', 'type', '001', ...Array(15).fill('')];
test('validator accepts valid identities including the same id in different types', () => {
  const other = row(); other[1] = 'other';
  assert.deepEqual(validateRows([row(), other], 'fixture'), []);
});
test('validator rejects malformed rows, missing identities, empty data and duplicates', () => {
  assert.match(validateRows([[]], 'fixture')[0], /fixture: row 1: expected 18 fields/);
  for (const column of [0, 1, 2]) {
    const invalid = row(); invalid[column] = ' ';
    assert.match(validateRows([invalid], 'fixture')[0], /required/);
  }
  assert.match(validateRows([], 'fixture')[0], /non-empty/);
  assert.match(validateRows([row(), row()], 'fixture')[0], /duplicate.*rows 1, 2/);
});
test('duplicate exceptions are exact and stale exceptions fail', () => {
  const known = [[row(), row()]];
  assert.deepEqual(validateRows([row(), row()], 'fixture', known), []);
  assert.match(validateRows([row(), row(), row()], 'fixture', known)[0], /duplicate/);
  const changed = row(); changed[0] = 'changed';
  assert.match(validateRows([row(), changed], 'fixture', known)[0], /duplicate/);
  assert.match(validateRows([row()], 'fixture', known)[0], /stale/);
});

function cartModel(options = {}) {
  return loadMatcherModel({ wardrobe: [], category: [], skipCategory: [], repelCates: [], ...options });
}

function scoredPiece(model, type, score, bonus = 0) {
  const piece = {
    type: { type }, tmpScore: score, bonusScore: bonus, sumScore: score + bonus,
    tmpScoreByCategory: model.ScoreByCategory(), bonusByCategory: model.ScoreByCategory(),
    calc() {},
  };
  piece.tmpScoreByCategory.record('simple', score, 0);
  piece.bonusByCategory.record('simple', bonus, 0);
  return piece;
}

test('fresh carts and BigUse carts isolate membership and total score state', () => {
  const model = cartModel();
  loadScript('biguse_model.js', model);
  const carts = [model.shoppingCart, model.shoppingCart1, model.shoppingCart2, model.createShoppingCart(), model.createShoppingCart()];
  assert.equal(new Set(carts.map(c => c.cart)).size, carts.length);
  assert.equal(new Set(carts.map(c => c.totalScore)).size, carts.length);
  const piece = scoredPiece(model, '髮型', 100);
  carts[0].put(piece);
  carts[0].calc({});
  for (const cart of carts.slice(1)) {
    assert.equal(cart.contains(piece), false);
    assert.equal(cart.totalScore.sumScore, 0);
  }
  carts[1].put(piece);
  carts[0].remove('髮型');
  assert.equal(carts[1].contains(piece), true);
  carts[0].put(piece);
  carts[1].clear();
  assert.equal(carts[0].contains(piece), true);
});

test('validation removes only from its receiver for both repel branches and accessory limits', () => {
  for (const [first, others, expected] of [[100, 60, ['上衣', '下著']], [120, 60, ['連身裙']], [150, 60, ['連身裙']]]) {
    const model = cartModel({ repelCates: [['連身裙', '上衣', '下著']] });
    const cart = model.createShoppingCart();
    const pieces = [scoredPiece(model, '連身裙', first), scoredPiece(model, '上衣', others), scoredPiece(model, '下著', others)];
    cart.putAll(pieces);
    model.shoppingCart.putAll(pieces);
    cart.validate({});
    assert.deepEqual(Object.keys(cart.cart), expected);
    assert.equal(Object.keys(model.shoppingCart.cart).length, 3);
    assert.equal(Object.hasOwn(model, 'currCate'), false);
  }
  const category = ['飾品-頭飾', '飾品-耳飾', '飾品-頸飾'];
  const model = cartModel({ category });
  const cart = model.createShoppingCart();
  const pieces = category.map((type, i) => scoredPiece(model, type, 100 - i * 10));
  cart.putAll(pieces);
  model.shoppingCart.putAll(pieces);
  cart.validate({}, 1);
  assert.deepEqual(Object.keys(cart.cart), [category[0]]);
  assert.equal(Object.keys(model.shoppingCart.cart).length, 3);
});

test('cart totals preserve accessory discount, bonuses, rounding and category output', () => {
  const model = cartModel();
  const cart = model.createShoppingCart();
  cart.put(scoredPiece(model, '髮型', 51));
  for (let i = 0; i < 4; i++) cart.put(scoredPiece(model, `飾品-${i}`, 101, 20));
  cart.calc({});
  assert.equal(cart.totalScore.sumScore, 515); // round(51 + 404 * .95 + 80)
  assert.equal(cart.totalScore.toCsv()[3], '515');
});

test('rating and Clothes CSV conversion preserve values without overwriting globals', () => {
  const type = { type: '髮型', score: { S: 100 }, deviation: { S: 2, 3: 1 } };
  const model = cartModel({ typeInfo: { '髮型': type } });
  const names = ['name', 'type', 'id', 'stars', 'simple', 'cute', 'active', 'pure', 'cool', 'extra', 'source', 'isSuit', 'version', 'real', 'symbol', 'score', 'dev'];
  for (const name of names) model[name] = 'sentinel';
  assert.deepEqual(Array.from(model.realRating('', 'S', type)), ['', 'S', -100, 2]);
  assert.deepEqual(Array.from(model.realRating('3', '', type)), ['3', '', 45, 1]);
  const piece = model.Clothes(['name', '髮型', '001', '5', '', 'S', '', 'S', '', 'S', '', 'S', 'S', '', 'POP/小動物', '抽·店', 'suit', 'v1']);
  assert.deepEqual(Array.from(piece.toCsv()), ['髮型', '001', '5', 'S', '', 'S', '', 'S', '', 'S', '', 'S', '', 'POP/小動物', '店', 'suit', 'v1']);
  for (const name of names) assert.equal(model[name], 'sentinel', name);
});

test('BigUse uses numeric model totals without DOM score reads, preserving boundaries and ties', () => {
  let advice;
  const model = cartModel({ document: {}, criteria: {}, byCategoryAndScore: () => 0 });
  model.$ = selector => {
    if (selector === model.document) return { ready() {} };
    assert.equal(selector, '#advise', 'only advice output may access the DOM');
    return { text(value) { assert.equal(typeof value, 'string'); advice = value; } };
  };
  loadScript('biguse_model.js', model);
  loadScript('biguse_ui.js', model);
  let renders = 0;
  model.drawTable = () => { renders++; }; // no rendered score text exists
  for (const [a, b, winner] of [[9, 100, 'B'], [100, 9, 'A'], [89, 100, 'B'], [90, 100, null], [100, 100, null], [110, 100, null], [111, 100, 'A'], [0, 0, null]]) {
    model.shoppingCart1.clear();
    model.shoppingCart2.clear();
    model.shoppingCart1.put(scoredPiece(model, '髮型', a));
    model.shoppingCart2.put(scoredPiece(model, '髮型', b));
    model.refreshShoppingCartBiguse();
    assert.equal(advice, winner
      ? `搭配A:${a}分, 搭配B: ${b}分, 當前搭配情況下選擇   [${winner}]    `
      : '當前兩種搭配分值過於接近, 建議去詢問群裡的小夥伴後再選擇');
  }
  assert.equal(renders, 16);
});
