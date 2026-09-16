import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('Gate 8C defines shared model/scoring contracts', () => {
  const types = read('src/domain/scoring/types.d.ts');
  assert.match(types, /export type FeatureName/);
  assert.match(types, /export type RatingTuple/);
  assert.match(types, /export interface ClothesType/);
  assert.match(types, /export interface Criteria/);
  assert.match(types, /export interface ScoreByCategoryState/);
  assert.match(types, /export interface ScoreBonus/);
});

test('Main and Material models consume the shared scoring contracts', () => {
  for (const file of ['model.mjs', 'material_model.mjs']) {
    const source = read(file);
    assert.match(source, /src\/domain\/scoring\/types\.d\.ts/);
    assert.match(source, /@returns \{ScoreByCategoryState\}/);
    assert.match(source, /@returns \{RatingTuple\}/);
  }
});

test('Gate 8C removes model diagnostics and reduces the baseline further', () => {
  const baseline = JSON.parse(read('typecheck-baseline.json'));
  assert.ok(baseline.diagnostic_count < 75);
  assert.equal(baseline.diagnostics.some(item => item.file === 'model.mjs' || item.file === 'material_model.mjs'), false);
});

test('model scoring removes implicit string-number coercion at typed boundaries', () => {
  for (const file of ['model.mjs', 'material_model.mjs']) {
    const source = read(file);
    assert.doesNotMatch(source, /1 \* total\.toFixed\(0\)/);
    assert.match(source, /Number\(total\.toFixed\(0\)\)/);
    assert.doesNotMatch(source, /for \(var i =1; i<splits1\.length; i\+\+\)/);
  }
});
