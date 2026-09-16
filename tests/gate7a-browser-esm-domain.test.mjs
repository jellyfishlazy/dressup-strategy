import test from 'node:test';
import assert from 'node:assert/strict';
import * as wardrobe from '../src/domain/wardrobe/index.mjs';
import * as inventory from '../src/domain/inventory/index.mjs';
import * as biguse from '../src/domain/biguse/index.mjs';

test('wardrobe browser ESM entry re-exports the canonical schema and adapter', () => {
  assert.equal(wardrobe.WARDROBE_FIELD_COUNT, 18);
  assert.equal(wardrobe.WARDROBE_FIELDS.length, 18);
  const row = ['name', '髮型', '001', '5', 'SS', 'S', 'A', 'B', 'C', '', '', '', '', '', 'POP', '店', '套裝', 'V1'];
  assert.deepEqual(wardrobe.wardrobeItemToRow(wardrobe.rowToWardrobeItem(row)), row);
});

test('inventory ESM entry preserves established serialization, storage and factory behavior', () => {
  const mine = { 1: ['001', '010'], 8: ['1234'] };
  assert.equal(inventory.serialize(mine), '1:001,010|8:1234|');
  assert.deepEqual(inventory.deserialize('1:001,010|8:1234|'), { mine, size: 3 });
  assert.throws(() => inventory.deserialize('broken'), /split/);

  const typeOf = clothing => clothing.type;
  const inv = inventory.createInventory({ typeOf });
  const source = [{ type: '髮型', id: '001', own: true }, { type: '鞋子', id: '002', own: false }];
  inv.filter(source);
  assert.deepEqual(inv.mine, { 髮型: ['001'] });
  inv.deserialize('髮型:001|鞋子:002|');
  inv.update(source);
  assert.equal(source[0].own, true);
  assert.equal(source[1].own, true);
});

test('BigUse ESM entry preserves score, identity and autocomplete behavior', () => {
  const a = { name: 'A' };
  const b = { name: 'B' };
  assert.equal(biguse.cartForIndex(1, a, b), a);
  assert.deepEqual(biguse.compareScores(111, 100), { close: false, winner: 'A', scoreA: 111, scoreB: 100 });

  const piece = { type: { type: '飾品-手持·右' }, id: '1234' };
  assert.deepEqual(biguse.pieceIdentity(piece), { type: '飾品-手持·右', id: '1234' });
  assert.equal(biguse.imageLongId(piece), '81234');

  const first = { name: 'Alpha Dress', id: '001' };
  const second = { name: 'Beta Alpha', id: '002' };
  assert.deepEqual(biguse.autocompleteSuggestions([first, second], 'Alpha').map(item => item.value), ['Alpha Dress', 'Beta Alpha']);
});
