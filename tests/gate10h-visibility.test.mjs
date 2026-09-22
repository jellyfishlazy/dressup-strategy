import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('Gate 10H-B native DOM visibility restores CSS-hidden elements', () => {
  const nativeDom = read('src/legacy/native-dom.js');

  assert.match(nativeDom, /var displayMemory = new WeakMap\(\);/);
  assert.match(nativeDom, /function defaultDisplay\(element\)/);
  assert.match(nativeDom, /getComputedStyle\(element\)\.display === 'none'/);
  assert.match(nativeDom, /element\.style\.display = defaultDisplay\(element\);/);
  assert.match(nativeDom, /function showElement\(element\)/);
  assert.match(nativeDom, /function hideElement\(element\)/);
  assert.match(nativeDom, /NativeDomCollection\.prototype\.show = function \(\)/);
  assert.match(nativeDom, /NativeDomCollection\.prototype\.hide = function \(\)/);
  assert.match(nativeDom, /NativeDomCollection\.prototype\.toggle = function \(\)/);
});

test('Gate 10H-B keeps visibility consumers on the shared native DOM facade', () => {
  const main = read('nikki.mjs');
  const biguse = read('biguse_ui.mjs');
  const material = read('material.mjs');

  assert.match(main, /Dom\("\.highscore-link"\)\.toggle\(\)/);
  assert.match(biguse, /Dom\("#imgModel"\)\.show\(\)/);
  assert.match(material, /Dom\('#custInv'\)\.show\(\)/);
  assert.match(material, /Dom\('#custCart'\)\.show\(\)/);
});


test('Gate 10H Final scopes Material-only tooltip hiding away from Main', () => {
  const pageEvents = read('src/legacy/page-events.js');

  assert.match(pageEvents, /function bindMaterialEvents\(\) \{[\s\S]*?classList\.contains\('ui-page-material'\)/);
  assert.match(pageEvents, /if \(links\[i\]\.getAttribute\('tooltip'\)\) links\[i\]\.style\.display = 'none';/);
});
