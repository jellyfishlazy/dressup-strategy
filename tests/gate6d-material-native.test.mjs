import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('Material no longer loads jQuery or Knockout', () => {
  const html = read('material.html');
  assert.doesNotMatch(html, /jquery\.js|knockout\.js/i);
  assert.match(html, /src\/legacy\/native-dom\.js/);
  assert.match(html, /src\/legacy\/material-actions\.js/);
  assert.equal(existsSync(new URL('../jquery.js', import.meta.url)), false);
  assert.equal(existsSync(new URL('../knockout.js', import.meta.url)), false);
});

test('Material runtime contains no jQuery API or generated inline handlers', () => {
  for (const file of ['material.js', 'material_model.js']) {
    const source = read(file);
    assert.doesNotMatch(source, /\$\s*\(|\$\s*\.|\bjQuery\b/, file);
    assert.doesNotMatch(source, /on(?:click|change|input|error)\s*=/i, file);
  }
  assert.match(read('material.js'), /data-material-action/);
  assert.match(read('material.js'), /data-material-change/);
});

test('Material delegated actions parse simple legacy call arguments without eval', () => {
  const listeners = {};
  const context = {
    document: {
      readyState: 'complete',
      addEventListener(type, handler) { listeners[type] = handler; },
    },
    decodeURIComponent,
    Object,
  };
  vm.createContext(context);
  vm.runInContext(read('src/legacy/material-actions.js'), context);
  assert.deepEqual(Array.from(context.MaterialActions.parseArgs("3,'Suit Name',1")), [3, 'Suit Name', 1]);
  context.sampleAction = (...args) => args;
  assert.deepEqual(Array.from(context.MaterialActions.run(encodeURIComponent("sampleAction(2,'x')"))), [2, 'x']);
  assert.doesNotMatch(read('src/legacy/material-actions.js'), /\beval\s*\(|new Function/);
});

test('classic wardrobe/inventory compatibility is contained to known synchronous consumers', () => {
  const consumers = ['model.js', 'material_model.js', 'wardrobechk.js'];
  for (const file of consumers) {
    const source = read(file);
    assert.match(source, /WardrobeDomain\.rowToWardrobeItem/);
    assert.match(source, /InventoryDomain\./);
  }
  for (const file of ['ui.js', 'nikki.js', 'biguse_ui.js', 'biguse_nikki.js', 'material.js']) {
    const source = read(file);
    assert.doesNotMatch(source, /WardrobeDomain|InventoryDomain/, file);
  }
});
