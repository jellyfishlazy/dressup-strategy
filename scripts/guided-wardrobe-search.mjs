import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { importOpencc } from '../cn-search/scripts/shared-deps.mjs';
import {
  CN_TAG_OVERRIDE,
  TW_TAG_NORMALIZE,
  splitPreserveSeg,
} from '../cn-search/scripts/cn-tag-map.mjs';
import { createLexicon } from '../cn-search/src/normalization.mjs';
import {
  buildTwLookup,
  filterRows,
  matchAll,
  mergeRow,
  tokens,
} from '../cn-search/src/search.mjs';
import { WARDROBE_FIELD_INDEX as FIELD } from '../src/domain/wardrobe/schema.mjs';
import { absoluteDataSourcePath } from './data-source-contract.mjs';
import { readExternalWardrobe } from './external-source-reader.mjs';
import { wardrobeRowWarnings } from './update-wardrobe.mjs';
import { loadWardrobe } from './validate-data.mjs';

export const GUIDED_WARDROBE_SEARCH_VERSION = 1;

const modelCache = new Map();
const MAX_CACHE_ENTRIES = 4;

function sha256Text(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function mappedTags(value, s2tw) {
  return splitPreserveSeg(String(value ?? '')).map(part => {
    if (part === '/' || part === ',' || part === '，') return part;
    const token = String(part).trim();
    if (!token) return part;
    if (Object.hasOwn(CN_TAG_OVERRIDE, token)) return CN_TAG_OVERRIDE[token];
    let converted = s2tw(token);
    if (Object.hasOwn(TW_TAG_NORMALIZE, converted)) converted = TW_TAG_NORMALIZE[converted];
    return converted;
  }).join('');
}

function normalizeFilters(input = {}) {
  const filters = {};
  for (const key of ['query', 'name', 'category', 'suit', 'version', 'source']) {
    const value = input[key] ?? '';
    if (typeof value !== 'string') throw new Error('invalid wardrobe search filter: ' + key);
    filters[key] = value.trim();
  }
  if (input.cnOnly !== undefined && typeof input.cnOnly !== 'boolean') {
    throw new Error('invalid wardrobe search filter: cnOnly');
  }
  filters.cnOnly = input.cnOnly === true;
  return filters;
}

function searchFingerprint({
  sessionId,
  sourceSha256,
  canonicalSha256,
  filters,
}) {
  return sha256Text(JSON.stringify({
    version: GUIDED_WARDROBE_SEARCH_VERSION,
    sessionId,
    sourceSha256,
    canonicalSha256,
    filters,
  }));
}

async function createConverters(localWardrobe) {
  const mod = await importOpencc();
  const Converter = mod.Converter ?? mod.default?.Converter;
  if (typeof Converter !== 'function') throw new Error('opencc-js Converter not found');
  const s2tw = Converter({ from: 'cn', to: 'tw' });
  const tw2cn = Converter({ from: 'tw', to: 'cn' });
  const lexicon = createLexicon({ s2tw, tw2cn });
  lexicon.build(localWardrobe);
  return { s2tw, lexicon };
}

function cacheSet(key, value) {
  modelCache.set(key, value);
  while (modelCache.size > MAX_CACHE_ENTRIES) {
    modelCache.delete(modelCache.keys().next().value);
  }
}

function compactResult(item, collected) {
  return {
    origin: 'external',
    key: item.sourceKey,
    sourceKey: item.sourceKey,
    displayKey: item.key,
    id: item.id,
    name: item.name,
    category: item.type,
    suit: item.suit,
    tags: item.tags,
    source: item.source,
    version: item.version,
    hasLocalMatch: item.hasTw,
    sourceOnly: !item.hasTw,
    collected: collected.has(item.sourceKey),
    selectable: item.selectable,
    warnings: cloneJson(item.warnings),
    original: cloneJson(item.original),
  };
}

function matchedRows(model, filters) {
  let rows = filterRows(model.items, {
    name: filters.name,
    suit: filters.suit,
    version: filters.version,
    source: filters.source,
    cnOnly: filters.cnOnly,
    category: filters.category,
  });

  const queryTokens = tokens(filters.query);
  if (queryTokens.length) {
    rows = rows.filter(item => matchAll(item.searchText, queryTokens));
  }
  return rows;
}

export async function buildGuidedWardrobeSearchModel({
  session,
  canonicalWardrobePath = absoluteDataSourcePath('wardrobe'),
} = {}) {
  if (!session || session.status !== 'draft') {
    throw new Error('Guided wardrobe search requires a draft update session');
  }

  const sourcePath = session.sourceSnapshot?.files?.wardrobe;
  const expectedSourceHash = session.sourceSnapshot?.hashes?.wardrobe;
  if (typeof sourcePath !== 'string' || typeof expectedSourceHash !== 'string') {
    throw new Error('update session is missing pinned wardrobe source');
  }

  const source = readExternalWardrobe(sourcePath);
  if (source.sha256 !== expectedSourceHash) {
    throw new Error('wardrobe source drift; restart or recreate the update session');
  }

  const canonicalPath = resolve(canonicalWardrobePath);
  const canonicalText = readFileSync(canonicalPath, 'utf8');
  const canonicalSha256 = sha256Text(canonicalText);
  const cacheKey = [
    GUIDED_WARDROBE_SEARCH_VERSION,
    source.path,
    source.sha256,
    canonicalPath,
    canonicalSha256,
  ].join('|');

  if (modelCache.has(cacheKey)) return modelCache.get(cacheKey);

  const localRows = loadWardrobe(canonicalPath);
  if (!Array.isArray(localRows)) {
    throw new Error('canonical wardrobe did not expose a wardrobe array');
  }

  const lookup = buildTwLookup(localRows);
  const converters = await createConverters(localRows);
  const duplicateCounts = new Map();
  for (const item of source.items) {
    duplicateCounts.set(item.key, (duplicateCounts.get(item.key) || 0) + 1);
  }

  const items = source.items.map(sourceItem => {
    const row = sourceItem.row;
    const tagsTw = mappedTags(row[FIELD.tags], converters.s2tw);
    const merged = mergeRow({
      id: sourceItem.id,
      categoryCn: sourceItem.category,
      nameCn: String(row[FIELD.name] ?? ''),
      tagsCn: String(row[FIELD.tags] ?? ''),
      tagsTw,
      sourceCn: String(row[FIELD.source] ?? ''),
      suitCn: String(row[FIELD.suit] ?? ''),
      version: String(row[FIELD.version] ?? ''),
      fullRow: row,
    }, lookup.slim, {
      s2tw: converters.s2tw,
      alignCompoundField: converters.lexicon.alignCompoundField,
      alignWholeField: converters.lexicon.alignWholeField,
    });

    const warnings = wardrobeRowWarnings(row);
    if (duplicateCounts.get(sourceItem.key) > 1) warnings.push('duplicate source identity');

    const original = {
      name: String(row[FIELD.name] ?? ''),
      category: sourceItem.category,
      tags: String(row[FIELD.tags] ?? ''),
      source: String(row[FIELD.source] ?? ''),
      suit: String(row[FIELD.suit] ?? ''),
      version: String(row[FIELD.version] ?? ''),
    };

    const searchText = [
      sourceItem.key,
      merged.key,
      merged.id,
      merged.type,
      merged.name,
      merged.suit,
      merged.tags,
      merged.source,
      merged.version,
      original.name,
      original.category,
      original.suit,
      original.tags,
      original.source,
      original.version,
    ].join(' ').toLowerCase();

    return {
      ...merged,
      sourceKey: sourceItem.key,
      sourceIndex: sourceItem.index,
      original,
      warnings,
      selectable: warnings.length === 0,
      searchText,
    };
  });

  const categoryCounts = new Map();
  for (const item of items) {
    categoryCounts.set(item.type, (categoryCounts.get(item.type) || 0) + 1);
  }
  const categories = [...categoryCounts.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'zh-TW'))
    .map(([value, count]) => ({ value, count }));

  const model = {
    version: GUIDED_WARDROBE_SEARCH_VERSION,
    sourcePath: source.path,
    sourceSha256: source.sha256,
    canonicalPath,
    canonicalSha256,
    categories,
    items,
  };
  cacheSet(cacheKey, model);
  return model;
}

export async function searchGuidedWardrobe({
  session,
  filters = {},
  offset = 0,
  limit = 50,
  canonicalWardrobePath,
} = {}) {
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('invalid wardrobe search offset');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) throw new Error('invalid wardrobe search limit');

  const normalized = normalizeFilters(filters);
  const model = await buildGuidedWardrobeSearchModel({ session, canonicalWardrobePath });
  const matched = matchedRows(model, normalized);
  const collected = new Set(session.collection.wardrobe.map(item => item.key));
  const selectable = matched.filter(item => item.selectable);
  const alreadyCollected = selectable.filter(item => collected.has(item.sourceKey));

  const fingerprint = searchFingerprint({
    sessionId: session.id,
    sourceSha256: model.sourceSha256,
    canonicalSha256: model.canonicalSha256,
    filters: normalized,
  });

  return {
    sessionId: session.id,
    filters: normalized,
    searchFingerprint: fingerprint,
    sourceHash: model.sourceSha256,
    canonicalHash: model.canonicalSha256,
    total: matched.length,
    selectable: selectable.length,
    alreadyCollected: alreadyCollected.length,
    addable: selectable.length - alreadyCollected.length,
    nonselectable: matched.length - selectable.length,
    offset,
    limit,
    hasMore: offset + limit < matched.length,
    categories: cloneJson(model.categories),
    items: matched.slice(offset, offset + limit).map(item => compactResult(item, collected)),
  };
}

export async function resolveGuidedWardrobeBatch({
  session,
  filters = {},
  searchFingerprint: expectedFingerprint,
  canonicalWardrobePath,
} = {}) {
  if (typeof expectedFingerprint !== 'string' || !/^[0-9a-f]{64}$/i.test(expectedFingerprint)) {
    throw new Error('invalid wardrobe search fingerprint');
  }

  const normalized = normalizeFilters(filters);
  const model = await buildGuidedWardrobeSearchModel({ session, canonicalWardrobePath });
  const currentFingerprint = searchFingerprint({
    sessionId: session.id,
    sourceSha256: model.sourceSha256,
    canonicalSha256: model.canonicalSha256,
    filters: normalized,
  });
  if (currentFingerprint !== expectedFingerprint) {
    throw new Error('搜尋結果已過期，請重新搜尋後再加入全部');
  }

  const matched = matchedRows(model, normalized);
  const collected = new Set(session.collection.wardrobe.map(item => item.key));
  const eligibleKeys = [];
  const alreadyCollectedKeys = [];
  const nonselectableItems = [];

  for (const item of matched) {
    if (!item.selectable) {
      nonselectableItems.push({
        sourceKey: item.sourceKey,
        displayKey: item.key,
        name: item.name,
        warnings: cloneJson(item.warnings),
      });
    } else if (collected.has(item.sourceKey)) {
      alreadyCollectedKeys.push(item.sourceKey);
    } else {
      eligibleKeys.push(item.sourceKey);
    }
  }

  return {
    sessionId: session.id,
    filters: normalized,
    searchFingerprint: currentFingerprint,
    sourceHash: model.sourceSha256,
    canonicalHash: model.canonicalSha256,
    matched: matched.length,
    eligibleKeys,
    alreadyCollectedKeys,
    nonselectableItems,
  };
}

export async function guidedWardrobeManualOptions({
  session,
  canonicalWardrobePath,
} = {}) {
  const model = await buildGuidedWardrobeSearchModel({ session, canonicalWardrobePath });
  const tags = new Set();
  for (const item of model.items) {
    for (const part of String(item.tags || '').split(/[/,，]/)) {
      const tag = part.trim();
      if (tag) tags.add(tag);
    }
  }
  return {
    categories: model.categories.map(entry => entry.value),
    tags: [...tags].sort((a, b) => a.localeCompare(b, 'zh-TW')),
  };
}

export async function projectGuidedWardrobeCollection({
  session,
  canonicalWardrobePath,
} = {}) {
  if (!session || !Array.isArray(session.collection?.wardrobe)) return [];
  const externalItems = session.collection.wardrobe.filter(item => item.origin !== 'manual');
  let bySourceKey = new Map();
  if (externalItems.length) {
    const model = await buildGuidedWardrobeSearchModel({ session, canonicalWardrobePath });
    bySourceKey = new Map(model.items.map(item => [item.sourceKey, item]));
  }
  const collected = new Set(session.collection.wardrobe.map(item => item.key));

  return session.collection.wardrobe.map(item => {
    if (item.origin === 'manual') {
      const row = item.coreRow || item.row;
      return {
        origin: 'manual',
        key: item.key,
        sourceKey: null,
        displayKey: item.key,
        id: String(row[FIELD.id] ?? ''),
        name: String(row[FIELD.name] ?? ''),
        category: String(row[FIELD.type] ?? ''),
        suit: String(row[FIELD.suit] ?? ''),
        tags: String(row[FIELD.tags] ?? ''),
        source: String(row[FIELD.source] ?? ''),
        version: String(row[FIELD.version] ?? ''),
        sourceOnly: false,
        hasLocalMatch: false,
        collected: true,
        selectable: true,
        warnings: [],
        original: null,
      };
    }

    const merged = bySourceKey.get(item.key);
    if (merged) return compactResult(merged, collected);
    return {
      origin: 'external',
      key: item.key,
      sourceKey: item.key,
      displayKey: item.key,
      id: item.id,
      name: item.name,
      category: item.category,
      suit: String(item.coreRow?.[FIELD.suit] ?? ''),
      tags: String(item.coreRow?.[FIELD.tags] ?? ''),
      source: String(item.coreRow?.[FIELD.source] ?? ''),
      version: String(item.coreRow?.[FIELD.version] ?? ''),
      sourceOnly: true,
      hasLocalMatch: false,
      collected: true,
      selectable: true,
      warnings: [],
      original: {
        name: item.name,
        category: item.category,
        suit: String(item.coreRow?.[FIELD.suit] ?? ''),
        tags: String(item.coreRow?.[FIELD.tags] ?? ''),
        source: String(item.coreRow?.[FIELD.source] ?? ''),
        version: String(item.coreRow?.[FIELD.version] ?? ''),
      },
    };
  });
}

export function clearGuidedWardrobeSearchCache() {
  modelCache.clear();
}
