import { isAbsolute } from 'node:path';
import { tokens, matchAll } from '../cn-search/src/search.mjs';
import { readExternalWardrobe } from './external-source-reader.mjs';
import {
  DEFAULT_UPDATE_WORKSPACE, getCurrentSession, loadUpdateSession, saveUpdateSession,
} from './update-session.mjs';

export function wardrobeRowWarnings(row) {
  const warnings = [];
  if (!Array.isArray(row)) return ['invalid row'];
  if (row.length < 18) warnings.push('row has fewer than 18 columns');
  if (Array.from(row).some(cell => !['string', 'boolean'].includes(typeof cell)
    && !(typeof cell === 'number' && Number.isFinite(cell)))) warnings.push('invalid scalar cell');
  if (typeof row[0] !== 'string' || !row[0].trim()) warnings.push('missing or invalid name');
  if (typeof row[1] !== 'string' || !row[1].trim() || row[1].includes('|')
    || !['string', 'number'].includes(typeof row[2]) || !String(row[2]).trim()
    || String(row[2]).includes('|')) warnings.push('missing or invalid identity');
  return warnings;
}

function validIso(value) {
  return typeof value === 'string'
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value;
}

export function wardrobeCollectionOrigin(item) {
  return item?.origin === 'manual' ? 'manual' : 'external';
}

function manualWardrobeRowWarnings(row) {
  const warnings = wardrobeRowWarnings(row);
  if (Array.isArray(row) && row.length !== 18) warnings.push('manual row must contain exactly 18 columns');
  return warnings;
}

function readSession({ workspace = DEFAULT_UPDATE_WORKSPACE, sessionId } = {}) {
  const session = sessionId === undefined
    ? getCurrentSession({ workspace }) : loadUpdateSession(sessionId, { workspace });
  if (!session) throw new Error('no current update session');
  const seen = new Set();
  for (const item of session.collection.wardrobe) {
    const origin = wardrobeCollectionOrigin(item);
    const commonInvalid = !item || typeof item !== 'object'
      || item.key !== item.category + '|' + item.id || seen.has(item.key)
      || item.name !== item.row?.[0] || item.category !== item.row?.[1]
      || item.id !== String(item.row?.[2])
      || !validIso(item.collectedAt);

    let invalid = commonInvalid;
    if (origin === 'manual') {
      invalid ||= item.origin !== 'manual'
        || manualWardrobeRowWarnings(item.row).length > 0
        || JSON.stringify(item.coreRow) !== JSON.stringify(item.row)
        || !Array.isArray(item.extraColumns) || item.extraColumns.length !== 0
        || item.index !== undefined
        || item.sourceHash !== undefined
        || item.sourcePath !== undefined;
    } else {
      invalid ||= (item.origin !== undefined && item.origin !== 'external')
        || wardrobeRowWarnings(item.row).length > 0
        || !Number.isSafeInteger(item.index) || item.index < 0
        || item.index >= session.sourceSnapshot.wardrobe?.count
        || JSON.stringify(item.coreRow) !== JSON.stringify(item.row.slice(0, 18))
        || JSON.stringify(item.extraColumns) !== JSON.stringify(item.row.slice(18))
        || item.sourceHash !== session.sourceSnapshot.hashes.wardrobe
        || typeof item.sourcePath !== 'string' || !isAbsolute(item.sourcePath)
        || item.sourcePath !== session.sourceSnapshot.files?.wardrobe;
    }

    if (invalid) throw new Error('invalid persisted wardrobe collection');
    seen.add(item.key);
  }
  return session;
}

function readPinned(session) {
  const path = session.sourceSnapshot.files?.wardrobe;
  if (typeof path !== 'string' || !isAbsolute(path)) throw new Error('invalid pinned wardrobe path');
  const source = readExternalWardrobe(path);
  if (source.sha256 !== session.sourceSnapshot.hashes.wardrobe) throw new Error('wardrobe source drift');
  const counts = new Map();
  for (const item of source.items) counts.set(item.key, (counts.get(item.key) || 0) + 1);
  for (const item of source.items) {
    item.warnings = wardrobeRowWarnings(item.row);
    if (counts.get(item.key) > 1) item.warnings.push('duplicate source identity');
    item.selectable = item.warnings.length === 0;
  }
  return source;
}

function requestedKeys(keys) {
  if (!Array.isArray(keys) || !keys.length || Array.from(keys).some(key =>
    typeof key !== 'string' || !/^[^|]+\|[^|]+$/.test(key)
    || key.split('|').some(part => !part.trim()))) throw new Error('keys must be a nonempty array of exact category|id strings');
  return keys;
}

function assertDraft(session) {
  if (session.status !== 'draft') throw new Error('only draft sessions can change wardrobe collection');
}

export function searchUpdateWardrobe(options = {}) {
  const { offset = 0, limit = 50 } = options;
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('invalid offset');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new Error('invalid limit');
  for (const field of ['query', 'name', 'category', 'sourceId', 'suit', 'source', 'tag', 'version']) {
    if (options[field] !== undefined && typeof options[field] !== 'string') throw new Error('invalid ' + field);
  }
  const session = readSession(options);
  const source = readPinned(session);
  const collected = new Set(session.collection.wardrobe.map(item => item.key));
  const queries = Object.fromEntries(['query', 'name', 'suit', 'source', 'tag', 'version']
    .map(field => [field, tokens(options[field])]));
  const items = source.items.map(item => ({
    key: item.key, index: item.index, name: item.name, category: item.category, id: item.id,
    suit: String(item.row[16] ?? ''), source: String(item.row[15] ?? ''),
    tags: String(item.row[14] ?? ''), version: String(item.row[17] ?? ''),
    collected: collected.has(item.key), selectable: item.selectable, warnings: item.warnings,
  })).filter(item => {
    if (options.category !== undefined && item.category !== options.category) return false;
    if (options.sourceId !== undefined && item.id !== options.sourceId) return false;
    const combined = [item.key, item.name, item.category, item.id, item.suit, item.source, item.tags, item.version].join(' ');
    return Object.entries(queries).every(([field, terms]) => matchAll(
      (field === 'query' ? combined : item[field === 'tag' ? 'tags' : field]).toLowerCase(), terms,
    ));
  });
  return {
    sessionId: session.id, total: items.length, offset, limit, items: items.slice(offset, offset + limit),
    sourceHash: source.sha256,
    warnings: [...source.warnings, ...source.items.filter(item => item.warnings.length)
      .map(item => ({ index: item.index, key: item.key, warnings: item.warnings }))],
  };
}

export function addWardrobeToUpdate(options = {}) {
  const keys = requestedKeys(options.keys);
  const session = readSession(options);
  assertDraft(session);
  const source = readPinned(session);
  if (options.expectedSourceHash !== undefined && options.expectedSourceHash !== source.sha256) {
    throw new Error('expected source hash mismatch');
  }
  const byKey = new Map(source.items.map(item => [item.key, item]));
  for (const key of keys) {
    if (!byKey.get(key)?.selectable) throw new Error('unknown or nonselectable source key: ' + key);
  }
  const collected = new Set(session.collection.wardrobe.map(item => item.key));
  const addedKeys = [], skippedKeys = [];
  const collectedAt = new Date().toISOString();
  for (const key of keys) {
    if (collected.has(key)) { skippedKeys.push(key); continue; }
    const { index, name, category, id, row, coreRow, extraColumns } = byKey.get(key);
    session.collection.wardrobe.push({
      origin: 'external',
      key, index, name, category, id, row, coreRow, extraColumns,
      sourcePath: source.path, sourceHash: source.sha256, collectedAt,
    });
    collected.add(key);
    addedKeys.push(key);
  }
  if (addedKeys.length) saveUpdateSession(session, options);
  return { session: readSession({ ...options, sessionId: session.id }), addedKeys, skippedKeys };
}

export function addManualWardrobeToUpdate(options = {}) {
  const row = Array.isArray(options.row) ? Array.from(options.row) : options.row;
  const warnings = manualWardrobeRowWarnings(row);
  if (warnings.length) throw new Error('invalid manual wardrobe row: ' + warnings.join('; '));

  const session = readSession(options);
  assertDraft(session);
  const category = String(row[1]);
  const id = String(row[2]);
  const key = category + '|' + id;
  if (session.collection.wardrobe.some(item => item.key === key)) {
    throw new Error('wardrobe collection already contains key: ' + key);
  }

  const collectedAt = (options.now instanceof Date ? options.now : new Date()).toISOString();
  session.collection.wardrobe.push({
    origin: 'manual',
    key,
    name: String(row[0]),
    category,
    id,
    row,
    coreRow: Array.from(row),
    extraColumns: [],
    collectedAt,
  });
  saveUpdateSession(session, options);
  return {
    session: readSession({ ...options, sessionId: session.id }),
    addedKeys: [key],
    skippedKeys: [],
  };
}

export function listUpdateWardrobe(options = {}) {
  const session = readSession(options);
  return { sessionId: session.id, status: session.status, count: session.collection.wardrobe.length, items: session.collection.wardrobe };
}

export function removeWardrobeFromUpdate(options = {}) {
  const keys = requestedKeys(options.keys);
  const session = readSession(options);
  assertDraft(session);
  const remaining = new Set(session.collection.wardrobe.map(item => item.key));
  const removedKeys = [], skippedKeys = [];
  for (const key of keys) {
    if (remaining.delete(key)) removedKeys.push(key);
    else skippedKeys.push(key);
  }
  if (removedKeys.length) {
    session.collection.wardrobe = session.collection.wardrobe.filter(item => remaining.has(item.key));
    saveUpdateSession(session, options);
  }
  return { session: readSession({ ...options, sessionId: session.id }), removedKeys, skippedKeys };
}
