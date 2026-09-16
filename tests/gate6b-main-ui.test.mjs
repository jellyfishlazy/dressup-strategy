import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

const MAIN_RUNTIME = [
  'main.mjs', 'model.mjs', 'ui.mjs', 'nikki.mjs', 'onekeystrategy_lan.mjs',
  'onekeystrategy.mjs', 'clock.mjs', 'sharewardrobe.mjs',
];

test('main matcher no longer loads jQuery or freezeheader', () => {
  const html = read('index.html');
  assert.doesNotMatch(html, /src=['"]jquery(?:\.js|\.min\.js)['"]/i);
  assert.doesNotMatch(html, /jquery\.freezeheader\.js/i);
  assert.match(html, /src=['"]src\/legacy\/native-dom\.js['"]/);
  const nativePos = html.indexOf('src/legacy/native-dom.js');
  const mainPos = html.indexOf('main.mjs');
  assert.ok(nativePos >= 0 && mainPos > nativePos, 'native DOM facade must load before main module entry');
  assert.match(html, /src=['"]src\/legacy\/main-actions\.js['"]/);
  assert.equal(existsSync(new URL('../jquery.freezeheader.js', import.meta.url)), false);
});

test('main matcher runtime has no jQuery API or generated inline-handler references', () => {
  for (const file of MAIN_RUNTIME) {
    const source = read(file);
    assert.doesNotMatch(source, /\$\s*\(|\$\s*\.|\bjQuery\b/, file);
    assert.doesNotMatch(source, /['"`]\s*[^'"`]*on(?:click|change|input|error)\s*=/i, file);
  }
});

test('native DOM facade exposes required collection/static and sticky-header APIs', () => {
  const context = { globalThis: {} };
  vm.createContext(context);
  vm.runInContext(read('src/legacy/native-dom.js'), context, { filename: 'native-dom.js' });
  const Dom = context.globalThis.Dom;
  assert.equal(typeof Dom, 'function');
  assert.equal(Dom.inArray('b', ['a', 'b']), 1);
  assert.deepEqual(Array.from(Dom.unique(['a', 'a', 'b'])), ['a', 'b']);
  assert.deepEqual(Array.from(Dom.merge(['a'], ['b'])), ['a', 'b']);
  assert.equal(Dom.isEmptyObject({}), true);
  assert.equal(Dom.isEmptyObject({ a: 1 }), false);
  assert.equal(typeof context.globalThis.menuFixed, 'function');
  assert.equal(typeof context.globalThis.ReDrawcloneHeaderRow, 'function');

  let listener;
  const fakeNode = {
    nodeType: 1,
    attrs: {},
    addEventListener(name, fn) { assert.equal(name, 'click'); listener = fn; },
    setAttribute(name, value) { this.attrs[name] = String(value); },
    removeAttribute(name) { delete this.attrs[name]; },
    getAttribute(name) { return Object.hasOwn(this.attrs, name) ? this.attrs[name] : null; },
  };
  const chained = Dom(fakeNode).attr('before-text', undefined);
  assert.equal(chained.length, 1, 'explicit undefined attribute setter must preserve chainability');
  assert.equal(fakeNode.getAttribute('before-text'), null);

  Dom(fakeNode).click(() => false);
  let prevented = false;
  let stopped = false;
  listener.call(fakeNode, { preventDefault() { prevented = true; }, stopPropagation() { stopped = true; } });
  assert.equal(prevented, true, 'return false should preserve jQuery-style preventDefault behavior');
  assert.equal(stopped, true, 'return false should preserve jQuery-style stopPropagation behavior');
});

test('main runtime is included in repository lint gate', () => {
  const pkg = JSON.parse(read('package.json'));
  for (const file of ['main.mjs', 'model.mjs', 'ui.mjs', 'nikki.mjs', 'onekeystrategy.mjs', 'onekeystrategy_lan.mjs', 'clock.mjs', 'sharewardrobe.mjs']) {
    assert.match(pkg.scripts.lint, new RegExp(file.replace('.', '\\.')));
  }
});
