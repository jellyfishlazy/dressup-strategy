import { WARDROBE_FIELD_INDEX as FIELD } from '../../src/domain/wardrobe/schema.mjs';

/** @typedef {import('../../src/domain/wardrobe/types.d.ts').WardrobeRow} WardrobeRow */
/** @typedef {{ s2tw: (value: string) => string, tw2cn: (value: string) => string }} LexiconConverters */

const SPLIT_SEG = /(\/|,|，)/;

/** @param {any} value */
export function normalizeHanHyphenToDot(value) {
  if (!value) return value;
  let out = String(value);
  let prev;
  const re = /([\u4e00-\u9fff\u3400-\u4dbf\u3040-\u30ff\u3007])[\u002d\uFF0D\u2013\u2014]([\u4e00-\u9fff\u3400-\u4dbf\u3040-\u30ff\u3007])/g;
  do {
    prev = out;
    out = out.replace(re, '$1·$2');
  } while (out !== prev);
  return out;
}

/** @param {any} value */
export function unifyLimitedLoginWording(value) {
  return String(value)
    .replace(/限时登入/g, '限时登录')
    .replace(/限时登陆/g, '限时登录')
    .replace(/限時登入/g, '限时登录')
    .replace(/限時登陸/g, '限时登录');
}

/** @param {any} value */
export function canonicalLexAnchor(value) {
  if (!value) return value;
  return unifyLimitedLoginWording(normalizeHanHyphenToDot(String(value)));
}

/** @param {any} value */
export function splitPreserveSeg(value) {
  if (!value) return [];
  return String(value).split(SPLIT_SEG);
}

/** @param {LexiconConverters} converters */
export function createLexicon({ s2tw, tw2cn }) {
  let lexByKey = Object.create(null);

  /** @param {unknown} twStr */
  function registerEntry(twStr) {
    if (!twStr || typeof twStr !== 'string') return;
    const text = twStr.trim();
    if (!text) return;
    const key = canonicalLexAnchor(tw2cn(text));
    const prev = lexByKey[key];
    if (!prev || (prev !== text && text.length > prev.length)) lexByKey[key] = text;
  }

  /** @param {unknown} value */
  function registerFieldPieces(value) {
    if (!value || typeof value !== 'string') return;
    registerEntry(value);
    for (const part of splitPreserveSeg(value)) {
      if (!part || part === '/' || part === ',' || part === '，') continue;
      registerEntry(part.trim());
    }
  }

  /** @param {WardrobeRow[] | null | undefined} wardrobe */
  function build(wardrobe) {
    lexByKey = Object.create(null);
    if (!Array.isArray(wardrobe)) return;
    for (const row of wardrobe) {
      registerFieldPieces(row[FIELD.tags] || '');
      registerFieldPieces(row[FIELD.source] || '');
      registerFieldPieces(row[FIELD.suit] || '');
      registerEntry(row[FIELD.version] || '');
    }
  }

  /** @param {any} cnSimpStr */
  function alignWholeField(cnSimpStr) {
    if (!cnSimpStr) return '';
    const raw = String(cnSimpStr);
    const canon = canonicalLexAnchor(raw);
    if (lexByKey[canon]) return lexByKey[canon];
    if (lexByKey[raw]) return lexByKey[raw];
    let key = canonicalLexAnchor(tw2cn(s2tw(canon)));
    if (lexByKey[key]) return lexByKey[key];
    key = canonicalLexAnchor(tw2cn(s2tw(raw)));
    if (lexByKey[key]) return lexByKey[key];
    return s2tw(canon);
  }

  /** @param {any} cnStr */
  function alignCompoundField(cnStr) {
    if (!cnStr) return '';
    const raw = String(cnStr);
    const canonFull = canonicalLexAnchor(raw);
    if (lexByKey[canonFull]) return lexByKey[canonFull];
    if (lexByKey[raw]) return lexByKey[raw];
    const parts = splitPreserveSeg(canonFull);
    if (parts.length <= 1) return alignWholeField(raw);
    return parts.map((part) => (part === '/' || part === ',' || part === '，') ? part : alignWholeField(part.trim())).join('');
  }

  return { build, alignWholeField, alignCompoundField };
}
