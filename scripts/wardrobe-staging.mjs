import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { WARDROBE_FIELD_COUNT, WARDROBE_FIELD_INDEX as FIELD } from '../src/domain/wardrobe/schema.mjs';
import { wardrobeRowErrors } from '../src/domain/wardrobe/adapter.mjs';
import { absoluteDataSourcePath, dataSourceById } from './data-source-contract.mjs';
import { loadWardrobe } from './validate-data.mjs';

export const STAGING_FORMAT_VERSION = 1;
export const STAGING_KIND = 'wardrobe-staging';

function sha256Text(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function identityKey(row) {
  return String(row[FIELD.type]) + '|' + String(row[FIELD.id]);
}

function sameRow(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function parseQuotedString(source, state) {
  const quote = source[state.index++];
  let out = '';
  while (state.index < source.length) {
    const ch = source[state.index++];
    if (ch === quote) return out;
    if (ch !== '\\') {
      out += ch;
      continue;
    }
    if (state.index >= source.length) throw new SyntaxError('unterminated escape sequence');
    const esc = source[state.index++];
    const simple = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', '0': '\0', '\\': '\\', "'": "'", '"': '"' };
    if (Object.prototype.hasOwnProperty.call(simple, esc)) {
      out += simple[esc];
      continue;
    }
    if (esc === 'u') {
      const hex = source.slice(state.index, state.index + 4);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new SyntaxError('invalid unicode escape');
      out += String.fromCharCode(parseInt(hex, 16));
      state.index += 4;
      continue;
    }
    if (esc === 'x') {
      const hex = source.slice(state.index, state.index + 2);
      if (!/^[0-9a-fA-F]{2}$/.test(hex)) throw new SyntaxError('invalid hex escape');
      out += String.fromCharCode(parseInt(hex, 16));
      state.index += 2;
      continue;
    }
    out += esc;
  }
  throw new SyntaxError('unterminated string literal');
}

function skipSpace(source, state) {
  while (/\s/.test(source[state.index] || '')) state.index++;
}

function parseLiteral(source, state) {
  skipSpace(source, state);
  const ch = source[state.index];
  if (ch === "'" || ch === '"') return parseQuotedString(source, state);

  const rest = source.slice(state.index);
  const number = rest.match(/^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/);
  if (number) {
    state.index += number[0].length;
    return Number(number[0]);
  }

  for (const [token, value] of [['null', null], ['true', true], ['false', false]]) {
    if (rest.startsWith(token)) {
      state.index += token.length;
      return value;
    }
  }

  throw new SyntaxError('unsupported literal near column ' + (state.index + 1));
}

export function parseWardrobeRowLiteral(text) {
  const source = String(text).trim().replace(/,\s*$/, '');
  const state = { index: 0 };
  skipSpace(source, state);
  if (source[state.index++] !== '[') throw new SyntaxError('row must start with [');

  const row = [];
  let closed = false;
  skipSpace(source, state);
  if (source[state.index] === ']') {
    state.index++;
    closed = true;
  } else {
    while (state.index < source.length) {
      row.push(parseLiteral(source, state));
      skipSpace(source, state);
      const ch = source[state.index++];
      if (ch === ']') { closed = true; break; }
      if (ch !== ',') throw new SyntaxError('expected comma or ] near column ' + state.index);
    }
  }
  if (!closed) throw new SyntaxError('unterminated row literal');
  skipSpace(source, state);
  if (state.index !== source.length) throw new SyntaxError('unexpected trailing content near column ' + (state.index + 1));
  return row;
}

function rowsFromJson(value) {
  if (Array.isArray(value) && value.every(row => Array.isArray(row))) return value;
  if (value && typeof value === 'object' && Array.isArray(value.rows)) return value.rows;
  throw new TypeError('JSON input must be an array of wardrobe rows or an object with a rows array');
}

export function parseWardrobeImportText(text) {
  const source = String(text).replace(/^\uFEFF/, '');
  const trimmed = source.trim();
  if (!trimmed) return { format: 'empty', rows: [], parseErrors: [] };

  try {
    const json = JSON.parse(trimmed);
    return { format: 'json', rows: rowsFromJson(json), parseErrors: [] };
  } catch {
    // CN Search exports JavaScript row literals, so fall through to the strict snippet parser.
  }

  const rows = [];
  const parseErrors = [];
  const lines = source.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('//')) continue;
    if (!line.startsWith('[')) {
      parseErrors.push({ line: i + 1, message: 'expected a wardrobe row literal' });
      continue;
    }
    try {
      rows.push(parseWardrobeRowLiteral(line));
    } catch (error) {
      parseErrors.push({ line: i + 1, message: error.message });
    }
  }
  return { format: 'cn-search-snippet', rows, parseErrors };
}

export function resolveWardrobeTarget(targetId = 'wardrobe') {
  const source = dataSourceById(targetId);
  if (!source || !('path' in source)) throw new Error('unknown staging target: ' + targetId);
  if (source.format !== 'wardrobe-18') throw new Error('staging target is not a wardrobe-18 source: ' + targetId);
  if (!source.writable) throw new Error('staging target is read-only by contract: ' + targetId);
  return source;
}

export function buildWardrobeStagingManifest({
  inputText,
  inputPath = null,
  targetId = 'wardrobe',
  targetPathOverride = null,
  createdAt = new Date(),
}) {
  const target = resolveWardrobeTarget(targetId);
  const targetPath = targetPathOverride ? resolve(targetPathOverride) : absoluteDataSourcePath(target.id);
  const targetText = readFileSync(targetPath, 'utf8');
  const targetRows = loadWardrobe(targetPath);
  if (!Array.isArray(targetRows)) throw new Error(target.path + ' did not expose a wardrobe array');

  const parsed = parseWardrobeImportText(inputText);
  const baselineByKey = new Map(targetRows.map(row => [identityKey(row), row]));
  const seen = new Map();
  const entries = [];
  const errors = parsed.parseErrors.map(error => ({ kind: 'parse', ...error }));

  parsed.rows.forEach((row, index) => {
    const rowErrors = wardrobeRowErrors(row);
    if (rowErrors.length) {
      errors.push(...rowErrors.map(message => ({ kind: 'row', index, message })));
      entries.push({ index, key: null, status: 'invalid', row });
      return;
    }

    const key = identityKey(row);
    if (seen.has(key)) {
      const firstIndex = seen.get(key);
      errors.push({ kind: 'duplicate', index, key, message: 'duplicate staged identity; first seen at index ' + firstIndex });
      entries.push({ index, key, status: 'duplicate', row });
      return;
    }
    seen.set(key, index);

    const existing = baselineByKey.get(key);
    let status = 'new';
    if (existing) status = sameRow(existing, row) ? 'unchanged' : 'conflict';

    entries.push({
      index,
      key,
      status,
      row,
      ...(existing ? { baselineRow: existing } : {}),
    });
  });

  const count = status => entries.filter(entry => entry.status === status).length;
  return {
    formatVersion: STAGING_FORMAT_VERSION,
    kind: STAGING_KIND,
    createdAt: createdAt.toISOString(),
    target: {
      id: target.id,
      path: target.path,
      role: target.role,
      sha256: sha256Text(targetText),
    },
    input: {
      path: inputPath,
      format: parsed.format,
      sha256: sha256Text(inputText),
    },
    summary: {
      totalRows: parsed.rows.length,
      acceptedRows: entries.filter(entry => !['invalid', 'duplicate'].includes(entry.status)).length,
      newRows: count('new'),
      unchangedRows: count('unchanged'),
      conflictRows: count('conflict'),
      invalidRows: count('invalid'),
      duplicateRows: count('duplicate'),
      parseErrors: parsed.parseErrors.length,
    },
    errors,
    entries,
  };
}

export function manifestHasBlockingErrors(manifest) {
  return manifest.errors.length > 0;
}

export function assertStagingManifest(manifest) {
  if (!manifest || manifest.formatVersion !== STAGING_FORMAT_VERSION || manifest.kind !== STAGING_KIND) {
    throw new TypeError('unsupported wardrobe staging manifest');
  }
  if (!manifest.target || !manifest.input || !manifest.summary || !Array.isArray(manifest.entries) || !Array.isArray(manifest.errors)) {
    throw new TypeError('malformed wardrobe staging manifest');
  }
  return manifest;
}

export { sha256Text, identityKey };
