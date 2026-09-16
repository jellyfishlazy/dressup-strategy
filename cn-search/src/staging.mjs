import { RATING_FIELDS, WARDROBE_FIELD_COUNT, WARDROBE_FIELD_INDEX as FIELD } from '../../src/domain/wardrobe/schema.mjs';

/** @typedef {{ s2tw: (value: string) => string, alignCompoundField: (value: string) => string, alignWholeField: (value: string) => string }} StagingDeps */
/** @typedef {{ hasTw: boolean, key: string, type: string, tags: any, cnFullRow: any[] | null }} StagingSource */
/** @typedef {{ key: string, row: any[] }} StagingEntry */

/** @param {StagingSource} item @param {Record<string, any[]>} fullTwByKey @param {StagingDeps} deps */
export function buildStagingRow(item, fullTwByKey, deps) {
  const { s2tw, alignCompoundField, alignWholeField } = deps;
  if (item.hasTw) {
    const tw = fullTwByKey[item.key];
    if (tw) return tw.slice(0, WARDROBE_FIELD_COUNT);
  }
  if (!item.cnFullRow) return null;
  const row = item.cnFullRow.slice(0, WARDROBE_FIELD_COUNT);
  for (const field of RATING_FIELDS) {
    const index = FIELD[field];
    if (typeof row[index] === 'string' && row[index]) row[index] = s2tw(row[index]);
  }
  if (typeof row[FIELD.name] === 'string' && row[FIELD.name]) row[FIELD.name] = s2tw(row[FIELD.name]);
  if (typeof row[FIELD.id] === 'string' && row[FIELD.id]) row[FIELD.id] = String(row[FIELD.id]);
  row[FIELD.type] = item.type || row[FIELD.type];
  row[FIELD.tags] = item.tags != null ? item.tags : '';
  if (typeof row[FIELD.source] === 'string') row[FIELD.source] = alignCompoundField(row[FIELD.source]);
  if (typeof row[FIELD.suit] === 'string') row[FIELD.suit] = alignCompoundField(row[FIELD.suit]);
  if (typeof row[FIELD.version] === 'string') {
    const original = row[FIELD.version];
    row[FIELD.version] = alignWholeField(original) || original;
  }
  return row;
}

/** @param {any[]} row */
export function rowSummary(row) {
  return {
    name: row[FIELD.name] || '', type: row[FIELD.type] || '', id: row[FIELD.id] || '',
    suit: row[FIELD.suit] || '', version: row[FIELD.version] || '',
  };
}

/** @param {any[]} row */
export function rowToWardrobeLine(row) {
  const parts = [];
  for (let i = 0; i < WARDROBE_FIELD_COUNT; i++) {
    const value = row[i];
    if (typeof value === 'string') {
      const json = JSON.stringify(value);
      const body = json.slice(1, -1).replace(/\\"/g, '"').replace(/'/g, "\\'");
      parts.push("'" + body + "'");
    } else if (value == null) parts.push("''");
    else parts.push(String(value));
  }
  return '  [' + parts.join(',') + '],';
}

/** @param {StagingEntry[]} staging @param {Date} [now] */
export function buildStagingSnippet(staging, now = new Date()) {
  const header =
    '// data/wardrobe.js 片段（' + staging.length + ' 筆）\n' +
    '// 產生時間：' + now.toLocaleString() + '\n' +
    '// 將下列各列貼到 var wardrobe = [ ... ] 內適當位置；請自行檢查編號重複。\n';
  return header + staging.map((entry) => rowToWardrobeLine(entry.row)).join('\n') + '\n';
}

export function createStagingStore() {
  /** @type {StagingEntry[]} */
  let entries = [];
  /** @type {Record<string, true>} */
  let keys = Object.create(null);
  return {
    list: () => entries,
    has: (/** @type {string} */ key) => !!keys[key],
    add(/** @type {string} */ key, /** @type {any[] | null | undefined} */ row) {
      if (keys[key]) return { ok: false, reason: 'dup' };
      if (!row) return { ok: false, reason: 'no-fullrow' };
      entries.push({ key, row }); keys[key] = true; return { ok: true };
    },
    remove(/** @type {string} */ key) {
      if (!keys[key]) return false;
      entries = entries.filter((entry) => entry.key !== key);
      delete keys[key]; return true;
    },
    clear() { entries = []; keys = Object.create(null); },
  };
}
