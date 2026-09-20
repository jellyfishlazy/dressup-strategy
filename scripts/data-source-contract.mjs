import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));

export const DATA_SOURCE_ROLES = Object.freeze({
  CANONICAL: 'canonical',
  GENERATED: 'generated',
  INDEPENDENT: 'independent',
  LEGACY_SNAPSHOT: 'legacy-snapshot',
});

export const DATA_SOURCES = Object.freeze({
  wardrobe: Object.freeze({
    id: 'wardrobe',
    path: 'data/wardrobe.js',
    role: DATA_SOURCE_ROLES.CANONICAL,
    format: 'wardrobe-18',
    writable: true,
    description: 'Current TW wardrobe source of truth for Main, BigUse, Wardrobe Check and CN Search alignment.',
    consumers: Object.freeze([
      'index.html',
      'biguse.html',
      'wardrobechk.html',
      'cn-search/index.html',
      'cn-search/scripts/build-cn-search-index.mjs',
      'cn-search/scripts/sync-wardrobe-tags-from-cn.mjs',
      'scripts/audit-tags.mjs',
      'scripts/verify-level-tags.mjs',
    ]),
  }),

  rootWardrobeSnapshot: Object.freeze({
    id: 'root-wardrobe-snapshot',
    path: 'wardrobe.js',
    role: DATA_SOURCE_ROLES.LEGACY_SNAPSHOT,
    format: 'wardrobe-18',
    writable: false,
    description: 'Older repository wardrobe snapshot. It is validated for integrity but is not an active runtime source.',
    replacedBy: 'wardrobe',
  }),

  legacyBigUseWardrobeSnapshot: Object.freeze({
    id: 'legacy-biguse-wardrobe-snapshot',
    path: 'data/biguse_wardrobe.js',
    role: DATA_SOURCE_ROLES.LEGACY_SNAPSHOT,
    format: 'wardrobe-18',
    writable: false,
    description: 'Legacy 18-column BigUse wardrobe snapshot with no active runtime consumer.',
  }),

  bigUseVisualMetadata: Object.freeze({
    id: 'biguse-visual-metadata',
    path: 'biguse_wardrobe.js',
    role: DATA_SOURCE_ROLES.INDEPENDENT,
    format: 'biguse-visual-metadata',
    writable: true,
    description: 'BigUse image size/color metadata (wardrobe2). Not an 18-column wardrobe and not derived from data/wardrobe.js.',
    consumers: Object.freeze(['biguse.html']),
  }),

  materialWardrobe: Object.freeze({
    id: 'material-wardrobe',
    path: 'data/material_wardrobe.js',
    role: DATA_SOURCE_ROLES.INDEPENDENT,
    format: 'wardrobe-18',
    writable: true,
    description: 'Material tool-specific wardrobe dataset. It is independent and must not be overwritten from the canonical wardrobe.',
    consumers: Object.freeze(['material.html']),
  }),

  cnSearchIndex: Object.freeze({
    id: 'cn-search-index',
    path: 'cn-search/data/cn_search_index.json',
    role: DATA_SOURCE_ROLES.GENERATED,
    format: 'cn-search-index-v3',
    writable: false,
    description: 'Generated CN Search index. Rebuild after either the external CN wardrobe source or canonical TW wardrobe changes.',
    builder: 'cn-search/scripts/build-cn-search-index.mjs',
    inputs: Object.freeze(['external-cn-wardrobe', 'wardrobe']),
    consumers: Object.freeze(['cn-search/cn-search.js']),
  }),

  mainLevels: Object.freeze({
    id: 'main-levels',
    path: 'data/levels.js',
    role: DATA_SOURCE_ROLES.CANONICAL,
    format: 'legacy-levels-js',
    writable: true,
    description: 'Main matcher level/theme/scoring source of truth.',
    consumers: Object.freeze(['index.html']),
  }),

  bigUseLevels: Object.freeze({
    id: 'biguse-levels',
    path: 'data/biguse_levels.js',
    role: DATA_SOURCE_ROLES.INDEPENDENT,
    format: 'legacy-levels-js',
    writable: true,
    description: 'BigUse-specific level dataset. It is not generated from data/levels.js.',
    consumers: Object.freeze(['biguse.html']),
  }),
});

export const EXTERNAL_SOURCES = Object.freeze({
  externalCnWardrobe: Object.freeze({
    id: 'external-cn-wardrobe',
    role: 'external-input',
    format: 'external-wardrobe-20',
    description: 'External wardrobe input resolved by CN_WARDROBE_JS / vendor / sibling clone lookup.',
  }),
  externalCnLevels: Object.freeze({
    id: 'external-cn-levels',
    role: 'external-input',
    format: 'legacy-levels-js',
    description: 'External level input resolved from the same data source root as wardrobe.js or CN_LEVELS_JS override.',
  }),
});

export function dataSourceById(id) {
  for (const source of Object.values(DATA_SOURCES)) {
    if (source.id === id) return source;
  }
  for (const source of Object.values(EXTERNAL_SOURCES)) {
    if (source.id === id) return source;
  }
  return null;
}

export function absoluteDataSourcePath(id) {
  const source = dataSourceById(id);
  if (!source || !('path' in source)) return null;
  return resolve(repoRoot, source.path);
}

export function canonicalWritableSources() {
  return Object.values(DATA_SOURCES).filter(source =>
    source.role === DATA_SOURCE_ROLES.CANONICAL && source.writable
  );
}

export function generatedSources() {
  return Object.values(DATA_SOURCES).filter(source =>
    source.role === DATA_SOURCE_ROLES.GENERATED
  );
}
