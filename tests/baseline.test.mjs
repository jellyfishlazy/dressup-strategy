import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { CN2TW_CATEGORY, CN_TAG_OVERRIDE, splitPreserveSeg } from '../cn-search/scripts/cn-tag-map.mjs';
import { importOpencc } from '../cn-search/scripts/shared-deps.mjs';
import { validateRows } from '../scripts/validate-data.mjs';
import * as BigUseDomain from '../src/domain/biguse/index.mjs';

function loadScript(file, context = {}) {
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), context, { filename: file, timeout: 10000 });
  return context;
}

async function loadMatcherModel(overrides = {}) {
  const previous = new Map();
  const globals = {
    wardrobe: [], category: [], skipCategory: [], typeInfo: {}, Flist: {}, repelCates: [], pattern: [],
    Dom: { inArray: (value, list) => list.indexOf(value) },
    ...overrides,
  };
  for (const [key, value] of Object.entries(globals)) {
    previous.set(key, globalThis[key]);
    globalThis[key] = value;
  }
  try {
    const imported = await import(`../model.mjs?baseline-${Date.now()}-${Math.random()}`);
    return { ...imported };
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
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

test('accessory scoring preserves thresholds and applies the floor', async () => {
  const model = await loadMatcherModel();
  assert.equal(model.accScore(100, 3), 100);
  assert.equal(model.accScore(100, 4), 95);
  assert.equal(model.accScore(100, 16), 40);
  assert.equal(model.accScore(100, 30), 40);
  assert.equal(model.accSumScore({ tmpScore: 100, bonusScore: 20 }, 4), 115);
});

test('domain IDs retain category prefixes and leading zeroes', async () => {
  const model = await loadMatcherModel();
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
  const s2tw = mod.Converter({ from: 'cn', to: 'tw' });
  assert.equal(s2tw('头发'), '頭髮');
  assert.equal(s2tw('栗梦心语'), '栗夢心語');
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

async function cartModel(options = {}) {
  return loadMatcherModel(options);
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

test('fresh carts isolate membership and total score state', async () => {
  const model = await cartModel();
  const carts = [model.shoppingCart, model.createShoppingCart(), model.createShoppingCart(), model.createShoppingCart(), model.createShoppingCart()];
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

test('validation removes only from its receiver for both repel branches and accessory limits', async () => {
  for (const [first, others, expected] of [[100, 60, ['上衣', '下著']], [120, 60, ['連身裙']], [150, 60, ['連身裙']]]) {
    const model = await cartModel({ repelCates: [['連身裙', '上衣', '下著']] });
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
  const model = await cartModel({ category });
  const cart = model.createShoppingCart();
  const pieces = category.map((type, i) => scoredPiece(model, type, 100 - i * 10));
  cart.putAll(pieces);
  model.shoppingCart.putAll(pieces);
  cart.validate({}, 1);
  assert.deepEqual(Object.keys(cart.cart), [category[0]]);
  assert.equal(Object.keys(model.shoppingCart.cart).length, 3);
});

test('cart totals preserve accessory discount, bonuses, rounding and category output', async () => {
  const model = await cartModel();
  const cart = model.createShoppingCart();
  cart.put(scoredPiece(model, '髮型', 51));
  for (let i = 0; i < 4; i++) cart.put(scoredPiece(model, `飾品-${i}`, 101, 20));
  cart.calc({});
  assert.equal(cart.totalScore.sumScore, 515); // round(51 + 404 * .95 + 80)
  assert.equal(cart.totalScore.toCsv()[3], '515');
});

test('rating and Clothes CSV conversion preserve values without overwriting globals', async () => {
  const type = { type: '髮型', mainType: '髮型', score: { S: 100 }, deviation: { S: 2, 3: 1 } };
  const names = ['name', 'type', 'id', 'stars', 'simple', 'cute', 'active', 'pure', 'cool', 'extra', 'source', 'isSuit', 'version', 'real', 'symbol', 'score', 'dev'];
  const previous = new Map(names.map(name => [name, globalThis[name]]));
  for (const name of names) globalThis[name] = 'sentinel';
  const model = await cartModel({ typeInfo: { '髮型': type } });
  assert.deepEqual(Array.from(model.realRating('', 'S', type)), ['', 'S', -100, 2]);
  assert.deepEqual(Array.from(model.realRating('3', '', type)), ['3', '', 45, 1]);
  const piece = model.Clothes(['name', '髮型', '001', '5', '', 'S', '', 'S', '', 'S', '', 'S', 'S', '', 'POP/小動物', '抽·店', 'suit', 'v1']);
  assert.deepEqual(Array.from(piece.toCsv()), ['髮型', '001', '5', 'S', '', 'S', '', 'S', '', 'S', '', 'S', '', 'POP/小動物', '店', 'suit', 'v1']);
  for (const name of names) assert.equal(globalThis[name], 'sentinel', name);
  for (const [name, value] of previous) {
    if (value === undefined) delete globalThis[name];
    else globalThis[name] = value;
  }
});

test('BigUse uses numeric model totals without DOM score reads, preserving boundaries and ties', () => {
  const source = readFileSync(new URL('../biguse_ui.mjs', import.meta.url), 'utf8');
  assert.match(source, /compareScores\(shoppingCart1\.totalScore\.sumScore, shoppingCart2\.totalScore\.sumScore\)/);
  assert.doesNotMatch(source, /#shoppingCart1[^\n]*\.text\(|#shoppingCart2[^\n]*\.text\(/);
  for (const [a, b, winner] of [[9, 100, 'B'], [100, 9, 'A'], [89, 100, 'B'], [90, 100, null], [100, 100, null], [110, 100, null], [111, 100, 'A'], [0, 0, null]]) {
    assert.equal(BigUseDomain.compareScores(a, b).winner, winner);
  }
});
