import { createHash } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { absoluteDataSourcePath, dataSourceById } from './data-source-contract.mjs';
import { loadWardrobe } from './validate-data.mjs';
import { WARDROBE_FIELD_INDEX as WARDROBE_FIELD } from '../src/domain/wardrobe/schema.mjs';

export const LEVEL_STAGING_FORMAT_VERSION = 1;
export const LEVEL_STAGING_KIND = 'level-staging';

export const PRIMARY_LEVEL_TABLES = Object.freeze([
  'competitionsRaw',
  'extraRaw',
  'tasksRaw',
  'levelsRaw',
  'dreamWeavingRaw',
]);
export const LEVEL_METADATA_TABLES = Object.freeze([
  'levelFilters',
  'levelBonus',
  'addSkillsInfo',
  'addHintInfo',
]);
export const LEVEL_TABLES = Object.freeze([
  'themeFilter',
  ...PRIMARY_LEVEL_TABLES,
  ...LEVEL_METADATA_TABLES,
]);

const PRIMARY_SET = new Set(PRIMARY_LEVEL_TABLES);
const TABLE_SET = new Set(LEVEL_TABLES);
const BONUS_BASES = new Set(['SS', 'S', 'A', 'B', 'C']);
const REPO_ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const LEVEL_DUPLICATE_BASELINE_URL = new URL('./known-level-duplicates.json', import.meta.url);

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

export function sha256Text(text) {
  return createHash('sha256').update(String(text), 'utf8').digest('hex');
}

function sameValue(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function splitTokens(value) {
  return String(value || '').split(/[\/,，]/).map(token => token.trim()).filter(Boolean);
}

function skipString(source, index) {
  const quote = source[index++];
  while (index < source.length) {
    const ch = source[index++];
    if (ch === '\\') index++;
    else if (ch === quote) return index;
  }
  return index;
}

function skipLineComment(source, index) {
  const end = source.indexOf('\n', index + 2);
  return end < 0 ? source.length : end + 1;
}

function skipBlockComment(source, index) {
  const end = source.indexOf('*/', index + 2);
  return end < 0 ? source.length : end + 2;
}

function findMatchingDelimiter(source, start, open, close) {
  let depth = 0;
  for (let index = start; index < source.length; index++) {
    const ch = source[index];
    if (ch === "'" || ch === '"') {
      index = skipString(source, index) - 1;
      continue;
    }
    if (ch === '/' && source[index + 1] === '/') {
      index = skipLineComment(source, index) - 1;
      continue;
    }
    if (ch === '/' && source[index + 1] === '*') {
      index = skipBlockComment(source, index) - 1;
      continue;
    }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return index;
    }
  }
  throw new Error('unterminated ' + open + close + ' block');
}

function escapeRegex(value) {
  return value.replace(/[.*+?^$()|[\]{}\\]/g, '\\$&');
}

function variableBlock(source, name, open, close) {
  const re = new RegExp('\\bvar\\s+' + escapeRegex(name) + '\\s*=\\s*\\' + open);
  const match = re.exec(source);
  if (!match) throw new Error('level table not found: ' + name);
  const start = match.index + match[0].lastIndexOf(open);
  const end = findMatchingDelimiter(source, start, open, close);
  return { start, end, open, close };
}

function readJsString(source, start) {
  const quote = source[start];
  let out = '';
  let index = start + 1;
  while (index < source.length) {
    const ch = source[index++];
    if (ch === quote) return { value: out, end: index };
    if (ch !== '\\') {
      out += ch;
      continue;
    }
    if (index >= source.length) throw new Error('unterminated escape in level key');
    const esc = source[index++];
    const simple = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', '0': '\0', '\\': '\\', "'": "'", '"': '"' };
    if (Object.prototype.hasOwnProperty.call(simple, esc)) out += simple[esc];
    else if (esc === 'u') {
      const hex = source.slice(index, index + 4);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new Error('invalid unicode escape in level key');
      out += String.fromCharCode(parseInt(hex, 16));
      index += 4;
    } else out += esc;
  }
  throw new Error('unterminated level key string');
}

function scanValueEnd(source, start, blockEnd) {
  let paren = 0;
  let bracket = 0;
  let brace = 0;
  for (let index = start; index < blockEnd; index++) {
    const ch = source[index];
    if (ch === "'" || ch === '"') {
      index = skipString(source, index) - 1;
      continue;
    }
    if (ch === '/' && source[index + 1] === '/') {
      index = skipLineComment(source, index) - 1;
      continue;
    }
    if (ch === '/' && source[index + 1] === '*') {
      index = skipBlockComment(source, index) - 1;
      continue;
    }
    if (ch === '(') paren++;
    else if (ch === ')') paren--;
    else if (ch === '[') bracket++;
    else if (ch === ']') bracket--;
    else if (ch === '{') brace++;
    else if (ch === '}') brace--;
    else if (ch === ',' && paren === 0 && bracket === 0 && brace === 0) {
      return { valueEnd: index, spanEnd: index + 1 };
    }
  }
  return { valueEnd: blockEnd, spanEnd: blockEnd };
}

export function objectEntrySpans(source, table) {
  const block = variableBlock(source, table, '{', '}');
  const entries = new Map();
  const occurrences = new Map();
  const duplicateKeys = [];
  let index = block.start + 1;
  let paren = 0;
  let bracket = 0;
  let brace = 0;

  while (index < block.end) {
    const ch = source[index];
    if (ch === '/' && source[index + 1] === '/') {
      index = skipLineComment(source, index);
      continue;
    }
    if (ch === '/' && source[index + 1] === '*') {
      index = skipBlockComment(source, index);
      continue;
    }
    if (ch === '(') { paren++; index++; continue; }
    if (ch === ')') { paren--; index++; continue; }
    if (ch === '[') { bracket++; index++; continue; }
    if (ch === ']') { bracket--; index++; continue; }
    if (ch === '{') { brace++; index++; continue; }
    if (ch === '}') { brace--; index++; continue; }

    if ((ch === "'" || ch === '"') && paren === 0 && bracket === 0 && brace === 0) {
      const keyStart = index;
      const key = readJsString(source, index);
      index = key.end;
      while (/\s/.test(source[index] || '')) index++;
      if (source[index] !== ':') continue;
      index++;
      while (/\s/.test(source[index] || '')) index++;
      const valueStart = index;
      const end = scanValueEnd(source, valueStart, block.end);
      const span = {
        key: key.value,
        start: keyStart,
        end: end.spanEnd,
        valueStart,
        valueEnd: end.valueEnd,
        expression: source.slice(valueStart, end.valueEnd).trim(),
      };
      if (!occurrences.has(key.value)) occurrences.set(key.value, []);
      occurrences.get(key.value).push(span);
      if (entries.has(key.value)) duplicateKeys.push(key.value);
      entries.set(key.value, span);
      index = end.spanEnd;
      continue;
    }
    index++;
  }

  return { block, entries, occurrences, duplicateKeys };
}

export function themeFilterElementSpans(source) {
  const block = variableBlock(source, 'themeFilter', '[', ']');
  const elements = [];
  const duplicateKeys = [];
  const seen = new Set();
  let index = block.start + 1;
  while (index < block.end) {
    const ch = source[index];
    if (ch === '/' && source[index + 1] === '/') {
      index = skipLineComment(source, index);
      continue;
    }
    if (ch === '/' && source[index + 1] === '*') {
      index = skipBlockComment(source, index);
      continue;
    }
    if (ch === '[') {
      const end = findMatchingDelimiter(source, index, '[', ']');
      const expression = source.slice(index, end + 1);
      let value;
      try {
        value = vm.runInNewContext('(' + expression + ')', {}, { timeout: 1000 });
      } catch {
        value = null;
      }
      let spanEnd = end + 1;
      while (/\s/.test(source[spanEnd] || '')) spanEnd++;
      if (source[spanEnd] === ',') spanEnd++;
      if (Array.isArray(value) && value.length >= 2) {
        const key = String(value[0]);
        if (seen.has(key)) duplicateKeys.push(key);
        seen.add(key);
        elements.push({
          key,
          value: String(value[1]),
          start: index,
          end: spanEnd,
        });
      }
      index = spanEnd;
      continue;
    }
    index++;
  }
  return { block, elements, duplicateKeys };
}

function parseFilterExpression(expression) {
  const sandbox = {
    normalFilter(tagWhitelist, nameWhitelist = null) {
      return {
        tagWhitelist: tagWhitelist == null ? null : String(tagWhitelist),
        nameWhitelist: nameWhitelist == null ? null : String(nameWhitelist),
        weight: 10,
      };
    },
    weightedFilter(tagWhitelist, nameWhitelist, weight) {
      return {
        tagWhitelist: tagWhitelist == null ? null : String(tagWhitelist),
        nameWhitelist: nameWhitelist == null ? null : String(nameWhitelist),
        weight: Number(weight),
      };
    },
  };
  return vm.runInNewContext('(' + expression + ')', sandbox, { timeout: 1000 });
}

function loadLevelContext(path) {
  const source = readFileSync(path, 'utf8');
  const context = {};
  vm.createContext(context);
  vm.runInContext(source, context, { filename: path, timeout: 30_000 });
  return { source, context };
}

function normalizeBonus(value) {
  if (!Array.isArray(value)) return value;
  return Array.from(value, bonus => ({
    base: String(bonus?.base ?? ''),
    weight: Number(bonus?.weight),
    tag: String(bonus?.tag ?? ''),
    replace: Boolean(bonus?.replace),
  }));
}

function normalizedLevelTables(path) {
  const { source, context } = loadLevelContext(path);
  const tables = Object.create(null);

  const themeMap = Object.create(null);
  for (const pair of context.themeFilter || []) {
    if (Array.isArray(pair) && pair.length >= 2) themeMap[String(pair[0])] = String(pair[1]);
  }
  tables.themeFilter = themeMap;

  for (const table of PRIMARY_LEVEL_TABLES) {
    const map = Object.create(null);
    for (const [key, value] of Object.entries(context[table] || {})) map[key] = cloneJson(value);
    tables[table] = map;
  }

  const filterSpans = objectEntrySpans(source, 'levelFilters').entries;
  const filters = Object.create(null);
  for (const [key, span] of filterSpans) {
    try {
      filters[key] = cloneJson(parseFilterExpression(span.expression));
    } catch {
      filters[key] = null;
    }
  }
  tables.levelFilters = filters;

  const bonus = Object.create(null);
  for (const [key, value] of Object.entries(context.levelBonus || {})) bonus[key] = normalizeBonus(value);
  tables.levelBonus = bonus;

  for (const table of ['addSkillsInfo', 'addHintInfo']) {
    const map = Object.create(null);
    for (const [key, value] of Object.entries(context[table] || {})) map[key] = cloneJson(value);
    tables[table] = map;
  }

  return { source, context, tables };
}

export function resolveLevelTarget(targetId = 'main-levels') {
  const source = dataSourceById(targetId);
  if (!source || !('path' in source)) throw new Error('unknown level target: ' + targetId);
  if (source.format !== 'legacy-levels-js') throw new Error('target is not a level data source: ' + targetId);
  if (!source.writable) throw new Error('level target is read-only by contract: ' + targetId);
  return source;
}

function validStringArray(value) {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

export function levelEntryErrors(entry) {
  const errors = [];
  if (!entry || typeof entry !== 'object') return ['entry must be an object'];
  if (!TABLE_SET.has(entry.table)) errors.push('unsupported table: ' + entry.table);
  if (typeof entry.key !== 'string' || !entry.key.trim()) errors.push('key must be a non-empty string');
  if (errors.length) return errors;

  const value = entry.value;
  if (entry.table === 'themeFilter') {
    if (typeof value !== 'string' || !value.trim()) errors.push('themeFilter value must be a non-empty string');
  } else if (PRIMARY_SET.has(entry.table)) {
    if (!Array.isArray(value) || value.length !== 5) {
      errors.push('primary level weight must contain exactly 5 values');
    } else if (value.some(item => typeof item !== 'number' || !Number.isFinite(item))) {
      errors.push('primary level weights must be finite numbers');
    }
  } else if (entry.table === 'levelFilters') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      errors.push('levelFilters value must be an object');
    } else {
      const { tagWhitelist = null, nameWhitelist = null, weight } = value;
      if (tagWhitelist !== null && typeof tagWhitelist !== 'string') errors.push('filter tagWhitelist must be string or null');
      if (nameWhitelist !== null && typeof nameWhitelist !== 'string') errors.push('filter nameWhitelist must be string or null');
      if (!tagWhitelist && !nameWhitelist) errors.push('filter requires tagWhitelist or nameWhitelist');
      if (typeof weight !== 'number' || !Number.isFinite(weight) || weight <= 0) errors.push('filter weight must be a positive finite number');
    }
  } else if (entry.table === 'levelBonus') {
    if (!Array.isArray(value)) errors.push('levelBonus value must be an array');
    else {
      value.forEach((bonus, index) => {
        if (!bonus || typeof bonus !== 'object' || Array.isArray(bonus)) {
          errors.push('bonus ' + index + ' must be an object');
          return;
        }
        if (!BONUS_BASES.has(bonus.base)) errors.push('bonus ' + index + ' has unsupported base');
        if (typeof bonus.weight !== 'number' || !Number.isFinite(bonus.weight) || bonus.weight <= 0) {
          errors.push('bonus ' + index + ' weight must be positive finite number');
        }
        if (typeof bonus.tag !== 'string' || !bonus.tag.trim()) errors.push('bonus ' + index + ' tag must be non-empty string');
        if (bonus.replace !== undefined && typeof bonus.replace !== 'boolean') errors.push('bonus ' + index + ' replace must be boolean');
      });
    }
  } else if (entry.table === 'addSkillsInfo') {
    if (!Array.isArray(value) || (value.length !== 2 && value.length !== 3)) {
      errors.push('addSkillsInfo must contain 2 or 3 slots');
    } else if (!value.every(slot => slot === null || validStringArray(slot))) {
      errors.push('skill slots must be null or string arrays');
    }
  } else if (entry.table === 'addHintInfo') {
    if (!Array.isArray(value) || value.length !== 3 || !value.every(validStringArray)) {
      errors.push('addHintInfo must contain exactly 3 string-array slots');
    }
  }
  return errors;
}

function knownLevelDuplicateBaseline(sourceLabel) {
  if (!sourceLabel) return {};
  const all = JSON.parse(readFileSync(LEVEL_DUPLICATE_BASELINE_URL, 'utf8'));
  return all[sourceLabel] || {};
}

function duplicateDebtErrors(snapshot, { baselineSource = null, strictBaseline = false } = {}) {
  const errors = [];
  const expected = knownLevelDuplicateBaseline(baselineSource);

  const themeInfo = themeFilterElementSpans(snapshot.source);
  for (const key of themeInfo.duplicateKeys) errors.push('themeFilter duplicate label: ' + key);

  const seenExpected = new Set();
  for (const table of [...PRIMARY_LEVEL_TABLES, ...LEVEL_METADATA_TABLES]) {
    const info = objectEntrySpans(snapshot.source, table);
    for (const [key, occurrences] of info.occurrences) {
      if (occurrences.length < 2) continue;
      const actual = occurrences.map(item => item.expression);
      const baseline = expected?.[table]?.[key];
      const marker = table + '|' + key;
      if (!Array.isArray(baseline)) {
        errors.push(table + ' duplicate property key: ' + key);
        continue;
      }
      seenExpected.add(marker);
      if (!sameValue(actual, baseline)) {
        errors.push(table + ' duplicate baseline changed: ' + key);
      }
    }
  }

  if (strictBaseline) {
    for (const [table, groups] of Object.entries(expected)) {
      for (const key of Object.keys(groups || {})) {
        if (!seenExpected.has(table + '|' + key)) errors.push('stale level duplicate baseline: ' + table + '|' + key);
      }
    }
  }
  return errors;
}

function structuralLevelErrorsFromSnapshot(snapshot, options = {}) {
  const errors = duplicateDebtErrors(snapshot, options);
  const owners = new Map();

  for (const table of PRIMARY_LEVEL_TABLES) {
    for (const [key, value] of Object.entries(snapshot.tables[table] || {})) {
      errors.push(...levelEntryErrors({ table, key, value }).map(message => table + ' ' + key + ': ' + message));
      if (owners.has(key)) errors.push('primary key appears in multiple tables: ' + key + ' (' + owners.get(key) + ', ' + table + ')');
      else owners.set(key, table);
    }
  }

  for (const [key, value] of Object.entries(snapshot.tables.themeFilter || {})) {
    errors.push(...levelEntryErrors({ table: 'themeFilter', key, value }).map(message => 'themeFilter ' + key + ': ' + message));
  }
  for (const table of LEVEL_METADATA_TABLES) {
    for (const [key, value] of Object.entries(snapshot.tables[table] || {})) {
      if (value === null && table === 'levelFilters') errors.push('levelFilters ' + key + ': expression could not be parsed');
      else errors.push(...levelEntryErrors({ table, key, value }).map(message => table + ' ' + key + ': ' + message));
    }
  }
  return errors;
}

export function validateLevelSource(path, { baselineSource = null, strictBaseline = null } = {}) {
  const resolvedPath = resolve(path);
  if (!baselineSource) {
    for (const id of ['main-levels', 'biguse-levels']) {
      const source = dataSourceById(id);
      const absolute = absoluteDataSourcePath(id);
      if (source && absolute && resolve(absolute) === resolvedPath) {
        baselineSource = source.path;
        if (strictBaseline === null) strictBaseline = true;
        break;
      }
    }
  }
  return structuralLevelErrorsFromSnapshot(normalizedLevelTables(path), {
    baselineSource,
    strictBaseline: strictBaseline === true,
  });
}

function wardrobeVocabulary() {
  const path = absoluteDataSourcePath('wardrobe');
  const rows = loadWardrobe(path);
  const tags = new Set();
  const names = [];
  for (const row of rows || []) {
    names.push(String(row[WARDROBE_FIELD.name] || ''));
    for (const token of splitTokens(row[WARDROBE_FIELD.tags])) tags.add(token);
  }
  return { tags, names };
}

function filterReferences(value) {
  if (!value || typeof value !== 'object') return { tags: [], names: [] };
  return {
    tags: splitTokens(value.tagWhitelist),
    names: splitTokens(value.nameWhitelist),
  };
}

function bonusReferences(value) {
  if (!Array.isArray(value)) return [];
  return value.map(item => String(item?.tag || '').trim()).filter(Boolean);
}

function referenceErrors(entry, baselineValue, vocabulary) {
  const errors = [];
  if (entry.table !== 'levelFilters' && entry.table !== 'levelBonus') return errors;

  const baselineTags = new Set();
  const baselineNames = new Set();
  if (entry.table === 'levelFilters') {
    const refs = filterReferences(baselineValue);
    refs.tags.forEach(tag => baselineTags.add(tag));
    refs.names.forEach(name => baselineNames.add(name));
  } else {
    bonusReferences(baselineValue).forEach(tag => baselineTags.add(tag));
  }

  const tags = entry.table === 'levelFilters'
    ? filterReferences(entry.value).tags
    : bonusReferences(entry.value);
  for (const tag of tags) {
    if (!vocabulary.tags.has(tag) && !baselineTags.has(tag)) {
      errors.push('unknown wardrobe tag introduced: ' + tag);
    }
  }

  if (entry.table === 'levelFilters') {
    for (const name of filterReferences(entry.value).names) {
      if (baselineNames.has(name)) continue;
      if (!vocabulary.names.some(candidate => candidate.includes(name))) {
        errors.push('nameWhitelist token matches no wardrobe item: ' + name);
      }
    }
  }
  return errors;
}

function primaryOwners(tables) {
  const owners = new Map();
  for (const table of PRIMARY_LEVEL_TABLES) {
    for (const key of Object.keys(tables[table] || {})) owners.set(key, table);
  }
  return owners;
}

export function parseLevelImportText(text) {
  const source = String(text).replace(/^\uFEFF/, '');
  let data;
  try {
    data = JSON.parse(source);
  } catch (error) {
    throw new Error('level import must be valid JSON: ' + error.message);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('level import root must be an object');
  if (data.formatVersion !== LEVEL_STAGING_FORMAT_VERSION) throw new Error('unsupported level import formatVersion');
  if (!Array.isArray(data.entries)) throw new Error('level import entries must be an array');
  return data;
}

export function buildLevelStagingManifest({
  inputText,
  inputPath = null,
  targetId = null,
  targetPathOverride = null,
  createdAt = new Date(),
}) {
  const input = parseLevelImportText(inputText);
  const target = resolveLevelTarget(targetId || input.target || 'main-levels');
  if (input.target && input.target !== target.id) throw new Error('input target does not match requested target');

  const targetPath = targetPathOverride ? resolve(targetPathOverride) : absoluteDataSourcePath(target.id);
  const snapshot = normalizedLevelTables(targetPath);
  const structuralErrors = structuralLevelErrorsFromSnapshot(snapshot, {
    baselineSource: target.path,
    strictBaseline: !targetPathOverride,
  });
  if (structuralErrors.length) throw new Error('target level source failed structural validation: ' + structuralErrors.join('; '));

  const vocabulary = wardrobeVocabulary();
  const owners = primaryOwners(snapshot.tables);
  const stagedPrimaryOwners = new Map();
  for (const entry of input.entries) {
    if (entry && PRIMARY_SET.has(entry.table) && typeof entry.key === 'string' && !stagedPrimaryOwners.has(entry.key)) {
      stagedPrimaryOwners.set(entry.key, entry.table);
    }
  }

  const finalPrimaryKeys = new Set(owners.keys());
  for (const [key] of stagedPrimaryOwners) finalPrimaryKeys.add(key);

  const seen = new Set();
  const entries = [];
  const errors = [];

  input.entries.forEach((rawEntry, index) => {
    const entry = rawEntry && typeof rawEntry === 'object'
      ? { table: rawEntry.table, key: rawEntry.key, value: cloneJson(rawEntry.value) }
      : rawEntry;
    const entryErrors = levelEntryErrors(entry);
    const identity = entry && typeof entry === 'object' ? String(entry.table) + '|' + String(entry.key) : 'invalid|' + index;

    if (seen.has(identity)) {
      errors.push({ kind: 'duplicate', index, table: entry?.table ?? null, key: entry?.key ?? null, message: 'duplicate staged table/key' });
      entries.push({ index, table: entry?.table ?? null, key: entry?.key ?? null, value: entry?.value, status: 'duplicate' });
      return;
    }
    seen.add(identity);

    const table = entry?.table;
    const key = entry?.key;
    let baselineValue;
    if (TABLE_SET.has(table) && typeof key === 'string') baselineValue = snapshot.tables[table]?.[key];

    if (!entryErrors.length && PRIMARY_SET.has(table)) {
      const currentOwner = owners.get(key);
      const stagedOwner = stagedPrimaryOwners.get(key);
      if ((currentOwner && currentOwner !== table) || (stagedOwner && stagedOwner !== table)) {
        entryErrors.push('primary key collides with another table: ' + (currentOwner || stagedOwner));
      }
    }

    if (!entryErrors.length && LEVEL_METADATA_TABLES.includes(table)) {
      const currentTableHasKey = Object.prototype.hasOwnProperty.call(snapshot.tables[table] || {}, key);
      if (!currentTableHasKey && !finalPrimaryKeys.has(key)) {
        entryErrors.push('new metadata key does not reference a primary level: ' + key);
      }
    }

    if (!entryErrors.length) entryErrors.push(...referenceErrors(entry, baselineValue, vocabulary));

    if (entryErrors.length) {
      errors.push(...entryErrors.map(message => ({ kind: 'entry', index, table: table ?? null, key: key ?? null, message })));
      entries.push({ index, table: table ?? null, key: key ?? null, value: entry?.value, status: 'invalid' });
      return;
    }

    const hasBaseline = baselineValue !== undefined;
    const status = !hasBaseline ? 'new' : sameValue(baselineValue, entry.value) ? 'unchanged' : 'conflict';
    entries.push({
      index,
      table,
      key,
      value: entry.value,
      status,
      ...(hasBaseline ? { baselineValue: cloneJson(baselineValue) } : {}),
    });
  });

  const count = status => entries.filter(entry => entry.status === status).length;
  const targetText = readFileSync(targetPath, 'utf8');
  return {
    formatVersion: LEVEL_STAGING_FORMAT_VERSION,
    kind: LEVEL_STAGING_KIND,
    createdAt: createdAt.toISOString(),
    target: {
      id: target.id,
      path: target.path,
      sha256: sha256Text(targetText),
    },
    input: {
      path: inputPath,
      sha256: sha256Text(inputText),
    },
    summary: {
      totalEntries: input.entries.length,
      acceptedEntries: entries.filter(entry => !['invalid', 'duplicate'].includes(entry.status)).length,
      newEntries: count('new'),
      unchangedEntries: count('unchanged'),
      conflictEntries: count('conflict'),
      invalidEntries: count('invalid'),
      duplicateEntries: count('duplicate'),
    },
    errors,
    entries,
  };
}

export function manifestHasBlockingLevelErrors(manifest) {
  return Array.isArray(manifest?.errors) && manifest.errors.length > 0;
}

export function assertLevelStagingManifest(manifest) {
  if (!manifest || manifest.formatVersion !== LEVEL_STAGING_FORMAT_VERSION || manifest.kind !== LEVEL_STAGING_KIND) {
    throw new TypeError('unsupported level staging manifest');
  }
  if (!manifest.target || !manifest.input || !manifest.summary || !Array.isArray(manifest.entries) || !Array.isArray(manifest.errors)) {
    throw new TypeError('malformed level staging manifest');
  }
  return manifest;
}

function resolveInputPath(inputPath) {
  if (!inputPath || typeof inputPath !== 'string') return null;
  if (isAbsolute(inputPath)) return inputPath;
  return resolve(REPO_ROOT, ...inputPath.split(/[\\/]+/).filter(Boolean));
}

export function buildLevelPreview(manifest, { targetPath = null } = {}) {
  assertLevelStagingManifest(manifest);
  const integrityErrors = [];
  const inputPath = resolveInputPath(manifest.input.path);
  if (!inputPath || !existsSync(inputPath)) {
    integrityErrors.push('manifest input file is missing');
  }

  let inputText = null;
  if (inputPath && existsSync(inputPath)) {
    inputText = readFileSync(inputPath, 'utf8');
    if (sha256Text(inputText) !== manifest.input.sha256) integrityErrors.push('manifest input SHA-256 no longer matches source file');
  }

  const target = resolveLevelTarget(manifest.target.id);
  if (manifest.target.path !== target.path) integrityErrors.push('manifest target path does not match data source contract');
  const actualTargetPath = targetPath ? resolve(targetPath) : absoluteDataSourcePath(target.id);
  const currentText = readFileSync(actualTargetPath, 'utf8');
  const stale = sha256Text(currentText) !== manifest.target.sha256;

  let derived = null;
  if (inputText !== null) {
    try {
      derived = buildLevelStagingManifest({
        inputText,
        inputPath: manifest.input.path,
        targetId: target.id,
        targetPathOverride: actualTargetPath,
        createdAt: new Date(manifest.createdAt),
      });
    } catch (error) {
      integrityErrors.push('could not re-stage input: ' + error.message);
    }
  }

  if (!stale && derived) {
    const compact = entry => ({
      table: entry.table,
      key: entry.key,
      value: entry.value,
      status: entry.status,
      ...(entry.baselineValue !== undefined ? { baselineValue: entry.baselineValue } : {}),
    });
    if (!sameValue(manifest.entries.map(compact), derived.entries.map(compact))) {
      integrityErrors.push('manifest entries do not match re-staged input');
    }
    if (!sameValue(manifest.summary, derived.summary)) integrityErrors.push('manifest summary does not match re-staged input');
    if (!sameValue(manifest.errors, derived.errors)) integrityErrors.push('manifest errors do not match re-staged input');
  }

  return {
    manifest,
    target,
    targetPath: actualTargetPath,
    currentSha256: sha256Text(currentText),
    stagedSha256: manifest.target.sha256,
    stale,
    integrityErrors,
    blockingErrors: derived ? derived.errors : manifest.errors,
    entries: derived ? derived.entries : manifest.entries,
    summary: derived ? derived.summary : manifest.summary,
  };
}

function jsString(value) {
  return JSON.stringify(String(value));
}

export function serializeLevelValue(table, value) {
  if (PRIMARY_SET.has(table) || table === 'addSkillsInfo' || table === 'addHintInfo') return JSON.stringify(value);
  if (table === 'levelFilters') {
    const tag = value.tagWhitelist == null ? 'null' : jsString(value.tagWhitelist);
    const name = value.nameWhitelist == null ? 'null' : jsString(value.nameWhitelist);
    if (value.weight === 10) return 'normalFilter(' + tag + (value.nameWhitelist == null ? '' : ', ' + name) + ')';
    return 'weightedFilter(' + tag + ', ' + name + ', ' + String(value.weight) + ')';
  }
  if (table === 'levelBonus') {
    return '[' + value.map(bonus => {
      const fn = bonus.replace ? 'replaceBonusInfo' : 'addBonusInfo';
      return fn + '(' + jsString(bonus.base) + ', ' + String(bonus.weight) + ', ' + jsString(bonus.tag) + ')';
    }).join(', ') + ']';
  }
  throw new Error('cannot serialize level table: ' + table);
}

function applyTextEdits(source, edits) {
  const sorted = [...edits].sort((a, b) => b.start - a.start);
  let output = source;
  for (const edit of sorted) output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  return output;
}

export function applyLevelEntriesToSource(source, entries) {
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const edits = [];
  const additions = new Map();

  for (const entry of entries) {
    if (entry.status === 'unchanged') continue;
    const table = entry.table;

    if (table === 'themeFilter') {
      const info = themeFilterElementSpans(source);
      const current = info.elements.find(element => element.key === entry.key);
      const text = '[' + jsString(entry.key) + ', ' + jsString(entry.value) + '],';
      if (current) edits.push({ start: current.start, end: current.end, text });
      else {
        if (!additions.has(table)) {
          const inner = source.slice(info.block.start + 1, info.block.end).trim();
          additions.set(table, {
            position: info.block.end,
            lines: [],
            needsLeadingComma: inner.length > 0 && !inner.endsWith(','),
          });
        }
        additions.get(table).lines.push('\t' + text);
      }
      continue;
    }

    const info = objectEntrySpans(source, table);
    const current = info.entries.get(entry.key);
    const text = jsString(entry.key) + ': ' + serializeLevelValue(table, entry.value) + ',';
    if (current) edits.push({ start: current.start, end: current.end, text });
    else {
      if (!additions.has(table)) {
        const inner = source.slice(info.block.start + 1, info.block.end).trim();
        additions.set(table, {
          position: info.block.end,
          lines: [],
          needsLeadingComma: inner.length > 0 && !inner.endsWith(','),
        });
      }
      additions.get(table).lines.push('\t' + text);
    }
  }

  for (const addition of additions.values()) {
    const separator = addition.needsLeadingComma ? ',' : '';
    const prefix = source[addition.position - 1] === '\n' ? '' : newline;
    edits.push({
      start: addition.position,
      end: addition.position,
      text: separator + prefix + addition.lines.join(newline) + newline,
    });
  }
  return applyTextEdits(source, edits);
}

function assertLevelPreviewCanApply(preview, { acceptConflicts = false } = {}) {
  if (preview.integrityErrors.length) throw new Error('manifest integrity check failed: ' + preview.integrityErrors.join('; '));
  if (preview.stale) throw new Error('stale manifest: level target changed after staging');
  if (preview.blockingErrors.length || preview.summary.invalidEntries > 0 || preview.summary.duplicateEntries > 0) {
    throw new Error('manifest contains blocking level staging errors');
  }
  if (preview.summary.conflictEntries > 0 && !acceptConflicts) {
    throw new Error('manifest contains conflicts; rerun apply with explicit conflict acceptance');
  }
}

function fsyncFile(path) {
  const fd = openSync(path, 'r+');
  try { fsyncSync(fd); }
  finally { closeSync(fd); }
}

export function applyLevelManifestToPath(
  manifest,
  targetPath,
  { acceptConflicts = false } = {},
) {
  const preview = buildLevelPreview(manifest, { targetPath });
  assertLevelPreviewCanApply(preview, { acceptConflicts });

  const changed = preview.entries.filter(entry => entry.status === 'new' || entry.status === 'conflict');
  const beforeText = readFileSync(targetPath, 'utf8');
  if (!changed.length) {
    return {
      applied: false,
      reason: 'no-changes',
      beforeSha256: sha256Text(beforeText),
      afterSha256: sha256Text(beforeText),
      preview,
    };
  }

  const output = applyLevelEntriesToSource(beforeText, preview.entries);
  const tempPath = join(dirname(targetPath), '.levels.gate11e-' + process.pid + '-' + Date.now() + '.tmp');

  try {
    writeFileSync(tempPath, output, 'utf8');
    fsyncFile(tempPath);
    const validationErrors = validateLevelSource(tempPath, {
      baselineSource: preview.target.path,
      strictBaseline: false,
    });
    if (validationErrors.length) throw new Error('updated level source failed validation: ' + validationErrors.join('; '));

    const appliedSnapshot = normalizedLevelTables(tempPath);
    for (const entry of preview.entries) {
      if (entry.status === 'new' || entry.status === 'conflict' || entry.status === 'unchanged') {
        if (!sameValue(appliedSnapshot.tables[entry.table]?.[entry.key], entry.value)) {
          throw new Error('updated level source does not contain expected value: ' + entry.table + '|' + entry.key);
        }
      }
    }

    try { chmodSync(tempPath, statSync(targetPath).mode); }
    catch { /* permission mode is advisory on Windows */ }
    renameSync(tempPath, targetPath);
  } catch (error) {
    if (existsSync(tempPath)) unlinkSync(tempPath);
    throw error;
  }

  const afterText = readFileSync(targetPath, 'utf8');
  return {
    applied: true,
    beforeSha256: sha256Text(beforeText),
    afterSha256: sha256Text(afterText),
    changedEntries: changed.length,
    newEntries: changed.filter(entry => entry.status === 'new').length,
    updatedEntries: changed.filter(entry => entry.status === 'conflict').length,
    preview,
  };
}

export function applyLevelManifest(manifest, options = {}) {
  const target = resolveLevelTarget(manifest.target.id);
  return applyLevelManifestToPath(manifest, absoluteDataSourcePath(target.id), options);
}

export function previewLevelLines(preview) {
  const lines = [];
  lines.push('[Level Preview] target: ' + preview.target.id + ' (' + preview.target.path + ')');
  lines.push('[Level Preview] target SHA: ' + preview.currentSha256 + (preview.stale ? ' [STALE]' : ' [MATCH]'));
  lines.push(
    '[Level Preview] entries: new ' + preview.summary.newEntries +
    '; unchanged ' + preview.summary.unchangedEntries +
    '; conflict ' + preview.summary.conflictEntries +
    '; invalid ' + preview.summary.invalidEntries +
    '; duplicate ' + preview.summary.duplicateEntries,
  );

  for (const entry of preview.entries) {
    if (entry.status === 'new') {
      lines.push('[NEW] ' + entry.table + '|' + entry.key + ' = ' + JSON.stringify(entry.value));
    } else if (entry.status === 'conflict') {
      lines.push('[CONFLICT] ' + entry.table + '|' + entry.key);
      lines.push('  - before: ' + JSON.stringify(entry.baselineValue));
      lines.push('  - after:  ' + JSON.stringify(entry.value));
    }
  }
  for (const error of preview.integrityErrors) lines.push('[INTEGRITY ERROR] ' + error);
  for (const error of preview.blockingErrors) lines.push('[BLOCKING] ' + error.table + '|' + error.key + ': ' + error.message);
  return lines;
}
