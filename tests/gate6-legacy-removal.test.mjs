import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('active HTML entry points no longer use inline event handlers', () => {
  for (const file of ['index.html', 'biguse.html', 'material.html', 'wardrobechk.html', 'cn-search/index.html']) {
    const source = read(file);
    assert.doesNotMatch(source, /on(?:click|change|input|error)\s*=/i, file);
  }
});

test('Bootstrap JavaScript and active CSS consumers are retired', () => {
  assert.equal(existsSync(new URL('../bootstrap/bootstrap.min.js', import.meta.url)), false);
  for (const file of ['index.html', 'biguse.html', 'material.html', 'wardrobechk.html', 'cn-search/index.html']) {
    const source = read(file);
    assert.doesNotMatch(source, /bootstrap\/bootstrap\.min\.js/, file);
    assert.doesNotMatch(source, /bootstrap\/bootstrap\.min\.css/, file);
  }
});

test('native event bridge replaces inline handlers and owns button-group state', () => {
  const source = read('src/legacy/page-events.js');
  assert.match(source, /querySelectorAll\('\[data-ui-buttons\]'\)/);
  assert.doesNotMatch(source, /data-toggle="buttons"|syncBootstrapButtons/);
  for (const id of ['theme-fliter', 'theme', 'importCate', 'btn-import', 'btn-load-custom-inventory', 'aIntro']) {
    assert.match(source, new RegExp(id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(read('index.html'), /src\/legacy\/page-events\.js/);
  assert.match(read('biguse.html'), /src\/legacy\/page-events\.js/);
  assert.match(read('material.html'), /src\/legacy\/page-events\.js/);
  assert.match(read('biguse.mjs'), /btn-clear-cart-a/);
  assert.match(read('biguse.mjs'), /btn-clear-cart-b/);
});

test('Wardrobe Check no longer depends on jQuery', () => {
  assert.doesNotMatch(read('wardrobechk.html'), /src=['"]jquery(?:\.js|\.min\.js)['"]/);
  assert.doesNotMatch(read('wardrobechk.mjs'), /\$\(|jQuery/);
  assert.match(read('wardrobechk.mjs'), /DOMContentLoaded/);
});

test('active entry points no longer load jQuery', () => {
  const files = ['index.html', 'biguse.html', 'material.html', 'wardrobechk.html', 'cn-search/index.html'];
  const users = files.filter(file => /src=['"]jquery(?:\.js|\.min\.js)['"]/.test(read(file)));
  assert.deepEqual(users, []);
  assert.equal(existsSync(new URL('../jquery.js', import.meta.url)), false);
});

test('obsolete analytics and BigUse compatibility stub are removed', () => {
  assert.doesNotMatch(read('index.html'), /googletagmanager|UA-122120666-2|\bgtag\s*\(/);
  assert.doesNotMatch(read('biguse_nikki.mjs'), /function\s+menuFixed\s*\(/);
  const nikki = read('nikki.mjs');
  assert.match(nikki, /typeof menuFixed === 'function'/);
  assert.match(read('biguse_ui.mjs'), /https:\/\/seal100x\.github\.io\/nikkiup2u3_img\//);
});
