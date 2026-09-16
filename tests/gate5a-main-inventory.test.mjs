import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WARDROBE_FIELDS, WARDROBE_FIELD_INDEX } from '../src/domain/wardrobe/schema.mjs';
import { rowToWardrobeItem } from '../src/domain/wardrobe/adapter.mjs';
import * as InventoryDomain from '../src/domain/inventory/index.mjs';

test('wardrobe ESM boundary exposes the canonical Gate 3 schema and adapter', () => {
  assert.equal(WARDROBE_FIELDS.length, 18);
  assert.equal(WARDROBE_FIELD_INDEX.id, 2);
  const row = ['name', '髮型', '001', '5', 'SS', 'S', 'A', 'B', 'C', '', '', '', '', '', 'POP/小動物', '抽·店', '套裝', 'V1'];
  assert.equal(rowToWardrobeItem(row).id, '001');
});

test('inventory codec preserves the legacy persisted format exactly', () => {
  const mine = { 1: ['001', '010'], 8: ['1234'] };
  assert.equal(InventoryDomain.serialize(mine), '1:001,010|8:1234|');
  const decoded = InventoryDomain.deserialize('1:001,010|8:1234|');
  assert.deepEqual(decoded.mine, mine);
  assert.equal(decoded.size, 3);
  assert.deepEqual(InventoryDomain.deserialize(''), { mine: {}, size: 0 });
  assert.throws(() => InventoryDomain.deserialize('broken'), /split/);
});

test('inventory storage boundary preserves current/local and legacy/cookie precedence', () => {
  const storage = { myClothesNew: '1:001|', myClothes: 'old-name' };
  assert.deepEqual(InventoryDomain.read(storage, () => 'unused'), { current: '1:001|', legacy: 'old-name' });
  const cookieReads = [];
  assert.deepEqual(InventoryDomain.read(null, name => {
    cookieReads.push(name);
    return name === 'mine2' ? '8:010|' : 'legacy';
  }), { current: '8:010|', legacy: 'legacy' });
  assert.deepEqual(cookieReads, ['mine2', 'mine']);

  InventoryDomain.write(storage, () => assert.fail('cookie fallback should not run'), '2:002|');
  assert.equal(storage.myClothesNew, '2:002|');
  let cookieWrite;
  InventoryDomain.write(null, (...args) => { cookieWrite = args; }, '3:003|');
  assert.deepEqual(cookieWrite, ['mine2', '3:003|', 3650]);
});

test('main matcher parses wardrobe rows through direct ESM domain imports rather than magic indexes', () => {
  const modelSource = readFileSync(new URL('../model.mjs', import.meta.url), 'utf8');
  assert.match(modelSource, /from '\.\/src\/domain\/wardrobe\/index\.mjs'/);
  assert.match(modelSource, /from '\.\/src\/domain\/inventory\/index\.mjs'/);
  assert.match(modelSource, /rowToWardrobeItem\(csv\)/);
  assert.doesNotMatch(modelSource.slice(modelSource.indexOf('var Clothes'), modelSource.indexOf('function clotonum')), /csv\[\d+\]/);
  assert.doesNotMatch(modelSource, /WardrobeDomain|InventoryDomain/);
});
