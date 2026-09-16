import { WARDROBE_FIELD_INDEX as FIELD } from '../../src/domain/wardrobe/schema.mjs';
import { CN2TW_CATEGORY } from './category-map.mjs';

export function buildTwLookup(wardrobe) {
  const slim = Object.create(null);
  const full = Object.create(null);
  if (!Array.isArray(wardrobe)) return { slim, full };
  for (const row of wardrobe) {
    const key = row[FIELD.type] + '|' + row[FIELD.id];
    slim[key] = {
      name: row[FIELD.name], type: row[FIELD.type], id: row[FIELD.id],
      tags: row[FIELD.tags] || '', source: row[FIELD.source] || '',
      suit: row[FIELD.suit] || '', version: row[FIELD.version] || '',
    };
    full[key] = row.slice();
  }
  return { slim, full };
}

export function mergeRow(cn, twByKey, deps) {
  const { s2tw, alignCompoundField, alignWholeField } = deps;
  const typeTw = CN2TW_CATEGORY[cn.categoryCn] || s2tw(cn.categoryCn || '');
  const tw = twByKey[typeTw + '|' + cn.id];
  let name, suit, tags, source, version, hasTw;
  if (tw) {
    hasTw = true;
    ({ name, suit, tags, source, version } = tw);
  } else {
    hasTw = false;
    name = s2tw(cn.nameCn || '');
    suit = alignCompoundField(cn.suitCn || '');
    tags = Object.prototype.hasOwnProperty.call(cn, 'tagsTw')
      ? (cn.tagsTw == null ? '' : String(cn.tagsTw))
      : alignCompoundField(cn.tagsCn || '');
    source = alignCompoundField(cn.sourceCn || '');
    version = alignWholeField(cn.version || '') || (cn.version || '');
  }
  const suitFallback = s2tw(cn.suitCn || '');
  const srcFallback = s2tw(cn.sourceCn || '');
  const tagRaw = cn.tagsCn || '';
  const tagS2tw = s2tw(tagRaw);
  return {
    hasTw, id: cn.id, type: typeTw, typeCn: cn.categoryCn, key: typeTw + '|' + cn.id,
    name, suit, tags, source, version,
    cnName: cn.nameCn || '', cnSuit: cn.suitCn || '', cnSource: cn.sourceCn || '',
    cnFullRow: Array.isArray(cn.fullRow) ? cn.fullRow : null,
    hayName: (name + '|' + (cn.nameCn || '')).toLowerCase(),
    haySuit: (suit + '|' + (cn.suitCn || '') + '|' + suitFallback).toLowerCase(),
    haySource: (source + '|' + (cn.sourceCn || '') + '|' + srcFallback + '|' + tags + '|' + tagRaw + '|' + tagS2tw).toLowerCase(),
    hayVersion: (version + '|' + (cn.version || '')).toLowerCase(),
  };
}

export function tokens(value) {
  if (!value) return [];
  return value.trim().split(/\s+/).filter(Boolean).map((token) => token.toLowerCase());
}

export function matchAll(haystack, queries) {
  return queries.every((query) => haystack.indexOf(query) >= 0);
}

export function filterRows(rows, filters) {
  const name = tokens(filters.name);
  const suit = tokens(filters.suit);
  const version = tokens(filters.version);
  const source = tokens(filters.source);
  return rows.filter((row) => {
    if (filters.cnOnly && row.hasTw) return false;
    if (filters.category && row.type !== filters.category) return false;
    if (name.length && !matchAll(row.hayName, name)) return false;
    if (suit.length && !matchAll(row.haySuit, suit)) return false;
    if (version.length && !matchAll(row.hayVersion, version)) return false;
    if (source.length && !matchAll(row.haySource, source)) return false;
    return true;
  });
}
