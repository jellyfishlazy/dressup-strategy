import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { resolveExternalDataSource } from './external-data-source.mjs';
import {
  guidedWardrobeManualOptions,
  projectGuidedWardrobeCollection,
  resolveGuidedWardrobeBatch,
  searchGuidedWardrobe,
} from './guided-wardrobe-search.mjs';
import {
  DEFAULT_UPDATE_WORKSPACE,
  cancelUpdateSession,
  createUpdateSession,
  getCurrentSession,
  listUpdateSessions,
  setCurrentSession,
} from './update-session.mjs';
import {
  addManualWardrobeToUpdate,
  addWardrobeToUpdate,
  listUpdateWardrobe,
  removeWardrobeFromUpdate,
} from './update-wardrobe.mjs';
import {
  addLevelsToUpdate,
  listUpdateLevels,
  removeLevelsFromUpdate,
  searchUpdateLevels,
} from './update-levels.mjs';
import {
  addManualPlannedWardrobe,
  addPlannedItems,
  checkUpdateCompleteness,
  listUpdatePlan,
  removePlannedItems,
} from './update-completeness.mjs';
import { buildUpdateDiffPreview } from './update-diff-preview.mjs';
import {
  listConflictReview,
  removeConflictDecision,
  saveConflictDecision,
} from './update-conflict-review.mjs';
import {
  DEFAULT_APPLY_READY_OUTPUT_ROOT,
  generateApplyReadyStaging,
} from './update-staging.mjs';
import { runSessionReviewApply } from './update-review-apply.mjs';
import {
  completePostApplyCloseout,
  verifyPostApplyCloseout,
} from './update-closeout.mjs';

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function compactSession(session) {
  if (!session) return null;
  return {
    id: session.id,
    name: session.name,
    note: session.note,
    status: session.status,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    completedAt: session.completedAt || null,
    cancelledAt: session.cancelledAt || null,
    closeout: cloneJson(session.closeout || null),
  };
}

function exactKeys(value, label) {
  if (!Array.isArray(value) || value.length === 0
    || value.some(key => typeof key !== 'string' || !key.trim())) {
    throw new Error(label + ' must be a nonempty array of exact keys');
  }
  return [...new Set(value)];
}

function findLatestApplyReport(outputRoot, sessionId) {
  const sessionRoot = join(resolve(outputRoot), sessionId);
  if (!existsSync(sessionRoot)) return null;
  const candidates = [];

  for (const generation of readdirSync(sessionRoot, { withFileTypes: true })) {
    if (!generation.isDirectory()) continue;
    const runsRoot = join(sessionRoot, generation.name, 'gate12j-runs');
    if (!existsSync(runsRoot)) continue;
    for (const run of readdirSync(runsRoot, { withFileTypes: true })) {
      if (!run.isDirectory()) continue;
      const reportPath = join(runsRoot, run.name, 'gate12j-report.json');
      if (!existsSync(reportPath) || !statSync(reportPath).isFile()) continue;
      try {
        const report = JSON.parse(readFileSync(reportPath, 'utf8'));
        if (report?.kind !== 'gate12-review-apply'
          || report?.mode !== 'apply'
          || report?.status !== 'applied'
          || report?.sessionId !== sessionId) continue;
        candidates.push({
          path: reportPath,
          completedAt: report.completedAt || '',
          generationFingerprint: report.generationFingerprint,
        });
      } catch {
        // Ignore malformed historical artifacts here; closeout validation remains strict.
      }
    }
  }

  candidates.sort((a, b) =>
    b.completedAt.localeCompare(a.completedAt) || b.path.localeCompare(a.path)
  );
  return candidates[0] || null;
}

function sourceStatus(sourceOptions) {
  try {
    const resolved = resolveExternalDataSource(sourceOptions);
    return {
      ready: true,
      sourceRoot: resolved.sourceRoot,
      sameRoot: resolved.sameRoot,
      wardrobePath: resolved.wardrobePath,
      levelsPath: resolved.levelsPath,
      error: null,
    };
  } catch (error) {
    return {
      ready: false,
      sourceRoot: null,
      sameRoot: false,
      wardrobePath: null,
      levelsPath: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function compactState(workspace, outputRoot, sourceOptions, canonicalWardrobePath) {
  const sessions = listUpdateSessions({ workspace }).map(compactSession);
  const current = getCurrentSession({ workspace });
  if (!current) {
    return {
      source: sourceStatus(sourceOptions),
      current: null,
      sessions,
      completeness: null,
      plan: null,
      collection: null,
      latestApplyReport: null,
    };
  }

  const common = { workspace, sessionId: current.id };
  const rawWardrobe = listUpdateWardrobe(common).items;
  let projectedWardrobe;
  let wardrobeOptions = { categories: [], tags: [] };
  try {
    [projectedWardrobe, wardrobeOptions] = await Promise.all([
      projectGuidedWardrobeCollection({
        session: current,
        canonicalWardrobePath,
      }),
      guidedWardrobeManualOptions({
        session: current,
        canonicalWardrobePath,
      }),
    ]);
  } catch {
    projectedWardrobe = rawWardrobe.map(item => ({
      origin: item.origin || 'external',
      key: item.key,
      displayKey: item.key,
      name: item.name,
      category: item.category,
      id: item.id,
      suit: String(item.coreRow?.[16] ?? ''),
      source: String(item.coreRow?.[15] ?? ''),
      tags: String(item.coreRow?.[14] ?? ''),
      version: String(item.coreRow?.[17] ?? ''),
      original: null,
    }));
  }
  return {
    source: sourceStatus(sourceOptions),
    current: compactSession(current),
    sessions,
    completeness: checkUpdateCompleteness(common),
    plan: (() => {
      const plan = listUpdatePlan(common);
      return {
        wardrobe: plan.wardrobe.map(item => ({
          origin: item.origin || 'external',
          key: item.key, name: item.name, category: item.category, id: item.id,
        })),
        levels: plan.levels.map(item => ({
          key: item.key, runtimeLabel: item.runtimeLabel,
        })),
      };
    })(),
    wardrobeOptions,
    collection: {
      wardrobe: projectedWardrobe,
      levels: listUpdateLevels(common).items.map(item => ({
        key: item.key, runtimeLabel: item.runtimeLabel,
      })),
    },
    latestApplyReport: findLatestApplyReport(outputRoot, current.id),
  };
}

export function createGuidedUpdateService({
  workspace = DEFAULT_UPDATE_WORKSPACE,
  outputRoot = DEFAULT_APPLY_READY_OUTPUT_ROOT,
  runRoot = null,
  sourceOptions = {},
  canonicalWardrobePath = null,
} = {}) {
  const actualWorkspace = resolve(workspace);
  const actualOutputRoot = resolve(outputRoot);
  const actualRunRoot = runRoot ? resolve(runRoot) : null;
  const actualCanonicalWardrobePath = canonicalWardrobePath ? resolve(canonicalWardrobePath) : undefined;
  let mutationQueue = Promise.resolve();

  function currentSession() {
    const current = getCurrentSession({ workspace: actualWorkspace });
    if (!current) throw new Error('尚未建立或啟用本次更新');
    return current;
  }

  function currentId() {
    return currentSession().id;
  }

  function common() {
    return { workspace: actualWorkspace, sessionId: currentId() };
  }

  function serializeMutation(task) {
    const next = mutationQueue.then(task, task);
    mutationQueue = next.catch(() => {});
    return next;
  }

  async function collectWardrobe(keys) {
    const requested = exactKeys(keys, 'wardrobe keys');
    const base = common();
    const beforePlan = new Set(listUpdatePlan(base).wardrobe.map(item => item.key));
    const planResult = addPlannedItems({ ...base, wardrobeKeys: requested });
    const newlyPlanned = planResult.added.wardrobe.filter(key => !beforePlan.has(key));
    try {
      const collection = addWardrobeToUpdate({ ...base, keys: requested });
      return {
        planned: planResult.added.wardrobe,
        collected: collection.addedKeys,
        skipped: collection.skippedKeys,
      };
    } catch (error) {
      if (newlyPlanned.length) {
        try {
          removePlannedItems({ ...base, wardrobeKeys: newlyPlanned });
        } catch (rollbackError) {
          throw new Error(error.message + '; plan rollback failed: ' + rollbackError.message);
        }
      }
      throw error;
    }
  }

  async function collectManualWardrobe(row) {
    const base = common();
    const planResult = addManualPlannedWardrobe({ ...base, row });
    const newlyPlanned = planResult.added.wardrobe;
    try {
      const collection = addManualWardrobeToUpdate({ ...base, row });
      return {
        planned: planResult.added.wardrobe,
        collected: collection.addedKeys,
        skipped: collection.skippedKeys,
      };
    } catch (error) {
      if (newlyPlanned.length) {
        try {
          removePlannedItems({ ...base, wardrobeKeys: newlyPlanned });
        } catch (rollbackError) {
          throw new Error(error.message + '; manual plan rollback failed: ' + rollbackError.message);
        }
      }
      throw error;
    }
  }

  async function collectLevels(keys) {
    const requested = exactKeys(keys, 'level keys');
    const base = common();
    const beforePlan = new Set(listUpdatePlan(base).levels.map(item => item.key));
    const planResult = addPlannedItems({ ...base, levelKeys: requested });
    const newlyPlanned = planResult.added.levels.filter(key => !beforePlan.has(key));
    try {
      const collection = addLevelsToUpdate({ ...base, keys: requested });
      return {
        planned: planResult.added.levels,
        collected: collection.addedKeys,
        skipped: collection.skippedKeys,
      };
    } catch (error) {
      if (newlyPlanned.length) {
        try {
          removePlannedItems({ ...base, levelKeys: newlyPlanned });
        } catch (rollbackError) {
          throw new Error(error.message + '; plan rollback failed: ' + rollbackError.message);
        }
      }
      throw error;
    }
  }

  async function removeWardrobe(keys) {
    const requested = exactKeys(keys, 'wardrobe keys');
    const base = common();
    const before = new Map(listUpdateWardrobe(base).items.map(item => [item.key, cloneJson(item)]));
    const removedCollection = removeWardrobeFromUpdate({ ...base, keys: requested });
    try {
      const removedPlan = removePlannedItems({ ...base, wardrobeKeys: requested });
      return {
        collection: removedCollection.removedKeys,
        plan: removedPlan.removed.wardrobe,
      };
    } catch (error) {
      if (removedCollection.removedKeys.length) {
        try {
          const external = [];
          for (const key of removedCollection.removedKeys) {
            const item = before.get(key);
            if (item?.origin === 'manual') addManualWardrobeToUpdate({ ...base, row: item.coreRow });
            else external.push(key);
          }
          if (external.length) addWardrobeToUpdate({ ...base, keys: external });
        } catch (rollbackError) {
          throw new Error(error.message + '; collection rollback failed: ' + rollbackError.message);
        }
      }
      throw error;
    }
  }

  async function removeLevels(keys) {
    const requested = exactKeys(keys, 'level keys');
    const base = common();
    const removedCollection = removeLevelsFromUpdate({ ...base, keys: requested });
    try {
      const removedPlan = removePlannedItems({ ...base, levelKeys: requested });
      return {
        collection: removedCollection.removedKeys,
        plan: removedPlan.removed.levels,
      };
    } catch (error) {
      if (removedCollection.removedKeys.length) {
        try {
          addLevelsToUpdate({ ...base, keys: removedCollection.removedKeys });
        } catch (rollbackError) {
          throw new Error(error.message + '; collection rollback failed: ' + rollbackError.message);
        }
      }
      throw error;
    }
  }

  async function dispatch(action, payload = {}) {
    const body = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};

    switch (action) {
      case 'state':
        return compactState(actualWorkspace, actualOutputRoot, sourceOptions, actualCanonicalWardrobePath);
      case 'session.create':
        return serializeMutation(() => compactSession(createUpdateSession({
          name: body.name,
          note: body.note || '',
          workspace: actualWorkspace,
          sourceOptions,
        })));
      case 'session.activate':
        return serializeMutation(() => compactSession(setCurrentSession(body.id, {
          workspace: actualWorkspace,
        })));
      case 'session.cancel':
        return serializeMutation(() => compactSession(cancelUpdateSession(
          body.id || currentId(),
          { workspace: actualWorkspace },
        )));
      case 'wardrobe.search':
        return searchGuidedWardrobe({
          session: currentSession(),
          filters: body.filters || body,
          offset: body.offset ?? 0,
          limit: body.limit ?? 50,
          canonicalWardrobePath: actualCanonicalWardrobePath,
        });
      case 'wardrobe.collect':
        return serializeMutation(() => collectWardrobe(body.keys));
      case 'wardrobe.manual-add':
        return serializeMutation(() => collectManualWardrobe(body.row));
      case 'wardrobe.collect-search':
        return serializeMutation(async () => {
          const batch = await resolveGuidedWardrobeBatch({
            session: currentSession(),
            filters: body.filters || {},
            searchFingerprint: body.searchFingerprint,
            canonicalWardrobePath: actualCanonicalWardrobePath,
          });
          const collected = batch.eligibleKeys.length
            ? await collectWardrobe(batch.eligibleKeys)
            : { planned: [], collected: [], skipped: [] };
          return {
            searchFingerprint: batch.searchFingerprint,
            matched: batch.matched,
            added: collected.collected.length,
            planned: collected.planned.length,
            alreadyCollected: batch.alreadyCollectedKeys.length,
            nonselectable: batch.nonselectableItems.length,
            skippedDuringCollect: collected.skipped.length,
            nonselectableItems: batch.nonselectableItems,
          };
        });
      case 'wardrobe.remove':
        return serializeMutation(() => removeWardrobe(body.keys));
      case 'levels.search':
        return searchUpdateLevels({ ...common(), ...body, limit: body.limit || 50 });
      case 'levels.collect':
        return serializeMutation(() => collectLevels(body.keys));
      case 'levels.remove':
        return serializeMutation(() => removeLevels(body.keys));
      case 'completeness':
        return checkUpdateCompleteness(common());
      case 'diff':
        return buildUpdateDiffPreview(common());
      case 'review':
        return listConflictReview(common());
      case 'review.save':
        return serializeMutation(() => saveConflictDecision({
          ...common(),
          domain: body.domain,
          sourceKey: body.sourceKey,
          decision: body.decision,
          note: body.note || '',
          ...(body.decision === 'manual-resolution'
            ? { resolvedPayload: body.resolvedPayload }
            : {}),
        }));
      case 'review.remove':
        return serializeMutation(() => removeConflictDecision({
          ...common(),
          domain: body.domain,
          sourceKey: body.sourceKey,
        }));
      case 'stage': {
        const result = await generateApplyReadyStaging({
          ...common(),
          outputRoot: actualOutputRoot,
        });
        return {
          outputDir: result.outputDir,
          reused: result.reused,
          generationFingerprint: result.bundle.generationFingerprint,
          gate12: cloneJson(result.bundle.gate12),
          gate11: cloneJson(result.bundle.gate11),
        };
      }
      case 'apply.preview': {
        const result = await runSessionReviewApply({
          ...common(),
          apply: false,
          outputRoot: actualOutputRoot,
          ...(actualRunRoot ? { runRoot: actualRunRoot } : {}),
        });
        return {
          reportPath: result.reportPath,
          status: result.report.status,
          readyForApply: result.report.readyForApply,
          confirmFingerprint: result.report.confirmFingerprint,
          preview: cloneJson(result.report.preview),
          authorization: cloneJson(result.report.authorization),
          gate11: cloneJson(result.report.gate11),
        };
      }
      case 'apply.execute': {
        if (typeof body.confirm !== 'string' || !body.confirm.trim()) {
          throw new Error('缺少 Apply 確認 fingerprint');
        }
        const result = await serializeMutation(() => runSessionReviewApply({
          ...common(),
          apply: true,
          confirm: body.confirm,
          outputRoot: actualOutputRoot,
          ...(actualRunRoot ? { runRoot: actualRunRoot } : {}),
        }));
        return {
          reportPath: result.reportPath,
          status: result.report.status,
          generationFingerprint: result.report.generationFingerprint,
          gate11: cloneJson(result.report.gate11),
        };
      }
      case 'closeout.verify': {
        const latest = body.applyReportPath
          ? { path: resolve(body.applyReportPath) }
          : findLatestApplyReport(actualOutputRoot, currentId());
        if (!latest?.path) throw new Error('找不到成功的 Gate 12J Apply report');
        const result = await verifyPostApplyCloseout({
          ...common(),
          applyReportPath: latest.path,
        });
        return {
          reportPath: result.reportPath,
          status: result.report.status,
          readyToComplete: result.readyToComplete,
          closeoutFingerprint: result.closeoutFingerprint,
          semantics: cloneJson(result.report.semantics),
        };
      }
      case 'closeout.complete': {
        if (typeof body.confirm !== 'string' || !body.confirm.trim()) {
          throw new Error('缺少 Closeout 確認 fingerprint');
        }
        const latest = body.applyReportPath
          ? { path: resolve(body.applyReportPath) }
          : findLatestApplyReport(actualOutputRoot, currentId());
        if (!latest?.path) throw new Error('找不到成功的 Gate 12J Apply report');
        const result = await serializeMutation(() => completePostApplyCloseout({
          ...common(),
          applyReportPath: latest.path,
          confirm: body.confirm,
        }));
        return {
          session: compactSession(result.session),
          reportPath: result.reportPath,
          closeoutFingerprint: result.closeoutFingerprint,
        };
      }
      default:
        throw new Error('未知的 Guided Update action: ' + action);
    }
  }

  return {
    dispatch,
    state: () => compactState(actualWorkspace, actualOutputRoot, sourceOptions, actualCanonicalWardrobePath),
    workspace: actualWorkspace,
    outputRoot: actualOutputRoot,
  };
}
