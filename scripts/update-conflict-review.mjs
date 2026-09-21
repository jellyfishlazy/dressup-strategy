import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { wardrobeRowErrors } from '../src/domain/wardrobe/adapter.mjs';
import {
  LEVEL_METADATA_TABLES,
  levelEntryErrors,
} from './level-pipeline.mjs';
import {
  DEFAULT_UPDATE_WORKSPACE,
  getCurrentSession,
  loadUpdateSession,
  saveUpdateSession,
} from './update-session.mjs';
import { buildUpdateDiffPreview } from './update-diff-preview.mjs';

export const CONFLICT_DECISIONS = Object.freeze([
  'keep-local',
  'use-source',
  'manual-resolution',
]);

const REVIEW_FORMAT_VERSION = 1;
const REVIEW_KIND = 'gate12-conflict-review';
const DECISION_KIND = 'gate12-conflict-decision';
const DOMAIN_SET = new Set(['wardrobe', 'levels']);
const LEVEL_MANUAL_TABLES = new Set([
  'themeFilter',
  'levelsRaw',
  ...LEVEL_METADATA_TABLES,
]);

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

function canonicalIso(value) {
  return typeof value === 'string'
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value;
}

function reviewIdentity(domain, sourceKey) {
  return domain + '|' + sourceKey;
}

function targetForDomain(preview, domain) {
  return domain === 'wardrobe' ? preview.targets.wardrobe : preview.targets.levels;
}

function currentConflictItems(preview) {
  return [
    ...preview.wardrobe.items,
    ...preview.levels.items,
  ].filter(item => item.status === 'conflict');
}

function findCurrentConflict(preview, domain, sourceKey) {
  return currentConflictItems(preview).find(
    item => item.domain === domain && item.sourceKey === sourceKey,
  ) || null;
}

function conflictFingerprint(preview, item) {
  const target = targetForDomain(preview, item.domain);
  return sha256(stableStringify({
    version: 1,
    domain: item.domain,
    sourceKey: item.sourceKey,
    targetKey: item.targetKey,
    conflictKind: item.conflictKind,
    targetSha256: target.sha256,
    conflict: item,
  }));
}

function sessionDependencyFingerprint(session) {
  return sha256(stableStringify({
    id: session.id,
    status: session.status,
    sourceSnapshot: session.sourceSnapshot,
    plan: session.plan,
    collection: session.collection,
  }));
}

function readSession(options = {}) {
  const workspace = options.workspace || DEFAULT_UPDATE_WORKSPACE;
  const session = options.sessionId === undefined
    ? getCurrentSession({ workspace })
    : loadUpdateSession(options.sessionId, { workspace });
  if (!session) throw new Error('no current update session');
  assertValidReviewContainer(session);
  return session;
}

function assertDraft(session) {
  if (session.status !== 'draft') {
    throw new Error('only draft sessions can change conflict decisions');
  }
}

function decisionArray(session) {
  return session.review?.conflictDecisions || [];
}

function ensureReview(session) {
  if (!session.review) {
    session.review = {
      formatVersion: REVIEW_FORMAT_VERSION,
      kind: REVIEW_KIND,
      conflictDecisions: [],
    };
  }
  return session.review;
}

function decisionErrors(record) {
  const errors = [];
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return ['decision must be an object'];
  }
  if (record.kind !== DECISION_KIND) errors.push('invalid decision kind');
  if (record.formatVersion !== REVIEW_FORMAT_VERSION) errors.push('invalid decision formatVersion');
  if (!DOMAIN_SET.has(record.domain)) errors.push('invalid decision domain');
  if (typeof record.sourceKey !== 'string' || !record.sourceKey.trim()) errors.push('invalid decision sourceKey');
  if (record.previewTargetKey !== null
    && (typeof record.previewTargetKey !== 'string' || !record.previewTargetKey.trim())) {
    errors.push('invalid previewTargetKey');
  }
  if (record.resolvedTargetKey !== null
    && (typeof record.resolvedTargetKey !== 'string' || !record.resolvedTargetKey.trim())) {
    errors.push('invalid resolvedTargetKey');
  }
  if (typeof record.conflictKind !== 'string' || !record.conflictKind.trim()) errors.push('invalid conflictKind');
  if (!CONFLICT_DECISIONS.includes(record.decision)) errors.push('invalid decision');
  if (typeof record.previewFingerprint !== 'string'
    || !/^[0-9a-f]{64}$/i.test(record.previewFingerprint)) {
    errors.push('invalid previewFingerprint');
  }
  if (typeof record.targetSha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(record.targetSha256)) {
    errors.push('invalid targetSha256');
  }
  if (!canonicalIso(record.decidedAt)) errors.push('invalid decidedAt');
  if (typeof record.note !== 'string') errors.push('invalid note');
  if (record.decision === 'keep-local' && record.resolvedPayload !== null) {
    errors.push('keep-local must not have resolvedPayload');
  }
  if (record.decision !== 'keep-local' && (!record.resolvedPayload || typeof record.resolvedPayload !== 'object')) {
    errors.push(record.decision + ' requires resolvedPayload');
  }
  return errors;
}

function validateWardrobeResolution(payload) {
  const errors = [];
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return ['wardrobe resolution must be an object'];
  }
  if (payload.kind !== 'wardrobe-row') errors.push('wardrobe resolution kind must be wardrobe-row');
  if (typeof payload.targetKey !== 'string' || !/^[^|]+\|[^|]+$/.test(payload.targetKey)) {
    errors.push('wardrobe resolution targetKey must be exact type|id');
  }
  if (!Array.isArray(payload.row)) {
    errors.push('wardrobe resolution row must be an array');
    return errors;
  }
  errors.push(...wardrobeRowErrors(payload.row));
  if (errors.length) return errors;
  const rowKey = String(payload.row[1]) + '|' + String(payload.row[2]);
  if (rowKey !== payload.targetKey) errors.push('wardrobe resolution row identity does not match targetKey');
  return errors;
}

function validateLevelResolution(payload) {
  const errors = [];
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return ['level resolution must be an object'];
  }
  if (payload.kind !== 'level-entries') errors.push('level resolution kind must be level-entries');
  if (typeof payload.targetKey !== 'string' || !payload.targetKey.trim()) {
    errors.push('level resolution targetKey must be a nonempty string');
  }
  if (!Array.isArray(payload.entries) || !payload.entries.length) {
    errors.push('level resolution entries must be a nonempty array');
    return errors;
  }

  const seen = new Set();
  let hasPrimary = false;
  for (const entry of payload.entries) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      errors.push('level resolution entry must be an object');
      continue;
    }
    if (!LEVEL_MANUAL_TABLES.has(entry.table)) {
      errors.push('unsupported manual level table: ' + entry.table);
      continue;
    }
    const identity = entry.table + '|' + entry.key;
    if (seen.has(identity)) errors.push('duplicate manual level entry: ' + identity);
    seen.add(identity);
    errors.push(...levelEntryErrors(entry).map(message => identity + ': ' + message));

    if (entry.table === 'levelsRaw') {
      if (entry.key !== payload.targetKey) {
        errors.push('levelsRaw manual key must match targetKey');
      }
      hasPrimary = true;
    } else if (entry.table !== 'themeFilter' && entry.key !== payload.targetKey) {
      errors.push(entry.table + ' manual key must match targetKey');
    }
  }
  if (!hasPrimary) errors.push('level resolution requires one levelsRaw entry for targetKey');
  return errors;
}

function resolutionErrors(domain, payload) {
  return domain === 'wardrobe'
    ? validateWardrobeResolution(payload)
    : validateLevelResolution(payload);
}

function assertResolution(domain, payload) {
  const errors = resolutionErrors(domain, payload);
  if (errors.length) throw new Error('invalid manual resolution: ' + errors.join('; '));
  return payload;
}

function levelSourceResolution(item) {
  if (!item.targetKey || !item.candidate) {
    throw new Error('use-source is not available for this level conflict');
  }
  const conflicts = Array.isArray(item.conflicts) ? item.conflicts : [];
  if (conflicts.some(conflict => conflict.kind === 'source-metadata-absent')) {
    throw new Error('use-source cannot safely represent source metadata deletion; use keep-local or manual-resolution');
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
  return {
    kind: 'level-entries',
    targetKey: item.targetKey,
    entries,
  };
}

function sourceResolution(item) {
  if (item.domain === 'wardrobe') {
    if (item.conflictKind !== 'localized-field-difference'
      || !item.targetKey
      || !Array.isArray(item.candidateRow)) {
      throw new Error('use-source is not available for this wardrobe conflict');
    }
    return {
      kind: 'wardrobe-row',
      targetKey: item.targetKey,
      row: cloneJson(item.candidateRow),
    };
  }
  return levelSourceResolution(item);
}

function resolvedTargetKey(decision, payload, item) {
  if (decision === 'keep-local') return item.targetKey ?? null;
  return payload.targetKey;
}

function sameStoredDecision(a, b) {
  if (!a || !b) return false;
  const compact = value => ({
    formatVersion: value.formatVersion,
    kind: value.kind,
    domain: value.domain,
    sourceKey: value.sourceKey,
    previewTargetKey: value.previewTargetKey,
    resolvedTargetKey: value.resolvedTargetKey,
    conflictKind: value.conflictKind,
    decision: value.decision,
    previewFingerprint: value.previewFingerprint,
    targetSha256: value.targetSha256,
    resolvedPayload: value.resolvedPayload,
    note: value.note,
  });
  return stableStringify(compact(a)) === stableStringify(compact(b));
}

function targetStillMatches(preview, domain) {
  const target = targetForDomain(preview, domain);
  const current = readFileSync(target.path, 'utf8');
  return sha256(current) === target.sha256;
}

function decorateDecision(decision, preview) {
  const item = findCurrentConflict(preview, decision.domain, decision.sourceKey);
  if (!item) {
    return {
      ...cloneJson(decision),
      state: 'obsolete',
      staleReasons: ['item is no longer a current Gate 12G conflict'],
    };
  }

  const target = targetForDomain(preview, decision.domain);
  const fingerprint = conflictFingerprint(preview, item);
  const reasons = [];
  if (decision.previewFingerprint !== fingerprint) reasons.push('conflict fingerprint changed');
  if (decision.targetSha256 !== target.sha256) reasons.push('target SHA-256 changed');
  if (decision.previewTargetKey !== (item.targetKey ?? null)) reasons.push('preview target identity changed');
  if (decision.conflictKind !== item.conflictKind) reasons.push('conflict kind changed');

  return {
    ...cloneJson(decision),
    state: reasons.length ? 'stale' : 'current',
    staleReasons: reasons,
  };
}

export function assertValidReviewContainer(session) {
  if (session.review === undefined) return null;
  const review = session.review;
  const errors = [];
  if (!review || typeof review !== 'object' || Array.isArray(review)) {
    throw new Error('invalid conflict review container: review must be an object');
  }
  if (review.formatVersion !== REVIEW_FORMAT_VERSION) errors.push('invalid review formatVersion');
  if (review.kind !== REVIEW_KIND) errors.push('invalid review kind');
  if (!Array.isArray(review.conflictDecisions)) {
    errors.push('review.conflictDecisions must be an array');
  } else {
    const seen = new Set();
    for (const record of review.conflictDecisions) {
      const identity = reviewIdentity(record?.domain, record?.sourceKey);
      if (seen.has(identity)) errors.push('duplicate conflict decision: ' + identity);
      seen.add(identity);
      errors.push(...decisionErrors(record).map(message => identity + ': ' + message));
      if (record?.decision === 'use-source' || record?.decision === 'manual-resolution') {
        errors.push(...resolutionErrors(record.domain, record.resolvedPayload)
          .map(message => identity + ': ' + message));
        if (record.resolvedPayload?.targetKey !== record.resolvedTargetKey) {
          errors.push(identity + ': resolvedTargetKey does not match payload targetKey');
        }
      }
    }
  }
  if (errors.length) throw new Error('invalid conflict review container: ' + errors.join('; '));
  return review;
}

export async function listConflictReview(options = {}) {
  const session = readSession(options);
  const preview = await buildUpdateDiffPreview({
    ...options,
    sessionId: session.id,
  });
  const saved = new Map(
    decisionArray(session).map(record => [reviewIdentity(record.domain, record.sourceKey), record]),
  );

  const conflicts = currentConflictItems(preview).map(item => {
    const identity = reviewIdentity(item.domain, item.sourceKey);
    const decision = saved.get(identity);
    const decorated = decision ? decorateDecision(decision, preview) : null;
    return {
      domain: item.domain,
      sourceKey: item.sourceKey,
      targetKey: item.targetKey,
      conflictKind: item.conflictKind,
      reasons: cloneJson(item.reasons || []),
      differences: cloneJson(item.differences || []),
      conflicts: cloneJson(item.conflicts || []),
      fingerprint: conflictFingerprint(preview, item),
      decision: decorated,
      reviewed: decorated?.state === 'current',
    };
  });

  const currentIdentities = new Set(
    conflicts.map(item => reviewIdentity(item.domain, item.sourceKey)),
  );
  const nonCurrentDecisions = decisionArray(session)
    .filter(record => !currentIdentities.has(reviewIdentity(record.domain, record.sourceKey)))
    .map(record => decorateDecision(record, preview));

  const unresolved = conflicts.filter(item => !item.reviewed);
  const stale = [
    ...conflicts.map(item => item.decision).filter(decision => decision?.state === 'stale'),
    ...nonCurrentDecisions.filter(decision => decision.state === 'stale'),
  ];

  return {
    sessionId: session.id,
    sessionStatus: session.status,
    completeness: preview.completeness,
    conflictCount: conflicts.length,
    reviewedCount: conflicts.filter(item => item.reviewed).length,
    unresolvedCount: unresolved.length,
    staleDecisionCount: stale.length,
    conflicts,
    nonCurrentDecisions,
    readyForNextGate: preview.completeness.complete
      && unresolved.length === 0
      && stale.length === 0,
  };
}

export async function listConflictDecisions(options = {}) {
  const session = readSession(options);
  const preview = await buildUpdateDiffPreview({
    ...options,
    sessionId: session.id,
  });
  return {
    sessionId: session.id,
    sessionStatus: session.status,
    count: decisionArray(session).length,
    decisions: decisionArray(session).map(record => decorateDecision(record, preview)),
  };
}

export async function showConflictDecision(options = {}) {
  if (!DOMAIN_SET.has(options.domain)) throw new Error('show requires domain=wardrobe|levels');
  if (typeof options.sourceKey !== 'string' || !options.sourceKey.trim()) {
    throw new Error('show requires a nonempty sourceKey');
  }
  const listed = await listConflictDecisions(options);
  const decision = listed.decisions.find(
    record => record.domain === options.domain && record.sourceKey === options.sourceKey,
  );
  if (!decision) throw new Error('conflict decision not found');
  return decision;
}

export async function saveConflictDecision(options = {}) {
  if (!DOMAIN_SET.has(options.domain)) throw new Error('set requires domain=wardrobe|levels');
  if (typeof options.sourceKey !== 'string' || !options.sourceKey.trim()) {
    throw new Error('set requires a nonempty sourceKey');
  }
  if (!CONFLICT_DECISIONS.includes(options.decision)) {
    throw new Error('set requires decision=' + CONFLICT_DECISIONS.join('|'));
  }
  if (options.note !== undefined && typeof options.note !== 'string') {
    throw new Error('note must be a string');
  }

  const before = readSession(options);
  assertDraft(before);
  const dependency = sessionDependencyFingerprint(before);

  const preview = await buildUpdateDiffPreview({
    ...options,
    sessionId: before.id,
  });
  const item = findCurrentConflict(preview, options.domain, options.sourceKey);
  if (!item) throw new Error('decision can only be saved for a current Gate 12G conflict');

  if (!targetStillMatches(preview, options.domain)) {
    throw new Error('preview target changed during decision review; rerun Gate 12G and retry');
  }

  let payload = null;
  if (options.decision === 'use-source') {
    payload = sourceResolution(item);
    assertResolution(options.domain, payload);
  } else if (options.decision === 'manual-resolution') {
    payload = cloneJson(options.resolvedPayload);
    assertResolution(options.domain, payload);
  } else if (options.resolvedPayload !== undefined && options.resolvedPayload !== null) {
    throw new Error('keep-local does not accept resolvedPayload');
  }

  const workspace = options.workspace || DEFAULT_UPDATE_WORKSPACE;
  const session = loadUpdateSession(before.id, { workspace });
  assertValidReviewContainer(session);
  assertDraft(session);
  if (sessionDependencyFingerprint(session) !== dependency) {
    throw new Error('update session changed during conflict review; retry');
  }

  const target = targetForDomain(preview, item.domain);
  const record = {
    formatVersion: REVIEW_FORMAT_VERSION,
    kind: DECISION_KIND,
    domain: item.domain,
    sourceKey: item.sourceKey,
    previewTargetKey: item.targetKey ?? null,
    resolvedTargetKey: resolvedTargetKey(options.decision, payload, item),
    conflictKind: item.conflictKind,
    decision: options.decision,
    previewFingerprint: conflictFingerprint(preview, item),
    targetSha256: target.sha256,
    resolvedPayload: payload,
    note: String(options.note || ''),
    decidedAt: (options.now instanceof Date ? options.now : new Date()).toISOString(),
  };

  const review = ensureReview(session);
  const identity = reviewIdentity(record.domain, record.sourceKey);
  const index = review.conflictDecisions.findIndex(
    saved => reviewIdentity(saved.domain, saved.sourceKey) === identity,
  );

  if (index >= 0 && sameStoredDecision(review.conflictDecisions[index], record)) {
    return {
      session,
      decision: cloneJson(review.conflictDecisions[index]),
      changed: false,
    };
  }

  if (index >= 0) review.conflictDecisions[index] = record;
  else review.conflictDecisions.push(record);
  assertValidReviewContainer(session);
  const saved = saveUpdateSession(session, {
    workspace,
    ...(options.now instanceof Date ? { now: options.now } : {}),
  });
  return {
    session: saved,
    decision: cloneJson(record),
    changed: true,
  };
}

export function removeConflictDecision(options = {}) {
  if (!DOMAIN_SET.has(options.domain)) throw new Error('remove requires domain=wardrobe|levels');
  if (typeof options.sourceKey !== 'string' || !options.sourceKey.trim()) {
    throw new Error('remove requires a nonempty sourceKey');
  }
  const session = readSession(options);
  assertDraft(session);
  const decisions = decisionArray(session);
  const identity = reviewIdentity(options.domain, options.sourceKey);
  const index = decisions.findIndex(
    record => reviewIdentity(record.domain, record.sourceKey) === identity,
  );
  if (index < 0) {
    return { session, removed: false, decision: null };
  }

  const [removed] = decisions.splice(index, 1);
  const workspace = options.workspace || DEFAULT_UPDATE_WORKSPACE;
  const saved = saveUpdateSession(session, { workspace });
  return {
    session: saved,
    removed: true,
    decision: cloneJson(removed),
  };
}

export function clearConflictDecisions(options = {}) {
  const session = readSession(options);
  assertDraft(session);
  const decisions = decisionArray(session);
  if (!decisions.length) return { session, removedCount: 0 };
  const removedCount = decisions.length;
  session.review.conflictDecisions = [];
  const workspace = options.workspace || DEFAULT_UPDATE_WORKSPACE;
  const saved = saveUpdateSession(session, { workspace });
  return { session: saved, removedCount };
}

export function loadManualResolutionFile(path) {
  if (typeof path !== 'string' || !path.trim()) throw new Error('resolution file path is required');
  const absolute = resolve(path);
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(absolute, 'utf8'));
  } catch (error) {
    throw new Error('manual resolution file must be valid JSON: ' + error.message);
  }
  return parsed;
}
