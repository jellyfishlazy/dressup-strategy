import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

const activePages = ['index.html', 'biguse.html', 'material.html', 'wardrobechk.html'];

test('UI Gate 9B loads the shared foundation on every active page after Bootstrap', () => {
  for (const file of activePages) {
    const html = read(file);
    const bootstrapIndex = html.indexOf('bootstrap/bootstrap.min.css');
    const foundationIndex = html.indexOf('ui-foundation.css');

    assert.notEqual(bootstrapIndex, -1, `${file} still keeps Bootstrap during Gate 9B`);
    assert.notEqual(foundationIndex, -1, `${file} loads ui-foundation.css`);
    assert.ok(bootstrapIndex < foundationIndex, `${file} loads the project foundation after Bootstrap`);
  }
});

test('UI Gate 9B establishes shared tokens and neutral base primitives', () => {
  const css = read('ui-foundation.css');

  for (const token of [
    '--ui-font-sans',
    '--ui-font-size',
    '--ui-line-height',
    '--ui-color-text',
    '--ui-color-link',
    '--ui-color-surface',
    '--ui-color-border',
    '--ui-color-primary',
    '--ui-space-1',
    '--ui-space-6',
    '--ui-radius-md',
    '--ui-shadow-md',
    '--ui-control-height-md',
    '--ui-breakpoint-mobile',
    '--ui-breakpoint-compact',
  ]) {
    assert.match(css, new RegExp(`${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:`));
  }

  assert.match(css, /html\s*\{[^}]*box-sizing:\s*border-box/s);
  assert.match(css, /\*,\s*\*::before,\s*\*::after\s*\{[^}]*box-sizing:\s*inherit/s);
  assert.match(css, /body\s*\{[^}]*font-family:\s*var\(--ui-font-sans\)/s);
  assert.match(css, /:focus-visible\s*\{/);
  assert.match(css, /\.ui-surface\s*\{/);
  assert.match(css, /\.ui-muted\s*\{/);
});

test('UI Gate 9B does not retire Bootstrap or page-specific styles early', () => {
  const index = read('index.html');
  const biguse = read('biguse.html');
  const material = read('material.html');
  const wardrobe = read('wardrobechk.html');

  assert.match(index, /bootstrap\/bootstrap\.min\.css/);
  assert.match(biguse, /bootstrap\/bootstrap\.min\.css/);
  assert.match(material, /bootstrap\/bootstrap\.min\.css/);
  assert.match(wardrobe, /bootstrap\/bootstrap\.min\.css/);

  assert.match(index, /style\.css/);
  assert.match(biguse, /biguse\.css/);
  assert.match(material, /data\/material_style\.css/);
  assert.match(wardrobe, /ui\.css/);
});

test('UI Gate 9C defines project-owned shared controls and components', () => {
  const css = read('ui-foundation.css');

  for (const selector of [
    '.ui-btn', '.ui-btn-sm', '.ui-btn-xs', '.ui-btn-group', '.ui-control', '.ui-control-sm',
    '.ui-inline-form', '.ui-check', '.ui-tabs', '.ui-tabs-justified', '.ui-badge',
    '.ui-icon-button', '.ui-icon-cart', '.ui-icon-trash', '.ui-gotop',
  ]) {
    assert.ok(css.includes(selector), `foundation defines ${selector}`);
  }

  assert.doesNotMatch(read('style.css'), /Glyphicons Halflings|\.gotop\s*\{/);
});

test('UI Gate 9C migrates shared static and runtime Bootstrap component classes', () => {
  const index = read('index.html');
  const biguse = read('biguse.html');
  const material = read('material.html');
  const mainUi = read('ui.mjs');
  const biguseUi = read('biguse_ui.mjs');
  const nikki = read('nikki.mjs');
  const lazy = read('onekeystrategy_lan.mjs');
  const materialRuntime = read('material.mjs');
  const wardrobeRuntime = read('wardrobechk.mjs');

  assert.match(index, /class="ui-btn ui-btn-default"/);
  assert.match(index, /class="ui-check"/);
  assert.match(biguse, /class="ui-control ui-control-sm"/);
  assert.match(material, /ui-icon-button ui-icon-cart ui-btn ui-btn-xs ui-btn-default/);
  assert.match(mainUi, /ui-icon-button ui-icon-cart ui-btn ui-btn-default/);
  assert.match(mainUi, /ui-icon-button ui-icon-trash ui-btn ui-btn-xs ui-btn-default/);
  assert.match(mainUi, /th_gotop ui-gotop/);
  assert.match(biguseUi, /ui-btn ui-btn-default/);
  assert.match(nikki, /ui-tabs ui-tabs-justified/);
  assert.match(nikki, /ui-badge/);
  assert.match(lazy, /ui-btn ui-btn-xs ui-btn-default/);
  assert.match(materialRuntime, /ui-icon-button ui-icon-cart ui-btn ui-btn-xs ui-btn-default/);
  assert.match(wardrobeRuntime, /ui-tabs ui-tabs-justified/);
  assert.match(wardrobeRuntime, /ui-badge/);

  const forbiddenTokens = ['glyphicon', 'nav-tabs', 'nav-justified', 'btn-default', 'btn-info', 'btn-success', 'btn-outline-secondary'];
  for (const source of [index, biguse, material, mainUi, biguseUi, nikki, lazy, materialRuntime, wardrobeRuntime]) {
    for (const token of forbiddenTokens) {
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`(?<![A-Za-z0-9_-])${escaped}(?![A-Za-z0-9_-])`);
      assert.doesNotMatch(source, pattern);
    }
  }
});

test('UI Gate 9C keeps Bootstrap loaded only as a compatibility stylesheet', () => {
  for (const file of activePages) assert.match(read(file), /bootstrap\/bootstrap\.min\.css/);
});

test('UI Gate 9D defines shared page-level layout primitives', () => {
  const css = read('ui-foundation.css');
  for (const selector of [
    '.ui-page', '.ui-page-header', '.ui-page-section', '.ui-main-top', '.ui-biguse-top',
    '.ui-filter-layout', '.ui-split', '.ui-cart-panel', '.ui-editor', '.ui-preview-card',
    '.ui-material-frame', '.ui-wardrobe-grid', '.ui-initially-hidden',
  ]) {
    assert.ok(css.includes(selector), `foundation defines ${selector}`);
  }
});

test('UI Gate 9D migrates Main and BigUse page layout away from inline widths and floats', () => {
  const index = read('index.html');
  const biguse = read('biguse.html');

  assert.match(index, /<body class="ui-page ui-page-main">/);
  assert.match(index, /ui-inline-form ui-filter-layout/);
  assert.match(index, /class="ui-editor"/);
  assert.doesNotMatch(index, /style="[^"]*(?:width:\s*60%|float:\s*right)/);

  assert.match(biguse, /<body class="ui-page ui-page-biguse">/);
  assert.match(biguse, /id="shoppingCartCompare"/);
  assert.match(biguse, /id='shoppingCartContainerA'/);
  assert.match(biguse, /id='shoppingCartContainerB'/);
  assert.match(biguse, /ui-preview-card ui-initially-hidden/);
  assert.doesNotMatch(biguse, /style="[^"]*(?:width:\s*(?:45%|70%)|float:\s*(?:left|right)|font-size:\s*18px)/);

  const ids = [...biguse.matchAll(/\bid\s*=\s*['"]([^'"]+)['"]/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'BigUse has unique static ids after cart-container migration');
});

test('UI Gate 9D migrates Material and Wardrobe Check page structure', () => {
  const material = read('material.html');
  const wardrobe = read('wardrobechk.html');

  assert.match(material, /<body class="ui-page ui-page-material">/);
  assert.match(material, /myframe ui-material-frame/);
  assert.match(material, /id="intro" class="ui-initially-hidden"/);
  assert.match(material, /id="custInv" class="ui-text-center ui-initially-hidden"/);
  assert.doesNotMatch(material, /align="center"|style="display:none/);

  assert.match(wardrobe, /<body class="ui-page ui-page-wardrobe">/);
  assert.match(wardrobe, /ui-wardrobe-grid ui-page-section/);
  assert.match(wardrobe, /id='myClothes' class="ui-hidden"/);
  assert.doesNotMatch(wardrobe, /<table>|table td \{vertical-align:top;\}/);
});

test('UI Gate 9D retires superseded legacy page-layout CSS', () => {
  const style = read('style.css');
  const mobile = read('mobileui.css');
  const biguseCss = read('biguse.css');
  const materialCss = read('data/material_style.css');

  assert.doesNotMatch(style, /^body\s*\{|^div\.top\s*\{|^div\.fliter\s*\{|^div\.announcement\s*\{/m);
  assert.doesNotMatch(mobile, /^body\s*\{|^div\.top\s*\{|^div\.fliter\s*\{|^div\.announcement\s*\{/m);
  assert.doesNotMatch(biguseCss, /^#imgModel\s*\{/m);
  assert.doesNotMatch(materialCss, /^body\s*\{[^}]*margin-bottom\s*:\s*150px/sm);
});
