import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('Gate 10H-D Main level bonus scoring no longer depends on the retired FEATURES global', () => {
  const levels = read('data/levels.js');

  assert.doesNotMatch(levels, /\bFEATURES\b/);
  assert.match(levels, /var scoringFeatures = \["simple", "cute", "active", "pure", "cool"\];/);
  assert.match(levels, /for \(var i = 0; i < scoringFeatures\.length; i\+\+\)/);
});
