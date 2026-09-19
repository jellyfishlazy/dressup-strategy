#!/usr/bin/env node

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
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DATA_SOURCE_ROLES,
  absoluteDataSourcePath,
  dataSourceById,
  generatedSources,
} from './data-source-contract.mjs';
import {
  findCnWardrobe,
  sha256File,
} from '../cn-search/scripts/cn-wardrobe-source.mjs';
import {
  buildCnSearchIndex,
  validateCnSearchIndex,
} from '../cn-search/scripts/build-cn-search-index.mjs';

export function affectedGeneratedSources(changedSourceIds) {
  const changed = new Set(changedSourceIds || []);
  return generatedSources().filter(source =>
    Array.isArray(source.inputs) && source.inputs.some(inputId => changed.has(inputId)),
  );
}

function resolveInputPath(inputId, inputOverrides = {}) {
  if (inputOverrides[inputId]) return resolve(inputOverrides[inputId]);
  if (inputId === 'external-cn-wardrobe') return findCnWardrobe();

  const source = dataSourceById(inputId);
  if (!source || !('path' in source)) throw new Error('cannot resolve generated input: ' + inputId);
  return absoluteDataSourcePath(inputId);
}

export function currentGeneratedInputs(source, { inputOverrides = {} } = {}) {
  if (!source || source.role !== DATA_SOURCE_ROLES.GENERATED) {
    throw new Error('source is not generated');
  }
  const inputs = {};
  for (const inputId of source.inputs || []) {
    const path = resolveInputPath(inputId, inputOverrides);
    if (!existsSync(path)) throw new Error('generated input missing: ' + inputId + ' at ' + path);
    inputs[inputId] = {
      path,
      sha256: sha256File(path),
    };
  }
  return inputs;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function validateGeneratedArtifact(source, data, { requireInputHashes = true } = {}) {
  if (source.id === 'cn-search-index') {
    return validateCnSearchIndex(data, { requireInputHashes });
  }
  return ['no validator registered for generated source ' + source.id];
}

export function inspectGeneratedSource(
  sourceId,
  {
    targetPath = null,
    inputOverrides = {},
  } = {},
) {
  const source = dataSourceById(sourceId);
  if (!source || source.role !== DATA_SOURCE_ROLES.GENERATED) {
    throw new Error('unknown generated source: ' + sourceId);
  }

  const actualTargetPath = targetPath ? resolve(targetPath) : absoluteDataSourcePath(source.id);
  const inputs = currentGeneratedInputs(source, { inputOverrides });
  const reasons = [];
  let data = null;
  let validationErrors = [];

  if (!existsSync(actualTargetPath)) {
    reasons.push('missing-output');
  } else {
    try {
      data = readJson(actualTargetPath);
      validationErrors = validateGeneratedArtifact(source, data, { requireInputHashes: false });
      if (validationErrors.length) reasons.push('invalid-output');
    } catch (error) {
      validationErrors = [error.message];
      reasons.push('invalid-json');
    }
  }

  if (data) {
    if (!data.inputHashes || typeof data.inputHashes !== 'object') {
      reasons.push('missing-input-hashes');
    } else {
      for (const inputId of source.inputs || []) {
        if (data.inputHashes[inputId] !== inputs[inputId].sha256) {
          reasons.push('input-changed:' + inputId);
        }
      }
    }
  }

  return {
    source,
    targetPath: actualTargetPath,
    inputs,
    data,
    validationErrors,
    staleReasons: [...new Set(reasons)],
    fresh: reasons.length === 0,
  };
}

function tempPathFor(targetPath, sourceId) {
  return join(
    dirname(targetPath),
    '.' + sourceId + '.gate11d-' + process.pid + '-' + Date.now() + '.tmp',
  );
}

function fsyncFile(path) {
  const fd = openSync(path, 'r+');
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function preserveModeIfPossible(tempPath, targetPath) {
  if (!existsSync(targetPath)) return;
  try {
    chmodSync(tempPath, statSync(targetPath).mode);
  } catch {
    // Windows permission bits are advisory here; validation is the safety gate.
  }
}

async function buildGeneratedToTemp(source, tempPath, inputs, generatedAt) {
  if (source.id === 'cn-search-index') {
    return buildCnSearchIndex({
      cnPath: inputs['external-cn-wardrobe'].path,
      twPath: inputs.wardrobe.path,
      outPath: tempPath,
      generatedAt,
    });
  }
  throw new Error('no rebuild handler registered for generated source ' + source.id);
}

export async function rebuildGeneratedSource(
  sourceId,
  {
    targetPath = null,
    inputOverrides = {},
    force = false,
    generatedAt = new Date(),
  } = {},
) {
  const before = inspectGeneratedSource(sourceId, { targetPath, inputOverrides });
  if (before.fresh && !force) {
    return {
      rebuilt: false,
      reason: 'fresh',
      before,
      after: before,
    };
  }

  const target = before.targetPath;
  const tempPath = tempPathFor(target, sourceId);

  try {
    await buildGeneratedToTemp(before.source, tempPath, before.inputs, generatedAt);
    fsyncFile(tempPath);

    const builtData = readJson(tempPath);
    const validationErrors = validateGeneratedArtifact(before.source, builtData, { requireInputHashes: true });
    if (validationErrors.length) {
      throw new Error('generated temp validation failed: ' + validationErrors.join('; '));
    }

    const afterInputs = currentGeneratedInputs(before.source, { inputOverrides });
    for (const inputId of before.source.inputs || []) {
      if (afterInputs[inputId].sha256 !== before.inputs[inputId].sha256) {
        throw new Error('generated input changed during rebuild: ' + inputId);
      }
      if (builtData.inputHashes[inputId] !== afterInputs[inputId].sha256) {
        throw new Error('generated temp hash does not match current input: ' + inputId);
      }
    }

    preserveModeIfPossible(tempPath, target);
    renameSync(tempPath, target);
  } catch (error) {
    if (existsSync(tempPath)) unlinkSync(tempPath);
    throw error;
  }

  const after = inspectGeneratedSource(sourceId, { targetPath: target, inputOverrides });
  if (!after.fresh) {
    throw new Error('rebuilt generated source is still stale: ' + after.staleReasons.join(', '));
  }

  return {
    rebuilt: true,
    reason: force ? 'forced' : 'stale',
    before,
    after,
  };
}

export function selectGeneratedSources({ changedSourceIds = null, sourceIds = null } = {}) {
  if (sourceIds?.length) {
    return sourceIds.map(id => {
      const source = dataSourceById(id);
      if (!source || source.role !== DATA_SOURCE_ROLES.GENERATED) {
        throw new Error('unknown generated source: ' + id);
      }
      return source;
    });
  }
  if (changedSourceIds?.length) return affectedGeneratedSources(changedSourceIds);
  return generatedSources();
}

export async function runDerivedRebuild({
  changedSourceIds = null,
  sourceIds = null,
  checkOnly = false,
  force = false,
} = {}) {
  const selected = selectGeneratedSources({ changedSourceIds, sourceIds });
  const results = [];

  for (const source of selected) {
    const inspection = inspectGeneratedSource(source.id);
    console.log(
      '[Derived] ' + source.id + ': ' +
      (inspection.fresh ? 'FRESH' : 'STALE (' + inspection.staleReasons.join(', ') + ')'),
    );

    if (checkOnly) {
      results.push({ source: source.id, inspection });
      continue;
    }

    const result = await rebuildGeneratedSource(source.id, { force });
    console.log(
      '[Derived] ' + source.id + ': ' +
      (result.rebuilt ? 'REBUILT' : 'NO-OP (' + result.reason + ')'),
    );
    results.push({ source: source.id, result });
  }

  return results;
}

function splitList(value) {
  return value.split(',').map(item => item.trim()).filter(Boolean);
}

function parseArgs(argv) {
  const options = {
    changedSourceIds: null,
    sourceIds: null,
    checkOnly: false,
    force: false,
  };
  for (const arg of argv) {
    if (arg === '--check') options.checkOnly = true;
    else if (arg === '--force') options.force = true;
    else if (arg.startsWith('--changed=')) options.changedSourceIds = splitList(arg.slice('--changed='.length));
    else if (arg.startsWith('--source=')) options.sourceIds = splitList(arg.slice('--source='.length));
    else throw new Error('unknown option: ' + arg);
  }
  if (options.checkOnly && options.force) throw new Error('--check and --force cannot be combined');
  return options;
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const results = await runDerivedRebuild(options);
    if (options.checkOnly) {
      const stale = results.filter(item => !item.inspection.fresh);
      if (stale.length) {
        console.error('[Derived] CHECK FAILED: ' + stale.length + ' generated source(s) are stale.');
        process.exitCode = 1;
      } else {
        console.log('[Derived] CHECK PASS: all selected generated sources are fresh.');
      }
    }
  } catch (error) {
    console.error('[Derived] ERROR: ' + error.message);
    process.exitCode = 1;
  }
}
