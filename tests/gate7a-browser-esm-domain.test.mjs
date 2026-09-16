import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

import * as wardrobe from '../src/domain/wardrobe/index.mjs';
import * as inventory from '../src/domain/inventory/index.mjs';
import * as biguse from '../src/domain/biguse/index.mjs';

function loadClassic(file, context = {}) {
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), context, { filename: file });
  return context;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('wardrobe browser ESM entry re-exports the canonical schema and adapter', () => {
  assert.equal(wardrobe.WARDROBE_FIELD_COUNT, 18);
  assert.equal(wardrobe.WARDROBE_FIELDS.length, 18);
  const row = ['name', '髮型', '001', '5', 'SS', 'S', 'A', 'B', 'C', '', '', '', '', '', 'POP', '店', '套裝', 'V1'];
  assert.deepEqual(wardrobe.wardrobeItemToRow(wardrobe.rowToWardrobeItem(row)), row);
});

test('inventory ESM entry stays behavior-compatible with the classic bridge', () => {
  const ctx = loadClassic('src/domain/inventory/runtime.js', {});
  const classic = ctx.InventoryDomain;
  const mine = { 1: ['001', '010'], 8: ['1234'] };
  assert.equal(inventory.serialize(mine), classic.serialize(mine));
  assert.deepEqual(plain(inventory.deserialize('1:001,010|8:1234|')), plain(classic.deserialize('1:001,010|8:1234|')));
  assert.throws(() => inventory.deserialize('broken'), /split/);
  assert.throws(() => classic.deserialize('broken'), /split/);

  const typeOf = clothing => clothing.type;
  const esmInv = inventory.createInventory({ typeOf });
  const classicInv = classic.createInventory({ typeOf });
  const sourceA = [{ type: '髮型', id: '001', own: true }, { type: '鞋子', id: '002', own: false }];
  const sourceB = sourceA.map(item => ({ ...item }));
  esmInv.filter(sourceA);
  classicInv.filter(sourceB);
  assert.deepEqual(plain(esmInv), plain(classicInv));
  esmInv.deserialize('髮型:001|鞋子:002|');
  classicInv.deserialize('髮型:001|鞋子:002|');
  esmInv.update(sourceA);
  classicInv.update(sourceB);
  assert.deepEqual(sourceA, sourceB);
});

test('BigUse ESM entry stays behavior-compatible with the classic bridge', () => {
  const ctx = loadClassic('src/domain/biguse/runtime.js', {});
  const classic = ctx.BigUseDomain;
  const a = { name: 'A' };
  const b = { name: 'B' };
  assert.equal(biguse.cartForIndex(1, a, b), classic.cartForIndex(1, a, b));
  assert.deepEqual(biguse.compareScores(111, 100), plain(classic.compareScores(111, 100)));

  const piece = { type: { type: '飾品-手持·右' }, id: '1234' };
  assert.deepEqual(biguse.pieceIdentity(piece), plain(classic.pieceIdentity(piece)));
  assert.equal(biguse.imageLongId(piece), classic.imageLongId(piece));

  const first = { name: 'Alpha Dress', id: '001' };
  const second = { name: 'Beta Alpha', id: '002' };
  assert.deepEqual(
    biguse.autocompleteSuggestions([first, second], 'Alpha').map(item => item.value),
    Array.from(classic.autocompleteSuggestions([first, second], 'Alpha'), item => item.value),
  );
});
