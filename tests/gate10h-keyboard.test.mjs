import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('Gate 10H-C installs the keyboard activator exactly once', () => {
  const pageEvents = read('src/legacy/page-events.js');

  assert.equal((pageEvents.match(/function prepareKeyboardActivators\(\)/g) || []).length, 1);
  assert.equal((pageEvents.match(/^\s*prepareKeyboardActivators\(\);$/gm) || []).length, 1);
  assert.equal((pageEvents.match(/document\.addEventListener\('keydown'/g) || []).length, 1);
});

test('Gate 10H-C keeps Enter and Space mapped to one synthetic click path', () => {
  const pageEvents = read('src/legacy/page-events.js');

  assert.match(pageEvents, /event\.key !== 'Enter' && event\.key !== ' '/);
  assert.match(pageEvents, /event\.preventDefault\(\)/);
  assert.match(pageEvents, /target\.click\(\)/);
});
