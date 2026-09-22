#!/usr/bin/env node

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  clearConflictDecisions,
  listConflictDecisions,
  listConflictReview,
  loadManualResolutionFile,
  removeConflictDecision,
  saveConflictDecision,
  showConflictDecision,
} from './update-conflict-review.mjs';

const COMMANDS = new Set(['conflicts', 'list', 'show', 'set', 'remove', 'clear']);

export const UPDATE_CONFLICT_REVIEW_HELP = `Gate 12H — 衝突審查 / 決策保存

列出目前 Gate 12G conflicts 與審查狀態：
  npm run data:session:review -- conflicts

列出已保存決策：
  npm run data:session:review -- list

查看單一決策：
  npm run data:session:review -- show --domain=wardrobe --source-key="來源分類|001"

保存決策：
  npm run data:session:review -- set --domain=wardrobe --source-key="來源分類|001" --decision=keep-local
  npm run data:session:review -- set --domain=wardrobe --source-key="來源分類|001" --decision=use-source
  npm run data:session:review -- set --domain=wardrobe --source-key="來源分類|001" --decision=manual-resolution --resolution-file=resolution.json

刪除／清空決策：
  npm run data:session:review -- remove --domain=wardrobe --source-key="來源分類|001"
  npm run data:session:review -- clear

決策：
  keep-local         保留本地，不套用來源 conflict
  use-source         採用 Gate 12G 的來源 candidate；只有可安全表示的 conflict 才允許
  manual-resolution  使用人工提供的 JSON resolution

共用選項：
  --session=<session-id>
  --workspace=<path>
  --wardrobe-target=<path>   唯讀 target override（測試 / 稽核）
  --levels-target=<path>     唯讀 target override（測試 / 稽核）

set 選項：
  --domain=wardrobe|levels
  --source-key=<exact source key>
  --decision=keep-local|use-source|manual-resolution
  --note=<optional note>
  --resolution-file=<path>   僅 manual-resolution 使用

決策會綁定當下 conflict fingerprint 與 target SHA-256。
若 canonical target、mapping 或 conflict 內容後續改變，舊決策會標記為 stale。
只有 draft session 可新增、修改、刪除或清空決策。
Gate 12H 不會修改 canonical 資料，也不會執行 staging / apply。
`;

function commonAllowed() {
  return {
    session: 'sessionId',
    workspace: 'workspace',
    'wardrobe-target': 'wardrobeTargetPath',
    'levels-target': 'levelsTargetPath',
  };
}

export function parseUpdateConflictReviewArgs(argv) {
  if (!Array.isArray(argv) || argv.some(arg => typeof arg !== 'string')) {
    throw new Error('arguments must be an array of strings');
  }
  if (argv.length === 1 && ['--help', '-h', 'help'].includes(argv[0])) {
    return { command: 'help' };
  }

  const [command = 'conflicts', ...args] = argv;
  if (!COMMANDS.has(command)) throw new Error('unknown command: ' + command);
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) return { command: 'help' };

  const options = { command };
  const seen = new Set();
  const allowed = {
    ...commonAllowed(),
    ...(['show', 'set', 'remove'].includes(command)
      ? { domain: 'domain', 'source-key': 'sourceKey' }
      : {}),
    ...(command === 'set'
      ? {
        decision: 'decision',
        note: 'note',
        'resolution-file': 'resolutionFile',
      }
      : {}),
  };

  for (const arg of args) {
    const match = /^--([^=]+)=(.*)$/s.exec(arg);
    if (!match) throw new Error('expected --option=value: ' + arg);
    const [, key, value] = match;
    if (!Object.hasOwn(allowed, key)) throw new Error('unknown option for ' + command + ': --' + key);
    if (seen.has(key)) throw new Error('duplicate option: --' + key);
    seen.add(key);

    if (key !== 'note' && !value.trim()) throw new Error('--' + key + ' must not be empty');
    let parsed = value;
    if (['workspace', 'wardrobe-target', 'levels-target', 'resolution-file'].includes(key)) {
      parsed = resolve(value);
    }
    options[allowed[key]] = parsed;
  }

  if (['show', 'set', 'remove'].includes(command)) {
    if (!options.domain) throw new Error(command + ' requires --domain=wardrobe|levels');
    if (!['wardrobe', 'levels'].includes(options.domain)) {
      throw new Error('--domain must be wardrobe or levels');
    }
    if (!options.sourceKey) throw new Error(command + ' requires --source-key=<exact source key>');
  }

  if (command === 'set') {
    if (!options.decision) throw new Error('set requires --decision');
    if (!['keep-local', 'use-source', 'manual-resolution'].includes(options.decision)) {
      throw new Error('invalid --decision');
    }
    if (options.decision === 'manual-resolution' && !options.resolutionFile) {
      throw new Error('manual-resolution requires --resolution-file=<path>');
    }
    if (options.decision !== 'manual-resolution' && options.resolutionFile) {
      throw new Error('--resolution-file is valid only with manual-resolution');
    }
  }

  return options;
}

export async function runUpdateConflictReviewCli(options = { command: 'conflicts' }) {
  if (options.command === 'help') {
    console.log(UPDATE_CONFLICT_REVIEW_HELP);
    return null;
  }

  let result;
  if (options.command === 'conflicts') {
    result = await listConflictReview(options);
  } else if (options.command === 'list') {
    result = await listConflictDecisions(options);
  } else if (options.command === 'show') {
    result = await showConflictDecision(options);
  } else if (options.command === 'set') {
    const resolvedPayload = options.decision === 'manual-resolution'
      ? loadManualResolutionFile(options.resolutionFile)
      : undefined;
    result = await saveConflictDecision({ ...options, resolvedPayload });
  } else if (options.command === 'remove') {
    result = removeConflictDecision(options);
  } else if (options.command === 'clear') {
    result = clearConflictDecisions(options);
  } else {
    throw new Error('unknown command: ' + options.command);
  }

  console.log(JSON.stringify(result, null, 2));
  return result;
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    await runUpdateConflictReviewCli(parseUpdateConflictReviewArgs(process.argv.slice(2)));
  } catch (error) {
    console.error('[Conflict Review] ERROR: ' + error.message);
    process.exitCode = 1;
  }
}
