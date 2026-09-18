import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../biguse_ui.mjs', import.meta.url), 'utf8');

test('Gate 10H-G chunks BigUse switch-all rendering without changing normal category rendering', () => {
  assert.match(source, /const BIGUSE_RENDER_CHUNK = 500;/);
  assert.match(source, /currentCategory === 'switchall'/);
  assert.match(source, /Math\.min\(datas\.length, BIGUSE_RENDER_CHUNK\)/);
  assert.match(source, /loadMoreControl\(\$list, data, BIGUSE_RENDER_CHUNK/);
});

test('Gate 10H-G exposes progressive load-more rendering instead of rendering the full dataset eagerly', () => {
  assert.match(source, /function appendBiguseRows\(/);
  assert.match(source, /function loadMoreControl\(/);
  assert.match(source, /載入更多（/);
});
