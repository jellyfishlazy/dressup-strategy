#!/usr/bin/env node

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSessionReviewApply } from './update-review-apply.mjs';

export const UPDATE_REVIEW_APPLY_HELP = `Gate 12J — Review / Apply 整合

先重新執行 Gate 11 preview（唯讀）：
  npm run data:session:apply -- preview

Preview 成功時會回傳：
  readyForApply: true
  confirmFingerprint: <generation-fingerprint>

正式 apply 必須帶回相同 fingerprint：
  npm run data:session:apply -- apply --confirm=<generation-fingerprint>

Gate 12J 會：
  1. 重新產生／驗證 Gate 12I staging
  2. 重跑 Gate 11 wardrobe / level preview
  3. 確認 Gate 11 conflict 集合「完全等於」Gate 12I bundle 核准集合
  4. apply 時只對這些已授權 conflict 開啟 Gate 11 acceptance
  5. 沿用 Gate 11F backup / rollback / derived rebuild / regression

共用選項：
  --session=<session-id>
  --workspace=<path>
  --wardrobe-target=<path>   唯讀/測試 target override
  --levels-target=<path>     唯讀/測試 target override
  --output-root=<path>       Gate 12I staging root override
  --run-root=<path>          Gate 12J run report root override

apply 專用：
  --confirm=<generation-fingerprint>

Gate 12J 不提供 --accept-conflicts。
Conflict acceptance 只能來自 Gate 12I bundle 的精確 identity 授權。
Preview 不寫 canonical；Apply 才可能寫入，並受 Gate 11F rollback/regression 保護。
`;

export function parseUpdateReviewApplyArgs(argv) {
  if (!Array.isArray(argv) || argv.some(arg => typeof arg !== 'string')) {
    throw new Error('arguments must be an array of strings');
  }
  if (argv.length === 1 && ['--help', '-h', 'help'].includes(argv[0])) {
    return { command: 'help' };
  }

  const [command = 'preview', ...args] = argv;
  if (!['preview', 'apply'].includes(command)) {
    throw new Error('unknown command: ' + command);
  }
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    return { command: 'help' };
  }

  const allowed = {
    session: 'sessionId',
    workspace: 'workspace',
    'wardrobe-target': 'wardrobeTargetPath',
    'levels-target': 'levelsTargetPath',
    'output-root': 'outputRoot',
    'run-root': 'runRoot',
    ...(command === 'apply' ? { confirm: 'confirm' } : {}),
  };
  const options = { command, apply: command === 'apply' };
  const seen = new Set();

  for (const arg of args) {
    const match = /^--([^=]+)=(.*)$/s.exec(arg);
    if (!match) throw new Error('expected --option=value: ' + arg);
    const [, key, value] = match;
    if (!Object.hasOwn(allowed, key)) {
      throw new Error('unknown option for ' + command + ': --' + key);
    }
    if (seen.has(key)) throw new Error('duplicate option: --' + key);
    seen.add(key);
    if (!value.trim()) throw new Error('--' + key + ' must not be empty');

    let parsed = value;
    if (['workspace', 'wardrobe-target', 'levels-target', 'output-root', 'run-root'].includes(key)) {
      parsed = resolve(value);
    }
    options[allowed[key]] = parsed;
  }

  if (command === 'apply' && !options.confirm) {
    throw new Error('apply requires --confirm=<generation-fingerprint>');
  }
  return options;
}

export async function runUpdateReviewApplyCli(options = { command: 'preview', apply: false }) {
  if (options.command === 'help') {
    console.log(UPDATE_REVIEW_APPLY_HELP);
    return null;
  }

  const result = await runSessionReviewApply(options);
  console.log(JSON.stringify({
    reportPath: result.reportPath,
    runDir: result.runDir,
    report: result.report,
  }, null, 2));
  return result;
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    await runUpdateReviewApplyCli(parseUpdateReviewApplyArgs(process.argv.slice(2)));
  } catch (error) {
    console.error('[Update Review/Apply] ERROR: ' + error.message);
    process.exitCode = 1;
  }
}
