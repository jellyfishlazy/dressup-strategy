import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('BigUse no longer loads jQuery or the retired autocomplete plugin', () => {
  const html = read('biguse.html');
  assert.doesNotMatch(html, /src=['"]jquery(?:\.js|\.min\.js)['"]/);
  assert.doesNotMatch(html, /jquery\.autocomplete(?:\.min)?\.js|jquery\.autocomplete\.css/);
  assert.match(html, /src\/legacy\/native-dom\.js/);
  assert.match(html, /src\/legacy\/native-autocomplete\.js/);
  assert.equal(existsSync(new URL('../jquery.autocomplete.min.js', import.meta.url)), false);
});

test('BigUse runtime contains no jQuery API references', () => {
  for (const file of ['biguse_ui.mjs', 'biguse_nikki.mjs', 'biguse_model.mjs', 'biguse.mjs']) {
    assert.doesNotMatch(read(file), /\$\s*\(|\$\s*\.|\bjQuery\b|\.autocomplete\s*\(/, file);
  }
});

test('native BigUse autocomplete keeps local selection and keyboard behavior explicit', () => {
  const source = read('src/legacy/native-autocomplete.js');
  assert.match(source, /addEventListener\('input'/);
  assert.match(source, /ArrowDown/);
  assert.match(source, /ArrowUp/);
  assert.match(source, /event\.key === 'Enter'/);
  assert.match(source, /event\.key === 'Escape'/);
  assert.match(source, /options\.onSelect/);
  assert.match(read('biguse_ui.mjs'), /NativeAutocomplete\.attach/);
});

test('BigUse UI and category runtime are covered by repository lint', () => {
  const lint = JSON.parse(read('package.json')).scripts.lint;
  assert.match(lint, /biguse_ui\.mjs/);
  assert.match(lint, /biguse_nikki\.mjs/);
  assert.match(lint, /src\/legacy/);
});
