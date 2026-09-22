import test from 'node:test';
import assert from 'node:assert/strict';
import { RATING_FIELDS, IDENTITY_FIELDS, WARDROBE_FIELDS, WARDROBE_FIELD_COUNT, WARDROBE_FIELD_INDEX } from '../src/domain/wardrobe/schema.mjs';
import { rowToWardrobeItem, wardrobeItemToRow } from '../src/domain/wardrobe/adapter.mjs';
import { loadWardrobe, sources } from '../scripts/validate-data.mjs';

const fixture = () => [' 春櫻 ', '髮型', '001', '5', 'SS', '', 'S', 'A', 'B', 'C', '', 'SSS', '3', 'S', ' POP/小動物,舞者，泳裝 ', '抽·店/設·圖001', '套裝·染', 'V1.0.0'];

test('schema locks all 18 column meanings and ten rating names', () => {
  const fields = ['name', 'type', 'id', 'stars', 'gorgeous', 'simple', 'elegant', 'active', 'mature', 'cute', 'sexy', 'pure', 'cool', 'warm', 'tags', 'source', 'suit', 'version'];
  assert.equal(WARDROBE_FIELD_COUNT, 18);
  assert.deepEqual(WARDROBE_FIELDS, fields);
  assert.deepEqual(RATING_FIELDS, fields.slice(4, 14));
  assert.deepEqual(IDENTITY_FIELDS, fields.slice(0, 3));
  assert.deepEqual(WARDROBE_FIELD_INDEX, Object.fromEntries(fields.map((name, index) => [name, index])));
  for (const value of [WARDROBE_FIELDS, RATING_FIELDS, IDENTITY_FIELDS, WARDROBE_FIELD_INDEX]) assert.ok(Object.isFrozen(value));
});

test('adapter groups ratings and preserves IDs, metadata, whitespace and empty grades exactly', () => {
  const row = fixture();
  const item = rowToWardrobeItem(row);
  assert.deepEqual(item, {
    name: ' 春櫻 ', type: '髮型', id: '001', stars: '5',
    ratings: { gorgeous: 'SS', simple: '', elegant: 'S', active: 'A', mature: 'B', cute: 'C', sexy: '', pure: 'SSS', cool: '3', warm: 'S' },
    tags: ' POP/小動物,舞者，泳裝 ', source: '抽·店/設·圖001', suit: '套裝·染', version: 'V1.0.0',
  });
  assert.deepEqual(wardrobeItemToRow(item), row);
  item.ratings.simple = 'B';
  assert.equal(row[5], '');
  const output = wardrobeItemToRow(item);
  assert.equal(output[5], 'B');
  output[2] = '999';
  assert.equal(item.id, '001');
});

test('adapter rejects malformed widths and invalid identities without coercion', () => {
  for (const row of [null, {}, 'invalid', [], fixture().slice(1), [...fixture(), 'extra']]) {
    assert.throws(() => rowToWardrobeItem(row), /expected 18 fields/);
  }
  for (const column of [0, 1, 2]) {
    for (const value of ['', ' ', 1, null, undefined]) {
      const row = fixture();
      row[column] = value;
      assert.throws(() => rowToWardrobeItem(row), /must be a non-empty string/);
    }
  }
  const item = rowToWardrobeItem(fixture());
  item.id = 1;
  assert.throws(() => wardrobeItemToRow(item), /required id/);
});

test('every persisted wardrobe row round-trips losslessly', () => {
  for (const file of sources) {
    const rows = loadWardrobe(new URL(`../${file}`, import.meta.url));
    for (const row of rows) {
      assert.deepEqual(wardrobeItemToRow(rowToWardrobeItem(row)), Array.from(row), `${file}: ${row[0]}`);
    }
  }
});
