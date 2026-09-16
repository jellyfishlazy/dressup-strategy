import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function loadScript(file, context = {}) {
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), context, { filename: file, timeout: 10000 });
  return context;
}

test('BigUse domain selects carts without sharing or hidden global lookup', () => {
  const ctx = loadScript('src/domain/biguse/runtime.js', {});
  const a = { name: 'A' };
  const b = { name: 'B' };
  assert.equal(ctx.BigUseDomain.cartForIndex(1, a, b), a);
  assert.equal(ctx.BigUseDomain.cartForIndex(2, a, b), b);
  assert.equal(ctx.BigUseDomain.cartForIndex(99, a, b), b);
});

test('BigUse score comparison preserves the existing ±10 percent rule and tie behavior', () => {
  const ctx = loadScript('src/domain/biguse/runtime.js', {});
  for (const [a, b, close, winner] of [
    [90, 100, true, null],
    [100, 100, true, null],
    [110, 100, true, null],
    [89, 100, false, 'B'],
    [111, 100, false, 'A'],
    [0, 0, true, null],
  ]) {
    const result = ctx.BigUseDomain.compareScores(a, b);
    assert.equal(result.close, close);
    assert.equal(result.winner, winner);
    assert.equal(result.scoreA, a);
    assert.equal(result.scoreB, b);
  }
});

test('BigUse autocomplete suggestions preserve substring matching and Clothes identity', () => {
  const ctx = loadScript('src/domain/biguse/runtime.js', {});
  const first = { name: 'Alpha Dress', id: '001' };
  const second = { name: 'Beta Alpha', id: '002' };
  const third = { name: 'Gamma', id: '003' };
  const results = ctx.BigUseDomain.autocompleteSuggestions([first, second, third], 'Alpha');
  assert.deepEqual(Array.from(results, item => item.value), ['Alpha Dress', 'Beta Alpha']);
  assert.equal(results[0].data, first);
  assert.equal(results[1].data, second);
  assert.equal(ctx.BigUseDomain.autocompleteSuggestions([first], '').length, 0);
});

test('BigUse image identity uses named Clothes fields and preserves legacy image ids', () => {
  const ctx = loadScript('src/domain/biguse/runtime.js', {});
  const piece = (type, id) => ({ type: { type }, id });
  assert.deepEqual({ ...ctx.BigUseDomain.pieceIdentity(piece('飾品-頭飾·髮飾', '001')) }, { type: '飾品-頭飾·髮飾', id: '001' });
  assert.equal(ctx.BigUseDomain.imageLongId(piece('髮型', '001')), '10001');
  assert.equal(ctx.BigUseDomain.imageLongId(piece('飾品-頭飾·髮飾', '123')), '80123');
  assert.equal(ctx.BigUseDomain.imageLongId(piece('飾品-手持·右', '1234')), '81234');
  assert.equal(ctx.BigUseDomain.imageLongId(piece('螢光之靈', '081')), '100081');
  assert.equal(ctx.BigUseDomain.imageLongId({ name: '總分' }), '');
});

test('BigUse UI no longer reverse-adapts Clothes through CSV or clothesSet lookups', () => {
  const source = readFileSync(new URL('../biguse_ui.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\.toCsv\s*\(/);
  assert.doesNotMatch(source, /clothesSet\s*\[/);
  assert.doesNotMatch(source, /csv\s*\[\s*\d+\s*\]/);
  assert.match(source, /BigUseDomain\.pieceIdentity\(piece\)/);
  assert.match(source, /BigUseDomain\.imageLongId\(piece\)/);
  assert.match(source, /\.put\(suggestion\.data\)/);
  assert.match(source, /NativeAutocomplete\.attach/);
  assert.match(source, /BigUseDomain\.autocompleteSuggestions\(clothes, query\)/);
});
