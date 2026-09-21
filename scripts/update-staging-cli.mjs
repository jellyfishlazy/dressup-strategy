#!/usr/bin/env node

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateApplyReadyStaging } from './update-staging.mjs';

export const UPDATE_STAGING_HELP = `Gate 12I — 產生 apply-ready staging

把目前 Gate 12 session 的：
  new
  modified
  已核准 conflict

轉成 Gate 11 可直接 preview/apply 的 staging input + manifest。

執行：
  npm run data:session:stage -- generate

輸出預設放在：
  .staging/gate12/<session-id>/<generation-fingerprint>/

其中包含：
  bundle.json
  wardrobe-input.json
  wardrobe-manifest.json
  levels-input.json
  levels-manifest.json

Gate 12H keep-local conflict 會被明確跳過。
use-source / manual-resolution 會使用已保存且仍為 current 的 resolved payload。
unchanged 不會進 staging。

共用選項：
  --session=<session-id>
  --workspace=<path>

唯讀 target override（測試 / 稽核用途）：
  --wardrobe-target=<path>
  --levels-target=<path>

輸出位置 override：
  --output-root=<path>

Gate 12I 只產生 .staging artifacts。
它不會修改 canonical wardrobe / levels、不會 apply，也不會 rebuild derived data。
相同 session / review / target 狀態重跑會重用相同 fingerprint staging。
`;

export function parseUpdateStagingArgs(argv) {
  if (!Array.isArray(argv) || argv.some(arg => typeof arg !== 'string')) {
    throw new Error('arguments must be an array of strings');
  }
  if (argv.length === 1 && ['--help', '-h', 'help'].includes(argv[0])) {
    return { command: 'help' };
  }

  const [command = 'generate', ...args] = argv;
  if (command !== 'generate') throw new Error('unknown command: ' + command);
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) return { command: 'help' };

  const allowed = {
    session: 'sessionId',
    workspace: 'workspace',
    'wardrobe-target': 'wardrobeTargetPath',
    'levels-target': 'levelsTargetPath',
    'output-root': 'outputRoot',
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
    if (['workspace', 'wardrobe-target', 'levels-target', 'output-root'].includes(key)) {
      parsed = resolve(value);
    }
    options[allowed[key]] = parsed;
  }
  return options;
}

export async function runUpdateStagingCli(options = { command: 'generate' }) {
  if (options.command === 'help') {
    console.log(UPDATE_STAGING_HELP);
    return null;
  }
  if (options.command !== 'generate') throw new Error('unknown command: ' + options.command);

  const result = await generateApplyReadyStaging(options);
  console.log(JSON.stringify(result, null, 2));
  return result;
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    await runUpdateStagingCli(parseUpdateStagingArgs(process.argv.slice(2)));
  } catch (error) {
    console.error('[Update Staging] ERROR: ' + error.message);
    process.exitCode = 1;
  }
}
