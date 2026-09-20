#!/usr/bin/env node

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  addPlannedItems,
  checkUpdateCompleteness,
  listUpdatePlan,
  removePlannedItems,
} from './update-completeness.mjs';

const COMMANDS = new Set(['check', 'plan-list', 'plan-add', 'plan-remove']);

export const UPDATE_COMPLETENESS_HELP = `Gate 12F — 完整度檢查

目的：
  明確列出「這次預計要搬的項目」與「目前已經收集的項目」差異。

預設檢查目前更新：
  npm run data:session:completeness -- check

把項目加入本次更新的預計清單：
  npm run data:session:completeness -- plan-add --wardrobe-key="分類|001"
  npm run data:session:completeness -- plan-add --level-key="1-1"
  npm run data:session:completeness -- plan-add --wardrobe-key="分類|001" --level-key="1-1"

查看預計清單：
  npm run data:session:completeness -- plan-list

從預計清單移除：
  npm run data:session:completeness -- plan-remove --wardrobe-key="分類|001"
  npm run data:session:completeness -- plan-remove --level-key="1-1"

共用選項：
  --session=<session-id>   指定更新；省略則使用目前更新
  --workspace=<path>      使用指定的更新工作區

plan-add 可選來源 SHA 鎖定：
  --wardrobe-source-hash=<SHA-256>
  --levels-source-hash=<SHA-256>

完整度只以 plan 為分母：
  - planned：預計項目
  - completed：預計項目中已經搬進 collection 的項目
  - missing：還沒搬完的預計項目
  - unplannedCollected：有搬進來但沒有列在 plan 的額外項目

若 plan 完全為空，percent 會是 null，complete 會是 false。
本階段只做計畫／完整度檢查，不執行 mapping / preview / apply。
`;

export function parseUpdateCompletenessArgs(argv) {
  if (!Array.isArray(argv) || argv.some(arg => typeof arg !== 'string')) {
    throw new Error('arguments must be an array of strings');
  }
  if (argv.length === 1 && ['--help', '-h', 'help'].includes(argv[0])) return { command: 'help' };

  const [command = 'check', ...args] = argv;
  if (!COMMANDS.has(command)) throw new Error('unknown command: ' + command);
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) return { command: 'help' };

  const options = { command };
  const seen = new Set();
  for (const arg of args) {
    const match = /^--([^=]+)=(.*)$/s.exec(arg);
    if (!match) throw new Error('expected --option=value: ' + arg);
    const [, key, value] = match;

    if (key === 'wardrobe-key' && (command === 'plan-add' || command === 'plan-remove')) {
      if (!value.trim()) throw new Error('--wardrobe-key must not be empty');
      (options.wardrobeKeys ??= []).push(value);
      continue;
    }
    if (key === 'level-key' && (command === 'plan-add' || command === 'plan-remove')) {
      if (!value.trim()) throw new Error('--level-key must not be empty');
      (options.levelKeys ??= []).push(value);
      continue;
    }

    const allowed = {
      workspace: 'workspace',
      session: 'sessionId',
      ...(command === 'plan-add'
        ? {
          'wardrobe-source-hash': 'expectedWardrobeSourceHash',
          'levels-source-hash': 'expectedLevelsSourceHash',
        }
        : {}),
    };
    if (!Object.hasOwn(allowed, key)) throw new Error('unknown option for ' + command + ': --' + key);
    if (seen.has(key)) throw new Error('duplicate option: --' + key);
    seen.add(key);
    if (!value.trim()) throw new Error('--' + key + ' must not be empty');

    let parsed = value;
    if (key === 'workspace') parsed = resolve(value);
    if ((key === 'wardrobe-source-hash' || key === 'levels-source-hash')
      && !/^[0-9a-f]{64}$/i.test(value)) {
      throw new Error('--' + key + ' must be a SHA-256 hash');
    }
    options[allowed[key]] = parsed;
  }

  if ((command === 'plan-add' || command === 'plan-remove')
    && !options.wardrobeKeys?.length && !options.levelKeys?.length) {
    throw new Error(command + ' requires at least one --wardrobe-key or --level-key');
  }
  return options;
}

export function runUpdateCompletenessCli(options = { command: 'check' }) {
  if (options.command === 'help') {
    console.log(UPDATE_COMPLETENESS_HELP);
    return null;
  }

  const handlers = {
    check: checkUpdateCompleteness,
    'plan-list': listUpdatePlan,
    'plan-add': addPlannedItems,
    'plan-remove': removePlannedItems,
  };
  if (!Object.hasOwn(handlers, options.command)) throw new Error('unknown command: ' + options.command);

  const result = handlers[options.command](options);
  console.log(JSON.stringify(result, null, 2));
  return result;
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    runUpdateCompletenessCli(parseUpdateCompletenessArgs(process.argv.slice(2)));
  } catch (error) {
    console.error('[Update Completeness] ERROR: ' + error.message);
    process.exitCode = 1;
  }
}
