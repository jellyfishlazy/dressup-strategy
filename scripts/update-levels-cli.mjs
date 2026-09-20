#!/usr/bin/env node

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  addLevelsToUpdate,
  listUpdateLevels,
  removeLevelsFromUpdate,
  searchUpdateLevels,
} from './update-levels.mjs';

const COMMON = { workspace: 'workspace', session: 'sessionId' };
const SEARCH = {
  query: 'query',
  'source-key': 'sourceKey',
  theme: 'theme',
  label: 'label',
  offset: 'offset',
  limit: 'limit',
};
const COMMANDS = new Set(['search', 'add', 'list', 'remove']);

export const UPDATE_LEVELS_HELP = `Gate 12E — 關卡搜尋 / 加入本次更新

先建立更新：
  npm run data:session -- create --name="本次遊戲更新"

搜尋來源關卡：
  npm run data:session:levels -- search --source-key="1-1"
  npm run data:session:levels -- search --theme="章節名稱"
  npm run data:session:levels -- search --query="關鍵字" --limit=50

加入搜尋結果（可重複指定 --key；整批成功或整批不寫入）：
  npm run data:session:levels -- add --key="1-1" --key="1-2"

加入時會自動收集該關卡的：
  levelsRaw
  levelFilters
  levelBonus
  skills（來源 addSkillsInfo）
  hint（來源 addHintInfo）
  themeFilter

查看 / 移除已收集關卡：
  npm run data:session:levels -- list
  npm run data:session:levels -- remove --key="1-1"

共用選項：
  --session=<session-id>   指定更新；省略則使用目前更新
  --workspace=<path>      使用指定的更新工作區

搜尋選項：
  --query= --source-key= --theme= --label=
  --offset=0 --limit=50    limit 範圍 1–500

加入選項：
  --source-hash=<SHA-256>  可指定搜尋結果的來源 SHA，避免加入不同版本資料

只選擇 levelsRaw 關卡；其他 primary level table 不會混入一般關卡清單。
重複加入不會增加副本。已完成／取消的更新不能加入或移除。
來源變更後拒絕搜尋／加入；已保存清單仍可查看，草稿仍可移除。
本階段只收集來源資料，不執行本地 mapping / completeness / preview / apply。
`;

export function parseUpdateLevelsArgs(argv) {
  if (!Array.isArray(argv) || argv.some(arg => typeof arg !== 'string')) {
    throw new Error('arguments must be an array of strings');
  }
  if (argv.length === 1 && ['--help', '-h', 'help'].includes(argv[0])) return { command: 'help' };
  const [command = 'list', ...args] = argv;
  if (!COMMANDS.has(command)) throw new Error('unknown command: ' + command);
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) return { command: 'help' };

  const allowed = {
    ...COMMON,
    ...(command === 'search' ? SEARCH : {}),
    ...(command === 'add' ? { 'source-hash': 'expectedSourceHash' } : {}),
  };
  const options = { command };
  const seen = new Set();

  for (const arg of args) {
    const match = /^--([^=]+)=(.*)$/s.exec(arg);
    if (!match) throw new Error('expected --option=value: ' + arg);
    const [, key, value] = match;

    if (key === 'key' && (command === 'add' || command === 'remove')) {
      if (!value.trim()) throw new Error('--key must not be empty');
      (options.keys ??= []).push(value);
      continue;
    }

    if (!Object.hasOwn(allowed, key)) throw new Error('unknown option for ' + command + ': --' + key);
    if (seen.has(key)) throw new Error('duplicate option: --' + key);
    seen.add(key);

    if (['workspace', 'session', 'source-hash'].includes(key) && !value.trim()) {
      throw new Error('--' + key + ' must not be empty');
    }

    let parsed = value;
    if (key === 'limit' || key === 'offset') {
      if (!/^(0|[1-9]\d*)$/.test(value)) throw new Error('--' + key + ' must be an integer');
      parsed = Number(value);
      if (!Number.isSafeInteger(parsed)
        || (key === 'limit' ? parsed < 1 || parsed > 500 : parsed < 0)) {
        throw new Error('--' + key + ' is out of range');
      }
    } else if (key === 'workspace') {
      parsed = resolve(value);
    } else if (key === 'source-hash' && !/^[0-9a-f]{64}$/i.test(value)) {
      throw new Error('--source-hash must be a SHA-256 hash');
    }
    options[allowed[key]] = parsed;
  }

  if ((command === 'add' || command === 'remove') && !options.keys?.length) {
    throw new Error(command + ' requires at least one --key=<levelsRaw-key>');
  }
  return options;
}

export function runUpdateLevelsCli(options = { command: 'list' }) {
  if (options.command === 'help') {
    console.log(UPDATE_LEVELS_HELP);
    return null;
  }

  const handlers = {
    search: searchUpdateLevels,
    add: addLevelsToUpdate,
    list: listUpdateLevels,
    remove: removeLevelsFromUpdate,
  };
  if (!Object.hasOwn(handlers, options.command)) throw new Error('unknown command: ' + options.command);

  const result = handlers[options.command](options);
  console.log(JSON.stringify(result, null, 2));
  return result;
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    runUpdateLevelsCli(parseUpdateLevelsArgs(process.argv.slice(2)));
  } catch (error) {
    console.error('[Update Levels] ERROR: ' + error.message);
    process.exitCode = 1;
  }
}
