import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { WARDROBE_FIELDS, WARDROBE_FIELD_INDEX } from '../src/domain/wardrobe/schema.mjs';
import { rowToWardrobeItem } from '../src/domain/wardrobe/adapter.mjs';

function loadClassic(file, context = {}) {
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), context, { filename: file });
  return context;
}

function runtimeContext() {
  const context = {};
  loadClassic('src/domain/wardrobe/runtime.js', context);
  loadClassic('src/domain/inventory/runtime.js', context);
  return context;
}

test('classic wardrobe bridge stays in lockstep with the canonical Gate 3 schema and adapter', () => {
  const context = runtimeContext();
  assert.deepEqual(Array.from(context.WardrobeDomain.fields), WARDROBE_FIELDS);
  assert.deepEqual({ ...context.WardrobeDomain.fieldIndex }, WARDROBE_FIELD_INDEX);
  const row = ['name', '髮型', '001', '5', 'SS', 'S', 'A', 'B', 'C', '', '', '', '', '', 'POP/小動物', '抽·店', '套裝', 'V1'];
  assert.deepEqual(JSON.parse(JSON.stringify(context.WardrobeDomain.rowToWardrobeItem(row))), rowToWardrobeItem(row));
});

test('inventory codec preserves the legacy persisted format exactly', () => {
  const { InventoryDomain } = runtimeContext();
  const mine = { 1: ['001', '010'], 8: ['1234'] };
  assert.equal(InventoryDomain.serialize(mine), '1:001,010|8:1234|');
  const decoded = InventoryDomain.deserialize('1:001,010|8:1234|');
  assert.deepEqual(JSON.parse(JSON.stringify(decoded.mine)), mine);
  assert.equal(decoded.size, 3);
  assert.deepEqual(JSON.parse(JSON.stringify(InventoryDomain.deserialize(''))), { mine: {}, size: 0 });
  assert.throws(() => InventoryDomain.deserialize('broken'), /reading 'split'/);
});

test('inventory storage boundary preserves current/local and legacy/cookie precedence', () => {
  const { InventoryDomain } = runtimeContext();
  const storage = { myClothesNew: '1:001|', myClothes: 'old-name' };
  assert.deepEqual(JSON.parse(JSON.stringify(InventoryDomain.read(storage, () => 'unused'))), {
    current: '1:001|', legacy: 'old-name'
  });
  const cookieReads = [];
  assert.deepEqual(JSON.parse(JSON.stringify(InventoryDomain.read(null, name => {
    cookieReads.push(name);
    return name === 'mine2' ? '8:010|' : 'legacy';
  }))), { current: '8:010|', legacy: 'legacy' });
  assert.deepEqual(cookieReads, ['mine2', 'mine']);

  InventoryDomain.write(storage, () => assert.fail('cookie fallback should not run'), '2:002|');
  assert.equal(storage.myClothesNew, '2:002|');
  let cookieWrite;
  InventoryDomain.write(null, (...args) => { cookieWrite = args; }, '3:003|');
  assert.deepEqual(cookieWrite, ['mine2', '3:003|', 3650]);
});

test('main matcher parses wardrobe rows through WardrobeDomain rather than magic indexes', () => {
  const modelSource = readFileSync(new URL('../model.js', import.meta.url), 'utf8');
  assert.match(modelSource, /WardrobeDomain\.rowToWardrobeItem\(csv\)/);
  assert.doesNotMatch(modelSource.slice(modelSource.indexOf('var Clothes'), modelSource.indexOf('function clotonum')), /csv\[\d+\]/);
  assert.match(modelSource, /InventoryDomain\.serialize/);
  assert.match(modelSource, /InventoryDomain\.deserialize/);
  assert.match(modelSource, /InventoryDomain\.read/);
  assert.match(modelSource, /InventoryDomain\.write/);
});
