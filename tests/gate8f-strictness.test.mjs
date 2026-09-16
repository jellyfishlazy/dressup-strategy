import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('Gate 8F-1 enables runtime/null strictness', () => {
  const config = JSON.parse(read('tsconfig.json'));
  assert.equal(config.compilerOptions.strictNullChecks, true);
  assert.equal(config.compilerOptions.strictFunctionTypes, true);
  assert.equal(config.compilerOptions.strictBindCallApply, true);
  assert.equal(config.compilerOptions.useUnknownInCatchVariables, true);
  assert.equal(config.compilerOptions.noUncheckedIndexedAccess, true);
  assert.equal(config.compilerOptions.exactOptionalPropertyTypes, true);
});

test('Gate 8F-2 enables unchecked-index protection', () => {
  const config = JSON.parse(read('tsconfig.json'));
  assert.equal(config.compilerOptions.noUncheckedIndexedAccess, true);
});

test('Gate 8F-3 enables exact optional-property semantics', () => {
  const config = JSON.parse(read('tsconfig.json'));
  assert.equal(config.compilerOptions.exactOptionalPropertyTypes, true);
});

test('Gate 8F-4 rejects implicit this', () => {
  const config = JSON.parse(read('tsconfig.json'));
  assert.equal(config.compilerOptions.noImplicitThis, true);
});

test('Gate 8F-5 preserves typed domain codec fallbacks and image-prefix guards', () => {
  const inventory = read('src/domain/inventory/index.mjs');
  assert.match(inventory, /@param \{string\} value \*\/ value => value/);
  assert.match(inventory, /@param \{string\} input \*\/ input => input/);
  const biguse = read('src/domain/biguse/index.mjs');
  assert.match(biguse, /@type \{Record<string, string>\}/);
  assert.match(biguse, /const prefix = imagePrefixes\[category\] \|\| ''/);
  assert.match(biguse, /if \(!prefix\) return ''/);
});

test('Gate 8F-6 preserves typed small app and UI boundaries', () => {
  for (const file of [
    'clock.mjs', 'main.mjs', 'biguse.mjs', 'biguse_nikki.mjs',
    'sharewardrobe.mjs', 'biguse_ui.mjs', 'ui.mjs',
  ]) {
    assert.match(read(file), /src\/legacy\/native-dom-types\.d\.ts/, file);
  }
  assert.match(read('wardrobechk.mjs'), /@param \{WardrobeInventory\} mine/);
  assert.match(read('biguse_nikki.mjs'), /color: Record<string, \[string, string\]>/);
  assert.match(read('biguse_ui.mjs'), /AutocompleteSuggestion<ScoringClothing>/);
  assert.match(read('ui.mjs'), /ShoppingCartInput<ScoringClothing>/);
});

test('Gate 8F-7 preserves one-key strategy categories and scoring contracts', () => {

  const strategy = read('onekeystrategy.mjs');
  assert.equal(strategy.includes('if(i == "襪子")'), true);
  assert.equal(strategy.includes('if(i != "飾品")'), true);
  assert.match(strategy, /src\/domain\/scoring\/types\.d\.ts/);
});

test('Gate 8F-8 enforces model internals while retaining loose legacy collections until consumer gates', () => {

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

test('Gate 8F-9 preserves lazy strategy contracts and tag cleanup', () => {

  const lazy = read('onekeystrategy_lan.mjs');
  assert.match(lazy, /@typedef \{Record<string, any>\} LegacyDict/);
  assert.match(lazy, /src\/legacy\/native-dom-types\.d\.ts/);
  assert.match(lazy, /from '\.\/onekeystrategy\.mjs'/);
  assert.match(lazy, /tagSet\[i\]\['count'\] -= tagSet\[i\]\['typeCount'\]\[typeName\]/);
});

test('Gate 8F-10 preserves material model contracts and feature iteration', () => {

  const materialModel = read('material_model.mjs');
  assert.match(materialModel, /src\/domain\/wardrobe\/types\.d\.ts/);
  assert.match(materialModel, /src\/domain\/scoring\/types\.d\.ts/);
  assert.match(materialModel, /@typedef \{Record<string, any>\} LegacyDict/);
  assert.match(materialModel, /@type \{any\[\]\} \*\/\s*var clothes = function/);
  assert.match(materialModel, /@type \{LegacyDict\} \*\/\s*var clothesSet = function/);
  assert.match(materialModel, /for \(const c of FEATURES\)/);
});

test('Gate 8F-11 enforces the cn-search source graph under noImplicitAny', () => {

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

test('Gate 8F-12 enforces Nikki with local typed collections and guarded reads', () => {
  const source = read('nikki.mjs');
  assert.match(source, /@type \{NikkiClothing\[\]\} \*\/\s*const clothes = legacyClothes;/);
  assert.match(source, /@type \{Record<string, Record<string, NikkiClothing>>\}/);
  assert.match(source, /@type \{Record<string, string\[\]>\}/);
  assert.match(source, /@type \{Record<string, any>\} \*\/\s*const CATEGORY_HIERARCHY = categoryHierarchy;/);
  assert.match(source, /allThemes: Record<string, NikkiLevel>/);
  assert.match(source, /@type \{Criteria\}/);
  assert.match(source, /const clothing = clothes\[i\];\s*if \(!clothing\) continue;/);
  assert.match(source, /const clothing = clothesSet\[type\]\?\.\[id\];\s*if \(!clothing\) return;/);
  assert.match(source, /const originalScore = clothesOrigScore\[i\]/);
  assert.match(source, /originalScore !== undefined && originalScore\*1\.778 < bestScore/);
  assert.match(source, /Object\.keys\(clotheslist\)\.length === 0/);
  assert.match(source, /var ownedIds = mine\.mine\[c\]/);
  assert.doesNotMatch(source, /@ts-(?:ignore|nocheck)/);
});


test('Gate 8F-13 enforces Material with local clothing, state and rendering boundaries', () => {
  const source = read('material.mjs');
  assert.match(source, /@type \{MaterialClothing\[\]\} \*\/\s*const clothes = legacyClothes;/);
  assert.match(source, /@typedef \{Record<string, any>\} LegacyDict/);
  assert.match(source, /@type \{LegacyDict\} \*\/\s*const clothesSet = legacyClothesSet;/);
  assert.match(source, /@type \{number\[\]\} \*\/\s*var reqCnt=/);
  assert.match(source, /@type \{MaterialId\[\]\} \*\/\s*var cartCont=/);
  assert.match(source, /@typedef \{\[MaterialClothing, string, string\]\} StarDrop/);
  assert.match(source, /const clothing = clothes\[Number\(id\)\];\s*if \(!clothing\) return;/);
  assert.match(source, /const starDrop = outStars2\[i\];\s*if \(starDrop === undefined\) continue;/);
  assert.match(source, /if \(dyeName === undefined \|\| dyeCount === undefined\) continue;/);
  assert.match(source, /onrendered\(canvas: HTMLCanvasElement\): void/);
  assert.match(source, /if \(!element\) return;\s*html2canvas\(element,/);
  assert.match(source, /Number\(s\)<2/);
  assert.match(source, /Number\(h\)>0/);
  assert.match(source, /MaterialActions\.register\(\{/);
  assert.match(source, /data-material-action/);
  assert.match(source, /data-material-change/);
  assert.doesNotMatch(source, /@ts-(?:ignore|nocheck)|WardrobeDomain|InventoryDomain/);
});

test('Gate 8F-13 preserves Material recipe counts, rendering and legacy cart identity', () => {
  const clothes = ['Design', 'Dye', 'Drop', 'Rebuild', 'Shop'].map((name, i) => ({
    name, id: String(i), type: { type: '髮型', mainType: '髮型' }, set: i === 0 ? 'Suit' : '',
    stars: '5', source: ['設計圖', '定2', '1-1公', '重構', '店·金幣'][i], tags: ['Tag'],
    simple: ['', ''], active: ['', ''], cute: ['', ''], pure: ['', ''], cool: ['', ''],
    getDeps: () => '',
  }));
  const clothesSet = { '髮型': Object.fromEntries(clothes.map(piece => [piece.id, piece])) };
  const output = new Map();
  const values = new Map([['#degree_level', '5'], ['#chooseCate', '公主級掉落']]);
  const Dom = selector => ({
    ready() {},
    val() { return values.get(selector); },
    html(value) { if (value !== undefined) output.set(selector, value); return output.get(selector); },
    append(value) { output.set(selector, (output.get(selector) || '') + value); },
  });
  Dom.inArray = (value, list) => list.indexOf(value);
  Dom.trim = value => String(value).trim();
  let actions;
  const context = vm.createContext({
    __model: { clothes, clothesSet }, Dom, document: { getElementById: () => null },
    MaterialActions: { register(value) { actions = value; } },
    html2canvas() { assert.fail('missing image target must not invoke html2canvas'); },
    category: ['髮型'], setcategory: [['Test', 'Suit']],
    pattern: [['髮型', '0', '髮型', '1', 3, '設'], ['髮型', '0', '髮型', '4', 1, '設'], ['髮型', '1', '髮型', '2', 1, '染']],
    convert: [['髮型', '1', 'Red', '', 2]], convertPrice: { Red: [8, 10] },
    construct: [['髮型', '3', 'Ring', 4]], constructMaterialName: ['Ring'],
    merchant: [['髮型', '4', 100, '金幣']], patternPrice: [['髮型', '0', 50]],
  });
  const source = read('material.mjs').replace(
    /^\uFEFF?import \{([^}]+)\} from '[^']+';/,
    (_, bindings) => 'const {' + bindings.replace(/ as /g, ': ') + '} = __model;'
  );
  vm.runInContext(source, context);
  actions.get_convertlist();
  actions.get_maxc();
  actions.genFactor('0');
  assert.deepEqual(Array.from(context.reqCnt), [1, 3, 3, 0, 1]);
  assert.deepEqual(Array.from(context.convertlistCnt), [6]);
  assert.match(output.get('#levelDropInfo'), /Design/);
  assert.match(output.get('#levelDropInfo'), /48星光幣\/60聯盟幣/);
  assert.match(output.get('#levelDropInfo'), /金幣100/);
  actions.genFactor(0, 0, 1);
  assert.deepEqual(Array.from(context.reqCnt), [0, 2, 2, 0, 0]);
  assert.deepEqual(Array.from(context.convertlistCnt), [4]);
  actions.searchSet('Suit');
  assert.deepEqual(Array.from(context.reqCnt), [1, 3, 3, 0, 1]);
  actions.addCart(0);
  actions.addCart(0);
  actions.addCart('0');
  assert.deepEqual(Array.from(context.cartCont), [0, '0']);
  actions.calcCart();
  assert.deepEqual(Array.from(context.reqCnt), [1, 3, 3, 0, 1]);
  actions.delCart('0');
  assert.deepEqual(Array.from(context.cartCont), []);
  actions.clearCnt();
  context.reqCnt[3] = 2;
  assert.match(actions.genBasicMaterial(2, '', 1), /Ring<\/td><td>分解<\/td><td>7<\/td>/);
  actions.chgStars2();
  assert.match(output.get('#levelDropInfo'), /Drop/);
  assert.match(output.get('#levelDropInfo'), /1-1公/);
  assert.equal(actions.add_genFac('Self\n   [髮型]Drop\n').includes('data-material-action="genFactor(2)"'), true);
  assert.deepEqual(Array.from(actions.getDistinct([undefined, undefined, 0, '0'])), [undefined, 0, '0']);
  assert.equal(actions.getPatternPrice(999), undefined);
  actions.toimage();
});

test('Gate 8F-Final makes full strict mode canonical and retires staged scaffolding', () => {
  const { compilerOptions } = JSON.parse(read('tsconfig.json'));
  assert.equal(compilerOptions.strict, true);
  assert.equal(compilerOptions.noUncheckedIndexedAccess, true);
  assert.equal(compilerOptions.exactOptionalPropertyTypes, true);
  for (const option of [
    'noImplicitAny', 'noImplicitThis', 'strictNullChecks', 'strictFunctionTypes',
    'strictBindCallApply', 'strictPropertyInitialization', 'strictBuiltinIteratorReturn',
    'useUnknownInCatchVariables', 'alwaysStrict',
  ]) {
    assert.notEqual(compilerOptions[option], false, option);
  }
  const { scripts } = JSON.parse(read('package.json'));
  assert.equal(Object.hasOwn(scripts, 'typecheck:no-implicit-any'), false);
  assert.doesNotMatch(scripts.check, /typecheck:no-implicit-any|typecheck-no-implicit-any/);
  for (const file of ['tsconfig.no-implicit-any.json', 'scripts/typecheck-no-implicit-any.mjs']) {
    assert.equal(existsSync(new URL('../' + file, import.meta.url)), false, file);
  }
});
