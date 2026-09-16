export type RatingField =
  | 'gorgeous' | 'simple' | 'elegant' | 'active' | 'mature'
  | 'cute' | 'sexy' | 'pure' | 'cool' | 'warm';

export type IdentityField = 'name' | 'type' | 'id';

export type WardrobeField =
  | IdentityField | 'stars' | RatingField | 'tags' | 'source' | 'suit' | 'version';

// Fields other than identity are intentionally opaque at this persistence boundary.
// Gate 8C will refine the model-facing values after their runtime normalization.
export type RawWardrobeValue = any;

export type WardrobeRow = readonly [
  name: string,
  type: string,
  id: string,
  stars: RawWardrobeValue,
  gorgeous: RawWardrobeValue,
  simple: RawWardrobeValue,
  elegant: RawWardrobeValue,
  active: RawWardrobeValue,
  mature: RawWardrobeValue,
  cute: RawWardrobeValue,
  sexy: RawWardrobeValue,
  pure: RawWardrobeValue,
  cool: RawWardrobeValue,
  warm: RawWardrobeValue,
  tags: RawWardrobeValue,
  source: RawWardrobeValue,
  suit: RawWardrobeValue,
  version: RawWardrobeValue,
];

export type WardrobeRatings = Record<RatingField, RawWardrobeValue>;

export interface WardrobeItem {
  name: string;
  type: string;
  id: string;
  stars: RawWardrobeValue;
  ratings: WardrobeRatings;
  tags: RawWardrobeValue;
  source: RawWardrobeValue;
  suit: RawWardrobeValue;
  version: RawWardrobeValue;
}
