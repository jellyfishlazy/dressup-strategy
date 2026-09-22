import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const fileUrl = new URL('../cn-search/cn-search.js', import.meta.url);
const source = readFileSync(fileUrl, 'utf8');

test('Gate 10H-F CN Search entry remains valid modular JavaScript', () => {
  const result = spawnSync(process.execPath, ['--check', fileURLToPath(fileUrl)], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(source, /from '\.\/src\/normalization\.mjs'/);
  assert.match(source, /from '\.\/src\/search\.mjs'/);
  assert.match(source, /from '\.\/src\/staging\.mjs'/);
  assert.match(source, /from '\.\/src\/ui\.mjs'/);
  assert.match(source, /from '\.\/src\/manual-entry\.mjs'/);
});

test('Gate 10H-F restores readable CN Search runtime copy without mojibake markers', () => {
  assert.match(source, /setStatus\('讀取陸服索引中…'\)/);
  assert.match(source, /setStatus\('解析中…'\)/);
  assert.match(source, /陸服資料更新:/);
  assert.match(source, /暫存區是空的/);
  assert.match(source, /已手動新增：/);
  assert.match(source, /屬性「/);
  assert.doesNotMatch(source, /閫|嚗|撌|蝑|隢|霈|銝|蝝|皜|芰|||||||/);
});
