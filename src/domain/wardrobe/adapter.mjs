import { IDENTITY_FIELDS, WARDROBE_FIELDS, WARDROBE_FIELD_COUNT, WARDROBE_FIELD_INDEX } from './schema.mjs';

/**
 * Match the repository validator's boundary: width and string identities only.
 * Other values remain opaque; do not trim, coerce, split tags or normalize sources.
 * @param {unknown} row
 * @returns {string[]}
 */
export function wardrobeRowErrors(row) {
  if (!Array.isArray(row) || row.length !== WARDROBE_FIELD_COUNT) {
    return [`expected ${WARDROBE_FIELD_COUNT} fields, got ${Array.isArray(row) ? row.length : typeof row}`];
  }
  return IDENTITY_FIELDS.filter(name => {
    const value = row[WARDROBE_FIELD_INDEX[name]];
    return typeof value !== 'string' || !value.trim();
  }).map(name => `required ${name} (column ${WARDROBE_FIELD_INDEX[name]}) must be a non-empty string`);
}

/** @param {unknown} row */
function assertRow(row) {
  const errors = wardrobeRowErrors(row);
  if (errors.length) throw new TypeError(errors.join('; '));
}

/**
 * @param {unknown} row
 * @returns {import('./types.d.ts').WardrobeItem}
 */
export function rowToWardrobeItem(row) {
  assertRow(row);
  const valid = /** @type {import('./types.d.ts').WardrobeRow} */ (row);
  return {
    name: valid[0],
    type: valid[1],
    id: valid[2],
    stars: valid[3],
    ratings: {
      gorgeous: valid[4],
      simple: valid[5],
      elegant: valid[6],
      active: valid[7],
      mature: valid[8],
      cute: valid[9],
      sexy: valid[10],
      pure: valid[11],
      cool: valid[12],
      warm: valid[13],
    },
    tags: valid[14],
    source: valid[15],
    suit: valid[16],
    version: valid[17],
  };
}

/**
 * @param {import('./types.d.ts').WardrobeItem} item
 * @returns {import('./types.d.ts').WardrobeRow}
 */
export function wardrobeItemToRow(item) {
  const row = /** @type {import('./types.d.ts').WardrobeRow} */ ([
    item.name,
    item.type,
    item.id,
    item.stars,
    item.ratings.gorgeous,
    item.ratings.simple,
    item.ratings.elegant,
    item.ratings.active,
    item.ratings.mature,
    item.ratings.cute,
    item.ratings.sexy,
    item.ratings.pure,
    item.ratings.cool,
    item.ratings.warm,
    item.tags,
    item.source,
    item.suit,
    item.version,
  ]);
  assertRow(row);
  return row;
}
