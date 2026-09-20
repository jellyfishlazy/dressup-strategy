import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readExternalSourceSnapshot } from './external-source-reader.mjs';

export const UPDATE_SESSION_FORMAT_VERSION = 1;
export const UPDATE_SESSION_KIND = 'game-update-session';
export const UPDATE_SESSION_STATUSES = Object.freeze(['draft', 'completed', 'cancelled']);

const REPO_ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
export const DEFAULT_UPDATE_WORKSPACE = join(REPO_ROOT, '.update-workspace');
const loadedRevisions = new WeakMap();

function validSessionId(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(id);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function safeStamp(date) {
  return date.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
}

function slugify(value) {
  const text = String(value || '').trim();
  const ascii = text
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return ascii || 'update';
}

function nameFingerprint(value) {
  return createHash('sha256').update(String(value || ''), 'utf8').digest('hex').slice(0, 8);
}

function ensureInside(root, path) {
  const resolvedRoot = resolve(root);
  const resolvedPath = resolve(path);
  const rel = relative(resolvedRoot, resolvedPath);
  if (rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) {
    throw new Error('update session path escapes workspace: ' + resolvedPath);
  }
  return resolvedPath;
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
    if (existsSync(temp)) unlinkSync(temp);
    throw error;
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function sessionDir(workspace, id) {
  if (!validSessionId(id)) throw new Error('invalid session id');
  return ensureInside(workspace, join(resolve(workspace), 'sessions', id));
}

function sessionPath(workspace, id) {
  return join(sessionDir(workspace, id), 'session.json');
}

function currentPath(workspace) {
  return join(resolve(workspace), 'current.json');
}

function sourceSnapshotSummary(snapshot) {
  return {
    sourceRoot: snapshot.sourceRoot,
    sameRoot: snapshot.sameRoot,
    files: cloneJson(snapshot.files),
    hashes: cloneJson(snapshot.hashes),
    wardrobe: {
      count: snapshot.wardrobe.count,
      columnLengths: cloneJson(snapshot.wardrobe.columnLengths),
      lastUpdated: snapshot.wardrobe.lastUpdated,
      warnings: snapshot.wardrobe.warnings.length,
    },
    levels: {
      counts: cloneJson(snapshot.levels.counts),
      warnings: snapshot.levels.warnings.length,
    },
    warnings: cloneJson(snapshot.warnings),
  };
}

export function sessionValidationErrors(session) {
  const errors = [];
  if (!session || typeof session !== 'object' || Array.isArray(session)) return ['session must be an object'];
  if (session.formatVersion !== UPDATE_SESSION_FORMAT_VERSION) errors.push('unsupported session formatVersion');
  if (session.kind !== UPDATE_SESSION_KIND) errors.push('invalid session kind');
  if (!validSessionId(session.id)) errors.push('invalid session id');
  if (typeof session.name !== 'string' || !session.name.trim()) errors.push('session name must be a non-empty string');
  if (!UPDATE_SESSION_STATUSES.includes(session.status)) errors.push('invalid session status');
  if (!Number.isFinite(Date.parse(session.createdAt))) errors.push('invalid createdAt');
  if (!Number.isFinite(Date.parse(session.updatedAt))) errors.push('invalid updatedAt');

  if (!session.sourceSnapshot || typeof session.sourceSnapshot !== 'object') {
    errors.push('missing sourceSnapshot');
  } else {
    for (const key of ['wardrobe', 'levels']) {
      const hash = session.sourceSnapshot.hashes?.[key];
      if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/i.test(hash)) {
        errors.push('invalid source hash: ' + key);
      }
    }
  }

  if (!session.plan || typeof session.plan !== 'object') {
    errors.push('missing plan');
  } else {
    if (!Array.isArray(session.plan.wardrobe)) errors.push('plan.wardrobe must be an array');
    if (!Array.isArray(session.plan.levels)) errors.push('plan.levels must be an array');
  }

  if (!session.collection || typeof session.collection !== 'object') {
    errors.push('missing collection');
  } else {
    if (!Array.isArray(session.collection.wardrobe)) errors.push('collection.wardrobe must be an array');
    if (!Array.isArray(session.collection.levels)) errors.push('collection.levels must be an array');
  }

  if (session.status === 'completed' && !Number.isFinite(Date.parse(session.completedAt))) {
    errors.push('completed session requires completedAt');
  }
  if (session.status === 'cancelled' && !Number.isFinite(Date.parse(session.cancelledAt))) {
    errors.push('cancelled session requires cancelledAt');
  }

  return errors;
}

export function assertValidUpdateSession(session) {
  const errors = sessionValidationErrors(session);
  if (errors.length) throw new Error('invalid update session: ' + errors.join('; '));
  return session;
}

export function createUpdateSession({
  name,
  note = '',
  now = new Date(),
  workspace = DEFAULT_UPDATE_WORKSPACE,
  sourceOptions = {},
  sourceSnapshot = null,
} = {}) {
  if (typeof name !== 'string' || !name.trim()) throw new Error('session name is required');
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new Error('invalid session creation time');

  const root = resolve(workspace);
  mkdirSync(join(root, 'sessions'), { recursive: true });

  const id = safeStamp(now) + '-' + slugify(name) + '-' + nameFingerprint(name.trim());
  const path = sessionPath(root, id);
  if (existsSync(path)) throw new Error('update session already exists: ' + id);

  const snapshot = sourceSnapshot || readExternalSourceSnapshot(sourceOptions);
  const session = {
    formatVersion: UPDATE_SESSION_FORMAT_VERSION,
    kind: UPDATE_SESSION_KIND,
    id,
    name: name.trim(),
    note: String(note || ''),
    status: 'draft',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    sourceSnapshot: sourceSnapshotSummary(snapshot),
    plan: {
      wardrobe: [],
      levels: [],
    },
    collection: {
      wardrobe: [],
      levels: [],
    },
  };

  assertValidUpdateSession(session);
  atomicWriteJson(path, session);
  setCurrentSession(id, { workspace: root });
  return loadUpdateSession(id, { workspace: root });
}

export function loadUpdateSession(id, { workspace = DEFAULT_UPDATE_WORKSPACE } = {}) {
  const path = sessionPath(workspace, id);
  if (!existsSync(path)) throw new Error('update session not found: ' + id);
  const bytes = readFileSync(path, 'utf8');
  const session = JSON.parse(bytes);
  assertValidUpdateSession(session);
  if (session.id !== id) throw new Error('session id does not match path');
  loadedRevisions.set(session, { path, bytes });
  return session;
}

export function saveUpdateSession(session, {
  workspace = DEFAULT_UPDATE_WORKSPACE,
  now = new Date(),
} = {}) {
  const copy = cloneJson(session);
  copy.updatedAt = now.toISOString();
  assertValidUpdateSession(copy);
  const path = sessionPath(workspace, copy.id);
  if (!existsSync(path)) throw new Error('update session not found: ' + copy.id);
  const revision = loadedRevisions.get(session);
  if (!revision || revision.path !== path) throw new Error('save requires a freshly loaded session');
  const lock = path + '.lock';
  const token = randomUUID();
  // Never reclaim a lock: an interrupted writer requires manual recovery.
  const fd = openSync(lock, 'wx');
  try {
    writeFileSync(fd, token, 'utf8');
    if (readFileSync(path, 'utf8') !== revision.bytes) throw new Error('stale update session; reload before saving');
    atomicWriteJson(path, copy);
    return loadUpdateSession(copy.id, { workspace });
  } finally {
    closeSync(fd);
    if (existsSync(lock) && readFileSync(lock, 'utf8') === token) unlinkSync(lock);
  }
}

export function listUpdateSessions({ workspace = DEFAULT_UPDATE_WORKSPACE } = {}) {
  const root = resolve(workspace);
  const sessionsRoot = join(root, 'sessions');
  if (!existsSync(sessionsRoot)) return [];

  const out = [];
  for (const entry of readdirSync(sessionsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = join(sessionsRoot, entry.name, 'session.json');
    if (!existsSync(path) || !statSync(path).isFile()) continue;
    const session = loadUpdateSession(entry.name, { workspace: root });
    out.push(session);
  }

  out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return cloneJson(out);
}

export function setCurrentSession(id, { workspace = DEFAULT_UPDATE_WORKSPACE } = {}) {
  const root = resolve(workspace);
  const session = loadUpdateSession(id, { workspace: root });
  if (session.status !== 'draft') {
    throw new Error('only draft sessions can be current: ' + id);
  }
  atomicWriteJson(currentPath(root), {
    formatVersion: 1,
    kind: 'current-game-update-session',
    id,
  });
  return cloneJson(session);
}

export function getCurrentSession({ workspace = DEFAULT_UPDATE_WORKSPACE } = {}) {
  const root = resolve(workspace);
  const path = currentPath(root);
  if (!existsSync(path)) return null;
  const pointer = readJson(path);
  if (!pointer || pointer.kind !== 'current-game-update-session' || typeof pointer.id !== 'string') {
    throw new Error('invalid current update session pointer');
  }
  return loadUpdateSession(pointer.id, { workspace: root });
}

function clearCurrentIfMatches(id, workspace) {
  const path = currentPath(workspace);
  if (!existsSync(path)) return;
  const pointer = readJson(path);
  if (pointer?.id === id) unlinkSync(path);
}

export function completeUpdateSession(id, {
  workspace = DEFAULT_UPDATE_WORKSPACE,
  now = new Date(),
} = {}) {
  const root = resolve(workspace);
  const session = loadUpdateSession(id, { workspace: root });
  if (session.status !== 'draft') throw new Error('only draft sessions can be completed: ' + id);
  session.status = 'completed';
  session.completedAt = now.toISOString();
  const saved = saveUpdateSession(session, { workspace: root, now });
  clearCurrentIfMatches(id, root);
  return saved;
}

export function cancelUpdateSession(id, {
  workspace = DEFAULT_UPDATE_WORKSPACE,
  now = new Date(),
} = {}) {
  const root = resolve(workspace);
  const session = loadUpdateSession(id, { workspace: root });
  if (session.status !== 'draft') throw new Error('only draft sessions can be cancelled: ' + id);
  session.status = 'cancelled';
  session.cancelledAt = now.toISOString();
  const saved = saveUpdateSession(session, { workspace: root, now });
  clearCurrentIfMatches(id, root);
  return saved;
}
