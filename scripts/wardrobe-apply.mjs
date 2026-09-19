import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  WARDROBE_FIELDS,
  WARDROBE_FIELD_INDEX as FIELD,
} from '../src/domain/wardrobe/schema.mjs';
import { wardrobeRowErrors } from '../src/domain/wardrobe/adapter.mjs';
import { rowToWardrobeLine } from '../cn-search/src/staging.mjs';
import {
  assertStagingManifest,
  identityKey,
  manifestHasBlockingErrors,
  parseWardrobeImportText,
  resolveWardrobeTarget,
  sha256Text,
} from './wardrobe-staging.mjs';
import { absoluteDataSourcePath } from './data-source-contract.mjs';
import { loadWardrobe, validateRows } from './validate-data.mjs';

const DUPLICATE_BASELINE_PATH = new URL('./known-wardrobe-duplicates.json', import.meta.url);
const REPO_ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const ALLOWED_ENTRY_STATUS = new Set(['new', 'unchanged', 'conflict', 'invalid', 'duplicate']);

function sameRow(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function rowLabel(row) {
  return {
    key: identityKey(row),
    name: String(row[FIELD.name] ?? ''),
    type: String(row[FIELD.type] ?? ''),
    id: String(row[FIELD.id] ?? ''),
  };
}

export function readWardrobeStagingManifest(path) {
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  return assertStagingManifest(manifest);
}

export function validateManifestIntegrity(manifest) {
  const errors = [];
  try {
    assertStagingManifest(manifest);
  } catch (error) {
    return [error.message];
  }

  let target;
  try {
    target = resolveWardrobeTarget(manifest.target.id);
  } catch (error) {
    errors.push(error.message);
    return errors;
  }

  if (manifest.target.path !== target.path) {
    errors.push('manifest target path does not match data source contract');
  }

  const seen = new Set();
  manifest.entries.forEach((entry, index) => {
    if (!entry || !ALLOWED_ENTRY_STATUS.has(entry.status)) {
      errors.push('entry ' + index + ': unsupported status');
      return;
    }
    if (!Array.isArray(entry.row)) {
      errors.push('entry ' + index + ': missing row');
      return;
    }

    const rowErrors = wardrobeRowErrors(entry.row);
    if (rowErrors.length && entry.status !== 'invalid') {
      errors.push('entry ' + index + ': row is invalid but status is ' + entry.status);
    }
    if (!rowErrors.length) {
      const key = identityKey(entry.row);
      if (entry.key !== key) errors.push('entry ' + index + ': key does not match row identity');
      if (seen.has(key) && entry.status !== 'duplicate') {
        errors.push('entry ' + index + ': repeated identity without duplicate status');
      }
      seen.add(key);
    }

    if (entry.status === 'unchanged' || entry.status === 'conflict') {
      if (!Array.isArray(entry.baselineRow)) {
        errors.push('entry ' + index + ': ' + entry.status + ' requires baselineRow');
      } else {
        const baselineErrors = wardrobeRowErrors(entry.baselineRow);
        if (baselineErrors.length) errors.push('entry ' + index + ': invalid baselineRow');
        else if (identityKey(entry.baselineRow) !== entry.key) {
          errors.push('entry ' + index + ': baselineRow identity does not match key');
        } else if (entry.status === 'unchanged' && !sameRow(entry.baselineRow, entry.row)) {
          errors.push('entry ' + index + ': unchanged row differs from baselineRow');
        } else if (entry.status === 'conflict' && sameRow(entry.baselineRow, entry.row)) {
          errors.push('entry ' + index + ': conflict row is identical to baselineRow');
        }
      }
    }
  });

  const count = status => manifest.entries.filter(entry => entry?.status === status).length;
  const expectedSummary = {
    totalRows: manifest.entries.length,
    acceptedRows: manifest.entries.filter(entry => entry && !['invalid', 'duplicate'].includes(entry.status)).length,
    newRows: count('new'),
    unchangedRows: count('unchanged'),
    conflictRows: count('conflict'),
    invalidRows: count('invalid'),
    duplicateRows: count('duplicate'),
    parseErrors: manifest.errors.filter(error => error?.kind === 'parse').length,
  };
  for (const [key, value] of Object.entries(expectedSummary)) {
    if (manifest.summary[key] !== value) errors.push('manifest summary mismatch for ' + key);
  }

  return errors;
}

function resolveManifestInputPath(inputPath) {
  if (!inputPath || typeof inputPath !== 'string') return null;
  if (isAbsolute(inputPath)) return inputPath;
  return resolve(REPO_ROOT, ...inputPath.split(/[\\/]+/).filter(Boolean));
}

function verifyManifestInputSource(manifest) {
  const errors = [];
  const inputPath = resolveManifestInputPath(manifest.input?.path);
  if (!inputPath) {
    errors.push('manifest input path is missing');
    return errors;
  }
  if (!existsSync(inputPath)) {
    errors.push('manifest input file is missing: ' + manifest.input.path);
    return errors;
  }

  const inputText = readFileSync(inputPath, 'utf8');
  const currentSha = sha256Text(inputText);
  if (currentSha !== manifest.input.sha256) {
    errors.push('manifest input SHA-256 no longer matches source file');
    return errors;
  }

  const parsed = parseWardrobeImportText(inputText);
  if (parsed.format !== manifest.input.format) {
    errors.push('manifest input format no longer matches source file');
  }
  const manifestRows = manifest.entries.map(entry => entry?.row);
  if (JSON.stringify(parsed.rows) !== JSON.stringify(manifestRows)) {
    errors.push('manifest rows no longer match parsed source input');
  }
  const manifestParseErrors = manifest.errors
    .filter(error => error?.kind === 'parse')
    .map(error => ({ line: error.line, message: error.message }));
  if (JSON.stringify(parsed.parseErrors) !== JSON.stringify(manifestParseErrors)) {
    errors.push('manifest parse errors no longer match source input');
  }
  return errors;
}

export function rowFieldDiffs(before, after) {
  const diffs = [];
  for (let index = 0; index < WARDROBE_FIELDS.length; index++) {
    if (JSON.stringify(before[index]) === JSON.stringify(after[index])) continue;
    diffs.push({
      field: WARDROBE_FIELDS[index],
      index,
      before: before[index],
      after: after[index],
    });
  }
  return diffs;
}

function groupRowIndices(rows) {
  const map = new Map();
  rows.forEach((row, index) => {
    const key = identityKey(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(index);
  });
  return map;
}

function readTargetState(manifest, targetPath) {
  const text = readFileSync(targetPath, 'utf8');
  const rows = loadWardrobe(targetPath);
  if (!Array.isArray(rows)) throw new Error(manifest.target.path + ' did not expose a wardrobe array');
  return {
    text,
    rows,
    sha256: sha256Text(text),
  };
}

export function buildWardrobePreview(manifest, { targetPath = null } = {}) {
  const integrityErrors = [
    ...validateManifestIntegrity(manifest),
    ...verifyManifestInputSource(manifest),
  ];
  const target = resolveWardrobeTarget(manifest.target.id);
  const actualPath = targetPath || absoluteDataSourcePath(target.id);
  const state = readTargetState(manifest, actualPath);
  const groups = groupRowIndices(state.rows);
  const seenStaged = new Set();

  const entries = manifest.entries.map((entry, index) => {
    if (!entry || !Array.isArray(entry.row)) {
      integrityErrors.push('entry ' + index + ': missing row during preview');
      return { ...entry, derivedStatus: 'invalid', targetMatchCount: 0, currentRow: null, fieldDiffs: [] };
    }

    const rowErrors = wardrobeRowErrors(entry.row);
    const derivedKey = rowErrors.length ? null : identityKey(entry.row);
    const lookupKey = derivedKey || entry.key;
    const indices = lookupKey ? (groups.get(lookupKey) || []) : [];
    const comparisonRow = indices.length ? state.rows[indices[indices.length - 1]] : null;
    let derivedStatus;

    if (rowErrors.length) {
      derivedStatus = 'invalid';
    } else if (seenStaged.has(derivedKey)) {
      derivedStatus = 'duplicate';
    } else {
      seenStaged.add(derivedKey);
      if (!comparisonRow) derivedStatus = 'new';
      else derivedStatus = sameRow(comparisonRow, entry.row) ? 'unchanged' : 'conflict';
    }

    if (entry.status !== derivedStatus) {
      integrityErrors.push(
        'entry ' + index + ': declared status ' + entry.status + ' does not match derived status ' + derivedStatus,
      );
    }

    if (
      (entry.status === 'unchanged' || entry.status === 'conflict') &&
      indices.length === 1 &&
      Array.isArray(entry.baselineRow) &&
      !sameRow(entry.baselineRow, state.rows[indices[0]])
    ) {
      integrityErrors.push('entry ' + index + ': baselineRow does not match current target row');
    }

    const currentRow = indices.length === 1 ? state.rows[indices[0]] : null;
    return {
      ...entry,
      derivedStatus,
      targetMatchCount: indices.length,
      currentRow,
      fieldDiffs: derivedStatus === 'conflict' && Array.isArray(entry.baselineRow)
        ? rowFieldDiffs(entry.baselineRow, entry.row)
        : [],
    };
  });

  const ambiguous = entries
    .filter(entry => (entry.derivedStatus === 'conflict' || entry.derivedStatus === 'unchanged') && entry.targetMatchCount !== 1)
    .map(entry => entry.key);

  return {
    manifest,
    target,
    targetPath: actualPath,
    currentSha256: state.sha256,
    stagedSha256: manifest.target.sha256,
    stale: state.sha256 !== manifest.target.sha256,
    manifestBlockingErrors: manifestHasBlockingErrors(manifest),
    integrityErrors,
    ambiguousTargetKeys: ambiguous,
    entries,
    summary: {
      newRows: entries.filter(entry => entry.derivedStatus === 'new').length,
      unchangedRows: entries.filter(entry => entry.derivedStatus === 'unchanged').length,
      conflictRows: entries.filter(entry => entry.derivedStatus === 'conflict').length,
      invalidRows: entries.filter(entry => entry.derivedStatus === 'invalid').length,
      duplicateRows: entries.filter(entry => entry.derivedStatus === 'duplicate').length,
    },
  };
}

function assertPreviewCanApply(preview, { acceptConflicts = false } = {}) {
  if (preview.integrityErrors.length) {
    throw new Error('manifest integrity check failed: ' + preview.integrityErrors.join('; '));
  }
  if (preview.manifestBlockingErrors || preview.summary.invalidRows > 0 || preview.summary.duplicateRows > 0) {
    throw new Error('manifest contains blocking staging errors');
  }
  if (preview.stale) {
    throw new Error('stale manifest: target SHA-256 changed after staging');
  }
  if (preview.ambiguousTargetKeys.length) {
    throw new Error('ambiguous target identity: ' + preview.ambiguousTargetKeys.join(', '));
  }
  if (preview.summary.conflictRows > 0 && !acceptConflicts) {
    throw new Error('manifest contains conflicts; rerun apply with explicit conflict acceptance');
  }
}

export function mergeWardrobeRows(currentRows, preview, { acceptConflicts = false } = {}) {
  assertPreviewCanApply(preview, { acceptConflicts });

  const merged = currentRows.map(row => row.slice());
  const groups = groupRowIndices(merged);

  for (const entry of preview.entries) {
    if (entry.derivedStatus === 'unchanged') continue;
    if (entry.derivedStatus === 'new') {
      if ((groups.get(entry.key) || []).length) {
        throw new Error('new row identity already exists in target: ' + entry.key);
      }
      merged.push(entry.row.slice());
      groups.set(entry.key, [merged.length - 1]);
      continue;
    }
    if (entry.derivedStatus === 'conflict') {
      const indices = groups.get(entry.key) || [];
      if (indices.length !== 1) throw new Error('conflict target identity is not unique: ' + entry.key);
      const index = indices[0];
      if (!sameRow(merged[index], entry.baselineRow)) {
        throw new Error('conflict baseline no longer matches target row: ' + entry.key);
      }
      merged[index] = entry.row.slice();
    }
  }

  return merged;
}

function localDateStamp(date) {
  return date.getFullYear() + '/' + (date.getMonth() + 1) + '/' + date.getDate();
}

export function serializeWardrobeFile(originalText, rows, updatedAt = new Date()) {
  const startMark = 'var wardrobe = [';
  const start = originalText.indexOf(startMark);
  if (start < 0) throw new Error('var wardrobe = [ not found');

  const afterStart = start + startMark.length;
  const tailMatch = originalText.slice(afterStart).match(/\r?\nvar lastVersion\b/);
  if (!tailMatch) throw new Error('var lastVersion not found after wardrobe array');
  const endBlock = afterStart + tailMatch.index;
  const closeIdx = originalText.lastIndexOf('];', endBlock);
  if (closeIdx < afterStart) throw new Error('could not locate wardrobe array closing ];');

  const newline = originalText.includes('\r\n') ? '\r\n' : '\n';
  const head = originalText.slice(0, afterStart);
  const tail = originalText.slice(closeIdx);
  const body = rows.map(row => rowToWardrobeLine(row)).join(newline);

  let output = head + newline + body + newline + newline + tail;
  output = output.replace(
    /var wardrobe_lastupd = '[^']*'/,
    "var wardrobe_lastupd = '" + localDateStamp(updatedAt) + "'",
  );
  return output;
}

function duplicateBaselineFor(path) {
  const all = JSON.parse(readFileSync(DUPLICATE_BASELINE_PATH, 'utf8'));
  return all[path] || [];
}

function validateMergedRows(rows, targetPathLabel) {
  const errors = validateRows(rows, targetPathLabel, duplicateBaselineFor(targetPathLabel));
  if (errors.length) throw new Error('merged wardrobe validation failed: ' + errors.join('; '));
}

function validateSerializedTemp(tempPath, expectedRows, targetPathLabel) {
  const rows = loadWardrobe(tempPath);
  if (!Array.isArray(rows)) throw new Error('serialized temp file did not expose wardrobe array');
  validateMergedRows(rows, targetPathLabel);
  if (JSON.stringify(rows) !== JSON.stringify(expectedRows)) {
    throw new Error('serialized temp wardrobe does not round-trip to expected rows');
  }
}

export function applyWardrobeManifestToPath(
  manifest,
  targetPath,
  {
    acceptConflicts = false,
    updatedAt = new Date(),
  } = {},
) {
  const preview = buildWardrobePreview(manifest, { targetPath });
  assertPreviewCanApply(preview, { acceptConflicts });

  const currentState = readTargetState(manifest, targetPath);
  const mergedRows = mergeWardrobeRows(currentState.rows, preview, { acceptConflicts });
  const changedRows = preview.summary.newRows + preview.summary.conflictRows;
  if (changedRows === 0) {
    return {
      applied: false,
      reason: 'no-changes',
      preview,
      beforeSha256: currentState.sha256,
      afterSha256: currentState.sha256,
      rowCount: currentState.rows.length,
    };
  }

  validateMergedRows(mergedRows, preview.target.path);
  const outputText = serializeWardrobeFile(currentState.text, mergedRows, updatedAt);
  const tempPath = join(
    dirname(targetPath),
    '.' + preview.target.id + '.gate11c-' + process.pid + '-' + Date.now() + '.tmp',
  );

  try {
    writeFileSync(tempPath, outputText, 'utf8');
    const fd = openSync(tempPath, 'r+');
    try {
      fsyncSync(fd);
      validateSerializedTemp(tempPath, mergedRows, preview.target.path);
    } finally {
      closeSync(fd);
    }
    try {
      chmodSync(tempPath, statSync(targetPath).mode);
    } catch {
      // Permission bits are advisory on Windows; failure here must not skip validated replacement.
    }
    renameSync(tempPath, targetPath);
  } catch (error) {
    if (existsSync(tempPath)) unlinkSync(tempPath);
    throw error;
  }

  const afterText = readFileSync(targetPath, 'utf8');
  return {
    applied: true,
    preview,
    beforeSha256: currentState.sha256,
    afterSha256: sha256Text(afterText),
    rowCount: mergedRows.length,
    addedRows: preview.summary.newRows,
    updatedRows: preview.summary.conflictRows,
  };
}

export function applyWardrobeManifest(manifest, options = {}) {
  const target = resolveWardrobeTarget(manifest.target.id);
  return applyWardrobeManifestToPath(
    manifest,
    absoluteDataSourcePath(target.id),
    options,
  );
}

export function previewLines(preview) {
  const lines = [];
  lines.push('[Preview] target: ' + preview.target.id + ' (' + preview.target.path + ')');
  lines.push('[Preview] target SHA: ' + preview.currentSha256 + (preview.stale ? ' [STALE]' : ' [MATCH]'));
  lines.push(
    '[Preview] rows: new ' + preview.summary.newRows +
    '; unchanged ' + preview.summary.unchangedRows +
    '; conflict ' + preview.summary.conflictRows +
    '; invalid ' + preview.summary.invalidRows +
    '; duplicate ' + preview.summary.duplicateRows,
  );

  for (const entry of preview.entries) {
    if (entry.derivedStatus === 'new') {
      const label = rowLabel(entry.row);
      lines.push('[NEW] ' + label.key + ' ' + label.name);
    } else if (entry.derivedStatus === 'conflict') {
      const label = rowLabel(entry.row);
      const fields = entry.fieldDiffs.map(diff => diff.field).join(', ');
      lines.push('[CONFLICT] ' + label.key + ' ' + label.name + ' fields: ' + fields);
      for (const diff of entry.fieldDiffs) {
        lines.push('  - ' + diff.field + ': ' + JSON.stringify(diff.before) + ' -> ' + JSON.stringify(diff.after));
      }
    }
  }

  if (preview.integrityErrors.length) {
    for (const error of preview.integrityErrors) lines.push('[INTEGRITY ERROR] ' + error);
  }
  if (preview.ambiguousTargetKeys.length) {
    lines.push('[AMBIGUOUS] ' + preview.ambiguousTargetKeys.join(', '));
  }
  return lines;
}
