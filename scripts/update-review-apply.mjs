import {
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import {
  buildWardrobePreview,
} from './wardrobe-apply.mjs';
import {
  buildLevelPreview,
} from './level-pipeline.mjs';
import { runDataUpdate } from './data-update.mjs';
import { generateApplyReadyStaging } from './update-staging.mjs';

export const REVIEW_APPLY_FORMAT_VERSION = 1;
export const REVIEW_APPLY_KIND = 'gate12-review-apply';

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function safeStamp(date) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function artifactPath(staging, name) {
  const artifact = staging.bundle.artifacts?.[name];
  if (!artifact?.relativeToBundle) {
    throw new Error('Gate 12I bundle is missing artifact descriptor: ' + name);
  }
  return join(staging.outputDir, artifact.relativeToBundle);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function sorted(values) {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function sameStrings(a, b) {
  return JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
}

function wardrobeConflictKeys(preview) {
  return preview.entries
    .filter(entry => entry.derivedStatus === 'conflict')
    .map(entry => entry.key);
}

function levelConflictKeys(preview) {
  return preview.entries
    .filter(entry => entry.status === 'conflict')
    .map(entry => entry.table + '|' + entry.key);
}

function approvedLevelKeys(bundle) {
  return (bundle.gate11?.levels?.approvedConflictEntries || [])
    .map(entry => entry.table + '|' + entry.key);
}

function hardPreviewErrors(wardrobePreview, levelPreview) {
  const errors = [];

  errors.push(...wardrobePreview.integrityErrors.map(error => 'wardrobe integrity: ' + error));
  if (wardrobePreview.manifestBlockingErrors) errors.push('wardrobe manifest has blocking errors');
  if (wardrobePreview.stale) errors.push('wardrobe target changed after Gate 12I staging');
  if (wardrobePreview.ambiguousTargetKeys.length) {
    errors.push('ambiguous wardrobe target identities: ' + wardrobePreview.ambiguousTargetKeys.join(', '));
  }
  if (wardrobePreview.summary.invalidRows || wardrobePreview.summary.duplicateRows) {
    errors.push('wardrobe preview contains invalid/duplicate rows');
  }

  errors.push(...levelPreview.integrityErrors.map(error => 'level integrity: ' + error));
  if (levelPreview.stale) errors.push('level target changed after Gate 12I staging');
  if (levelPreview.blockingErrors.length) {
    errors.push(...levelPreview.blockingErrors.map(error => 'level blocking: ' + JSON.stringify(error)));
  }
  if (levelPreview.summary.invalidEntries || levelPreview.summary.duplicateEntries) {
    errors.push('level preview contains invalid/duplicate entries');
  }
  return errors;
}

function verifyConflictAuthorization(bundle, wardrobePreview, levelPreview) {
  const actualWardrobe = wardrobeConflictKeys(wardrobePreview);
  const approvedWardrobe = bundle.gate11?.wardrobe?.approvedConflictKeys || [];
  const actualLevels = levelConflictKeys(levelPreview);
  const approvedLevels = approvedLevelKeys(bundle);

  if (!sameStrings(actualWardrobe, approvedWardrobe)) {
    throw new Error(
      'wardrobe Gate 11 conflict set does not match Gate 12I authorization; actual='
      + JSON.stringify(sorted(actualWardrobe))
      + '; approved=' + JSON.stringify(sorted(approvedWardrobe)),
    );
  }
  if (!sameStrings(actualLevels, approvedLevels)) {
    throw new Error(
      'level Gate 11 conflict set does not match Gate 12I authorization; actual='
      + JSON.stringify(sorted(actualLevels))
      + '; approved=' + JSON.stringify(sorted(approvedLevels)),
    );
  }

  const wardrobeRequires = actualWardrobe.length > 0;
  const levelRequires = actualLevels.length > 0;
  if (!!bundle.gate11?.wardrobe?.requiresConflictAcceptance !== wardrobeRequires) {
    throw new Error('wardrobe conflict-acceptance metadata does not match current Gate 11 preview');
  }
  if (!!bundle.gate11?.levels?.requiresConflictAcceptance !== levelRequires) {
    throw new Error('level conflict-acceptance metadata does not match current Gate 11 preview');
  }

  return {
    wardrobe: {
      actual: sorted(actualWardrobe),
      approved: sorted(approvedWardrobe),
      accept: wardrobeRequires,
    },
    levels: {
      actual: sorted(actualLevels),
      approved: sorted(approvedLevels),
      accept: levelRequires,
    },
  };
}

function compactPreview(wardrobePreview, levelPreview) {
  return {
    wardrobe: {
      target: wardrobePreview.target.id,
      targetPath: wardrobePreview.targetPath,
      targetSha256: wardrobePreview.currentSha256,
      stale: wardrobePreview.stale,
      summary: cloneJson(wardrobePreview.summary),
    },
    levels: {
      target: levelPreview.target.id,
      targetPath: levelPreview.targetPath,
      targetSha256: levelPreview.currentSha256,
      stale: levelPreview.stale,
      summary: cloneJson(levelPreview.summary),
    },
  };
}

function writeJson(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

export async function runSessionReviewApply(
  options = {},
  {
    dataUpdateRunner = runDataUpdate,
    regressionRunner,
    derivedRebuilder,
    derivedChecker,
  } = {},
) {
  const mode = options.apply ? 'apply' : 'preview';
  if (options.confirm !== undefined && typeof options.confirm !== 'string') {
    throw new Error('confirm must be a string');
  }

  const now = options.now instanceof Date ? options.now : new Date();
  if (Number.isNaN(now.getTime())) throw new Error('invalid Gate 12J time');

  const staging = await generateApplyReadyStaging(options);
  const bundle = staging.bundle;

  if (mode === 'apply') {
    if (!options.confirm) {
      throw new Error(
        'apply requires explicit --confirm=<generation-fingerprint>; preview the current bundle first',
      );
    }
    if (options.confirm !== bundle.generationFingerprint) {
      throw new Error(
        'apply confirmation fingerprint does not match current Gate 12I staging; expected '
        + bundle.generationFingerprint,
      );
    }
  } else if (options.confirm) {
    throw new Error('confirm is valid only for apply mode');
  }

  const wardrobeInput = artifactPath(staging, 'wardrobeInput');
  const wardrobeManifestPath = artifactPath(staging, 'wardrobeManifest');
  const levelInput = artifactPath(staging, 'levelInput');
  const levelManifestPath = artifactPath(staging, 'levelManifest');
  const wardrobeManifest = readJson(wardrobeManifestPath);
  const levelManifest = readJson(levelManifestPath);

  const wardrobeTargetPath = options.wardrobeTargetPath
    ? resolve(options.wardrobeTargetPath)
    : bundle.targets.wardrobe.path;
  const levelsTargetPath = options.levelsTargetPath
    ? resolve(options.levelsTargetPath)
    : bundle.targets.levels.path;

  const wardrobePreview = buildWardrobePreview(wardrobeManifest, {
    targetPath: wardrobeTargetPath,
  });
  const levelPreview = buildLevelPreview(levelManifest, {
    targetPath: levelsTargetPath,
  });
  const hardErrors = hardPreviewErrors(wardrobePreview, levelPreview);
  if (hardErrors.length) {
    throw new Error('Gate 12J preflight failed: ' + hardErrors.join('; '));
  }

  const authorization = verifyConflictAuthorization(
    bundle,
    wardrobePreview,
    levelPreview,
  );

  const runRoot = resolve(options.runRoot || join(staging.outputDir, 'gate12j-runs'));
  const runDir = join(
    runRoot,
    safeStamp(now) + '-' + mode + '-' + process.pid + '-' + Date.now(),
  );
  mkdirSync(runDir, { recursive: true });

  const authorizationPath = join(runDir, 'gate12j-authorization.json');
  writeJson(authorizationPath, {
    formatVersion: REVIEW_APPLY_FORMAT_VERSION,
    kind: 'gate12-conflict-authorization',
    sessionId: bundle.sessionId,
    generationFingerprint: bundle.generationFingerprint,
    mode,
    authorizedAt: now.toISOString(),
    authorization,
  });

  const targetOverrides = {
    wardrobe: wardrobeTargetPath,
    'main-levels': levelsTargetPath,
    ...(options.targetOverrides || {}),
  };

  const updateOptions = {
    wardrobeInput,
    wardrobeTarget: 'wardrobe',
    levelInput,
    levelTarget: 'main-levels',
    apply: mode === 'apply',
    acceptConflicts: false,
    acceptWardrobeConflicts: mode === 'apply' && authorization.wardrobe.accept,
    acceptLevelConflicts: mode === 'apply' && authorization.levels.accept,
    now,
    runDir,
    targetOverrides,
    generatedTargetOverrides: options.generatedTargetOverrides || {},
    derivedInputOverrides: options.derivedInputOverrides || {},
  };

  const services = {};
  if (regressionRunner !== undefined) services.regressionRunner = regressionRunner;
  if (derivedRebuilder !== undefined) services.derivedRebuilder = derivedRebuilder;
  if (derivedChecker !== undefined) services.derivedChecker = derivedChecker;

  let gate11;
  try {
    gate11 = await dataUpdateRunner(updateOptions, services);
  } catch (error) {
    const report = {
      formatVersion: REVIEW_APPLY_FORMAT_VERSION,
      kind: REVIEW_APPLY_KIND,
      sessionId: bundle.sessionId,
      generationFingerprint: bundle.generationFingerprint,
      mode,
      status: 'failed',
      completedAt: new Date().toISOString(),
      staging: {
        outputDir: staging.outputDir,
        bundlePath: staging.bundlePath,
        reused: staging.reused,
      },
      preview: compactPreview(wardrobePreview, levelPreview),
      authorization,
      authorizationPath,
      error: error.message,
    };
    writeJson(join(runDir, 'gate12j-report.json'), report);
    throw error;
  }

  if (!gate11?.ok) {
    throw new Error('Gate 11 review/apply returned a non-ready result');
  }

  const expectedPreviewStatus = authorization.wardrobe.accept || authorization.levels.accept
    ? 'review-required'
    : 'ready';
  if (mode === 'preview' && gate11.report?.status !== expectedPreviewStatus) {
    throw new Error(
      'unexpected Gate 11 preview status: ' + gate11.report?.status
      + '; expected ' + expectedPreviewStatus,
    );
  }
  if (mode === 'apply' && gate11.report?.status !== 'applied') {
    throw new Error('Gate 11 apply did not reach applied status');
  }

  const report = {
    formatVersion: REVIEW_APPLY_FORMAT_VERSION,
    kind: REVIEW_APPLY_KIND,
    sessionId: bundle.sessionId,
    generationFingerprint: bundle.generationFingerprint,
    mode,
    status: mode === 'apply' ? 'applied' : 'ready',
    completedAt: new Date().toISOString(),
    staging: {
      outputDir: staging.outputDir,
      bundlePath: staging.bundlePath,
      reused: staging.reused,
    },
    preview: compactPreview(wardrobePreview, levelPreview),
    authorization,
    authorizationPath,
    gate11: {
      reportPath: gate11.reportPath,
      status: gate11.report.status,
      expectedPreviewStatus: mode === 'preview' ? expectedPreviewStatus : null,
      changedSourceIds: cloneJson(gate11.report.changedSourceIds || []),
      applies: cloneJson(gate11.report.applies || {}),
      derived: cloneJson(gate11.report.derived || []),
      regression: cloneJson(gate11.report.regression),
      generatedFreshness: cloneJson(gate11.report.generatedFreshness),
      rollback: cloneJson(gate11.report.rollback),
    },
    readyForApply: mode === 'preview',
    confirmFingerprint: mode === 'preview' ? bundle.generationFingerprint : null,
  };
  const reportPath = join(runDir, 'gate12j-report.json');
  writeJson(reportPath, report);

  return {
    report,
    reportPath,
    runDir,
    staging,
    gate11,
  };
}
