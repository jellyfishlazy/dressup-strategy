import { isAbsolute } from 'node:path';
import { tokens, matchAll } from '../cn-search/src/search.mjs';
import { readExternalLevels } from './external-source-reader.mjs';
import { levelEntryErrors } from './level-pipeline.mjs';
import {
  DEFAULT_UPDATE_WORKSPACE, getCurrentSession, loadUpdateSession, saveUpdateSession,
} from './update-session.mjs';

const PRIMARY_TABLE = 'levelsRaw';
const METADATA_FIELDS = Object.freeze([
  ['levelFilters', 'levelFilters'],
  ['levelBonus', 'levelBonus'],
  ['addSkillsInfo', 'skills'],
  ['addHintInfo', 'hint'],
]);

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function validIso(value) {
  return typeof value === 'string'
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value;
}

function recordErrors(item, session) {
  const errors = [];
  if (!item || typeof item !== 'object' || Array.isArray(item)) return ['record must be an object'];
  if (typeof item.key !== 'string' || !item.key.trim()) errors.push('invalid key');
  if (item.primaryTable !== PRIMARY_TABLE) errors.push('invalid primaryTable');
  if (typeof item.runtimeLabel !== 'string' || !item.runtimeLabel.trim()) errors.push('invalid runtimeLabel');

  errors.push(...levelEntryErrors({
    table: PRIMARY_TABLE,
    key: typeof item.key === 'string' ? item.key : '',
    value: item.levelsRaw,
  }));

  const presence = item.metadataPresence;
  if (!presence || typeof presence !== 'object' || Array.isArray(presence)) {
    errors.push('invalid metadataPresence');
  } else {
    for (const [table, field] of METADATA_FIELDS) {
      if (typeof presence[table] !== 'boolean') {
        errors.push('invalid metadata presence: ' + table);
        continue;
      }
      if (presence[table]) {
        errors.push(...levelEntryErrors({ table, key: item.key, value: item[field] }));
      } else if (item[field] !== null) {
        errors.push(field + ' must be null when metadata is absent');
      }
    }
  }

  if (!Array.isArray(item.themeFilter)) {
    errors.push('themeFilter must be an array');
  } else {
    const names = new Set();
    for (const entry of item.themeFilter) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        errors.push('invalid themeFilter entry');
        continue;
      }
      if (names.has(entry.name)) errors.push('duplicate themeFilter name');
      names.add(entry.name);
      errors.push(...levelEntryErrors({ table: 'themeFilter', key: entry.name, value: entry.prefix }));
      if (typeof item.runtimeLabel === 'string'
        && typeof entry.prefix === 'string'
        && entry.prefix !== 'null'
        && !item.runtimeLabel.startsWith(entry.prefix)) {
        errors.push('themeFilter prefix does not match runtime label');
      }
    }
  }

  if (item.sourceHash !== session.sourceSnapshot.hashes.levels) errors.push('sourceHash mismatch');
  if (typeof item.sourcePath !== 'string' || !isAbsolute(item.sourcePath)
    || item.sourcePath !== session.sourceSnapshot.files?.levels) errors.push('sourcePath mismatch');
  if (!validIso(item.collectedAt)) errors.push('invalid collectedAt');
  return errors;
}

function readSession({ workspace = DEFAULT_UPDATE_WORKSPACE, sessionId } = {}) {
  const session = sessionId === undefined
    ? getCurrentSession({ workspace }) : loadUpdateSession(sessionId, { workspace });
  if (!session) throw new Error('no current update session');

  const seen = new Set();
  for (const item of session.collection.levels) {
    const errors = recordErrors(item, session);
    if (seen.has(item?.key)) errors.push('duplicate collected level key');
    if (errors.length) throw new Error('invalid persisted level collection: ' + errors.join('; '));
    seen.add(item.key);
  }
  return session;
}

function warningsForBundle(source, bundle) {
  const themeNames = new Set(bundle.themeGroups.map(group => group.name));
  return source.warnings.filter(warning => {
    if (warning.kind === 'level-primary-collision') return warning.key === bundle.key;
    if (warning.table === 'themeFilter') return themeNames.has(warning.key);
    if (warning.key !== bundle.key) return false;
    return warning.table === PRIMARY_TABLE
      || METADATA_FIELDS.some(([table]) => table === warning.table);
  }).map(cloneJson);
}

function selectableLevels(source) {
  return source.bundles
    .filter(bundle => bundle.primaryTable === PRIMARY_TABLE)
    .map(bundle => {
      const warnings = warningsForBundle(source, bundle);
      return { ...bundle, warnings, selectable: warnings.length === 0 };
    });
}

function readPinned(session) {
  const path = session.sourceSnapshot.files?.levels;
  if (typeof path !== 'string' || !isAbsolute(path)) throw new Error('invalid pinned levels path');
  const source = readExternalLevels(path);
  if (source.sha256 !== session.sourceSnapshot.hashes.levels) throw new Error('levels source drift');
  return { ...source, levelItems: selectableLevels(source) };
}

function requestedKeys(keys) {
  if (!Array.isArray(keys) || !keys.length
    || keys.some(key => typeof key !== 'string' || !key.trim())) {
    throw new Error('keys must be a nonempty array of exact levelsRaw keys');
  }
  return keys;
}

function assertDraft(session) {
  if (session.status !== 'draft') throw new Error('only draft sessions can change level collection');
}

function collectPayload(bundle) {
  return {
    key: bundle.key,
    primaryTable: PRIMARY_TABLE,
    runtimeLabel: bundle.runtimeLabel,
    levelsRaw: cloneJson(bundle.weights),
    levelFilters: cloneJson(bundle.filter),
    levelBonus: cloneJson(bundle.bonus),
    skills: cloneJson(bundle.skills),
    hint: cloneJson(bundle.hint),
    metadataPresence: cloneJson(bundle.metadataPresence),
    themeFilter: cloneJson(bundle.themeGroups),
  };
}

function searchableText(item) {
  return [
    item.key,
    item.runtimeLabel,
    ...item.themeFilter.flatMap(group => [group.name, group.prefix]),
    JSON.stringify(item.levelsRaw),
    JSON.stringify(item.levelFilters),
    JSON.stringify(item.levelBonus),
    JSON.stringify(item.skills),
    JSON.stringify(item.hint),
  ].join(' ').toLowerCase();
}

export function searchUpdateLevels(options = {}) {
  const { offset = 0, limit = 50 } = options;
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('invalid offset');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new Error('invalid limit');
  for (const field of ['query', 'sourceKey', 'theme', 'label']) {
    if (options[field] !== undefined && typeof options[field] !== 'string') {
      throw new Error('invalid ' + field);
    }
  }

  const session = readSession(options);
  const source = readPinned(session);
  const collected = new Set(session.collection.levels.map(item => item.key));
  const queryTerms = tokens(options.query);
  const themeTerms = tokens(options.theme);
  const labelTerms = tokens(options.label);

  const items = source.levelItems.map(bundle => {
    const payload = collectPayload(bundle);
    return {
      ...payload,
      collected: collected.has(bundle.key),
      selectable: bundle.selectable,
      warnings: bundle.warnings,
    };
  }).filter(item => {
    if (options.sourceKey !== undefined && item.key !== options.sourceKey) return false;
    if (themeTerms.length) {
      const themeText = item.themeFilter.flatMap(group => [group.name, group.prefix]).join(' ').toLowerCase();
      if (!matchAll(themeText, themeTerms)) return false;
    }
    if (labelTerms.length && !matchAll(item.runtimeLabel.toLowerCase(), labelTerms)) return false;
    return matchAll(searchableText(item), queryTerms);
  });

  return {
    sessionId: session.id,
    total: items.length,
    offset,
    limit,
    items: items.slice(offset, offset + limit),
    sourceHash: source.sha256,
    warnings: cloneJson(source.warnings),
  };
}

export function addLevelsToUpdate(options = {}) {
  const keys = requestedKeys(options.keys);
  const session = readSession(options);
  assertDraft(session);
  const source = readPinned(session);
  if (options.expectedSourceHash !== undefined && options.expectedSourceHash !== source.sha256) {
    throw new Error('expected source hash mismatch');
  }

  const byKey = new Map(source.levelItems.map(item => [item.key, item]));
  for (const key of keys) {
    const item = byKey.get(key);
    if (!item || !item.selectable) throw new Error('unknown or nonselectable levelsRaw key: ' + key);
  }

  const collected = new Set(session.collection.levels.map(item => item.key));
  const addedKeys = [];
  const skippedKeys = [];
  const collectedAt = new Date().toISOString();

  for (const key of keys) {
    if (collected.has(key)) {
      skippedKeys.push(key);
      continue;
    }
    session.collection.levels.push({
      ...collectPayload(byKey.get(key)),
      sourcePath: source.path,
      sourceHash: source.sha256,
      collectedAt,
    });
    collected.add(key);
    addedKeys.push(key);
  }

  if (addedKeys.length) saveUpdateSession(session, options);
  return {
    session: readSession({ ...options, sessionId: session.id }),
    addedKeys,
    skippedKeys,
  };
}

export function listUpdateLevels(options = {}) {
  const session = readSession(options);
  return {
    sessionId: session.id,
    status: session.status,
    count: session.collection.levels.length,
    items: session.collection.levels,
  };
}

export function removeLevelsFromUpdate(options = {}) {
  const keys = requestedKeys(options.keys);
  const session = readSession(options);
  assertDraft(session);

  const requested = new Set(keys);
  const existing = new Set(session.collection.levels.map(item => item.key));
  const removedKeys = [];
  const skippedKeys = [];
  for (const key of keys) {
    if (existing.has(key) && !removedKeys.includes(key)) removedKeys.push(key);
    else skippedKeys.push(key);
  }

  if (removedKeys.length) {
    session.collection.levels = session.collection.levels.filter(item => !requested.has(item.key));
    saveUpdateSession(session, options);
  }
  return {
    session: readSession({ ...options, sessionId: session.id }),
    removedKeys,
    skippedKeys,
  };
}
