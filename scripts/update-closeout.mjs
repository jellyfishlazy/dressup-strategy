import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import {
  DEFAULT_UPDATE_WORKSPACE,
  completeUpdateSession,
  loadUpdateSession,
} from './update-session.mjs';
import {
  APPLY_READY_STAGING_FORMAT_VERSION,
  APPLY_READY_STAGING_KIND,
  sessionDependencyFingerprint,
} from './update-staging.mjs';
import {
  REVIEW_APPLY_FORMAT_VERSION,
  REVIEW_APPLY_KIND,
} from './update-review-apply.mjs';
import { checkUpdateCompleteness } from './update-completeness.mjs';
import { assertValidReviewContainer } from './update-conflict-review.mjs';
import {
  assertGeneratedFresh,
  runRepositoryRegression,
} from './data-update.mjs';
import {
  identityKey,
} from './wardrobe-staging.mjs';
import {
  readNormalizedLevelTables,
  validateLevelSource,
} from './level-pipeline.mjs';
import {
  loadWardrobe,
  validateRows,
} from './validate-data.mjs';

export const CLOSEOUT_FORMAT_VERSION = 1;
export const CLOSEOUT_KIND = 'gate12-post-apply-closeout';

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

function sha256Text(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function fileSha(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function readJson(path, label) {
  const absolute = resolve(path);
  if (!existsSync(absolute)) throw new Error(label + ' not found: ' + absolute);
  try {
    return JSON.parse(readFileSync(absolute, 'utf8'));
  } catch (error) {
    throw new Error(label + ' must be valid JSON: ' + error.message);
  }
}

function fsyncFile(path) {
  const fd = openSync(path, 'r+');
  try { fsyncSync(fd); }
  finally { closeSync(fd); }
}

function atomicWriteJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temp = path + '.tmp-' + process.pid + '-' + Date.now();
  try {
    writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', 'utf8');
    fsyncFile(temp);
    renameSync(temp, path);
  } catch (error) {
    if (existsSync(temp)) {
      try { renameSync(temp, temp + '.failed'); }
      catch { /* best-effort evidence preservation */ }
    }
    throw error;
  }
}

function ensureInside(root, path, label) {
  const resolvedRoot = resolve(root);
  const resolvedPath = resolve(path);
  const rel = relative(resolvedRoot, resolvedPath);
  if (rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) {
    throw new Error(label + ' escapes expected root: ' + resolvedPath);
  }
  return resolvedPath;
}

function exactJson(a, b) {
  return stableStringify(a) === stableStringify(b);
}

function sorted(values) {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function assertHex64(value, label) {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/i.test(value)) {
    throw new Error('invalid ' + label);
  }
}

function resolveBundleArtifact(bundleDir, artifact, label) {
  if (!artifact || typeof artifact.relativeToBundle !== 'string') {
    throw new Error('Gate 12I bundle missing artifact: ' + label);
  }
  const path = ensureInside(bundleDir, join(bundleDir, artifact.relativeToBundle), label);
  if (!existsSync(path)) throw new Error('Gate 12I artifact missing: ' + label);
  if (fileSha(path) !== artifact.sha256) {
    throw new Error('Gate 12I artifact SHA mismatch: ' + label);
  }
  return path;
}

function validateApplyReport(report) {
  if (!report || report.formatVersion !== REVIEW_APPLY_FORMAT_VERSION
    || report.kind !== REVIEW_APPLY_KIND) {
    throw new Error('unsupported Gate 12J report');
  }
  if (report.mode !== 'apply' || report.status !== 'applied') {
    throw new Error('Gate 12K requires a successful Gate 12J apply report');
  }
  if (typeof report.sessionId !== 'string' || !report.sessionId.trim()) {
    throw new Error('Gate 12J report missing sessionId');
  }
  assertHex64(report.generationFingerprint, 'Gate 12J generation fingerprint');
  if (report.gate11?.status !== 'applied') {
    throw new Error('Gate 12J report does not contain an applied Gate 11 result');
  }
  if (report.gate11?.rollback?.attempted) {
    throw new Error('Gate 12J apply report indicates rollback was attempted');
  }
  if (report.gate11?.regression?.status !== 'pass') {
    throw new Error('Gate 12J apply report does not contain a passing regression result');
  }
  if (!Array.isArray(report.gate11?.generatedFreshness)) {
    throw new Error('Gate 12J apply report missing generated freshness evidence');
  }
  if (report.gate11.generatedFreshness.some(item => item?.fresh !== true)) {
    throw new Error('Gate 12J apply report contains stale generated data');
  }
  return report;
}

function validateGate11Report(applyReport) {
  const path = resolve(applyReport.gate11.reportPath || '');
  const report = readJson(path, 'Gate 11 run report');
  if (report.kind !== 'data-update-run' || report.status !== 'applied' || report.mode !== 'apply') {
    throw new Error('Gate 11 run report is not a successful apply report');
  }

  const expected = {
    status: applyReport.gate11.status,
    changedSourceIds: applyReport.gate11.changedSourceIds || [],
    applies: applyReport.gate11.applies || {},
    derived: applyReport.gate11.derived || [],
    regression: applyReport.gate11.regression,
    generatedFreshness: applyReport.gate11.generatedFreshness,
    rollback: applyReport.gate11.rollback,
  };
  const actual = {
    status: report.status,
    changedSourceIds: report.changedSourceIds || [],
    applies: report.applies || {},
    derived: report.derived || [],
    regression: report.regression,
    generatedFreshness: report.generatedFreshness,
    rollback: report.rollback,
  };
  if (!exactJson(actual, expected)) {
    throw new Error('Gate 11 run report no longer matches Gate 12J embedded evidence');
  }
  return { path, report, sha256: fileSha(path) };
}

function validateAuthorization(applyReport) {
  const path = resolve(applyReport.authorizationPath || '');
  const authorization = readJson(path, 'Gate 12J authorization');
  if (authorization.kind !== 'gate12-conflict-authorization'
    || authorization.mode !== 'apply'
    || authorization.sessionId !== applyReport.sessionId
    || authorization.generationFingerprint !== applyReport.generationFingerprint) {
    throw new Error('Gate 12J authorization does not match apply report');
  }
  if (!exactJson(authorization.authorization, applyReport.authorization)) {
    throw new Error('Gate 12J authorization content does not match apply report');
  }
  return { path, authorization, sha256: fileSha(path) };
}

function validateBundle(applyReport) {
  const bundlePath = resolve(applyReport.staging?.bundlePath || '');
  const bundle = readJson(bundlePath, 'Gate 12I bundle');
  if (bundle.formatVersion !== APPLY_READY_STAGING_FORMAT_VERSION
    || bundle.kind !== APPLY_READY_STAGING_KIND) {
    throw new Error('unsupported Gate 12I bundle');
  }
  if (bundle.sessionId !== applyReport.sessionId
    || bundle.generationFingerprint !== applyReport.generationFingerprint) {
    throw new Error('Gate 12I bundle identity does not match Gate 12J apply report');
  }
  assertHex64(bundle.sessionDependencyFingerprint, 'Gate 12I session dependency fingerprint');

  const bundleDir = dirname(bundlePath);
  const artifacts = {};
  for (const [name, artifact] of Object.entries(bundle.artifacts || {})) {
    artifacts[name] = resolveBundleArtifact(bundleDir, artifact, name);
  }
  for (const name of ['wardrobeInput', 'wardrobeManifest', 'levelInput', 'levelManifest']) {
    if (!artifacts[name]) throw new Error('Gate 12I bundle missing required artifact: ' + name);
  }

  return {
    path: bundlePath,
    sha256: fileSha(bundlePath),
    bundle,
    bundleDir,
    artifacts,
  };
}

function validateSessionAgainstBundle(session, bundleEvidence) {
  if (session.status !== 'draft') {
    throw new Error('Gate 12K verification requires the update session to remain draft');
  }
  assertValidReviewContainer(session);
  const fingerprint = sessionDependencyFingerprint(session);
  if (fingerprint !== bundleEvidence.bundle.sessionDependencyFingerprint
    || session.updatedAt !== bundleEvidence.bundle.sessionUpdatedAt) {
    throw new Error('update session changed after Gate 12I staging / Gate 12J apply');
  }

  const completeness = checkUpdateCompleteness({
    workspace: bundleEvidence.workspace,
    sessionId: session.id,
  });
  if (!completeness.planDefined || !completeness.complete || completeness.overall.missing !== 0) {
    throw new Error('Gate 12F completeness is no longer complete at closeout');
  }

  const review = bundleEvidence.bundle.gate12?.review;
  if (!review || review.unresolvedCount !== 0 || review.staleDecisionCount !== 0
    || review.reviewedCount !== review.conflictCount) {
    throw new Error('Gate 12I bundle does not contain a fully reviewed Gate 12H state');
  }

  return {
    fingerprint,
    completeness,
    reviewDecisionCount: session.review?.conflictDecisions?.length || 0,
    stagedReview: cloneJson(review),
  };
}

function expectedChangedSourceIds(applies) {
  const ids = [];
  if (applies.wardrobe?.applied) ids.push('wardrobe');
  if (applies.levels?.applied) ids.push('main-levels');
  return sorted(ids);
}

function validateApplyTargets(applyReport, bundleEvidence) {
  const applies = applyReport.gate11.applies || {};
  const changed = sorted(applyReport.gate11.changedSourceIds || []);
  const expectedChanged = expectedChangedSourceIds(applies);
  if (!exactJson(changed, expectedChanged)) {
    throw new Error('Gate 11 changedSourceIds do not match applied domain results');
  }

  const wardrobePath = resolve(applyReport.preview?.wardrobe?.targetPath || '');
  const levelPath = resolve(applyReport.preview?.levels?.targetPath || '');
  if (resolve(bundleEvidence.bundle.targets.wardrobe.path) !== wardrobePath) {
    throw new Error('wardrobe target path differs between Gate 12I bundle and Gate 12J report');
  }
  if (resolve(bundleEvidence.bundle.targets.levels.path) !== levelPath) {
    throw new Error('level target path differs between Gate 12I bundle and Gate 12J report');
  }

  const wardrobeExpected = applies.wardrobe?.afterSha256;
  const levelsExpected = applies.levels?.afterSha256;
  assertHex64(wardrobeExpected, 'Gate 11 wardrobe after SHA');
  assertHex64(levelsExpected, 'Gate 11 levels after SHA');

  const wardrobeActual = fileSha(wardrobePath);
  const levelsActual = fileSha(levelPath);
  if (wardrobeActual !== wardrobeExpected) {
    throw new Error('wardrobe target changed after Gate 12J apply');
  }
  if (levelsActual !== levelsExpected) {
    throw new Error('levels target changed after Gate 12J apply');
  }

  return {
    wardrobe: {
      path: wardrobePath,
      sha256: wardrobeActual,
      applied: !!applies.wardrobe?.applied,
    },
    levels: {
      path: levelPath,
      sha256: levelsActual,
      applied: !!applies.levels?.applied,
    },
  };
}

function validateWardrobeSemantics(path, manifestPath) {
  const rows = loadWardrobe(path);
  if (!Array.isArray(rows)) throw new Error('post-apply wardrobe target did not expose wardrobe array');
  const errors = validateRows(rows, 'data/wardrobe.js', []);
  if (errors.length) {
    throw new Error('post-apply wardrobe validation failed: ' + errors.join('; '));
  }

  const groups = new Map();
  for (const row of rows) {
    const key = identityKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const manifest = readJson(manifestPath, 'Gate 12I wardrobe manifest');
  let checked = 0;
  for (const entry of manifest.entries || []) {
    if (!entry || ['invalid', 'duplicate'].includes(entry.status)) continue;
    const matches = groups.get(entry.key) || [];
    if (matches.length !== 1) {
      throw new Error('post-apply wardrobe identity is not unique/present: ' + entry.key);
    }
    if (!exactJson(matches[0], entry.row)) {
      throw new Error('post-apply wardrobe row does not match staged result: ' + entry.key);
    }
    checked++;
  }
  return { rowCount: rows.length, stagedRowsVerified: checked };
}

function validateLevelSemantics(path, manifestPath) {
  const errors = validateLevelSource(path, {
    baselineSource: 'data/levels.js',
    strictBaseline: false,
  });
  if (errors.length) {
    throw new Error('post-apply level validation failed: ' + errors.join('; '));
  }

  const tables = readNormalizedLevelTables(path);
  const manifest = readJson(manifestPath, 'Gate 12I level manifest');
  let checked = 0;
  for (const entry of manifest.entries || []) {
    if (!entry || ['invalid', 'duplicate'].includes(entry.status)) continue;
    const actual = tables[entry.table]?.[entry.key];
    if (!exactJson(actual, entry.value)) {
      throw new Error('post-apply level entry does not match staged result: '
        + entry.table + '|' + entry.key);
    }
    checked++;
  }
  return { stagedEntriesVerified: checked };
}

function normalizeFreshness(result) {
  if (!Array.isArray(result)) throw new Error('generated freshness recheck must return an array');
  if (result.some(item => item?.fresh !== true)) {
    throw new Error('generated freshness recheck found stale output');
  }
  return cloneJson(result);
}

function normalizeRegression(result) {
  if (!result || result.status !== 'pass') {
    throw new Error('post-apply repository regression did not pass');
  }
  return cloneJson(result);
}

function closeoutFingerprint(evidence) {
  return sha256Text(stableStringify({
    formatVersion: CLOSEOUT_FORMAT_VERSION,
    sessionId: evidence.sessionId,
    sessionUpdatedAt: evidence.sessionUpdatedAt,
    sessionDependencyFingerprint: evidence.sessionDependencyFingerprint,
    generationFingerprint: evidence.generationFingerprint,
    applyReportSha256: evidence.applyReport.sha256,
    gate11ReportSha256: evidence.gate11Report.sha256,
    authorizationSha256: evidence.authorization.sha256,
    bundleSha256: evidence.bundle.sha256,
    targets: evidence.targets,
    completeness: evidence.completeness.overall,
    stagedReview: evidence.stagedReview,
    semantics: evidence.semantics,
    generatedFreshness: evidence.generatedFreshness,
    regression: evidence.regression,
  }));
}

function closeoutReportPath(workspace, sessionId, generationFingerprint, fingerprint) {
  return join(
    resolve(workspace),
    'sessions',
    sessionId,
    'closeout',
    generationFingerprint,
    fingerprint + '.json',
  );
}

function assertEvidenceStillCurrent(evidence) {
  if (fileSha(evidence.applyReport.path) !== evidence.applyReport.sha256) {
    throw new Error('Gate 12J apply report changed after closeout verification');
  }
  if (fileSha(evidence.gate11Report.path) !== evidence.gate11Report.sha256) {
    throw new Error('Gate 11 run report changed after closeout verification');
  }
  if (fileSha(evidence.authorization.path) !== evidence.authorization.sha256) {
    throw new Error('Gate 12J authorization changed after closeout verification');
  }
  if (fileSha(evidence.bundle.path) !== evidence.bundle.sha256) {
    throw new Error('Gate 12I bundle changed after closeout verification');
  }
  if (fileSha(evidence.targets.wardrobe.path) !== evidence.targets.wardrobe.sha256) {
    throw new Error('wardrobe target changed after closeout verification');
  }
  if (fileSha(evidence.targets.levels.path) !== evidence.targets.levels.sha256) {
    throw new Error('levels target changed after closeout verification');
  }
}

export async function verifyPostApplyCloseout(
  options = {},
  {
    regressionRunner = runRepositoryRegression,
    freshnessChecker = assertGeneratedFresh,
  } = {},
) {
  if (typeof options.applyReportPath !== 'string' || !options.applyReportPath.trim()) {
    throw new Error('Gate 12K requires applyReportPath');
  }

  const workspace = resolve(options.workspace || DEFAULT_UPDATE_WORKSPACE);
  const applyReportPath = resolve(options.applyReportPath);
  const applyReport = validateApplyReport(
    readJson(applyReportPath, 'Gate 12J apply report'),
  );
  const applyReportSha = fileSha(applyReportPath);

  const sessionId = options.sessionId || applyReport.sessionId;
  if (sessionId !== applyReport.sessionId) {
    throw new Error('requested session does not match Gate 12J apply report');
  }
  const session = loadUpdateSession(sessionId, { workspace });

  const bundleEvidence = validateBundle(applyReport);
  bundleEvidence.workspace = workspace;
  const sessionEvidence = validateSessionAgainstBundle(session, bundleEvidence);
  const gate11Report = validateGate11Report(applyReport);
  const authorization = validateAuthorization(applyReport);
  const targets = validateApplyTargets(applyReport, bundleEvidence);

  const semantics = {
    wardrobe: validateWardrobeSemantics(
      targets.wardrobe.path,
      bundleEvidence.artifacts.wardrobeManifest,
    ),
    levels: validateLevelSemantics(
      targets.levels.path,
      bundleEvidence.artifacts.levelManifest,
    ),
  };

  const generatedFreshness = normalizeFreshness(await freshnessChecker({
    generatedTargetOverrides: options.generatedTargetOverrides || {},
    derivedInputOverrides: options.derivedInputOverrides || {},
  }));
  const regression = normalizeRegression(await regressionRunner());

  const evidence = {
    formatVersion: CLOSEOUT_FORMAT_VERSION,
    kind: CLOSEOUT_KIND,
    sessionId,
    sessionUpdatedAt: session.updatedAt,
    sessionDependencyFingerprint: sessionEvidence.fingerprint,
    generationFingerprint: applyReport.generationFingerprint,
    applyReport: {
      path: applyReportPath,
      sha256: applyReportSha,
    },
    gate11Report: {
      path: gate11Report.path,
      sha256: gate11Report.sha256,
    },
    authorization: {
      path: authorization.path,
      sha256: authorization.sha256,
    },
    bundle: {
      path: bundleEvidence.path,
      sha256: bundleEvidence.sha256,
    },
    targets,
    completeness: cloneJson(sessionEvidence.completeness),
    reviewDecisionCount: sessionEvidence.reviewDecisionCount,
    stagedReview: cloneJson(sessionEvidence.stagedReview),
    semantics,
    generatedFreshness,
    regression,
  };
  const fingerprint = closeoutFingerprint(evidence);
  const reportPath = closeoutReportPath(
    workspace,
    sessionId,
    applyReport.generationFingerprint,
    fingerprint,
  );
  const verifiedAt = (options.now instanceof Date ? options.now : new Date()).toISOString();
  const report = {
    ...cloneJson(evidence),
    closeoutFingerprint: fingerprint,
    status: 'verified',
    verifiedAt,
    readyToComplete: true,
  };
  atomicWriteJson(reportPath, report);

  return {
    report,
    reportPath,
    closeoutFingerprint: fingerprint,
    readyToComplete: true,
  };
}

export async function completePostApplyCloseout(
  options = {},
  services = {},
) {
  if (typeof options.confirm !== 'string' || !options.confirm.trim()) {
    throw new Error('Gate 12K complete requires confirm=<closeout-fingerprint>');
  }

  const verification = await verifyPostApplyCloseout(options, services);
  if (options.confirm !== verification.closeoutFingerprint) {
    throw new Error(
      'closeout confirmation fingerprint does not match current post-apply verification; expected '
      + verification.closeoutFingerprint,
    );
  }

  const evidence = verification.report;
  assertEvidenceStillCurrent(evidence);

  const workspace = resolve(options.workspace || DEFAULT_UPDATE_WORKSPACE);
  const now = options.now instanceof Date ? options.now : new Date();
  const closeoutSummary = {
    formatVersion: 1,
    kind: 'gate12-closeout-summary',
    generationFingerprint: evidence.generationFingerprint,
    closeoutFingerprint: verification.closeoutFingerprint,
    reportPath: verification.reportPath,
    verifiedAt: evidence.verifiedAt,
  };

  const completed = completeUpdateSession(evidence.sessionId, {
    workspace,
    now,
    expectedUpdatedAt: evidence.sessionUpdatedAt,
    closeout: closeoutSummary,
  });

  const finalReport = {
    ...verification.report,
    status: 'completed',
    readyToComplete: false,
    sessionCompletion: {
      status: completed.status,
      completedAt: completed.completedAt,
      updatedAt: completed.updatedAt,
      closeout: cloneJson(completed.closeout),
    },
  };
  atomicWriteJson(verification.reportPath, finalReport);

  return {
    session: completed,
    report: finalReport,
    reportPath: verification.reportPath,
    closeoutFingerprint: verification.closeoutFingerprint,
  };
}
