#!/usr/bin/env node

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildUpdateDiffPreview } from './update-diff-preview.mjs';

export const UPDATE_DIFF_HELP = `Gate 12G — 差異預覽

唯讀預覽目前更新與本地 canonical 資料的差異：

  npm run data:session:diff -- preview

預覽分類：

  new        本地沒有對應 target
  modified   已唯一對應，本地資料與來源候選資料不同
  conflict   identity / localization / shared metadata 等需要人工判斷
  unchanged  已唯一對應且目前沒有差異

共用選項：

  --session=<session-id>
  --workspace=<path>

唯讀 target override（測試 / 稽核用途）：

  --wardrobe-target=<path>
  --levels-target=<path>

Gate 12G 只讀取 session、外部 collection 與本地 target。
它不會寫入正式資料，不會自動接受 conflict，也不會執行 apply。
若 Gate 12F plan 尚未完整收集，preview 仍會顯示已收集項目的差異，
但 blockers 會列出缺少項目，readyForNextGate 會保持 false。
`;

export function parseUpdateDiffArgs(argv) {
  if (!Array.isArray(argv) || argv.some(arg => typeof arg !== 'string')) {
    throw new Error('arguments must be an array of strings');
  }
  if (argv.length === 1 && ['--help', '-h', 'help'].includes(argv[0])) {
    return { command: 'help' };
  }

  const [command = 'preview', ...args] = argv;
  if (command !== 'preview') throw new Error('unknown command: ' + command);
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) return { command: 'help' };

  const allowed = {
    session: 'sessionId',
    workspace: 'workspace',
    'wardrobe-target': 'wardrobeTargetPath',
    'levels-target': 'levelsTargetPath',
  };
  const options = { command };
  const seen = new Set();

  for (const arg of args) {
    const match = /^--([^=]+)=(.*)$/s.exec(arg);
    if (!match) throw new Error('expected --option=value: ' + arg);
    const [, key, value] = match;
    if (!Object.hasOwn(allowed, key)) throw new Error('unknown option: --' + key);
    if (seen.has(key)) throw new Error('duplicate option: --' + key);
    seen.add(key);
    if (!value.trim()) throw new Error('--' + key + ' must not be empty');

    let parsed = value;
    if (['workspace', 'wardrobe-target', 'levels-target'].includes(key)) parsed = resolve(value);
    options[allowed[key]] = parsed;
  }
  return options;
}

export async function runUpdateDiffCli(options = { command: 'preview' }) {
  if (options.command === 'help') {
    console.log(UPDATE_DIFF_HELP);
    return null;
  }
  if (options.command !== 'preview') throw new Error('unknown command: ' + options.command);
  const result = await buildUpdateDiffPreview(options);
  console.log(JSON.stringify(result, null, 2));
  return result;
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    await runUpdateDiffCli(parseUpdateDiffArgs(process.argv.slice(2)));
  } catch (error) {
    console.error('[Update Diff] ERROR: ' + error.message);
    process.exitCode = 1;
  }
}
