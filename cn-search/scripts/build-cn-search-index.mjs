#!/usr/bin/env node
// Build the CN Search JSON index from the external wardrobe input and the
// canonical TW data/wardrobe.js. The normal CLI still writes the established
// cn-search/data/cn_search_index.json path, while Gate 11D can redirect output
// to a validated temporary file before atomic replacement.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import {
  CN2TW_CATEGORY,
  CN_TAG_OVERRIDE,
  TW_TAG_NORMALIZE,
  splitPreserveSeg,
} from './cn-tag-map.mjs';
import { importOpencc } from './shared-deps.mjs';
import {
  CN_SEARCH_ROOT,
  REPO_ROOT,
  findCnWardrobe,
} from './cn-wardrobe-source.mjs';
import { WARDROBE_FIELD_INDEX as FIELD } from '../../src/domain/wardrobe/schema.mjs';

export const CN_INDEX_SCHEMA = 3;

export function loadWardrobeArray(filePath) {
  const src = readFileSync(filePath, 'utf8');
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: filePath, timeout: 60_000 });
  if (!Array.isArray(ctx.wardrobe)) {
    throw new Error('wardrobe.js did not expose a top-level `wardrobe` array: ' + filePath);
  }
  return {
    wardrobe: ctx.wardrobe,
    wardrobe_lastupd: ctx.wardrobe_lastupd || null,
    sha256: createHash('sha256').update(src, 'utf8').digest('hex'),
  };
}

function buildTwTagByKey(twRows) {
  const map = Object.create(null);
  for (let i = 0; i < twRows.length; i++) {
    const row = twRows[i];
    if (!row || row.length <= FIELD.tags) continue;
    const typeTw = row[FIELD.type];
    const id = String(row[FIELD.id]);
    map[typeTw + '|' + id] = row[FIELD.tags] == null ? '' : String(row[FIELD.tags]);
  }
  return map;
}

function mapCnOnlyTagsToTw(tagsCn, s2tw) {
  const raw = String(tagsCn || '');
  if (!raw.trim()) return { tags: '', fallbackTokens: Object.create(null) };
  const parts = splitPreserveSeg(raw);
  const fallbackTokens = Object.create(null);
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part === '/' || part === ',' || part === '，') {
      out.push(part);
      continue;
    }
    const token = typeof part === 'string' ? part.trim() : '';
    if (!token) {
      out.push(part);
      continue;
    }
    const override = CN_TAG_OVERRIDE[token];
    if (override !== undefined) {
      out.push(override);
      continue;
    }
    let converted = s2tw(token);
    if (TW_TAG_NORMALIZE[converted] !== undefined) converted = TW_TAG_NORMALIZE[converted];
    if (converted !== token) fallbackTokens[token] = (fallbackTokens[token] || 0) + 1;
    out.push(converted);
  }
  return { tags: out.join(''), fallbackTokens };
}

async function makeS2tw() {
  try {
    const mod = await importOpencc();
    const Converter = mod.Converter ?? mod.default?.Converter;
    if (typeof Converter !== 'function') throw new Error('opencc-js Converter not found');
    return Converter({ from: 'cn', to: 'tw' });
  } catch (error) {
    console.warn(
      '[cn-index] opencc-js not available (' +
        (error && error.message ? error.message : error) +
        '). Run `npm ci` in the repository root. Unmapped CN-only tag tokens will stay as-is.',
    );
    return value => String(value);
  }
}

export function validateCnSearchIndex(data, { requireInputHashes = true } = {}) {
  const errors = [];
  if (!data || typeof data !== 'object') return ['index must be an object'];
  if (data.schema !== CN_INDEX_SCHEMA) errors.push('expected schema ' + CN_INDEX_SCHEMA);
  if (!Array.isArray(data.rows)) errors.push('rows must be an array');
  if (!Number.isInteger(data.count) || data.count < 0) errors.push('count must be a non-negative integer');
  if (Array.isArray(data.rows) && data.count !== data.rows.length) {
    errors.push('count does not match rows.length');
  }
  if (requireInputHashes) {
    for (const inputId of ['external-cn-wardrobe', 'wardrobe']) {
      const hash = data.inputHashes?.[inputId];
      if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash)) {
        errors.push('missing or invalid input hash for ' + inputId);
      }
    }
  }
  if (Array.isArray(data.rows)) {
    for (let index = 0; index < data.rows.length; index++) {
      const row = data.rows[index];
      if (!row || typeof row !== 'object') {
        errors.push('row ' + index + ' must be an object');
        break;
      }
      if (typeof row.id !== 'string' || typeof row.categoryCn !== 'string' || !Array.isArray(row.fullRow)) {
        errors.push('row ' + index + ' has invalid identity/fullRow fields');
        break;
      }
    }
  }
  return errors;
}

export async function buildCnSearchIndex({
  cnPath = findCnWardrobe(),
  twPath = join(REPO_ROOT, 'data', 'wardrobe.js'),
  outPath = join(CN_SEARCH_ROOT, 'data', 'cn_search_index.json'),
  generatedAt = new Date(),
} = {}) {
  if (!existsSync(cnPath)) throw new Error('external CN wardrobe not found at ' + cnPath);
  if (!existsSync(twPath)) throw new Error('TW wardrobe not found at ' + twPath);

  const s2tw = await makeS2tw();

  console.log('[cn-index] reading CN: ' + cnPath);
  const cnCtx = loadWardrobeArray(cnPath);
  const cnWardrobe = cnCtx.wardrobe;

  console.log('[cn-index] reading TW: ' + twPath);
  const twCtx = loadWardrobeArray(twPath);
  const twTagByKey = buildTwTagByKey(twCtx.wardrobe);

  const aggFallback = Object.create(null);
  let cnOnlyCount = 0;
  let twMatchedCount = 0;

  const rows = cnWardrobe.map(row => {
    const id = String(row[FIELD.id]);
    const categoryCn = row[FIELD.type] || '';
    const typeTw = CN2TW_CATEGORY[categoryCn] || categoryCn;
    const key = typeTw + '|' + id;
    const tagsCn = row[FIELD.tags] || '';

    let tagsTw;
    if (Object.prototype.hasOwnProperty.call(twTagByKey, key)) {
      tagsTw = twTagByKey[key];
      twMatchedCount++;
    } else {
      cnOnlyCount++;
      const mapped = mapCnOnlyTagsToTw(tagsCn, s2tw);
      tagsTw = mapped.tags;
      for (const token of Object.keys(mapped.fallbackTokens)) {
        aggFallback[token] = (aggFallback[token] || 0) + mapped.fallbackTokens[token];
      }
    }

    return {
      id,
      categoryCn,
      nameCn: row[FIELD.name] || '',
      tagsCn,
      sourceCn: row[FIELD.source] || '',
      suitCn: row[FIELD.suit] || '',
      version: row[FIELD.version] || '',
      fullRow: Array.from(row),
      tagsTw,
    };
  });

  const fallbackKeys = Object.keys(aggFallback).sort();
  if (fallbackKeys.length) {
    console.log(
      '[cn-index] CN-only tag tokens that used OpenCC fallback (count): ' +
        fallbackKeys.slice(0, 30).map(key => key + '=' + aggFallback[key]).join(', ') +
        (fallbackKeys.length > 30 ? ' … +' + (fallbackKeys.length - 30) + ' more' : ''),
    );
  }
  console.log('[cn-index] tagsTw: matched TW row ' + twMatchedCount + ', CN-only mapped ' + cnOnlyCount);

  const out = {
    schema: CN_INDEX_SCHEMA,
    generatedAt: generatedAt.toISOString(),
    sourcePath: resolve(cnPath),
    twWardrobePath: resolve(twPath),
    inputHashes: {
      'external-cn-wardrobe': cnCtx.sha256,
      wardrobe: twCtx.sha256,
    },
    inputLastUpdated: {
      'external-cn-wardrobe': cnCtx.wardrobe_lastupd || null,
      wardrobe: twCtx.wardrobe_lastupd || null,
    },
    lastUpdated: cnCtx.wardrobe_lastupd || null,
    count: rows.length,
    rows,
  };

  const validationErrors = validateCnSearchIndex(out);
  if (validationErrors.length) {
    throw new Error('generated CN index failed validation: ' + validationErrors.join('; '));
  }

  const outDir = dirname(outPath);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  writeFileSync(outPath, JSON.stringify(out), 'utf8');
  console.log('[cn-index] wrote ' + rows.length + ' rows to ' + outPath);
  console.log('[cn-index] schema=' + out.schema + ' (includes fullRow + tagsTw + input hashes).');

  return { data: out, cnPath: resolve(cnPath), twPath: resolve(twPath), outPath: resolve(outPath) };
}

function parseArgs(argv) {
  const options = {};
  for (const arg of argv) {
    if (arg.startsWith('--output=')) options.outPath = resolve(arg.slice('--output='.length));
    else if (arg.startsWith('--cn-source=')) options.cnPath = resolve(arg.slice('--cn-source='.length));
    else if (arg.startsWith('--tw-source=')) options.twPath = resolve(arg.slice('--tw-source='.length));
    else if (arg.startsWith('--generated-at=')) options.generatedAt = new Date(arg.slice('--generated-at='.length));
    else throw new Error('unknown option: ' + arg);
  }
  if (options.generatedAt && Number.isNaN(options.generatedAt.getTime())) {
    throw new Error('invalid --generated-at value');
  }
  return options;
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    await buildCnSearchIndex(parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error('[cn-index] ERROR: ' + error.message);
    process.exitCode = 1;
  }
}
