import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadWardrobeArray } from '../cn-search/scripts/build-cn-search-index.mjs';
import {
  LEVEL_METADATA_TABLES,
  PRIMARY_LEVEL_TABLES,
  levelEntryErrors,
  objectEntrySpans,
  readNormalizedLevelTables,
  themeFilterElementSpans,
} from './level-pipeline.mjs';
import { resolveExternalDataSource } from './external-data-source.mjs';

export const EXTERNAL_WARDROBE_CORE_COLUMNS = 18;

const RUNTIME_PREFIX = Object.freeze({
  extraRaw: '活动地图: ',
  competitionsRaw: '竞技场: ',
  tasksRaw: '',
  levelsRaw: '关卡: ',
  dreamWeavingRaw: '织梦人: ',
});

function sha256Text(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function wardrobeIdentity(row) {
  return String(row?.[1] ?? '') + '|' + String(row?.[2] ?? '');
}

function runtimeLabel(table, key) {
  return (RUNTIME_PREFIX[table] ?? '') + key;
}

function matchingThemeGroups(label, themeFilter) {
  const groups = [];
  for (const [name, prefix] of Object.entries(themeFilter || {})) {
    if (!prefix || prefix === 'null') continue;
    if (label.startsWith(prefix)) groups.push({ name, prefix });
  }
  return groups;
}

export function readExternalWardrobe(path) {
  const absolutePath = resolve(path);
  const loaded = loadWardrobeArray(absolutePath);
  const seen = new Set();
  const warnings = [];
  const items = [];

  for (let index = 0; index < loaded.wardrobe.length; index++) {
    const row = Array.from(loaded.wardrobe[index] || []);
    const key = wardrobeIdentity(row);

    if (row.length < EXTERNAL_WARDROBE_CORE_COLUMNS) {
      warnings.push({
        kind: 'wardrobe-short-row',
        index,
        length: row.length,
        message: 'wardrobe row has fewer than 18 core columns',
      });
    }
    if (!row[1] || row[2] === undefined || row[2] === null || String(row[2]) === '') {
      warnings.push({
        kind: 'wardrobe-missing-identity',
        index,
        message: 'wardrobe row is missing category or id',
      });
    }
    if (seen.has(key)) {
      warnings.push({
        kind: 'wardrobe-duplicate-identity',
        index,
        key,
        message: 'duplicate external wardrobe identity',
      });
    }
    seen.add(key);

    items.push({
      index,
      key,
      name: String(row[0] ?? ''),
      category: String(row[1] ?? ''),
      id: String(row[2] ?? ''),
      coreRow: row.slice(0, EXTERNAL_WARDROBE_CORE_COLUMNS),
      extraColumns: row.slice(EXTERNAL_WARDROBE_CORE_COLUMNS),
      row,
    });
  }

  return {
    path: absolutePath,
    sha256: loaded.sha256,
    lastUpdated: loaded.wardrobe_lastupd || null,
    count: items.length,
    columnLengths: Object.fromEntries(
      [...new Set(items.map(item => item.row.length))]
        .sort((a, b) => a - b)
        .map(length => [String(length), items.filter(item => item.row.length === length).length]),
    ),
    warnings,
    items,
  };
}

function duplicateWarnings(source) {
  const warnings = [];
  const themeDuplicates = themeFilterElementSpans(source).duplicateKeys;
  for (const key of themeDuplicates) {
    warnings.push({
      kind: 'level-duplicate-key',
      table: 'themeFilter',
      key,
      message: 'duplicate themeFilter key in external source',
    });
  }

  for (const table of [...PRIMARY_LEVEL_TABLES, ...LEVEL_METADATA_TABLES]) {
    const duplicates = objectEntrySpans(source, table).duplicateKeys;
    for (const key of duplicates) {
      warnings.push({
        kind: 'level-duplicate-key',
        table,
        key,
        message: 'duplicate level property key in external source',
      });
    }
  }
  return warnings;
}

export function readExternalLevels(path) {
  const absolutePath = resolve(path);
  const source = readFileSync(absolutePath, 'utf8');
  const tables = readNormalizedLevelTables(absolutePath);
  const warnings = duplicateWarnings(source);
  const bundles = [];
  const seenPrimary = new Map();

  for (const table of PRIMARY_LEVEL_TABLES) {
    for (const [key, weights] of Object.entries(tables[table] || {})) {
      const shapeErrors = levelEntryErrors({ table, key, value: weights });
      for (const message of shapeErrors) {
        warnings.push({
          kind: 'level-invalid-primary',
          table,
          key,
          message,
        });
      }

      if (seenPrimary.has(key)) {
        warnings.push({
          kind: 'level-primary-collision',
          table,
          key,
          otherTable: seenPrimary.get(key),
          message: 'same external level key appears in more than one primary table',
        });
      } else {
        seenPrimary.set(key, table);
      }

      const label = runtimeLabel(table, key);
      const metadata = {};
      for (const metadataTable of LEVEL_METADATA_TABLES) {
        const value = tables[metadataTable]?.[key];
        metadata[metadataTable] = value === undefined ? null : cloneJson(value);
        if (value !== undefined) {
          for (const message of levelEntryErrors({ table: metadataTable, key, value })) {
            warnings.push({
              kind: 'level-invalid-metadata',
              table: metadataTable,
              key,
              message,
            });
          }
        }
      }

      bundles.push({
        key,
        primaryTable: table,
        runtimeLabel: label,
        weights: cloneJson(weights),
        filter: metadata.levelFilters,
        bonus: metadata.levelBonus,
        skills: metadata.addSkillsInfo,
        hint: metadata.addHintInfo,
        metadataPresence: {
          levelFilters: metadata.levelFilters !== null,
          levelBonus: metadata.levelBonus !== null,
          addSkillsInfo: metadata.addSkillsInfo !== null,
          addHintInfo: metadata.addHintInfo !== null,
        },
        themeGroups: matchingThemeGroups(label, tables.themeFilter),
      });
    }
  }

  const orphanMetadata = [];
  for (const metadataTable of LEVEL_METADATA_TABLES) {
    for (const key of Object.keys(tables[metadataTable] || {})) {
      if (!seenPrimary.has(key)) {
        orphanMetadata.push({ table: metadataTable, key });
      }
    }
  }

  return {
    path: absolutePath,
    sha256: sha256Text(source),
    counts: {
      themeFilter: Object.keys(tables.themeFilter || {}).length,
      ...Object.fromEntries(
        PRIMARY_LEVEL_TABLES.map(table => [table, Object.keys(tables[table] || {}).length]),
      ),
      ...Object.fromEntries(
        LEVEL_METADATA_TABLES.map(table => [table, Object.keys(tables[table] || {}).length]),
      ),
      bundles: bundles.length,
      orphanMetadata: orphanMetadata.length,
    },
    warnings,
    orphanMetadata,
    themeFilter: cloneJson(tables.themeFilter || {}),
    bundles,
  };
}

export function readExternalSourceSnapshot(options = {}) {
  const resolved = resolveExternalDataSource(options);
  const wardrobe = readExternalWardrobe(resolved.wardrobePath);
  const levels = readExternalLevels(resolved.levelsPath);

  return {
    sourceRoot: resolved.sourceRoot,
    sameRoot: resolved.sameRoot,
    files: {
      wardrobe: resolved.wardrobePath,
      levels: resolved.levelsPath,
    },
    hashes: {
      wardrobe: wardrobe.sha256,
      levels: levels.sha256,
    },
    wardrobe,
    levels,
    warnings: [
      ...wardrobe.warnings,
      ...levels.warnings,
    ],
  };
}
