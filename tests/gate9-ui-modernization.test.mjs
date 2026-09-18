import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

const activePages = ['index.html', 'biguse.html', 'material.html', 'wardrobechk.html'];

test('UI foundation loads on every active page after Bootstrap retirement', () => {
  for (const file of activePages) {
    const html = read(file);
    assert.notEqual(html.indexOf('ui-foundation.css'), -1, `${file} loads ui-foundation.css`);
    assert.doesNotMatch(html, /bootstrap\/bootstrap\.min\.css/, `${file} no longer loads Bootstrap CSS`);
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

test('UI Gate 9B preserves page-specific styles alongside the shared foundation', () => {
  const index = read('index.html');
  const biguse = read('biguse.html');
  const material = read('material.html');
  const wardrobe = read('wardrobechk.html');

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

test('UI Gate 9E retires Bootstrap CSS and legacy Bootstrap button hooks', () => {
  const pageEvents = read('src/legacy/page-events.js');
  const foundation = read('ui-foundation.css');

  for (const file of [...activePages, 'cn-search/index.html']) assert.doesNotMatch(read(file), /bootstrap\/bootstrap\.min\.css/);
  assert.doesNotMatch(read('index.html'), /data-toggle="buttons"/);
  assert.doesNotMatch(read('biguse.html'), /data-toggle="buttons"/);
  assert.match(read('index.html'), /data-ui-buttons/);
  assert.match(read('biguse.html'), /data-ui-buttons/);
  assert.doesNotMatch(pageEvents, /syncBootstrapButtons|data-toggle="buttons"/);
  assert.match(pageEvents, /syncUiButtons/);
  assert.match(pageEvents, /\[data-ui-buttons\]/);

  for (const baseline of [
    /p\s*\{[^}]*margin:\s*0 0 var\(--ui-space-3\)/s,
    /a\s*\{[^}]*text-decoration:\s*none/s,
    /hr\s*\{[^}]*border-top:\s*1px solid #eeeeee/s,
    /label\s*\{[^}]*font-weight:\s*700/s,
    /\[data-ui-buttons\][^\{]*\{[^}]*clip:\s*rect\(0, 0, 0, 0\)/s,
  ]) assert.match(foundation, baseline);
});

test('UI Gate 9F-1 restores zoom and standardizes the responsive baseline', () => {
  const responsiveEntries = [...activePages, 'cn-search/index.html'];
  for (const file of responsiveEntries) {
    const html = read(file);
    assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
    assert.doesNotMatch(html, /maximum-scale|user-scalable/);
  }

  const foundation = read('ui-foundation.css');
  assert.match(foundation, /--ui-breakpoint-mobile:\s*650px/);
  assert.doesNotMatch(foundation, /--ui-breakpoint-compact|1020px/);

  for (const source of [foundation, read('onekeystrategy.css'), read('material.html')]) {
    const queries = [...source.matchAll(/^@media[^\{]+/gm)].map(match => match[0]);
    for (const query of queries) assert.match(query, /max-width:\s*650px/);
  }

  for (const file of ['index.html', 'biguse.html', 'wardrobechk.html']) {
    assert.match(read(file), /mobileui\.css[^>]*media="only screen and \(max-width: 650px\)"/);
  }
});

test('UI Gate 9F-2 centralizes typography, spacing and shared control states', () => {
  const foundation = read('ui-foundation.css');
  const style = read('style.css');
  const mobile = read('mobileui.css');

  for (const token of [
    '--ui-font-size-sm: 12px',
    '--ui-font-size-lg: 18px',
    '--ui-line-height-tight: 1.25',
    '--ui-line-height-relaxed: 1.6',
  ]) assert.ok(foundation.includes(token), `foundation defines ${token}`);

  assert.match(foundation, /\.ui-btn\s*\{[^}]*min-height:\s*var\(--ui-control-height-md\)/s);
  assert.match(foundation, /\.ui-control\s*\{[^}]*min-height:\s*var\(--ui-control-height-md\)[^}]*vertical-align:\s*middle/s);
  assert.match(foundation, /\.ui-btn-sm,\s*\.ui-control\.ui-control-sm\s*\{[^}]*min-height:\s*var\(--ui-control-height-sm\)/s);
  assert.match(foundation, /\.ui-btn:focus-visible,\s*\.ui-control:focus-visible\s*\{[^}]*box-shadow:\s*var\(--ui-focus-ring\)/s);
  assert.match(foundation, /\.ui-btn:disabled,[^}]*\.ui-control:disabled\s*\{[^}]*cursor:\s*not-allowed[^}]*opacity:\s*0\.65/s);
  assert.match(foundation, /\.ui-btn-info:hover,[^}]*background:\s*#31b0d5/s);
  assert.match(foundation, /\.ui-btn-success:hover,[^}]*background:\s*#449d44/s);
  assert.match(foundation, /\.ui-btn-group > \.ui-btn \+ \.ui-btn\s*\{[^}]*margin-left:\s*-1px/s);
  assert.match(foundation, /\.ui-check > label\s*\{[^}]*font-weight:\s*400/s);
  assert.match(foundation, /fieldset\s*\{[^}]*border:\s*1px solid var\(--ui-color-border-strong\)/s);
  assert.match(foundation, /legend\s*\{[^}]*font-size:\s*var\(--ui-font-size\)/s);

  assert.doesNotMatch(style, /^hr\s*\{|^input\[type="checkbox"\]\s*\{|^\.ui-check\s*\{|^fieldset\s*\{|^legend\s*\{|^#filtersTop select\s*\{|^span\.ui-badge\s*\{/m);
  assert.doesNotMatch(mobile, /^input\[type=checkbox\], input\[type=radio\]\s*\{|\.fliter_option \.ui-check\s*\{|\.fliter_form_div_right \.ui-check\s*\{/m);
  assert.match(style, /\.notice-text\s*\{[^}]*background:\s*var\(--ui-color-warning-bg\)[^}]*padding:\s*var\(--ui-space-2\) var\(--ui-space-3\)/s);
});

test('UI Gate 9F-3 polishes Main and BigUse responsive page behavior', () => {
  const foundation = read('ui-foundation.css');
  const style = read('style.css');
  const index = read('index.html');

  assert.match(index, /ui-btn-group ui-main-theme-controls/);
  assert.match(foundation, /\.ui-page-main \.ui-filter-layout\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*minmax\(280px, 0\.8fr\) minmax\(280px, 2fr\)/s);
  assert.match(style, /\.weightContainer\s*\{[^}]*overflow:\s*visible[^}]*display:\s*flex[^}]*flex-wrap:\s*wrap/s);
  assert.match(foundation, /\.ui-page-main \.ui-tabs,\s*\.ui-page-biguse \.ui-tabs\s*\{[^}]*display:\s*flex[^}]*flex-wrap:\s*wrap/s);
  assert.match(foundation, /\.ui-page-main \.ui-tabs-justified > li,\s*\.ui-page-biguse \.ui-tabs-justified > li\s*\{[^}]*min-width:\s*max-content/s);
  assert.match(foundation, /\.ui-page-biguse \.ui-cart-search\s*\{[^}]*display:\s*block[^}]*clear:\s*both[^}]*width:\s*100%/s);
  assert.match(foundation, /\.ui-page-biguse \.ui-preview-card\s*\{[^}]*right:\s*var\(--ui-space-4\)[^}]*max-width:\s*calc\(100vw - \(2 \* var\(--ui-space-4\)\)\)/s);
  assert.match(foundation, /@media only screen and \(max-width: 650px\)[\s\S]*\.ui-main-theme-controls\s*\{[^}]*width:\s*100%/s);
  assert.match(foundation, /@media only screen and \(max-width: 650px\)[\s\S]*\.ui-page-main \.ui-filter-layout\s*\{[^}]*display:\s*block/s);
});

test('UI Gate 9F-4 polishes Material, Wardrobe Check and auxiliary responsive layout', () => {
  const foundation = read('ui-foundation.css');
  const material = read('material.html');
  const auxiliary = read('cn-search/index.html');

  assert.doesNotMatch(material, /#myClothes\s*\{\s*width:|@media only screen and \(max-width:650px\)/);
  assert.match(foundation, /\.ui-page-material #levelDropInfo,[^}]*#custInv\s*\{[^}]*max-width:\s*100%[^}]*overflow-x:\s*auto/s);
  assert.match(foundation, /\.ui-page-material #myClothes\s*\{[^}]*width:\s*60%[^}]*max-width:\s*100%/s);
  assert.match(foundation, /\.ui-page-wardrobe \.ui-tabs\s*\{[^}]*display:\s*flex[^}]*flex-wrap:\s*wrap/s);
  assert.match(foundation, /\.ui-page-wardrobe \.ui-tabs-justified > li\s*\{[^}]*width:\s*auto[^}]*min-width:\s*max-content/s);
  assert.match(foundation, /@media only screen and \(max-width: 650px\)[\s\S]*\.ui-page-material #myClothes\s*\{[^}]*width:\s*100%/s);

  assert.match(auxiliary, /grid-template-columns:\s*repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(auxiliary, /@media only screen and \(max-width: 650px\)\s*\{[\s\S]*\.manual-attrs\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s);
  assert.match(auxiliary, /\.filter-group, \.manual-grid \.filter-group\s*\{[^}]*flex:\s*1 1 100%[^}]*min-width:\s*0/s);
  assert.match(auxiliary, /\.meta\s*\{[^}]*display:\s*flex[^}]*flex-wrap:\s*wrap/s);
  assert.doesNotMatch(auxiliary, /style="float:right"/);
});

test('UI Gate 9F-5 closes responsive CSS debt and inline layout residue', () => {
  const foundation = read('ui-foundation.css');
  const style = read('style.css');
  const mobile = read('mobileui.css');
  const auxiliary = read('cn-search/index.html');

  for (const source of [foundation, read('onekeystrategy.css'), auxiliary]) {
    const queries = [...source.matchAll(/^\s*@media[^\{]+/gm)].map(match => match[0]);
    for (const query of queries) assert.match(query, /max-width:\s*650px/);
  }
  assert.doesNotMatch([foundation, read('onekeystrategy.css'), auxiliary, read('material.html')].join('\n'), /@media[^\{]*(?:768|1020)px/);

  for (const file of activePages) {
    const html = read(file).replace(/<!--[\s\S]*?-->/g, '');
    assert.doesNotMatch(html, /style="[^"]*(?:width|float|position|margin|padding|max-width|min-width|font-size|overflow)[^"]*"/, `${file} has no active layout-critical inline style`);
  }
  assert.doesNotMatch(auxiliary, /style="[^"]*(?:width|float|position|margin|padding|max-width|min-width|font-size|color|background|overflow)[^"]*"/);
  assert.match(auxiliary, /class="manual-section-label"/);

  assert.doesNotMatch(style, /FloatMenu|ds-thread|ds-powered-by|ds-dialog-footer|\.fliter_option\s*\{\s*\}|div\.facet\s*\{\s*\}/);
  assert.match(mobile, /\.ui-tabs\.ui-tabs-justified>li/);
  assert.match(mobile, /\.table-head\s*\{/);
});

test('UI Gate 9G visual closeout locks the BigUse mobile action lane', () => {
  const foundation = read('ui-foundation.css');
  assert.match(foundation, /@media only screen and \(max-width: 650px\)[\s\S]*\.ui-page-biguse #clothes \.table-row\s*\{[^}]*position:\s*relative[^}]*min-height:\s*42px[^}]*padding-right:\s*84px/s);
  assert.match(foundation, /\.ui-page-biguse #clothes \.table-td\.icon\s*\{[^}]*position:\s*absolute[^}]*top:\s*var\(--ui-space-2\)[^}]*float:\s*none[^}]*margin-top:\s*0/s);
  assert.match(foundation, /\.ui-page-biguse #clothes \.table-td\.icon:nth-last-child\(2\)\s*\{[^}]*right:\s*44px/s);
  assert.match(foundation, /\.ui-page-biguse #clothes \.table-td\.icon:last-child\s*\{[^}]*right:\s*var\(--ui-space-1\)/s);
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
