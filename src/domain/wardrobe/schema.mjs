// Persisted row order. Ratings are raw grades, not calculated scores.
export const RATING_FIELDS = Object.freeze([
  'gorgeous', 'simple', 'elegant', 'active', 'mature', 'cute',
  'sexy', 'pure', 'cool', 'warm',
]);
export const IDENTITY_FIELDS = Object.freeze(['name', 'type', 'id']);
export const WARDROBE_FIELDS = Object.freeze([
  ...IDENTITY_FIELDS, 'stars', ...RATING_FIELDS, 'tags', 'source', 'suit', 'version',
]);
export const WARDROBE_FIELD_COUNT = WARDROBE_FIELDS.length;
export const WARDROBE_FIELD_INDEX = Object.freeze(
  Object.fromEntries(WARDROBE_FIELDS.map((name, index) => [name, index])),
);
