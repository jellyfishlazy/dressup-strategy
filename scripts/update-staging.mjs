import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import {
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildWardrobeStagingManifest,
  identityKey,
  manifestHasBlockingErrors,
} from './wardrobe-staging.mjs';
import {
  buildWardrobePreview,
} from './wardrobe-apply.mjs';
import {
  LEVEL_STAGING_FORMAT_VERSION,
  buildLevelPreview,
  buildLevelStagingManifest,
  manifestHasBlockingLevelErrors,
} from './level-pipeline.mjs';
import {
  DEFAULT_UPDATE_WORKSPACE,
  getCurrentSession,
  loadUpdateSession,
} from './update-session.mjs';
import { buildUpdateDiffPreview } from './update-diff-preview.mjs';
import { listConflictReview } from './update-conflict-review.mjs';

export const APPLY_READY_STAGING_FORMAT_VERSION = 1;
export const APPLY_READY_STAGING_KIND = 'gate12-apply-ready-staging';

const REPO_ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
export const DEFAULT_APPLY_READY_OUTPUT_ROOT = join(REPO_ROOT, '.staging', 'gate12');

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map(key => [key, stableValue(value[key])]),
    );
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

function sha256(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function fileSha(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function portablePath(path) {
  const absolute = resolve(path);
  const rel = relative(REPO_ROOT, absolute);
  if (rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel)) {
    return rel.split(sep).join('/');
  }
  return absolute;
}

function readSession(options = {}) {
  const workspace = options.workspace || DEFAULT_UPDATE_WORKSPACE;
  const session = options.sessionId === undefined
    ? getCurrentSession({ workspace })
    : loadUpdateSession(options.sessionId, { workspace });
  if (!session) throw new Error('no current update session');
  if (session.status !== 'draft') {
    throw new Error('apply-ready staging requires a draft update session');
  }
  return session;
}

export function sessionDependencyFingerprint(session) {
  return sha256(stableStringify({
    id: session.id,
    status: session.status,
    sourceSnapshot: session.sourceSnapshot,
    plan: session.plan,
    collection: session.collection,
    review: session.review || null,
  }));
}

function currentTargetSha(target) {
  return fileSha(target.path);
}

function assertTargetStillMatches(target) {
  const current = currentTargetSha(target);
  if (current !== target.sha256) {
    throw new Error('canonical target changed during Gate 12I generation: ' + target.id);
  }
}

function reviewKey(domain, sourceKey) {
  return domain + '|' + sourceKey;
}

function currentDecisions(review) {
  const out = new Map();
  for (const conflict of review.conflicts) {
    if (!conflict.reviewed || conflict.decision?.state !== 'current') continue;
    out.set(reviewKey(conflict.domain, conflict.sourceKey), conflict.decision);
  }
  return out;
}

function wardrobeRowsFromPreview(preview, review) {
  const decisions = currentDecisions(review);
  const rows = [];
  const actions = [];
  const seen = new Map();

  for (const item of preview.wardrobe.items) {
    if (item.status === 'unchanged') {
      actions.push({
        sourceKey: item.sourceKey,
        targetKey: item.targetKey,
        previewStatus: item.status,
        action: 'skip-unchanged',
      });
      continue;
    }

    let row = null;
    let action = null;
    let decision = null;

    if (item.status === 'new' || item.status === 'modified') {
      if (!Array.isArray(item.candidateRow)) {
        throw new Error('Gate 12G wardrobe item is missing candidateRow: ' + item.sourceKey);
      }
      row = cloneJson(item.candidateRow);
      action = item.status === 'new' ? 'stage-new' : 'stage-modified';
    } else if (item.status === 'conflict') {
      decision = decisions.get(reviewKey('wardrobe', item.sourceKey));
      if (!decision) throw new Error('current wardrobe conflict has no current Gate 12H decision: ' + item.sourceKey);
      if (decision.decision === 'keep-local') {
        actions.push({
          sourceKey: item.sourceKey,
          targetKey: item.targetKey,
          previewStatus: item.status,
          action: 'skip-keep-local',
          decision: decision.decision,
          previewFingerprint: decision.previewFingerprint,
        });
        continue;
      }
      if (decision.resolvedPayload?.kind !== 'wardrobe-row'
        || !Array.isArray(decision.resolvedPayload.row)) {
        throw new Error('wardrobe conflict decision has no apply-ready resolved row: ' + item.sourceKey);
      }
      row = cloneJson(decision.resolvedPayload.row);
      action = 'stage-reviewed-conflict';
    } else {
      throw new Error('unsupported Gate 12G wardrobe status: ' + item.status);
    }

    const key = identityKey(row);
    const previous = seen.get(key);
    if (previous && stableStringify(previous) !== stableStringify(row)) {
      throw new Error('multiple Gate 12 items resolve to different wardrobe rows for target: ' + key);
    }
    if (!previous) {
      seen.set(key, row);
      rows.push(row);
    }

    actions.push({
      sourceKey: item.sourceKey,
      targetKey: key,
      previewStatus: item.status,
      action,
      ...(decision ? {
        decision: decision.decision,
        previewFingerprint: decision.previewFingerprint,
      } : {}),
    });
  }

  return { rows, actions };
}

function levelCandidateEntries(item) {
  if (!item.targetKey || !item.candidate) {
    throw new Error('Gate 12G level item is missing target/candidate: ' + item.sourceKey);
  }

  if (item.status === 'modified') {
    return (item.differences || []).map(diff => ({
      table: diff.table,
      key: diff.key,
      value: cloneJson(diff.after),
    }));
  }

  if (item.status !== 'new') {
    throw new Error('levelCandidateEntries expects new/modified item');
  }

  const entries = [{
    table: 'levelsRaw',
    key: item.targetKey,
    value: cloneJson(item.candidate.levelsRaw),
  }];

  for (const [table, field] of [
    ['levelFilters', 'levelFilters'],
    ['levelBonus', 'levelBonus'],
    ['addSkillsInfo', 'skills'],
    ['addHintInfo', 'hint'],
  ]) {
    const value = item.candidate[field];
    if (value !== null && value !== undefined) {
      entries.push({ table, key: item.targetKey, value: cloneJson(value) });
    }
  }

  for (const theme of item.candidate.themeFilter || []) {
    entries.push({
      table: 'themeFilter',
      key: theme.name,
      value: theme.prefix,
    });
  }
  return entries;
}

function dedupeLevelEntries(entries) {
  const out = [];
  const seen = new Map();
  for (const entry of entries) {
    const identity = entry.table + '|' + entry.key;
    if (seen.has(identity)) {
      if (stableStringify(seen.get(identity).value) !== stableStringify(entry.value)) {
        throw new Error('multiple Gate 12 items resolve to different level values for: ' + identity);
      }
      continue;
    }
    const copy = cloneJson(entry);
    seen.set(identity, copy);
    out.push(copy);
  }
  return out;
}

function levelEntriesFromPreview(preview, review) {
  const decisions = currentDecisions(review);
  const entries = [];
  const actions = [];

  for (const item of preview.levels.items) {
    if (item.status === 'unchanged') {
      actions.push({
        sourceKey: item.sourceKey,
        targetKey: item.targetKey,
        previewStatus: item.status,
        action: 'skip-unchanged',
      });
      continue;
    }

    let resolved = [];
    let action = null;
    let decision = null;

    if (item.status === 'new' || item.status === 'modified') {
      resolved = levelCandidateEntries(item);
      action = item.status === 'new' ? 'stage-new' : 'stage-modified';
    } else if (item.status === 'conflict') {
      decision = decisions.get(reviewKey('levels', item.sourceKey));
      if (!decision) throw new Error('current level conflict has no current Gate 12H decision: ' + item.sourceKey);
      if (decision.decision === 'keep-local') {
        actions.push({
          sourceKey: item.sourceKey,
          targetKey: item.targetKey,
          previewStatus: item.status,
          action: 'skip-keep-local',
          decision: decision.decision,
          previewFingerprint: decision.previewFingerprint,
        });
        continue;
      }
      if (decision.resolvedPayload?.kind !== 'level-entries'
        || !Array.isArray(decision.resolvedPayload.entries)) {
        throw new Error('level conflict decision has no apply-ready resolved entries: ' + item.sourceKey);
      }
      resolved = cloneJson(decision.resolvedPayload.entries);
      action = 'stage-reviewed-conflict';
    } else {
      throw new Error('unsupported Gate 12G level status: ' + item.status);
    }

    entries.push(...resolved);
    actions.push({
      sourceKey: item.sourceKey,
      targetKey: decision?.resolvedTargetKey || item.targetKey,
      previewStatus: item.status,
      action,
      entryCount: resolved.length,
      ...(decision ? {
        decision: decision.decision,
        previewFingerprint: decision.previewFingerprint,
      } : {}),
    });
  }

  return {
    entries: dedupeLevelEntries(entries),
    actions,
  };
}

function assertReviewMatchesPreview(preview, review) {
  if (!preview.completeness.complete) {
    throw new Error('Gate 12F completeness must be complete before Gate 12I');
  }
  if (!review.readyForNextGate) {
    throw new Error(
      'Gate 12H review is not ready: unresolved=' + review.unresolvedCount
      + '; stale=' + review.staleDecisionCount,
    );
  }

  const reviewed = new Map(review.conflicts.map(item => [reviewKey(item.domain, item.sourceKey), item]));
  const currentConflicts = [
    ...preview.wardrobe.items,
    ...preview.levels.items,
  ].filter(item => item.status === 'conflict');

  if (review.conflictCount !== currentConflicts.length) {
    throw new Error('Gate 12G conflict set changed during review');
  }

  for (const item of currentConflicts) {
    const conflict = reviewed.get(reviewKey(item.domain, item.sourceKey));
    if (!conflict || !conflict.reviewed || conflict.decision?.state !== 'current') {
      throw new Error('Gate 12G conflict lacks a current Gate 12H decision: ' + item.domain + '|' + item.sourceKey);
    }
    if (conflict.targetKey !== item.targetKey || conflict.conflictKind !== item.conflictKind) {
      throw new Error('Gate 12G conflict identity changed after Gate 12H review: ' + item.domain + '|' + item.sourceKey);
    }
    const target = item.domain === 'wardrobe' ? preview.targets.wardrobe : preview.targets.levels;
    if (conflict.decision.targetSha256 !== target.sha256) {
      throw new Error('Gate 12H decision target SHA no longer matches Gate 12G preview: ' + item.domain + '|' + item.sourceKey);
    }
  }
}

function generationFingerprint(session, preview, review, wardrobe, levels) {
  return sha256(stableStringify({
    formatVersion: APPLY_READY_STAGING_FORMAT_VERSION,
    session: {
      id: session.id,
      dependency: sessionDependencyFingerprint(session),
    },
    targets: preview.targets,
    review: review.conflicts.map(item => ({
      domain: item.domain,
      sourceKey: item.sourceKey,
      fingerprint: item.fingerprint,
      decision: item.decision ? {
        decision: item.decision.decision,
        previewFingerprint: item.decision.previewFingerprint,
        resolvedTargetKey: item.decision.resolvedTargetKey,
        resolvedPayload: item.decision.resolvedPayload,
      } : null,
    })),
    wardrobe,
    levels,
  }));
}

function validateWardrobeManifest(manifest) {
  if (manifestHasBlockingErrors(manifest)) {
    throw new Error('generated wardrobe staging has blocking errors: ' + JSON.stringify(manifest.errors));
  }
  if (manifest.summary.invalidRows || manifest.summary.duplicateRows || manifest.summary.parseErrors) {
    throw new Error('generated wardrobe staging contains invalid/duplicate/parse errors');
  }
}

function validateLevelManifest(manifest) {
  if (manifestHasBlockingLevelErrors(manifest)) {
    throw new Error('generated level staging has blocking errors: ' + JSON.stringify(manifest.errors));
  }
  if (manifest.summary.invalidEntries || manifest.summary.duplicateEntries) {
    throw new Error('generated level staging contains invalid/duplicate entries');
  }
}

function validateGate11Previews(wardrobePreview, levelPreview) {
  const errors = [];
  if (wardrobePreview.integrityErrors.length) {
    errors.push(...wardrobePreview.integrityErrors.map(error => 'wardrobe integrity: ' + error));
  }
  if (wardrobePreview.manifestBlockingErrors) errors.push('wardrobe manifest has blocking errors');
  if (wardrobePreview.stale) errors.push('wardrobe target is stale');
  if (wardrobePreview.ambiguousTargetKeys.length) {
    errors.push('wardrobe target identities are ambiguous: ' + wardrobePreview.ambiguousTargetKeys.join(', '));
  }
  if (wardrobePreview.summary.invalidRows || wardrobePreview.summary.duplicateRows) {
    errors.push('wardrobe preview contains invalid/duplicate rows');
  }

  if (levelPreview.integrityErrors.length) {
    errors.push(...levelPreview.integrityErrors.map(error => 'level integrity: ' + error));
  }
  if (levelPreview.stale) errors.push('level target is stale');
  if (levelPreview.blockingErrors.length) {
    errors.push(...levelPreview.blockingErrors.map(error => 'level blocking: ' + JSON.stringify(error)));
  }
  if (levelPreview.summary.invalidEntries || levelPreview.summary.duplicateEntries) {
    errors.push('level preview contains invalid/duplicate entries');
  }

  if (errors.length) throw new Error('generated staging failed Gate 11 preview validation: ' + errors.join('; '));
}

function artifactDescriptor(path, outputDir) {
  return {
    path: portablePath(path),
    relativeToBundle: relative(outputDir, path).split(sep).join('/'),
    sha256: fileSha(path),
  };
}

function verifyExistingBundle(outputDir, fingerprint) {
  const bundlePath = join(outputDir, 'bundle.json');
  if (!existsSync(bundlePath)) throw new Error('existing Gate 12I output is missing bundle.json');
  const bundle = JSON.parse(readFileSync(bundlePath, 'utf8'));
  if (bundle.kind !== APPLY_READY_STAGING_KIND
    || bundle.formatVersion !== APPLY_READY_STAGING_FORMAT_VERSION
    || bundle.generationFingerprint !== fingerprint) {
    throw new Error('existing Gate 12I output does not match current generation fingerprint');
  }

  for (const artifact of Object.values(bundle.artifacts || {})) {
    const path = join(outputDir, artifact.relativeToBundle);
    if (!existsSync(path)) throw new Error('existing Gate 12I artifact is missing: ' + artifact.relativeToBundle);
    if (fileSha(path) !== artifact.sha256) {
      throw new Error('existing Gate 12I artifact hash mismatch: ' + artifact.relativeToBundle);
    }
  }
  return { bundlePath, bundle };
}

function assertSessionUnchanged(beforeFingerprint, sessionId, workspace) {
  const after = loadUpdateSession(sessionId, { workspace });
  if (sessionDependencyFingerprint(after) !== beforeFingerprint) {
    throw new Error('update session changed during Gate 12I generation; discard staging and retry');
  }
}

export async function generateApplyReadyStaging(options = {}) {
  const workspace = options.workspace || DEFAULT_UPDATE_WORKSPACE;
  const session = readSession(options);
  const beforeSessionFingerprint = sessionDependencyFingerprint(session);
  const generatedAt = options.now instanceof Date ? options.now : new Date();
  if (Number.isNaN(generatedAt.getTime())) throw new Error('invalid generation time');

  const review = await listConflictReview({
    ...options,
    sessionId: session.id,
  });
  const preview = await buildUpdateDiffPreview({
    ...options,
    sessionId: session.id,
  });
  assertReviewMatchesPreview(preview, review);

  assertTargetStillMatches(preview.targets.wardrobe);
  assertTargetStillMatches(preview.targets.levels);

  const wardrobe = wardrobeRowsFromPreview(preview, review);
  const levels = levelEntriesFromPreview(preview, review);
  const fingerprint = generationFingerprint(session, preview, review, wardrobe, levels);
  const outputRoot = resolve(options.outputRoot || DEFAULT_APPLY_READY_OUTPUT_ROOT);
  const outputDir = join(outputRoot, session.id, fingerprint.slice(0, 16));

  if (existsSync(outputDir)) {
    const existing = verifyExistingBundle(outputDir, fingerprint);
    assertTargetStillMatches(preview.targets.wardrobe);
    assertTargetStillMatches(preview.targets.levels);
    assertSessionUnchanged(beforeSessionFingerprint, session.id, workspace);

    const wardrobeManifest = JSON.parse(readFileSync(
      join(outputDir, existing.bundle.artifacts.wardrobeManifest.relativeToBundle),
      'utf8',
    ));
    const levelManifest = JSON.parse(readFileSync(
      join(outputDir, existing.bundle.artifacts.levelManifest.relativeToBundle),
      'utf8',
    ));
    const wardrobePreview = buildWardrobePreview(wardrobeManifest, {
      targetPath: preview.targets.wardrobe.path,
    });
    const levelPreview = buildLevelPreview(levelManifest, {
      targetPath: preview.targets.levels.path,
    });
    validateGate11Previews(wardrobePreview, levelPreview);

    return {
      outputDir,
      bundlePath: existing.bundlePath,
      bundle: existing.bundle,
      reused: true,
    };
  }

  const finalWardrobeInput = join(outputDir, 'wardrobe-input.json');
  const finalWardrobeManifest = join(outputDir, 'wardrobe-manifest.json');
  const finalLevelInput = join(outputDir, 'levels-input.json');
  const finalLevelManifest = join(outputDir, 'levels-manifest.json');

  const wardrobeInputText = JSON.stringify(wardrobe.rows, null, 2) + '\n';
  const levelInputText = JSON.stringify({
    formatVersion: LEVEL_STAGING_FORMAT_VERSION,
    target: 'main-levels',
    entries: levels.entries,
  }, null, 2) + '\n';

  const wardrobeManifest = buildWardrobeStagingManifest({
    inputText: wardrobeInputText,
    inputPath: portablePath(finalWardrobeInput),
    targetId: 'wardrobe',
    targetPathOverride: preview.targets.wardrobe.path,
    createdAt: generatedAt,
  });
  validateWardrobeManifest(wardrobeManifest);

  const levelManifest = buildLevelStagingManifest({
    inputText: levelInputText,
    inputPath: portablePath(finalLevelInput),
    targetId: 'main-levels',
    targetPathOverride: preview.targets.levels.path,
    createdAt: generatedAt,
  });
  validateLevelManifest(levelManifest);

  if (wardrobeManifest.target.sha256 !== preview.targets.wardrobe.sha256) {
    throw new Error('wardrobe target changed between Gate 12G preview and Gate 11 staging');
  }
  if (levelManifest.target.sha256 !== preview.targets.levels.sha256) {
    throw new Error('level target changed between Gate 12G preview and Gate 11 staging');
  }

  const tempDir = outputDir + '.tmp-' + process.pid + '-' + Date.now();
  mkdirSync(tempDir, { recursive: true });
  try {
    const tempWardrobeInput = join(tempDir, 'wardrobe-input.json');
    const tempWardrobeManifest = join(tempDir, 'wardrobe-manifest.json');
    const tempLevelInput = join(tempDir, 'levels-input.json');
    const tempLevelManifest = join(tempDir, 'levels-manifest.json');

    writeFileSync(tempWardrobeInput, wardrobeInputText, 'utf8');
    writeFileSync(tempWardrobeManifest, JSON.stringify(wardrobeManifest, null, 2) + '\n', 'utf8');
    writeFileSync(tempLevelInput, levelInputText, 'utf8');
    writeFileSync(tempLevelManifest, JSON.stringify(levelManifest, null, 2) + '\n', 'utf8');

    const bundle = {
      formatVersion: APPLY_READY_STAGING_FORMAT_VERSION,
      kind: APPLY_READY_STAGING_KIND,
      sessionId: session.id,
      generatedAt: generatedAt.toISOString(),
      generationFingerprint: fingerprint,
      sessionDependencyFingerprint: beforeSessionFingerprint,
      sessionUpdatedAt: session.updatedAt,
      mode: 'staging-only',
      sourceSnapshotHashes: cloneJson(session.sourceSnapshot.hashes),
      targets: cloneJson(preview.targets),
      gate12: {
        diffSummary: cloneJson(preview.summary),
        review: {
          conflictCount: review.conflictCount,
          reviewedCount: review.reviewedCount,
          unresolvedCount: review.unresolvedCount,
          staleDecisionCount: review.staleDecisionCount,
        },
        wardrobeActions: cloneJson(wardrobe.actions),
        levelActions: cloneJson(levels.actions),
      },
      gate11: {
        wardrobe: {
          summary: cloneJson(wardrobeManifest.summary),
          requiresConflictAcceptance: wardrobeManifest.summary.conflictRows > 0,
          approvedConflictKeys: wardrobeManifest.entries
            .filter(entry => entry.status === 'conflict')
            .map(entry => entry.key),
        },
        levels: {
          summary: cloneJson(levelManifest.summary),
          requiresConflictAcceptance: levelManifest.summary.conflictEntries > 0,
          approvedConflictEntries: levelManifest.entries
            .filter(entry => entry.status === 'conflict')
            .map(entry => ({ table: entry.table, key: entry.key })),
        },
      },
      artifacts: {
        wardrobeInput: {
          path: portablePath(finalWardrobeInput),
          relativeToBundle: 'wardrobe-input.json',
          sha256: sha256(wardrobeInputText),
        },
        wardrobeManifest: {
          path: portablePath(finalWardrobeManifest),
          relativeToBundle: 'wardrobe-manifest.json',
          sha256: sha256(JSON.stringify(wardrobeManifest, null, 2) + '\n'),
        },
        levelInput: {
          path: portablePath(finalLevelInput),
          relativeToBundle: 'levels-input.json',
          sha256: sha256(levelInputText),
        },
        levelManifest: {
          path: portablePath(finalLevelManifest),
          relativeToBundle: 'levels-manifest.json',
          sha256: sha256(JSON.stringify(levelManifest, null, 2) + '\n'),
        },
      },
    };

    writeFileSync(join(tempDir, 'bundle.json'), JSON.stringify(bundle, null, 2) + '\n', 'utf8');
    mkdirSync(resolve(outputDir, '..'), { recursive: true });
    renameSync(tempDir, outputDir);

    const wardrobePreview = buildWardrobePreview(wardrobeManifest, {
      targetPath: preview.targets.wardrobe.path,
    });
    const levelPreview = buildLevelPreview(levelManifest, {
      targetPath: preview.targets.levels.path,
    });
    validateGate11Previews(wardrobePreview, levelPreview);

    assertTargetStillMatches(preview.targets.wardrobe);
    assertTargetStillMatches(preview.targets.levels);
    assertSessionUnchanged(beforeSessionFingerprint, session.id, workspace);

    const bundlePath = join(outputDir, 'bundle.json');
    const persistedBundle = JSON.parse(readFileSync(bundlePath, 'utf8'));
    for (const [name, artifact] of Object.entries(persistedBundle.artifacts)) {
      const path = join(outputDir, artifact.relativeToBundle);
      const actual = artifactDescriptor(path, outputDir);
      if (actual.sha256 !== artifact.sha256) {
        throw new Error('persisted Gate 12I artifact hash mismatch: ' + name);
      }
    }

    return {
      outputDir,
      bundlePath,
      bundle: persistedBundle,
      reused: false,
    };
  } catch (error) {
    if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
    if (existsSync(outputDir)) rmSync(outputDir, { recursive: true, force: true });
    throw error;
  }
}
