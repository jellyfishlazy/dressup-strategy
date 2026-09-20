import { isAbsolute } from 'node:path';
import { readExternalLevels, readExternalWardrobe } from './external-source-reader.mjs';
import { levelEntryErrors } from './level-pipeline.mjs';
import {
  DEFAULT_UPDATE_WORKSPACE,
  getCurrentSession,
  loadUpdateSession,
  saveUpdateSession,
} from './update-session.mjs';
import { listUpdateWardrobe } from './update-wardrobe.mjs';
import { listUpdateLevels } from './update-levels.mjs';

const LEVEL_PRIMARY_TABLE = 'levelsRaw';
const LEVEL_METADATA_TABLES = new Set([
  'levelFilters',
  'levelBonus',
  'addSkillsInfo',
  'addHintInfo',
]);

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function validIso(value) {
  return typeof value === 'string'
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value;
}

function readSession({ workspace = DEFAULT_UPDATE_WORKSPACE, sessionId } = {}) {
  const session = sessionId === undefined
    ? getCurrentSession({ workspace })
    : loadUpdateSession(sessionId, { workspace });
  if (!session) throw new Error('no current update session');
  assertValidPlan(session);
  return session;
}

function assertDraft(session) {
  if (session.status !== 'draft') throw new Error('only draft sessions can change update plan');
}

function exactKeyList(value, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some(key => typeof key !== 'string' || !key.trim())) {
    throw new Error(label + ' must be an array of nonempty exact keys');
  }
  return value;
}

function rowWarnings(row) {
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

function readPlannableWardrobe(session) {
  const path = session.sourceSnapshot.files?.wardrobe;
  if (typeof path !== 'string' || !isAbsolute(path)) throw new Error('invalid pinned wardrobe path');
  const source = readExternalWardrobe(path);
  if (source.sha256 !== session.sourceSnapshot.hashes.wardrobe) throw new Error('wardrobe source drift');

  const counts = new Map();
  for (const item of source.items) counts.set(item.key, (counts.get(item.key) || 0) + 1);

  return {
    source,
    byKey: new Map(source.items.map(item => [
      item.key,
      {
        ...item,
        selectable: rowWarnings(item.row).length === 0 && counts.get(item.key) === 1,
      },
    ])),
  };
}

function relevantLevelWarnings(source, bundle) {
  const themeNames = new Set(bundle.themeGroups.map(group => group.name));
  return source.warnings.filter(warning => {
    if (warning.kind === 'level-primary-collision') return warning.key === bundle.key;
    if (warning.table === 'themeFilter') return themeNames.has(warning.key);
    if (warning.key !== bundle.key) return false;
    return warning.table === LEVEL_PRIMARY_TABLE || LEVEL_METADATA_TABLES.has(warning.table);
  });
}

function readPlannableLevels(session) {
  const path = session.sourceSnapshot.files?.levels;
  if (typeof path !== 'string' || !isAbsolute(path)) throw new Error('invalid pinned levels path');
  const source = readExternalLevels(path);
  if (source.sha256 !== session.sourceSnapshot.hashes.levels) throw new Error('levels source drift');

  const byKey = new Map();
  for (const bundle of source.bundles) {
    if (bundle.primaryTable !== LEVEL_PRIMARY_TABLE) continue;
    const warnings = relevantLevelWarnings(source, bundle);
    byKey.set(bundle.key, {
      ...bundle,
      selectable: warnings.length === 0,
    });
  }
  return { source, byKey };
}

function wardrobePlanRecord(item, source, plannedAt) {
  return {
    key: item.key,
    name: item.name,
    category: item.category,
    id: item.id,
    sourcePath: source.path,
    sourceHash: source.sha256,
    plannedAt,
  };
}

function levelPlanRecord(bundle, source, plannedAt) {
  return {
    key: bundle.key,
    runtimeLabel: bundle.runtimeLabel,
    themeFilter: cloneJson(bundle.themeGroups),
    sourcePath: source.path,
    sourceHash: source.sha256,
    plannedAt,
  };
}

function validateWardrobePlanItem(item, session) {
  const errors = [];
  if (!item || typeof item !== 'object' || Array.isArray(item)) return ['wardrobe plan item must be an object'];
  if (typeof item.key !== 'string' || !/^[^|]+\|[^|]+$/.test(item.key)) errors.push('invalid wardrobe plan key');
  if (typeof item.name !== 'string' || !item.name.trim()) errors.push('invalid wardrobe plan name');
  if (typeof item.category !== 'string' || !item.category.trim()) errors.push('invalid wardrobe plan category');
  if (typeof item.id !== 'string' || !item.id.trim()) errors.push('invalid wardrobe plan id');
  if (item.key !== item.category + '|' + item.id) errors.push('wardrobe plan identity mismatch');
  if (item.sourcePath !== session.sourceSnapshot.files?.wardrobe || !isAbsolute(item.sourcePath || '')) {
    errors.push('wardrobe plan source path mismatch');
  }
  if (item.sourceHash !== session.sourceSnapshot.hashes.wardrobe) errors.push('wardrobe plan source hash mismatch');
  if (!validIso(item.plannedAt)) errors.push('invalid wardrobe plannedAt');
  return errors;
}

function validateLevelPlanItem(item, session) {
  const errors = [];
  if (!item || typeof item !== 'object' || Array.isArray(item)) return ['level plan item must be an object'];
  if (typeof item.key !== 'string' || !item.key.trim()) errors.push('invalid level plan key');
  if (typeof item.runtimeLabel !== 'string' || !item.runtimeLabel.trim()) errors.push('invalid level runtimeLabel');
  if (!Array.isArray(item.themeFilter)) {
    errors.push('invalid level themeFilter');
  } else {
    const seen = new Set();
    for (const entry of item.themeFilter) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        errors.push('invalid planned themeFilter entry');
        continue;
      }
      if (seen.has(entry.name)) errors.push('duplicate planned themeFilter name');
      seen.add(entry.name);
      errors.push(...levelEntryErrors({
        table: 'themeFilter',
        key: entry.name,
        value: entry.prefix,
      }));
      if (typeof entry.prefix === 'string'
        && entry.prefix !== 'null'
        && typeof item.runtimeLabel === 'string'
        && !item.runtimeLabel.startsWith(entry.prefix)) {
        errors.push('planned themeFilter prefix mismatch');
      }
    }
  }
  if (item.sourcePath !== session.sourceSnapshot.files?.levels || !isAbsolute(item.sourcePath || '')) {
    errors.push('level plan source path mismatch');
  }
  if (item.sourceHash !== session.sourceSnapshot.hashes.levels) errors.push('level plan source hash mismatch');
  if (!validIso(item.plannedAt)) errors.push('invalid level plannedAt');
  return errors;
}

export function assertValidPlan(session) {
  if (!session?.plan || !Array.isArray(session.plan.wardrobe) || !Array.isArray(session.plan.levels)) {
    throw new Error('invalid update plan container');
  }

  const wardrobeSeen = new Set();
  for (const item of session.plan.wardrobe) {
    const errors = validateWardrobePlanItem(item, session);
    if (wardrobeSeen.has(item?.key)) errors.push('duplicate planned wardrobe key');
    wardrobeSeen.add(item?.key);
    if (errors.length) throw new Error('invalid wardrobe plan: ' + errors.join('; '));
  }

  const levelSeen = new Set();
  for (const item of session.plan.levels) {
    const errors = validateLevelPlanItem(item, session);
    if (levelSeen.has(item?.key)) errors.push('duplicate planned level key');
    levelSeen.add(item?.key);
    if (errors.length) throw new Error('invalid level plan: ' + errors.join('; '));
  }
  return session.plan;
}

export function addPlannedItems(options = {}) {
  const wardrobeKeys = exactKeyList(options.wardrobeKeys, 'wardrobeKeys');
  const levelKeys = exactKeyList(options.levelKeys, 'levelKeys');
  if (!wardrobeKeys.length && !levelKeys.length) {
    throw new Error('plan add requires at least one wardrobe or level key');
  }

  const session = readSession(options);
  assertDraft(session);

  let wardrobeSource = null;
  let levelsSource = null;
  if (wardrobeKeys.length) {
    wardrobeSource = readPlannableWardrobe(session);
    if (options.expectedWardrobeSourceHash !== undefined
      && options.expectedWardrobeSourceHash !== wardrobeSource.source.sha256) {
      throw new Error('expected wardrobe source hash mismatch');
    }
    for (const key of wardrobeKeys) {
      if (!wardrobeSource.byKey.get(key)?.selectable) {
        throw new Error('unknown or nonselectable wardrobe plan key: ' + key);
      }
    }
  }
  if (levelKeys.length) {
    levelsSource = readPlannableLevels(session);
    if (options.expectedLevelsSourceHash !== undefined
      && options.expectedLevelsSourceHash !== levelsSource.source.sha256) {
      throw new Error('expected levels source hash mismatch');
    }
    for (const key of levelKeys) {
      if (!levelsSource.byKey.get(key)?.selectable) {
        throw new Error('unknown or nonselectable level plan key: ' + key);
      }
    }
  }

  const wardrobeExisting = new Set(session.plan.wardrobe.map(item => item.key));
  const levelExisting = new Set(session.plan.levels.map(item => item.key));
  const added = { wardrobe: [], levels: [] };
  const skipped = { wardrobe: [], levels: [] };
  const plannedAt = new Date().toISOString();

  for (const key of wardrobeKeys) {
    if (wardrobeExisting.has(key)) {
      skipped.wardrobe.push(key);
      continue;
    }
    session.plan.wardrobe.push(
      wardrobePlanRecord(wardrobeSource.byKey.get(key), wardrobeSource.source, plannedAt),
    );
    wardrobeExisting.add(key);
    added.wardrobe.push(key);
  }

  for (const key of levelKeys) {
    if (levelExisting.has(key)) {
      skipped.levels.push(key);
      continue;
    }
    session.plan.levels.push(
      levelPlanRecord(levelsSource.byKey.get(key), levelsSource.source, plannedAt),
    );
    levelExisting.add(key);
    added.levels.push(key);
  }

  if (added.wardrobe.length || added.levels.length) saveUpdateSession(session, options);
  const saved = readSession({ ...options, sessionId: session.id });
  return { session: saved, added, skipped };
}

export function removePlannedItems(options = {}) {
  const wardrobeKeys = exactKeyList(options.wardrobeKeys, 'wardrobeKeys');
  const levelKeys = exactKeyList(options.levelKeys, 'levelKeys');
  if (!wardrobeKeys.length && !levelKeys.length) {
    throw new Error('plan remove requires at least one wardrobe or level key');
  }

  const session = readSession(options);
  assertDraft(session);
  const existingWardrobe = new Set(session.plan.wardrobe.map(item => item.key));
  const existingLevels = new Set(session.plan.levels.map(item => item.key));
  const removed = { wardrobe: [], levels: [] };
  const skipped = { wardrobe: [], levels: [] };

  for (const key of wardrobeKeys) {
    if (existingWardrobe.has(key) && !removed.wardrobe.includes(key)) removed.wardrobe.push(key);
    else skipped.wardrobe.push(key);
  }
  for (const key of levelKeys) {
    if (existingLevels.has(key) && !removed.levels.includes(key)) removed.levels.push(key);
    else skipped.levels.push(key);
  }

  if (removed.wardrobe.length) {
    const remove = new Set(removed.wardrobe);
    session.plan.wardrobe = session.plan.wardrobe.filter(item => !remove.has(item.key));
  }
  if (removed.levels.length) {
    const remove = new Set(removed.levels);
    session.plan.levels = session.plan.levels.filter(item => !remove.has(item.key));
  }
  if (removed.wardrobe.length || removed.levels.length) saveUpdateSession(session, options);

  const saved = readSession({ ...options, sessionId: session.id });
  return { session: saved, removed, skipped };
}

export function listUpdatePlan(options = {}) {
  const session = readSession(options);
  return {
    sessionId: session.id,
    status: session.status,
    wardrobe: cloneJson(session.plan.wardrobe),
    levels: cloneJson(session.plan.levels),
  };
}

function domainCompleteness(plannedItems, collectedItems, compactCollected) {
  const plannedKeys = new Set(plannedItems.map(item => item.key));
  const collectedKeys = new Set(collectedItems.map(item => item.key));
  const missingItems = plannedItems.filter(item => !collectedKeys.has(item.key)).map(cloneJson);
  const completedItems = plannedItems.filter(item => collectedKeys.has(item.key)).map(cloneJson);
  const unplannedCollectedItems = collectedItems
    .filter(item => !plannedKeys.has(item.key))
    .map(compactCollected);

  const planned = plannedItems.length;
  const completed = completedItems.length;
  return {
    planned,
    completed,
    missing: missingItems.length,
    percent: planned === 0 ? null : Math.round((completed / planned) * 10000) / 100,
    complete: planned > 0 && missingItems.length === 0,
    missingItems,
    completedItems,
    unplannedCollected: unplannedCollectedItems.length,
    unplannedCollectedItems,
  };
}

export function checkUpdateCompleteness(options = {}) {
  const session = readSession(options);
  const common = { workspace: options.workspace, sessionId: session.id };
  const wardrobeCollection = listUpdateWardrobe(common).items;
  const levelCollection = listUpdateLevels(common).items;

  const wardrobe = domainCompleteness(
    session.plan.wardrobe,
    wardrobeCollection,
    item => ({
      key: item.key,
      name: item.name,
      category: item.category,
      id: item.id,
    }),
  );
  const levels = domainCompleteness(
    session.plan.levels,
    levelCollection,
    item => ({
      key: item.key,
      runtimeLabel: item.runtimeLabel,
    }),
  );

  const planned = wardrobe.planned + levels.planned;
  const completed = wardrobe.completed + levels.completed;
  const missing = wardrobe.missing + levels.missing;
  const planDefined = planned > 0;

  return {
    sessionId: session.id,
    status: session.status,
    planDefined,
    complete: planDefined && missing === 0,
    overall: {
      planned,
      completed,
      missing,
      percent: planDefined ? Math.round((completed / planned) * 10000) / 100 : null,
    },
    wardrobe,
    levels,
  };
}
