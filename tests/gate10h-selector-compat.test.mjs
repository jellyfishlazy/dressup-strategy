import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('Gate 10H-A keeps selector-sensitive ids out of querySelector paths', () => {
  const nikki = read('nikki.mjs');
  const biguse = read('biguse_nikki.mjs');

  assert.doesNotMatch(nikki, /Dom\(["']#["'] \+ c\)/);
  assert.doesNotMatch(biguse, /Dom\(["']#["'] \+ c\)/);
  assert.match(nikki, /document\.getElementById\(categoryId\)/);
  assert.match(biguse, /document\.getElementById\(categoryId\)/);
  assert.match(nikki, /document\.getElementById\(["']clickable-["'] \+ mainType \+ id\)/);
});

test('Gate 10H-A uses CSS-safe high-score classes and strict source references', () => {
  const main = read('index.html');
  const biguse = read('biguse.html');
  const nikki = read('nikki.mjs');

  assert.doesNotMatch(main, /class="[^"]*\s1d(?:27|778)(?:\s|")/);
  assert.doesNotMatch(biguse, /class="[^"]*\s1d(?:27|778)(?:\s|")/);
  assert.match(main, /highscore-1d27/);
  assert.match(main, /highscore-1d778/);
  assert.match(biguse, /highscore-1d27/);
  assert.match(biguse, /highscore-1d778/);
  assert.doesNotMatch(nikki, /Dom\(["']\.1d(?:27|778)["']\)/);
  assert.match(nikki, /sourceText\.match\(\/\(\?:定\|進\)\(\[0-9\]\+\)\//);
  assert.match(nikki, /if \(!sourceMatch\) return true;/);
});
