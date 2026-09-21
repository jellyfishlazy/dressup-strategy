#!/usr/bin/env node

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  completePostApplyCloseout,
  verifyPostApplyCloseout,
} from './update-closeout.mjs';

export const UPDATE_CLOSEOUT_HELP = `Gate 12K — Apply 後驗證 / Session 收尾

先驗證 Gate 12J apply 結果：
  npm run data:session:closeout -- verify --report=<gate12j-report.json>

成功會回傳：
  readyToComplete: true
  closeoutFingerprint: <SHA-256>

正式完成 session：
  npm run data:session:closeout -- complete \
    --report=<gate12j-report.json> \
    --confirm=<closeoutFingerprint>

Gate 12K 會重新確認：
  - Gate 12J / Gate 11 apply report 與 authorization 未被竄改
  - Gate 12I bundle / artifacts 與目前 session fingerprint 相符
  - Gate 12F plan 仍完整
  - Gate 12H staged review 當時已全數核准
  - canonical wardrobe / levels SHA 等於 Gate 11 apply 後 SHA
  - staging manifest 的每個結果仍實際存在於 canonical target
  - generated data 仍 fresh
  - repository regression 再次 PASS

共用選項：
  --report=<path>       必填，Gate 12J 成功 apply 的 gate12j-report.json
  --session=<id>        可選；提供時必須與 report 一致
  --workspace=<path>    update workspace override

complete 專用：
  --confirm=<closeoutFingerprint>

驗證 report 會保存於：
  .update-workspace/sessions/<id>/closeout/<generation>/<fingerprint>.json

只有全部 post-apply checks 通過，且 complete 帶回同一 closeout fingerprint，
Gate 12K 才會把 draft session 標成 completed 並清掉 current pointer。
`;

export function parseUpdateCloseoutArgs(argv) {
  if (!Array.isArray(argv) || argv.some(arg => typeof arg !== 'string')) {
    throw new Error('arguments must be an array of strings');
  }
  if (argv.length === 1 && ['--help', '-h', 'help'].includes(argv[0])) {
    return { command: 'help' };
  }

  const [command = 'verify', ...args] = argv;
  if (!['verify', 'complete'].includes(command)) {
    throw new Error('unknown command: ' + command);
  }
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    return { command: 'help' };
  }

  const allowed = {
    report: 'applyReportPath',
    session: 'sessionId',
    workspace: 'workspace',
    ...(command === 'complete' ? { confirm: 'confirm' } : {}),
  };
  const options = { command };
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
    if (['report', 'workspace'].includes(key)) parsed = resolve(value);
    options[allowed[key]] = parsed;
  }

  if (!options.applyReportPath) {
    throw new Error(command + ' requires --report=<gate12j-report.json>');
  }
  if (command === 'complete' && !options.confirm) {
    throw new Error('complete requires --confirm=<closeoutFingerprint>');
  }
  return options;
}

export async function runUpdateCloseoutCli(options = { command: 'verify' }) {
  if (options.command === 'help') {
    console.log(UPDATE_CLOSEOUT_HELP);
    return null;
  }

  const result = options.command === 'complete'
    ? await completePostApplyCloseout(options)
    : await verifyPostApplyCloseout(options);
  console.log(JSON.stringify(result, null, 2));
  return result;
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    await runUpdateCloseoutCli(parseUpdateCloseoutArgs(process.argv.slice(2)));
  } catch (error) {
    console.error('[Update Closeout] ERROR: ' + error.message);
    process.exitCode = 1;
  }
}
