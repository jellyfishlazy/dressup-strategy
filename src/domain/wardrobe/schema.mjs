/** @type {ReadonlyArray<import('./types.d.ts').RatingField>} */
export const RATING_FIELDS = Object.freeze([
  'gorgeous', 'simple', 'elegant', 'active', 'mature', 'cute',
  'sexy', 'pure', 'cool', 'warm',
]);

/** @type {ReadonlyArray<import('./types.d.ts').IdentityField>} */
export const IDENTITY_FIELDS = Object.freeze(['name', 'type', 'id']);

/** @type {ReadonlyArray<import('./types.d.ts').WardrobeField>} */
export const WARDROBE_FIELDS = Object.freeze([
  ...IDENTITY_FIELDS, 'stars', ...RATING_FIELDS, 'tags', 'source', 'suit', 'version',
]);

export const WARDROBE_FIELD_COUNT = WARDROBE_FIELDS.length;

/** @type {Readonly<Record<import('./types.d.ts').WardrobeField, number>>} */
export const WARDROBE_FIELD_INDEX = Object.freeze(
  /** @type {Record<import('./types.d.ts').WardrobeField, number>} */ (
    Object.fromEntries(WARDROBE_FIELDS.map((name, index) => [name, index]))
  ),
);
