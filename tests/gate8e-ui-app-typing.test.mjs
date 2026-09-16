import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('Gate 8E clears the non-strict TypeScript baseline', () => {
  const baseline = JSON.parse(read('typecheck-baseline.json'));
  assert.equal(baseline.diagnostic_count, 0);
  assert.deepEqual(baseline.summary_by_code, {});
  assert.deepEqual(baseline.diagnostics, []);
});

test('UI DOM access is narrowed at native element boundaries', () => {
  const nikki = read('nikki.mjs');
  const wardrobeCheck = read('wardrobechk.mjs');
  assert.match(nikki, /HTMLTextAreaElement\|null/);
  assert.match(nikki, /HTMLInputElement\|null/);
  assert.match(wardrobeCheck, /HTMLTextAreaElement\|null/);
  assert.doesNotMatch(nikki, /ifhide\s*&=/);
});

test('app helpers no longer rely on implicit numeric coercion or mutable function properties', () => {
  const clock = read('clock.mjs');
  const share = read('sharewardrobe.mjs');
  const strategy = read('onekeystrategy.mjs');
  assert.match(clock, /Math\.trunc\(timeIndex \/ 3600\)/);
  assert.doesNotMatch(clock, /parseInt\(timeIndex \/ 3600\)/);
  assert.match(share, /function zipChunk\(/);
  assert.doesNotMatch(share, /zipNum\.zip/);
  assert.match(strategy, /getFullYear\(\)/);
  assert.doesNotMatch(strategy, /getYear\(\)/);
});

test('Material and lazy-strategy loops make numeric index intent explicit', () => {
  const material = read('material.mjs');
  const lazy = read('onekeystrategy_lan.mjs');
  assert.match(material, /Number\(s\)<2/);
  assert.match(material, /Number\(h\)>0/);
  assert.match(lazy, /Number\(k\)==0/);
  assert.match(lazy, /let removeIndex=1/);
});
