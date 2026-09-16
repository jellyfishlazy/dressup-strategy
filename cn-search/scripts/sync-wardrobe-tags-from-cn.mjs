#!/usr/bin/env node
// Compare TW data/wardrobe.js tags to tags derived from the reference wardrobe,
// mapping each CN token → canonical TW via scripts/cn-tag-map.mjs (+ OpenCC + TW_TAG_NORMALIZE).
//
// Usage:
//   node scripts/sync-wardrobe-tags-from-cn.mjs           # writes data/sync-wardrobe-tags.report.json
//   node scripts/sync-wardrobe-tags-from-cn.mjs --apply   # same + rewrite data/wardrobe.js wardrobe array only
//
// Optional: data/wardrobe_tag_exceptions.json — { "skip": ["髮型|001", ...] }
import fs from 'node:fs';
import vm from 'node:vm';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CN2TW_CATEGORY,
  CN_TAG_OVERRIDE,
  TW_TAG_NORMALIZE,
  splitPreserveSeg,
} from './cn-tag-map.mjs';
import { importOpencc } from './shared-deps.mjs';
import { WARDROBE_FIELD_INDEX as FIELD } from '../../src/domain/wardrobe/schema.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GLOW = /^(簡約|華麗|可愛|成熟|活潑|優雅|清純|性感|清涼|保暖)\+\d+$/;

function findCnWardrobe() {
  const candidates = [
    process.env.CN_WARDROBE_JS,
    join(projectRoot, 'vendor', 'nikkiup2u3-cn', 'wardrobe.js'),
    resolve(projectRoot, '..', '..', 'nikkiup2u3_data-gh-pages', 'wardrobe.js'),
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  throw new Error(
    'CN wardrobe.js not found. Set CN_WARDROBE_JS or place nikkiup2u3_data-gh-pages next to this repo.'
  );
}

function loadCnWardrobe(path) {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path, 'utf8'), ctx, { filename: path, timeout: 120000 });
  if (!Array.isArray(ctx.wardrobe)) throw new Error('CN file has no wardrobe array: ' + path);
  return ctx.wardrobe;
}

function loadTwWardrobeAndTags(path) {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path, 'utf8'), ctx, { filename: path, timeout: 120000 });
  if (!Array.isArray(ctx.wardrobe)) throw new Error('TW file has no wardrobe array: ' + path);
  return { wardrobe: ctx.wardrobe, wardrobeTags: ctx.wardrobeTags || [] };
}

function mapCnToken(t, s2tw) {
  if (CN_TAG_OVERRIDE[t] !== undefined) return CN_TAG_OVERRIDE[t];
  let v = s2tw(t);
  if (TW_TAG_NORMALIZE[v] !== undefined) v = TW_TAG_NORMALIZE[v];
  return v;
}

function tokensFromCnField(raw, s2tw) {
  const tokens = [];
  for (const p of splitPreserveSeg(String(raw || ''))) {
    if (p === '/' || p === ',' || p === '，') continue;
    const t = String(p).trim();
    if (!t) continue;
    tokens.push(mapCnToken(t, s2tw));
  }
  return tokens;
}

function tokensFromTwField(raw) {
  const tokens = [];
  for (const p of splitPreserveSeg(String(raw || ''))) {
    if (p === '/' || p === ',' || p === '，') continue;
    const t = String(p).trim();
    if (!t) continue;
    tokens.push(t);
  }
  return tokens;
}

function sortKey(tokens) {
  return [...tokens]
    .sort((a, b) => a.localeCompare(b, 'zh-Hant', { numeric: true }))
    .join('\0');
}

function joinSlash(tokens) {
  return tokens.join('/');
}

function rowKey(r) {
  return (r[FIELD.type] || '') + '|' + String(r[FIELD.id] || '');
}

function escapeJsString(s) {
  return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
}

function rowToLine(row) {
  return '  [' + row.map((c) => escapeJsString(c == null ? '' : c)).join(',') + ']';
}

async function makeS2tw() {
  try {
    const mod = await importOpencc();
    const Conv = mod.Converter ?? mod.default?.Converter;
    if (typeof Conv !== 'function') throw new Error('opencc Converter missing');
    return Conv({ from: 'cn', to: 'tw' });
  } catch (e) {
    console.warn(
      '[sync-tags] opencc-js unavailable (' +
        (e && e.message ? e.message : e) +
        '); run npm ci in the repository root. Unmapped simplified tokens may stay wrong.'
    );
    return (s) => String(s);
  }
}

function replaceWardrobeArray(twPath, newRows) {
  const raw = fs.readFileSync(twPath, 'utf8');
  const startMark = 'var wardrobe = [';
  const start = raw.indexOf(startMark);
  if (start < 0) throw new Error('var wardrobe = [ not found');
  const endBlock = raw.indexOf('\nvar lastVersion', start + startMark.length);
  if (endBlock < 0) throw new Error('\\nvar lastVersion not found after wardrobe array');
  const closeIdx = raw.lastIndexOf('];', endBlock);
  if (closeIdx < 0 || closeIdx > endBlock) throw new Error('could not locate closing ];');

  const head = raw.slice(0, start + startMark.length);
  const tail = raw.slice(closeIdx);
  const body = newRows.map(rowToLine).join(',\n');
  let out = head + '\n' + body + '\n\n' + tail;

  const d = new Date();
  const lastUpd = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  out = out.replace(/var wardrobe_lastupd = '[^']*'/, `var wardrobe_lastupd = '${lastUpd}'`);
  fs.writeFileSync(twPath, out, 'utf8');
}

const apply = process.argv.includes('--apply');
const cnPath = findCnWardrobe();
const twPath = join(projectRoot, '..', 'data', 'wardrobe.js');
const reportPath = join(projectRoot, '..', 'data', 'sync-wardrobe-tags.report.json');
const exceptPath = join(projectRoot, '..', 'data', 'wardrobe_tag_exceptions.json');

const s2tw = await makeS2tw();
const cnWardrobe = loadCnWardrobe(cnPath);
const { wardrobe: twWardrobe, wardrobeTags } = loadTwWardrobeAndTags(twPath);

const allowlist = new Set(wardrobeTags.map(String));
for (const v of Object.values(CN_TAG_OVERRIDE)) {
  if (v) allowlist.add(v);
}
for (const r of twWardrobe) {
  const typ = r[FIELD.type] || '';
  if (typ === '螢光之靈') continue;
  for (const t of tokensFromTwField(r[FIELD.tags])) {
    if (!GLOW.test(t)) allowlist.add(t);
  }
}

const exceptions = new Set();
if (fs.existsSync(exceptPath)) {
  try {
    const j = JSON.parse(fs.readFileSync(exceptPath, 'utf8'));
    for (const k of j.skip || j.exceptions || []) exceptions.add(String(k));
  } catch (e) {
    console.warn('[sync-tags] could not parse ' + exceptPath + ': ' + (e.message || e));
  }
}

const cnByKey = new Map();
for (const r of cnWardrobe) {
  const catCn = r[FIELD.type] || '';
  const typeTw = CN2TW_CATEGORY[catCn] || catCn;
  const key = typeTw + '|' + String(r[FIELD.id] || '');
  cnByKey.set(key, r);
}

const report = {
  generatedAt: new Date().toISOString(),
  cnPath,
  twPath,
  apply,
  skipped: { glow: 0, exception: 0, noCnRef: 0, emptyCnTags: 0 },
  needsReview: [],
  changes: [],
  unchanged: 0,
};

for (let i = 0; i < twWardrobe.length; i++) {
  const r = twWardrobe[i];
  const type = r[FIELD.type] || '';
  if (type === '螢光之靈') {
    report.skipped.glow++;
    continue;
  }
  const key = rowKey(r);
  if (exceptions.has(key)) {
    report.skipped.exception++;
    continue;
  }
  const cnRow = cnByKey.get(key);
  if (!cnRow) {
    report.skipped.noCnRef++;
    continue;
  }
  const tagsCn = cnRow[FIELD.tags] || '';
  if (!String(tagsCn).trim()) {
    report.skipped.emptyCnTags++;
    continue;
  }

  const expected = tokensFromCnField(tagsCn, s2tw);
  const unknown = expected.filter((t) => !allowlist.has(t));
  if (unknown.length) {
    report.needsReview.push({
      key,
      name: r[FIELD.name],
      tagsCn: String(tagsCn),
      expected,
      unknownTokens: [...new Set(unknown)],
      current: String(r[FIELD.tags] || ''),
    });
    continue;
  }

  const cur = tokensFromTwField(r[FIELD.tags]);
  if (sortKey(cur) === sortKey(expected)) {
    report.unchanged++;
    continue;
  }

  const to = joinSlash(expected);
  report.changes.push({
    key,
    name: r[FIELD.name],
    from: String(r[FIELD.tags] || ''),
    to,
  });
  if (apply) r[FIELD.tags] = to;
}

fs.mkdirSync(dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
console.log('[sync-tags] report -> ' + reportPath);
console.log(
  '[sync-tags] changes=' +
    report.changes.length +
    ' needsReview=' +
    report.needsReview.length +
    ' unchanged=' +
    report.unchanged +
    ' skipped=' +
    JSON.stringify(report.skipped)
);

if (apply && report.changes.length) {
  replaceWardrobeArray(twPath, twWardrobe);
  console.log('[sync-tags] applied ' + report.changes.length + ' updates to data/wardrobe.js');
}
