#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  absoluteDataSourcePath,
  generatedSources,
} from './data-source-contract.mjs';
import {
  buildWardrobeStagingManifest,
} from './wardrobe-staging.mjs';
import {
  applyWardrobeManifestToPath,
  buildWardrobePreview,
  previewLines,
} from './wardrobe-apply.mjs';
import {
  applyLevelManifestToPath,
  buildLevelPreview,
  buildLevelStagingManifest,
  previewLevelLines,
} from './level-pipeline.mjs';
import {
  affectedGeneratedSources,
  inspectGeneratedSource,
  rebuildGeneratedSource,
} from './derived-rebuild.mjs';

export const DATA_UPDATE_RUN_FORMAT_VERSION = 1;
export const DATA_UPDATE_RUN_KIND = 'data-update-run';

const REPO_ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));

function safeStamp(date) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function resolveInputPath(path) {
  if (!path) return null;
  return isAbsolute(path) ? resolve(path) : resolve(REPO_ROOT, path);
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function compactWardrobeSummary(preview) {
  return {
    target: preview.target.id,
    path: preview.target.path,
    stale: preview.stale,
    integrityErrors: preview.integrityErrors,
    ambiguousTargetKeys: preview.ambiguousTargetKeys,
    blocking: preview.manifestBlockingErrors || preview.summary.invalidRows > 0 || preview.summary.duplicateRows > 0,
    summary: preview.summary,
  };
}

function compactLevelSummary(preview) {
  return {
    target: preview.target.id,
    path: preview.target.path,
    stale: preview.stale,
    integrityErrors: preview.integrityErrors,
    blockingErrors: preview.blockingErrors,
    summary: preview.summary,
  };
}

function wardrobePreviewBlockers(preview, acceptConflicts) {
  const blockers = [];
  blockers.push(...preview.integrityErrors);
  if (preview.manifestBlockingErrors || preview.summary.invalidRows > 0 || preview.summary.duplicateRows > 0) {
    blockers.push('wardrobe staging contains blocking errors');
  }
  if (preview.stale) blockers.push('wardrobe target changed after staging');
  if (preview.ambiguousTargetKeys.length) blockers.push('ambiguous wardrobe target identities: ' + preview.ambiguousTargetKeys.join(', '));
  if (preview.summary.conflictRows > 0 && !acceptConflicts) {
    blockers.push('wardrobe conflicts require explicit acceptance');
  }
  return blockers;
}

function levelPreviewBlockers(preview, acceptConflicts) {
  const blockers = [...preview.integrityErrors];
  if (preview.blockingErrors.length || preview.summary.invalidEntries > 0 || preview.summary.duplicateEntries > 0) {
    blockers.push('level staging contains blocking errors');
  }
  if (preview.stale) blockers.push('level target changed after staging');
  if (preview.summary.conflictEntries > 0 && !acceptConflicts) {
    blockers.push('level conflicts require explicit acceptance');
  }
  return blockers;
}

function previewHardErrors(wardrobePreview, levelPreview) {
  const errors = [];
  if (wardrobePreview) {
    errors.push(...wardrobePreview.integrityErrors);
    if (wardrobePreview.manifestBlockingErrors || wardrobePreview.summary.invalidRows > 0 || wardrobePreview.summary.duplicateRows > 0) {
      errors.push('wardrobe staging contains blocking errors');
    }
    if (wardrobePreview.stale) errors.push('wardrobe target changed after staging');
    if (wardrobePreview.ambiguousTargetKeys.length) errors.push('ambiguous wardrobe target identities');
  }
  if (levelPreview) {
    errors.push(...levelPreview.integrityErrors);
    if (levelPreview.blockingErrors.length || levelPreview.summary.invalidEntries > 0 || levelPreview.summary.duplicateEntries > 0) {
      errors.push('level staging contains blocking errors');
    }
    if (levelPreview.stale) errors.push('level target changed after staging');
  }
  return errors;
}

function prospectiveChangedSourceIds(wardrobePreview, levelPreview) {
  const ids = [];
  if (wardrobePreview && (wardrobePreview.summary.newRows > 0 || wardrobePreview.summary.conflictRows > 0)) {
    ids.push(wardrobePreview.target.id);
  }
  if (levelPreview && (levelPreview.summary.newEntries > 0 || levelPreview.summary.conflictEntries > 0)) {
    ids.push(levelPreview.target.id);
  }
  return [...new Set(ids)];
}

function actualChangedSourceIds(wardrobeResult, levelResult) {
  const ids = [];
  if (wardrobeResult?.applied) ids.push(wardrobeResult.preview.target.id);
  if (levelResult?.applied) ids.push(levelResult.preview.target.id);
  return [...new Set(ids)];
}

function captureSnapshot(path, backupDir, label) {
  const target = resolve(path);
  const exists = existsSync(target);
  const backupPath = join(backupDir, label.replace(/[^a-zA-Z0-9._-]/g, '_') + '.bak');
  let mode = null;
  if (exists) {
    mkdirSync(backupDir, { recursive: true });
    copyFileSync(target, backupPath);
    mode = statSync(target).mode;
  }
  return { path: target, exists, backupPath: exists ? backupPath : null, mode };
}

function fsyncFile(path) {
  const fd = openSync(path, 'r+');
  try { fsyncSync(fd); }
  finally { closeSync(fd); }
}

function restoreSnapshot(snapshot) {
  if (!snapshot.exists) {
    if (existsSync(snapshot.path)) unlinkSync(snapshot.path);
    return;
  }

  const tempPath = join(
    dirname(snapshot.path),
    '.' + basename(snapshot.path) + '.gate11f-rollback-' + process.pid + '-' + Date.now() + '.tmp',
  );
  try {
    copyFileSync(snapshot.backupPath, tempPath);
    fsyncFile(tempPath);
    if (snapshot.mode !== null) {
      try { chmodSync(tempPath, snapshot.mode); }
      catch { /* advisory on Windows */ }
    }
    renameSync(tempPath, snapshot.path);
  } catch (error) {
    if (existsSync(tempPath)) unlinkSync(tempPath);
    throw error;
  }
}

function snapshotPathsForRun({
  wardrobePreview,
  levelPreview,
  targetOverrides,
  generatedTargetOverrides,
}) {
  const paths = [];
  const changedIds = prospectiveChangedSourceIds(wardrobePreview, levelPreview);

  if (wardrobePreview && changedIds.includes(wardrobePreview.target.id)) {
    paths.push({
      label: 'target-' + wardrobePreview.target.id,
      path: targetOverrides[wardrobePreview.target.id] || wardrobePreview.targetPath,
    });
  }
  if (levelPreview && changedIds.includes(levelPreview.target.id)) {
    paths.push({
      label: 'target-' + levelPreview.target.id,
      path: targetOverrides[levelPreview.target.id] || levelPreview.targetPath,
    });
  }

  for (const source of affectedGeneratedSources(changedIds)) {
    paths.push({
      label: 'generated-' + source.id,
      path: generatedTargetOverrides[source.id] || absoluteDataSourcePath(source.id),
    });
  }

  const seen = new Set();
  return paths.filter(item => {
    const key = resolve(item.path);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function runRepositoryRegression() {
  const npmExecPath = process.env.npm_execpath;
  const result = npmExecPath && existsSync(npmExecPath)
    ? spawnSync(process.execPath, [npmExecPath, 'run', 'check'], {
        cwd: REPO_ROOT,
        stdio: 'inherit',
      })
    : spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'check'], {
        cwd: REPO_ROOT,
        stdio: 'inherit',
        shell: process.platform === 'win32',
      });
  if (result.error) throw new Error('repository regression check could not start: ' + result.error.message);
  if (result.status !== 0) throw new Error('repository regression check failed with exit code ' + result.status);
  return { status: 'pass' };
}

export async function rebuildAffectedGenerated(
  changedSourceIds,
  {
    generatedTargetOverrides = {},
    derivedInputOverrides = {},
  } = {},
) {
  const results = [];
  for (const source of affectedGeneratedSources(changedSourceIds)) {
    const result = await rebuildGeneratedSource(source.id, {
      targetPath: generatedTargetOverrides[source.id] || null,
      inputOverrides: derivedInputOverrides,
    });
    results.push({ source: source.id, rebuilt: result.rebuilt, reason: result.reason });
  }
  return results;
}

export function assertGeneratedFresh({
  generatedTargetOverrides = {},
  derivedInputOverrides = {},
} = {}) {
  const results = [];
  for (const source of generatedSources()) {
    const inspection = inspectGeneratedSource(source.id, {
      targetPath: generatedTargetOverrides[source.id] || null,
      inputOverrides: derivedInputOverrides,
    });
    results.push({ source: source.id, fresh: inspection.fresh, staleReasons: inspection.staleReasons });
    if (!inspection.fresh) {
      throw new Error('generated source is stale after update: ' + source.id + ' (' + inspection.staleReasons.join(', ') + ')');
    }
  }
  return results;
}

export async function runDataUpdate(
  {
    wardrobeInput = null,
    wardrobeTarget = 'wardrobe',
    levelInput = null,
    levelTarget = null,
    apply = false,
    acceptConflicts = false,
    acceptWardrobeConflicts = false,
    acceptLevelConflicts = false,
    now = new Date(),
    runDir = null,
    targetOverrides = {},
    generatedTargetOverrides = {},
    derivedInputOverrides = {},
  } = {},
  {
    regressionRunner = runRepositoryRegression,
    derivedRebuilder = rebuildAffectedGenerated,
    derivedChecker = assertGeneratedFresh,
  } = {},
) {
  if (!wardrobeInput && !levelInput) throw new Error('data update requires --wardrobe and/or --levels input');

  const stamp = safeStamp(now);
  const actualRunDir = runDir
    ? resolve(runDir)
    : join(REPO_ROOT, '.staging', 'runs', stamp);
  mkdirSync(actualRunDir, { recursive: true });

  const reportPath = join(actualRunDir, 'run-report.json');
  const report = {
    formatVersion: DATA_UPDATE_RUN_FORMAT_VERSION,
    kind: DATA_UPDATE_RUN_KIND,
    startedAt: now.toISOString(),
    mode: apply ? 'apply' : 'preview',
    inputs: {
      wardrobe: wardrobeInput,
      levels: levelInput,
    },
    manifests: {},
    previews: {},
    applies: {},
    derived: [],
    regression: null,
    generatedFreshness: null,
    rollback: null,
    status: 'running',
  };

  let wardrobeManifest = null;
  let wardrobePreview = null;
  let levelManifest = null;
  let levelPreview = null;

  try {
    if (wardrobeInput) {
      const inputPath = resolveInputPath(wardrobeInput);
      const inputText = readFileSync(inputPath, 'utf8');
      wardrobeManifest = buildWardrobeStagingManifest({
        inputText,
        inputPath: inputPath,
        targetId: wardrobeTarget,
        targetPathOverride: targetOverrides[wardrobeTarget] || null,
        createdAt: now,
      });
      const manifestPath = join(actualRunDir, 'wardrobe-manifest.json');
      writeJson(manifestPath, wardrobeManifest);
      report.manifests.wardrobe = manifestPath;

      wardrobePreview = buildWardrobePreview(wardrobeManifest, {
        targetPath: targetOverrides[wardrobeTarget] || null,
      });
      report.previews.wardrobe = compactWardrobeSummary(wardrobePreview);
      for (const line of previewLines(wardrobePreview)) console.log(line);
    }

    if (levelInput) {
      const inputPath = resolveInputPath(levelInput);
      const inputText = readFileSync(inputPath, 'utf8');
      levelManifest = buildLevelStagingManifest({
        inputText,
        inputPath: inputPath,
        targetId: levelTarget,
        targetPathOverride: levelTarget ? (targetOverrides[levelTarget] || null) : null,
        createdAt: now,
      });
      const actualLevelTargetId = levelManifest.target.id;
      const manifestPath = join(actualRunDir, 'level-manifest.json');
      writeJson(manifestPath, levelManifest);
      report.manifests.levels = manifestPath;

      levelPreview = buildLevelPreview(levelManifest, {
        targetPath: targetOverrides[actualLevelTargetId] || null,
      });
      report.previews.levels = compactLevelSummary(levelPreview);
      for (const line of previewLevelLines(levelPreview)) console.log(line);
    }

    if (!apply) {
      const hardErrors = previewHardErrors(wardrobePreview, levelPreview);
      const conflicts =
        (wardrobePreview?.summary.conflictRows || 0) +
        (levelPreview?.summary.conflictEntries || 0);
      report.status = hardErrors.length
        ? 'blocked'
        : conflicts
          ? 'review-required'
          : 'ready';
      if (hardErrors.length) report.errors = hardErrors;
      writeJson(reportPath, report);
      console.log('[Data Update] PREVIEW: ' + report.status.toUpperCase());
      console.log('[Data Update] report: ' + reportPath);
      return { report, reportPath, ok: hardErrors.length === 0 };
    }

    const wardrobeAccept = acceptConflicts || acceptWardrobeConflicts;
    const levelAccept = acceptConflicts || acceptLevelConflicts;
    const blockers = [
      ...(wardrobePreview ? wardrobePreviewBlockers(wardrobePreview, wardrobeAccept) : []),
      ...(levelPreview ? levelPreviewBlockers(levelPreview, levelAccept) : []),
    ];
    if (blockers.length) {
      report.status = 'blocked';
      report.errors = blockers;
      writeJson(reportPath, report);
      throw new Error('preflight blocked: ' + blockers.join('; '));
    }

    const backupDir = join(actualRunDir, 'backups');
    const snapshotPlan = snapshotPathsForRun({
      wardrobePreview,
      levelPreview,
      targetOverrides,
      generatedTargetOverrides,
    });
    const snapshots = snapshotPlan.map(item => captureSnapshot(item.path, backupDir, item.label));
    let writesStarted = false;

    try {
      let wardrobeResult = null;
      let levelResult = null;

      if (wardrobeManifest) {
        const targetId = wardrobeManifest.target.id;
        wardrobeResult = applyWardrobeManifestToPath(
          wardrobeManifest,
          targetOverrides[targetId] || absoluteDataSourcePath(targetId),
          { acceptConflicts: wardrobeAccept, updatedAt: now },
        );
        report.applies.wardrobe = {
          applied: wardrobeResult.applied,
          reason: wardrobeResult.reason || null,
          addedRows: wardrobeResult.addedRows || 0,
          updatedRows: wardrobeResult.updatedRows || 0,
          beforeSha256: wardrobeResult.beforeSha256,
          afterSha256: wardrobeResult.afterSha256,
        };
        if (wardrobeResult.applied) writesStarted = true;
      }

      if (levelManifest) {
        const targetId = levelManifest.target.id;
        levelResult = applyLevelManifestToPath(
          levelManifest,
          targetOverrides[targetId] || absoluteDataSourcePath(targetId),
          { acceptConflicts: levelAccept },
        );
        report.applies.levels = {
          applied: levelResult.applied,
          reason: levelResult.reason || null,
          newEntries: levelResult.newEntries || 0,
          updatedEntries: levelResult.updatedEntries || 0,
          beforeSha256: levelResult.beforeSha256,
          afterSha256: levelResult.afterSha256,
        };
        if (levelResult.applied) writesStarted = true;
      }

      const changedSourceIds = actualChangedSourceIds(wardrobeResult, levelResult);
      report.changedSourceIds = changedSourceIds;

      if (changedSourceIds.length) {
        const derivedResults = await derivedRebuilder(changedSourceIds, {
          generatedTargetOverrides,
          derivedInputOverrides,
        });
        report.derived = derivedResults;
        if (derivedResults.some(item => item.rebuilt)) writesStarted = true;
      }

      report.generatedFreshness = derivedChecker({
        generatedTargetOverrides,
        derivedInputOverrides,
      });

      report.regression = await regressionRunner({
        changedSourceIds,
        wardrobeResult,
        levelResult,
      });

      report.status = 'applied';
      report.completedAt = new Date().toISOString();
      writeJson(reportPath, report);
      console.log('[Data Update] APPLY PASS');
      console.log('[Data Update] report: ' + reportPath);
      return { report, reportPath, ok: true };
    } catch (error) {
      if (writesStarted || snapshots.length) {
        const rollbackErrors = [];
        for (const snapshot of [...snapshots].reverse()) {
          try { restoreSnapshot(snapshot); }
          catch (rollbackError) {
            rollbackErrors.push(snapshot.path + ': ' + rollbackError.message);
          }
        }
        report.rollback = {
          attempted: true,
          success: rollbackErrors.length === 0,
          errors: rollbackErrors,
        };
        if (rollbackErrors.length) {
          report.status = 'rollback-failed';
          report.errors = [error.message, ...rollbackErrors];
          writeJson(reportPath, report);
          throw new Error(error.message + '; rollback failed: ' + rollbackErrors.join('; '));
        }
        console.error('[Data Update] ROLLBACK: restored pre-run files.');
      }
      report.status = writesStarted || snapshots.length ? 'rolled-back' : 'failed';
      report.errors = [error.message];
      writeJson(reportPath, report);
      throw error;
    }
  } catch (error) {
    if (report.status === 'running') {
      report.status = 'blocked';
      report.errors = [error.message];
      writeJson(reportPath, report);
    }
    throw error;
  }
}

function parseArgs(argv) {
  const options = {
    wardrobeInput: null,
    wardrobeTarget: 'wardrobe',
    levelInput: null,
    levelTarget: null,
    apply: false,
    acceptConflicts: false,
    acceptWardrobeConflicts: false,
    acceptLevelConflicts: false,
  };

  for (const arg of argv) {
    if (arg.startsWith('--wardrobe=')) options.wardrobeInput = arg.slice('--wardrobe='.length);
    else if (arg.startsWith('--wardrobe-target=')) options.wardrobeTarget = arg.slice('--wardrobe-target='.length);
    else if (arg.startsWith('--levels=')) options.levelInput = arg.slice('--levels='.length);
    else if (arg.startsWith('--level-target=')) options.levelTarget = arg.slice('--level-target='.length);
    else if (arg === '--apply') options.apply = true;
    else if (arg === '--accept-conflicts') options.acceptConflicts = true;
    else if (arg === '--accept-wardrobe-conflicts') options.acceptWardrobeConflicts = true;
    else if (arg === '--accept-level-conflicts') options.acceptLevelConflicts = true;
    else throw new Error('unknown option: ' + arg);
  }
  return options;
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    const result = await runDataUpdate(parseArgs(process.argv.slice(2)));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error('[Data Update] ERROR: ' + error.message);
    process.exitCode = 1;
  }
}
