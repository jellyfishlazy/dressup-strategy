#!/usr/bin/env node

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_UPDATE_WORKSPACE,
  cancelUpdateSession,
  completeUpdateSession,
  createUpdateSession,
  getCurrentSession,
  listUpdateSessions,
  loadUpdateSession,
  setCurrentSession,
} from './update-session.mjs';

function parseArgs(argv) {
  const [command = 'current', ...rest] = argv;
  const options = { command };

  for (const arg of rest) {
    if (arg.startsWith('--name=')) options.name = arg.slice('--name='.length);
    else if (arg.startsWith('--note=')) options.note = arg.slice('--note='.length);
    else if (arg.startsWith('--id=')) options.id = arg.slice('--id='.length);
    else if (arg.startsWith('--workspace=')) options.workspace = resolve(arg.slice('--workspace='.length));
    else if (arg.startsWith('--wardrobe=')) options.wardrobePath = resolve(arg.slice('--wardrobe='.length));
    else if (arg.startsWith('--levels=')) options.levelsPath = resolve(arg.slice('--levels='.length));
    else throw new Error('unknown option: ' + arg);
  }

  return options;
}

function sessionLine(session, currentId = null) {
  const marker = session.id === currentId ? '*' : ' ';
  return [
    marker,
    session.id,
    '[' + session.status + ']',
    session.name,
    session.createdAt,
  ].join(' ');
}

function printSession(session) {
  console.log(JSON.stringify({
    id: session.id,
    name: session.name,
    note: session.note,
    status: session.status,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    completedAt: session.completedAt || null,
    cancelledAt: session.cancelledAt || null,
    sourceSnapshot: session.sourceSnapshot,
    plan: session.plan,
    collection: session.collection,
  }, null, 2));
}

export function runUpdateSessionCli(options) {
  const workspace = options.workspace || DEFAULT_UPDATE_WORKSPACE;

  if (options.command === 'create') {
    const session = createUpdateSession({
      name: options.name,
      note: options.note || '',
      workspace,
      sourceOptions: {
        wardrobePath: options.wardrobePath || null,
        levelsPath: options.levelsPath || null,
      },
    });
    console.log('[Update Session] CREATED: ' + session.id);
    printSession(session);
    return session;
  }

  if (options.command === 'list') {
    const current = getCurrentSession({ workspace });
    const sessions = listUpdateSessions({ workspace });
    if (!sessions.length) {
      console.log('[Update Session] no sessions');
      return sessions;
    }
    for (const session of sessions) console.log(sessionLine(session, current?.id || null));
    return sessions;
  }

  if (options.command === 'current') {
    const session = getCurrentSession({ workspace });
    if (!session) {
      console.log('[Update Session] no current session');
      return null;
    }
    printSession(session);
    return session;
  }

  if (!options.id) throw new Error('--id is required for ' + options.command);

  if (options.command === 'show') {
    const session = loadUpdateSession(options.id, { workspace });
    printSession(session);
    return session;
  }

  if (options.command === 'activate') {
    const session = setCurrentSession(options.id, { workspace });
    console.log('[Update Session] CURRENT: ' + session.id);
    return session;
  }

  if (options.command === 'complete') {
    const session = completeUpdateSession(options.id, { workspace });
    console.log('[Update Session] COMPLETED: ' + session.id);
    return session;
  }

  if (options.command === 'cancel') {
    const session = cancelUpdateSession(options.id, { workspace });
    console.log('[Update Session] CANCELLED: ' + session.id);
    return session;
  }

  throw new Error('unknown command: ' + options.command);
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    runUpdateSessionCli(parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error('[Update Session] ERROR: ' + error.message);
    process.exitCode = 1;
  }
}
