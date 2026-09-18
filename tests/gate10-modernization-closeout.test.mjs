import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('Gate 10 keeps legacy click-like controls keyboard reachable', () => {
  const pageEvents = read('src/legacy/page-events.js');
  const mainUi = read('ui.mjs');
  const biguseUi = read('biguse_ui.mjs');

  assert.match(pageEvents, /querySelectorAll\('\.highscore-link, #showmore'\)/);
  assert.match(pageEvents, /setAttribute\('role', 'button'\)/);
  assert.match(pageEvents, /setAttribute\('tabindex', '0'\)/);
  assert.match(pageEvents, /event\.key !== 'Enter' && event\.key !== ' '/);
  assert.match(pageEvents, /target\.click\(\)/);

  assert.match(mainUi, /ui-gotop"\)\.attr\("role", "button"\)\.attr\("tabindex", "0"\)/);
  assert.match(biguseUi, /ui-gotop"\)\.attr\("role", "button"\)\.attr\("tabindex", "0"\)/);
});

test('Gate 10 gives icon-only actions accessible names', () => {
  const mainUi = read('ui.mjs');
  const biguseUi = read('biguse_ui.mjs');
  const material = read('material.mjs');

  assert.match(mainUi, /aria-label", "加入推薦穿戴"/);
  assert.match(mainUi, /aria-label", "從推薦穿戴移除"/);
  assert.match(biguseUi, /aria-label", "從搭配移除"/);
  assert.match(material, /aria-label="加入材料清單"/);
});
