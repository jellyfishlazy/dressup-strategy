#!/usr/bin/env node
// Decode the simplified-Chinese (mainland) wardrobe.js by running it in a
// Node `vm` sandbox, then emit a slim JSON index used by cn-search.html.
//
// Lookup order for the source file:
//   1. $CN_WARDROBE_JS (absolute path override)
//   2. <repo>/vendor/nikkiup2u3-cn/wardrobe.js (vendored copy or submodule)
//   3. <repo>/../nikkiup2u3_data-gh-pages/wardrobe.js (sibling clone of repo root)
//
// Also loads TW ../data/wardrobe.js (repo root) to precompute `tagsTw` per row (build-time).
// Output: <cn-search>/data/cn_search_index.json (schema 3: includes tagsTw)

import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
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

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..');

function findCnWardrobe() {
  const candidates = [
    process.env.CN_WARDROBE_JS,
    join(projectRoot, 'vendor', 'nikkiup2u3-cn', 'wardrobe.js'),
    resolve(projectRoot, '..', '..', 'nikkiup2u3_data-gh-pages', 'wardrobe.js'),
  ].filter(Boolean);

  for (const p of candidates) {
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  const tried = candidates.map((c) => '  - ' + c).join('\n');
  throw new Error(
    'Cannot locate CN wardrobe.js. Looked at:\n' +
      tried +
      '\n\nSet the CN_WARDROBE_JS environment variable to override.'
  );
}

function loadWardrobeArray(filePath) {
  const src = readFileSync(filePath, 'utf8');
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: filePath, timeout: 60_000 });
  if (!Array.isArray(ctx.wardrobe)) {
    throw new Error('wardrobe.js did not expose a top-level `wardrobe` array: ' + filePath);
  }
  return { wardrobe: ctx.wardrobe, wardrobe_lastupd: ctx.wardrobe_lastupd || null };
}

function buildTwTagByKey(twRows) {
  const map = Object.create(null);
  for (let i = 0; i < twRows.length; i++) {
    const r = twRows[i];
    if (!r || r.length < 15) continue;
    const typeTw = r[1];
    const id = String(r[2]);
    map[typeTw + '|' + id] = r[14] == null ? '' : String(r[14]);
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
    const p = parts[i];
    if (p === '/' || p === ',' || p === '，') {
      out.push(p);
      continue;
    }
    const t = typeof p === 'string' ? p.trim() : '';
    if (!t) {
      out.push(p);
      continue;
    }
    const o = CN_TAG_OVERRIDE[t];
    if (o !== undefined) {
      out.push(o);
      continue;
    }
    let converted = s2tw(t);
    if (TW_TAG_NORMALIZE[converted] !== undefined) converted = TW_TAG_NORMALIZE[converted];
    if (converted !== t) fallbackTokens[t] = (fallbackTokens[t] || 0) + 1;
    out.push(converted);
  }
  return { tags: out.join(''), fallbackTokens };
}

async function makeS2tw() {
  try {
    const mod = await importOpencc();
    const Conv = mod.Converter ?? mod.default?.Converter;
    if (typeof Conv !== 'function') throw new Error('opencc-js Converter not found');
    return Conv({ from: 'cn', to: 'tw' });
  } catch (e) {
    console.warn(
      '[cn-index] opencc-js not available (' +
        (e && e.message ? e.message : e) +
        '). Run `npm ci` in the repository root. Unmapped CN-only tag tokens will stay as-is.'
    );
    return (s) => String(s);
  }
}

const cnPath = findCnWardrobe();
const twPath = join(projectRoot, '..', 'data', 'wardrobe.js');

const s2tw = await makeS2tw();

console.log('[cn-index] reading CN: ' + cnPath);
const cnCtx = loadWardrobeArray(cnPath);
const cnWardrobe = cnCtx.wardrobe;

if (!existsSync(twPath)) {
  throw new Error('TW wardrobe not found at ' + twPath);
}
console.log('[cn-index] reading TW: ' + twPath);
const twCtx = loadWardrobeArray(twPath);
const twTagByKey = buildTwTagByKey(twCtx.wardrobe);

const aggFallback = Object.create(null);
let cnOnlyCount = 0;
let twMatchedCount = 0;

// Column layout (matches model.js Clothes for both CN and TW data):
const rows = cnWardrobe.map((r) => {
  const id = String(r[2]);
  const categoryCn = r[1] || '';
  const typeTw = CN2TW_CATEGORY[categoryCn] || categoryCn;
  const key = typeTw + '|' + id;
  const tagsCn = r[14] || '';

  let tagsTw;
  if (Object.prototype.hasOwnProperty.call(twTagByKey, key)) {
    tagsTw = twTagByKey[key];
    twMatchedCount++;
  } else {
    cnOnlyCount++;
    const { tags, fallbackTokens } = mapCnOnlyTagsToTw(tagsCn, s2tw);
    tagsTw = tags;
    for (const tok of Object.keys(fallbackTokens)) {
      aggFallback[tok] = (aggFallback[tok] || 0) + fallbackTokens[tok];
    }
  }

  return {
    id,
    categoryCn,
    nameCn: r[0] || '',
    tagsCn,
    sourceCn: r[15] || '',
    suitCn: r[16] || '',
    version: r[17] || '',
    fullRow: Array.from(r),
    tagsTw,
  };
});

const fbKeys = Object.keys(aggFallback).sort();
if (fbKeys.length) {
  console.log(
    '[cn-index] CN-only tag tokens that used OpenCC fallback (count): ' +
      fbKeys.slice(0, 30).map((k) => k + '=' + aggFallback[k]).join(', ') +
      (fbKeys.length > 30 ? ' … +' + (fbKeys.length - 30) + ' more' : '')
  );
}
console.log('[cn-index] tagsTw: matched TW row ' + twMatchedCount + ', CN-only mapped ' + cnOnlyCount);

const out = {
  schema: 3,
  generatedAt: new Date().toISOString(),
  sourcePath: cnPath,
  twWardrobePath: twPath,
  lastUpdated: cnCtx.wardrobe_lastupd || null,
  count: rows.length,
  rows,
};

const outDir = join(projectRoot, 'data');
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'cn_search_index.json');
writeFileSync(outPath, JSON.stringify(out), 'utf8');
console.log('[cn-index] wrote ' + rows.length + ' rows to ' + outPath);
console.log('[cn-index] schema=' + out.schema + ' (includes fullRow + tagsTw); file size will grow accordingly.');
