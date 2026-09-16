import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('Gate 8F-1 enables runtime/null strictness without turning on implicit-any migration', () => {
  const config = JSON.parse(read('tsconfig.json'));
  assert.equal(config.compilerOptions.strict, false);
  assert.equal(config.compilerOptions.noImplicitAny, false);
  assert.equal(config.compilerOptions.strictNullChecks, true);
  assert.equal(config.compilerOptions.strictFunctionTypes, true);
  assert.equal(config.compilerOptions.strictBindCallApply, true);
  assert.equal(config.compilerOptions.useUnknownInCatchVariables, true);
  assert.equal(config.compilerOptions.noUncheckedIndexedAccess, true);
  assert.equal(config.compilerOptions.exactOptionalPropertyTypes, true);
});

test('Gate 8F-2 enables unchecked-index protection while keeping implicit-any deferred', () => {
  const config = JSON.parse(read('tsconfig.json'));
  assert.equal(config.compilerOptions.noUncheckedIndexedAccess, true);
  assert.equal(config.compilerOptions.noImplicitAny, false);
  assert.equal(config.compilerOptions.strict, false);
});

test('Gate 8F-3 enables exact optional-property semantics without implicit-any migration', () => {
  const config = JSON.parse(read('tsconfig.json'));
  assert.equal(config.compilerOptions.exactOptionalPropertyTypes, true);
  assert.equal(config.compilerOptions.noImplicitAny, false);
  assert.equal(config.compilerOptions.strict, false);
});

test('Gate 8F-4 rejects implicit this while keeping implicit-any migration deferred', () => {
  const config = JSON.parse(read('tsconfig.json'));
  assert.equal(config.compilerOptions.noImplicitThis, true);
  assert.equal(config.compilerOptions.noImplicitAny, false);
  assert.equal(config.compilerOptions.strict, false);
});

test('Gate 8F-5 starts staged noImplicitAny enforcement with the canonical domain graph', () => {
  const config = JSON.parse(read('tsconfig.no-implicit-any.json'));
  assert.equal(config.extends, './tsconfig.json');
  assert.equal(config.compilerOptions.noImplicitAny, true);

  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['typecheck:no-implicit-any'], 'node scripts/typecheck-no-implicit-any.mjs');
  assert.match(pkg.scripts.check, /npm run typecheck:no-implicit-any/);

  const checker = read('scripts/typecheck-no-implicit-any.mjs');
  assert.match(checker, /file\.startsWith\('src\/domain\/'\)/);
});

test('Gate 8F-6 expands staged noImplicitAny enforcement to small app and UI boundaries', () => {
  const checker = read('scripts/typecheck-no-implicit-any.mjs');
  const files = [
    'clock.mjs',
    'main.mjs',
    'biguse.mjs',
    'biguse_nikki.mjs',
    'sharewardrobe.mjs',
    'wardrobechk.mjs',
    'biguse_ui.mjs',
    'ui.mjs',
  ];
  for (const file of files) {
    assert.equal(checker.includes(`'${file}'`), true, file);
  }
  assert.match(checker, /tsconfig\.no-implicit-any\.json/);
  assert.match(checker, /diagnostics\.filter\(diagnostic => isEnforcedFile\(diagnostic\.file\)\)/);
});

test('Gate 8F-7 adds one-key strategy to staged noImplicitAny enforcement', () => {
  const checker = read('scripts/typecheck-no-implicit-any.mjs');
  assert.equal(checker.includes("'onekeystrategy.mjs'"), true);

  const strategy = read('onekeystrategy.mjs');
  assert.equal(strategy.includes('if(i == "襪子")'), true);
  assert.equal(strategy.includes('if(i != "飾品")'), true);
  assert.match(strategy, /src\/domain\/scoring\/types\.d\.ts/);
});

test('Gate 8F-8 enforces model internals while retaining loose legacy collections until consumer gates', () => {
  const checker = read('scripts/typecheck-no-implicit-any.mjs');
  assert.equal(checker.includes("'model.mjs'"), true);

  const model = read('model.mjs');
  assert.match(model, /@typedef \{ScoringClothing & \{ isSuit: unknown \}\} ModelClothing/);
  assert.match(model, /@returns \{ModelClothing\}/);
  assert.match(model, /@type \{ModelClothing\[\]\}/);
  assert.match(model, /@type \{Record<string, Record<string, ModelClothing>>\}/);
  // These public aliases deliberately retain legacy any; direct assignment preserves identity.
  assert.match(model, /@type \{any\[\]\} \*\/\s*var clothes = typedClothes;/);
  assert.match(model, /@type \{Record<string, any>\} \*\/\s*var clothesSet = typedClothesSet;/);
  assert.match(model, /for \(var i in typedClothes\)/);
  assert.match(model, /var clothing = typedClothes\[i\]/);
  assert.match(model, /var target = typedClothesSet\[recipe\[0\]\]/);
  assert.match(model, /var source = typedClothesSet\[recipe\[2\]\]/);
  assert.match(model, /mine\.filter\(typedClothes\)/);
  assert.match(model, /mine\.update\(typedClothes\)/);
  assert.match(model, /myClothes\.filter\(typedClothes\)/);
});

test('Gate 8F-9 adds lazy strategy to staged noImplicitAny enforcement', () => {
  const checker = read('scripts/typecheck-no-implicit-any.mjs');
  assert.equal(checker.includes("'onekeystrategy_lan.mjs'"), true);

  const lazy = read('onekeystrategy_lan.mjs');
  assert.match(lazy, /@typedef \{Record<string, any>\} LegacyDict/);
  assert.match(lazy, /src\/legacy\/native-dom-types\.d\.ts/);
  assert.match(lazy, /from '\.\/onekeystrategy\.mjs'/);
  assert.match(lazy, /tagSet\[i\]\['count'\] -= tagSet\[i\]\['typeCount'\]\[typeName\]/);
});

test('Gate 8F-10 adds material model to staged noImplicitAny enforcement', () => {
  const checker = read('scripts/typecheck-no-implicit-any.mjs');
  assert.equal(checker.includes("'material_model.mjs'"), true);

  const materialModel = read('material_model.mjs');
  assert.match(materialModel, /src\/domain\/wardrobe\/types\.d\.ts/);
  assert.match(materialModel, /src\/domain\/scoring\/types\.d\.ts/);
  assert.match(materialModel, /@typedef \{Record<string, any>\} LegacyDict/);
  assert.match(materialModel, /@type \{any\[\]\} \*\/\s*var clothes = function/);
  assert.match(materialModel, /@type \{LegacyDict\} \*\/\s*var clothesSet = function/);
  assert.match(materialModel, /for \(const c of FEATURES\)/);
});

test('Gate 8F-11 enforces the cn-search source graph under noImplicitAny', () => {
  const checker = read('scripts/typecheck-no-implicit-any.mjs');
  assert.match(checker, /file\.startsWith\('cn-search\/src\/'\)/);

  const normalization = read('cn-search/src/normalization.mjs');
  const search = read('cn-search/src/search.mjs');
  const staging = read('cn-search/src/staging.mjs');
  const manual = read('cn-search/src/manual-entry.mjs');
  const ui = read('cn-search/src/ui.mjs');
  assert.match(normalization, /WardrobeRow/);
  assert.match(search, /SearchDeps/);
  assert.match(staging, /StagingEntry/);
  assert.match(manual, /Readonly<Record<string, 1>>/);
  assert.match(ui, /if \(!row\) continue;/);
});

test('Gate 8F keeps the TypeScript baseline empty', () => {
  const baseline = JSON.parse(read('typecheck-baseline.json'));
  assert.equal(baseline.diagnostic_count, 0);
  assert.deepEqual(baseline.summary_by_code, {});
  assert.deepEqual(baseline.diagnostics, []);
});

test('native DOM facade provides contextual callback typing without runtime imports', () => {
  const facade = read('src/legacy/native-dom-types.d.ts');
  assert.match(facade, /export interface DomFacade/);
  assert.match(facade, /this: HTMLElement/);
  assert.match(facade, /this: HTMLInputElement/);
  for (const file of ['main.mjs', 'nikki.mjs', 'material.mjs', 'biguse_ui.mjs']) {
    assert.match(read(file), /src\/legacy\/native-dom-types\.d\.ts/, file);
  }
});

test('strict typing fixes lazy tag cleanup to use the current tagSet key', () => {
  const source = read('onekeystrategy_lan.mjs');
  assert.match(source, /tagSet\[i\]\['count'\] -= tagSet\[i\]\['typeCount'\]\[typeName\]/);
  assert.doesNotMatch(source, /tagSet\[tagCate\]\['count'\] -=/);
});

test('bulk inventory emptiness uses object keys rather than nonexistent length', () => {
  const source = read('nikki.mjs');
  assert.match(source, /Object\.keys\(clotheslist\)\.length === 0/);
  assert.doesNotMatch(source, /clotheslist\.length\s*<=\s*0/);
});

test('inventory size aggregation reads the actual persisted subtype key', () => {
  const source = read('nikki.mjs');
  assert.match(source, /var ownedIds = mine\.mine\[c\]/);
  assert.doesNotMatch(source, /var ownedIds = mine\.mine\[type\]/);
});
