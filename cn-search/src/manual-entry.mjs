import { WARDROBE_FIELD_INDEX as FIELD } from '../../src/domain/wardrobe/schema.mjs';
import { splitPreserveSeg } from './normalization.mjs';

/** @typedef {import('../../src/domain/wardrobe/types.d.ts').WardrobeRow} WardrobeRow */

/** @type {Readonly<Record<string, 1>>} */
export const VALID_ATTR = Object.freeze({ '': 1, C: 1, B: 1, A: 1, S: 1, SS: 1 });
const GLOW_BONUS_TAG = /^(簡約|華麗|可愛|成熟|活潑|優雅|清純|性感|清涼|保暖)\+\d+$/;

/** @param {string} category @param {string} token */
export function shouldSkipTagFromPicker(category, token) {
  if (category === '螢光之靈') return true;
  return GLOW_BONUS_TAG.test(token);
}

/** @param {string[] | null | undefined} canonicalOrdered @param {Record<string, unknown> | null | undefined} scannedSet */
export function mergePickerTags(canonicalOrdered, scannedSet) {
  const seen = Object.create(null);
  /** @type {string[]} */
  const out = [];
  /** @param {string} name */
  const push = (name) => {
    if (!name || seen[name]) return;
    seen[name] = true;
    out.push(name);
  };
  for (const name of canonicalOrdered || []) push(name);
  const extra = Object.keys(scannedSet || {}).filter((name) => !seen[name]);
  extra.sort((a, b) => a.localeCompare(b, 'zh-Hant', { numeric: true }));
  extra.forEach(push);
  return out;
}

/** @param {WardrobeRow[] | null | undefined} wardrobe @param {string[] | null | undefined} wardrobeTags */
export function collectManualOptions(wardrobe, wardrobeTags) {
  const categories = Object.create(null);
  const tags = Object.create(null);
  for (const row of wardrobe || []) {
    const category = String(row[FIELD.type] || '');
    if (category) categories[category] = true;
    const tagStr = row[FIELD.tags] || '';
    if (!tagStr || shouldSkipTagFromPicker(category, String(tagStr).trim())) continue;
    for (const part of splitPreserveSeg(tagStr)) {
      if (!part || part === '/' || part === ',' || part === '，') continue;
      const tag = part.trim();
      if (tag && !shouldSkipTagFromPicker(category, tag)) tags[tag] = true;
    }
  }
  const tagList = Array.isArray(wardrobeTags) && wardrobeTags.length
    ? mergePickerTags(wardrobeTags, tags)
    : Object.keys(tags).sort((a, b) => a.localeCompare(b, 'zh-Hant', { numeric: true }));
  return { categories: Object.keys(categories).sort(), tags: tagList };
}

/** @param {any[]} row @param {Iterable<HTMLInputElement>} inputs */
export function applyManualAttributes(row, inputs) {
  for (const input of inputs) {
    const value = input.value.trim().toUpperCase();
    if (!VALID_ATTR[value]) return { ok: false, input, value };
    const index = Number.parseInt(input.getAttribute('data-attr') ?? '', 10);
    if (index >= FIELD.gorgeous && index <= FIELD.warm) row[index] = value;
  }
  return { ok: true };
}
