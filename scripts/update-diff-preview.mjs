import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { importOpencc } from '../cn-search/scripts/shared-deps.mjs';
import {
  CN2TW_CATEGORY,
  CN_TAG_OVERRIDE,
  TW_TAG_NORMALIZE,
  splitPreserveSeg,
} from '../cn-search/scripts/cn-tag-map.mjs';
import { createLexicon } from '../cn-search/src/normalization.mjs';
import {
  WARDROBE_FIELDS,
  WARDROBE_FIELD_INDEX as FIELD,
} from '../src/domain/wardrobe/schema.mjs';
import { absoluteDataSourcePath } from './data-source-contract.mjs';
import {
  PRIMARY_LEVEL_TABLES,
  readNormalizedLevelTables,
} from './level-pipeline.mjs';
import { loadWardrobe } from './validate-data.mjs';
import { checkUpdateCompleteness, listUpdatePlan } from './update-completeness.mjs';
import { listUpdateWardrobe } from './update-wardrobe.mjs';
import { listUpdateLevels } from './update-levels.mjs';

const WARDROBE_MANUAL_FIELDS = new Set(['name', 'source', 'suit']);
const LEVEL_METADATA = Object.freeze([
  ['levelFilters', 'levelFilters'],
  ['levelBonus', 'levelBonus'],
  ['addSkillsInfo', 'skills'],
  ['addHintInfo', 'hint'],
]);

function sha256Text(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function sameValue(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function scalarEqual(a, b) {
  return String(a ?? '') === String(b ?? '');
}

function diffRows(before, after) {
  const diffs = [];
  for (let index = 0; index < WARDROBE_FIELDS.length; index++) {
    if (scalarEqual(before[index], after[index])) continue;
    diffs.push({
      field: WARDROBE_FIELDS[index],
      before: before[index] ?? '',
      after: after[index] ?? '',
    });
  }
  return diffs;
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

function mappedTags(value, s2tw) {
  const parts = splitPreserveSeg(String(value ?? ''));
  return parts.map(part => {
    if (part === '/' || part === ',' || part === '，') return part;
    const token = String(part).trim();
    if (!token) return part;
    if (Object.hasOwn(CN_TAG_OVERRIDE, token)) return CN_TAG_OVERRIDE[token];
    let converted = s2tw(token);
    if (Object.hasOwn(TW_TAG_NORMALIZE, converted)) converted = TW_TAG_NORMALIZE[converted];
    return converted;
  }).join('');
}

function wardrobeTargetType(sourceType, localTypes) {
  if (Object.hasOwn(CN2TW_CATEGORY, sourceType)) {
    return { targetType: CN2TW_CATEGORY[sourceType], rule: 'explicit-category-map' };
  }
  if (localTypes.has(sourceType)) return { targetType: sourceType, rule: 'exact-category' };
  return { targetType: null, rule: null };
}

function candidateWardrobeRow(sourceItem, mapping, converters) {
  const row = cloneJson(sourceItem.coreRow);
  row[FIELD.name] = converters.s2tw(String(row[FIELD.name] ?? ''));
  row[FIELD.type] = mapping.targetType;
  row[FIELD.id] = String(row[FIELD.id] ?? '');
  row[FIELD.tags] = mappedTags(row[FIELD.tags], converters.s2tw);
  row[FIELD.source] = converters.lexicon.alignCompoundField(String(row[FIELD.source] ?? ''));
  row[FIELD.suit] = converters.lexicon.alignCompoundField(String(row[FIELD.suit] ?? ''));
  const version = String(row[FIELD.version] ?? '');
  row[FIELD.version] = converters.lexicon.alignWholeField(version) || converters.s2tw(version);
  return row;
}

function compactWardrobePlan(planItem) {
  return {
    key: planItem.key,
    name: planItem.name,
    category: planItem.category,
    id: planItem.id,
  };
}

function localWardrobeIndex(rows) {
  const byKey = new Map();
  const types = new Set();
  rows.forEach((row, index) => {
    const type = String(row[FIELD.type] ?? '');
    const id = String(row[FIELD.id] ?? '');
    types.add(type);
    const key = type + '|' + id;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push({ index, row });
  });
  return { byKey, types };
}

function previewWardrobeItem(sourceItem, planItem, local, converters) {
  const sourceType = String(sourceItem.category);
  const mapping = wardrobeTargetType(sourceType, local.types);
  if (!mapping.targetType) {
    return {
      domain: 'wardrobe',
      sourceKey: sourceItem.key,
      planned: compactWardrobePlan(planItem),
      status: 'conflict',
      conflictKind: 'unmapped-category',
      reasons: ['source category has no explicit or exact local mapping'],
      targetKey: null,
    };
  }

  const targetKey = mapping.targetType + '|' + sourceItem.id;
  const candidates = local.byKey.get(targetKey) || [];
  const candidateRow = candidateWardrobeRow(sourceItem, mapping, converters);

  if (candidates.length > 1) {
    return {
      domain: 'wardrobe',
      sourceKey: sourceItem.key,
      planned: compactWardrobePlan(planItem),
      targetKey,
      mappingRule: mapping.rule,
      status: 'conflict',
      conflictKind: 'ambiguous-local-identity',
      reasons: ['multiple local wardrobe rows share the mapped identity'],
      localMatches: candidates.length,
      candidateRow,
    };
  }

  if (candidates.length === 0) {
    return {
      domain: 'wardrobe',
      sourceKey: sourceItem.key,
      planned: compactWardrobePlan(planItem),
      targetKey,
      mappingRule: mapping.rule,
      status: 'new',
      candidateRow,
      differences: [],
    };
  }

  const target = candidates[0];
  const differences = diffRows(target.row, candidateRow);
  if (!differences.length) {
    return {
      domain: 'wardrobe',
      sourceKey: sourceItem.key,
      planned: compactWardrobePlan(planItem),
      targetKey,
      mappingRule: mapping.rule,
      targetIndex: target.index,
      status: 'unchanged',
      differences: [],
    };
  }

  const manual = differences.filter(diff => WARDROBE_MANUAL_FIELDS.has(diff.field));
  if (manual.length) {
    return {
      domain: 'wardrobe',
      sourceKey: sourceItem.key,
      planned: compactWardrobePlan(planItem),
      targetKey,
      mappingRule: mapping.rule,
      targetIndex: target.index,
      status: 'conflict',
      conflictKind: 'localized-field-difference',
      reasons: ['name/source/suit differs after deterministic conversion and requires review'],
      differences,
      manualReviewFields: manual.map(diff => diff.field),
      candidateRow,
      baselineRow: cloneJson(target.row),
    };
  }

  return {
    domain: 'wardrobe',
    sourceKey: sourceItem.key,
    planned: compactWardrobePlan(planItem),
    targetKey,
    mappingRule: mapping.rule,
    targetIndex: target.index,
    status: 'modified',
    differences,
    candidateRow,
    baselineRow: cloneJson(target.row),
  };
}

function mapLevelKey(sourceKey) {
  if (/^\d/.test(sourceKey)) {
    return { targetKey: 'I-' + sourceKey, rule: 'volume-I-prefix' };
  }
  if (/^(?:II|III)-/.test(sourceKey)) {
    return { targetKey: sourceKey, rule: 'explicit-volume-key' };
  }
  return { targetKey: null, rule: null };
}

function convertDeep(value, s2tw) {
  if (typeof value === 'string') return s2tw(value);
  if (Array.isArray(value)) return value.map(item => convertDeep(item, s2tw));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, convertDeep(item, s2tw)]),
    );
  }
  return value;
}

function mapThemePrefix(prefix, s2tw) {
  let out = s2tw(String(prefix ?? ''));
  out = out.replace(/^關卡:\s*(\d)/, '關卡: I-$1');
  return out;
}

function mappedThemeGroups(groups, s2tw) {
  return groups.map(group => ({
    name: s2tw(String(group.name ?? '')),
    prefix: mapThemePrefix(group.prefix, s2tw),
  }));
}

function localLevelOwners(tables, key) {
  return PRIMARY_LEVEL_TABLES.filter(table =>
    Object.prototype.hasOwnProperty.call(tables[table] || {}, key)
  );
}

function addLevelDifference(differences, table, key, before, after, kind) {
  differences.push({
    table,
    key,
    kind,
    before: before === undefined ? null : cloneJson(before),
    after: after === undefined ? null : cloneJson(after),
  });
}

function themePreview(groups, localThemeFilter) {
  const differences = [];
  const conflicts = [];
  const localByPrefix = new Map();
  for (const [name, prefix] of Object.entries(localThemeFilter || {})) {
    if (!localByPrefix.has(prefix)) localByPrefix.set(prefix, []);
    localByPrefix.get(prefix).push(name);
  }

  for (const group of groups) {
    const existing = localThemeFilter?.[group.name];
    if (existing !== undefined) {
      if (existing !== group.prefix) {
        conflicts.push({
          kind: 'theme-prefix-mismatch',
          name: group.name,
          before: existing,
          after: group.prefix,
        });
      }
      continue;
    }

    const aliases = localByPrefix.get(group.prefix) || [];
    if (aliases.length === 1) continue;
    if (aliases.length > 1) {
      conflicts.push({
        kind: 'ambiguous-theme-prefix',
        name: group.name,
        prefix: group.prefix,
        localNames: aliases,
      });
      continue;
    }

    addLevelDifference(differences, 'themeFilter', group.name, undefined, group.prefix, 'add');
  }
  return { differences, conflicts };
}

function previewLevelItem(sourceItem, planItem, local, s2tw) {
  const mapping = mapLevelKey(sourceItem.key);
  if (!mapping.targetKey) {
    return {
      domain: 'levels',
      sourceKey: sourceItem.key,
      planned: {
        key: planItem.key,
        runtimeLabel: planItem.runtimeLabel,
      },
      status: 'conflict',
      conflictKind: 'unmapped-level-key',
      reasons: ['source levelsRaw key does not match a supported deterministic mapping rule'],
      targetKey: null,
    };
  }

  const targetKey = mapping.targetKey;
  const owners = localLevelOwners(local.tables, targetKey);
  if (owners.length > 1 || (owners.length === 1 && owners[0] !== 'levelsRaw')) {
    return {
      domain: 'levels',
      sourceKey: sourceItem.key,
      planned: {
        key: planItem.key,
        runtimeLabel: planItem.runtimeLabel,
      },
      targetKey,
      mappingRule: mapping.rule,
      status: 'conflict',
      conflictKind: 'ambiguous-local-primary',
      reasons: ['mapped local key belongs to an unexpected or ambiguous primary table'],
      localOwners: owners,
    };
  }

  const converted = {
    levelsRaw: cloneJson(sourceItem.levelsRaw),
    levelFilters: convertDeep(sourceItem.levelFilters, s2tw),
    levelBonus: convertDeep(sourceItem.levelBonus, s2tw),
    skills: convertDeep(sourceItem.skills, s2tw),
    hint: convertDeep(sourceItem.hint, s2tw),
    themeFilter: mappedThemeGroups(sourceItem.themeFilter, s2tw),
  };

  if (owners.length === 0) {
    return {
      domain: 'levels',
      sourceKey: sourceItem.key,
      planned: {
        key: planItem.key,
        runtimeLabel: planItem.runtimeLabel,
      },
      targetKey,
      mappingRule: mapping.rule,
      status: 'new',
      candidate: converted,
      differences: [],
    };
  }

  const differences = [];
  const conflicts = [];

  const localPrimary = local.tables.levelsRaw?.[targetKey];
  if (!sameValue(localPrimary, converted.levelsRaw)) {
    addLevelDifference(
      differences,
      'levelsRaw',
      targetKey,
      localPrimary,
      converted.levelsRaw,
      'modify',
    );
  }

  for (const [table, field] of LEVEL_METADATA) {
    const present = sourceItem.metadataPresence?.[table] === true;
    const before = local.tables[table]?.[targetKey];
    const after = converted[field];

    if (!present) {
      if (before !== undefined) {
        conflicts.push({
          kind: 'source-metadata-absent',
          table,
          key: targetKey,
          localValue: cloneJson(before),
          reason: 'local metadata exists but the collected source bundle has no corresponding metadata record',
        });
      }
      continue;
    }

    if (before === undefined) {
      addLevelDifference(differences, table, targetKey, undefined, after, 'add');
    } else if (!sameValue(before, after)) {
      addLevelDifference(differences, table, targetKey, before, after, 'modify');
    }
  }

  const theme = themePreview(converted.themeFilter, local.tables.themeFilter || {});
  differences.push(...theme.differences);
  conflicts.push(...theme.conflicts);

  if (conflicts.length) {
    return {
      domain: 'levels',
      sourceKey: sourceItem.key,
      planned: {
        key: planItem.key,
        runtimeLabel: planItem.runtimeLabel,
      },
      targetKey,
      mappingRule: mapping.rule,
      status: 'conflict',
      conflictKind: 'level-data-conflict',
      reasons: ['one or more mapped level surfaces require manual review'],
      conflicts,
      differences,
      candidate: converted,
    };
  }

  if (differences.length) {
    return {
      domain: 'levels',
      sourceKey: sourceItem.key,
      planned: {
        key: planItem.key,
        runtimeLabel: planItem.runtimeLabel,
      },
      targetKey,
      mappingRule: mapping.rule,
      status: 'modified',
      differences,
      candidate: converted,
    };
  }

  return {
    domain: 'levels',
    sourceKey: sourceItem.key,
    planned: {
      key: planItem.key,
      runtimeLabel: planItem.runtimeLabel,
    },
    targetKey,
    mappingRule: mapping.rule,
    status: 'unchanged',
    differences: [],
  };
}

function summarize(items) {
  const count = status => items.filter(item => item.status === status).length;
  return {
    total: items.length,
    new: count('new'),
    modified: count('modified'),
    conflict: count('conflict'),
    unchanged: count('unchanged'),
  };
}

function resolveTargetPath(defaultId, override) {
  return override ? resolve(override) : absoluteDataSourcePath(defaultId);
}

export async function buildUpdateDiffPreview(options = {}) {
  const completeness = checkUpdateCompleteness(options);
  const plan = listUpdatePlan(options);
  const wardrobeCollection = listUpdateWardrobe(options).items;
  const levelCollection = listUpdateLevels(options).items;

  const wardrobeTargetPath = resolveTargetPath('wardrobe', options.wardrobeTargetPath);
  const levelsTargetPath = resolveTargetPath('main-levels', options.levelsTargetPath);
  const wardrobeTargetText = readFileSync(wardrobeTargetPath, 'utf8');
  const levelsTargetText = readFileSync(levelsTargetPath, 'utf8');

  const localWardrobeRows = loadWardrobe(wardrobeTargetPath);
  if (!Array.isArray(localWardrobeRows)) throw new Error('wardrobe preview target did not expose wardrobe array');
  const localWardrobe = localWardrobeIndex(localWardrobeRows);
  const converters = await createConverters(localWardrobeRows);

  const localLevels = {
    tables: readNormalizedLevelTables(levelsTargetPath),
  };

  const collectedWardrobe = new Map(wardrobeCollection.map(item => [item.key, item]));
  const collectedLevels = new Map(levelCollection.map(item => [item.key, item]));

  const wardrobeItems = [];
  for (const planned of plan.wardrobe) {
    const source = collectedWardrobe.get(planned.key);
    if (!source) continue;
    wardrobeItems.push(previewWardrobeItem(source, planned, localWardrobe, converters));
  }

  const levelItems = [];
  for (const planned of plan.levels) {
    const source = collectedLevels.get(planned.key);
    if (!source) continue;
    levelItems.push(previewLevelItem(source, planned, localLevels, converters.s2tw));
  }

  const wardrobeSummary = summarize(wardrobeItems);
  const levelsSummary = summarize(levelItems);
  const totalSummary = {
    total: wardrobeSummary.total + levelsSummary.total,
    new: wardrobeSummary.new + levelsSummary.new,
    modified: wardrobeSummary.modified + levelsSummary.modified,
    conflict: wardrobeSummary.conflict + levelsSummary.conflict,
    unchanged: wardrobeSummary.unchanged + levelsSummary.unchanged,
  };

  const blockers = [];
  if (!completeness.planDefined) blockers.push({ kind: 'plan-not-defined' });
  for (const item of completeness.wardrobe.missingItems) {
    blockers.push({ kind: 'missing-planned-wardrobe', key: item.key, name: item.name });
  }
  for (const item of completeness.levels.missingItems) {
    blockers.push({ kind: 'missing-planned-level', key: item.key, runtimeLabel: item.runtimeLabel });
  }
  for (const item of [...wardrobeItems, ...levelItems].filter(item => item.status === 'conflict')) {
    blockers.push({
      kind: 'diff-conflict',
      domain: item.domain,
      sourceKey: item.sourceKey,
      targetKey: item.targetKey,
      conflictKind: item.conflictKind,
    });
  }

  return {
    sessionId: completeness.sessionId,
    sessionStatus: completeness.status,
    mode: 'read-only-preview',
    targets: {
      wardrobe: {
        id: 'wardrobe',
        path: wardrobeTargetPath,
        sha256: sha256Text(wardrobeTargetText),
      },
      levels: {
        id: 'main-levels',
        path: levelsTargetPath,
        sha256: sha256Text(levelsTargetText),
      },
    },
    completeness,
    summary: totalSummary,
    wardrobe: {
      summary: wardrobeSummary,
      items: wardrobeItems,
      ignoredUnplannedCollected: cloneJson(completeness.wardrobe.unplannedCollectedItems),
    },
    levels: {
      summary: levelsSummary,
      items: levelItems,
      ignoredUnplannedCollected: cloneJson(completeness.levels.unplannedCollectedItems),
    },
    blockers,
    readyForNextGate: completeness.complete && blockers.length === 0,
  };
}
