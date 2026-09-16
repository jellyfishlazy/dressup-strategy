import { IDENTITY_FIELDS, RATING_FIELDS, WARDROBE_FIELDS, WARDROBE_FIELD_COUNT, WARDROBE_FIELD_INDEX } from './schema.mjs';

// Match the repository validator's boundary: width and string identities only.
// Other values remain opaque; do not trim, coerce, split tags or normalize sources.
export function wardrobeRowErrors(row) {
  if (!Array.isArray(row) || row.length !== WARDROBE_FIELD_COUNT) {
    return [`expected ${WARDROBE_FIELD_COUNT} fields, got ${Array.isArray(row) ? row.length : typeof row}`];
  }
  return IDENTITY_FIELDS.filter(name => {
    const value = row[WARDROBE_FIELD_INDEX[name]];
    return typeof value !== 'string' || !value.trim();
  }).map(name => `required ${name} (column ${WARDROBE_FIELD_INDEX[name]}) must be a non-empty string`);
}

function assertRow(row) {
  const errors = wardrobeRowErrors(row);
  if (errors.length) throw new TypeError(errors.join('; '));
}

// WardrobeItem has name/type/id/stars/tags/source/suit/version and a ratings
// object containing all ten named raw grades. IDs always remain strings.
export function rowToWardrobeItem(row) {
  assertRow(row);
  const item = { ratings: {} };
  for (const [index, name] of WARDROBE_FIELDS.entries()) {
    (RATING_FIELDS.includes(name) ? item.ratings : item)[name] = row[index];
  }
  return item;
}

export function wardrobeItemToRow(item) {
  const row = WARDROBE_FIELDS.map(name =>
    (RATING_FIELDS.includes(name) ? item.ratings : item)[name]);
  assertRow(row);
  return row;
}
