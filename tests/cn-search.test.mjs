import test from 'node:test';
import assert from 'node:assert/strict';
import { createLexicon, canonicalLexAnchor, splitPreserveSeg } from '../cn-search/src/normalization.mjs';
import { buildTwLookup, mergeRow, filterRows } from '../cn-search/src/search.mjs';
import { buildStagingRow, rowToWardrobeLine, buildStagingSnippet } from '../cn-search/src/staging.mjs';
import { collectManualOptions, VALID_ATTR } from '../cn-search/src/manual-entry.mjs';
import { escapeHtml, resultRowsHtml } from '../cn-search/src/ui.mjs';

const identity = (s) => String(s);
const baseRow = ['春櫻','髮型','001','5','SS','S','A','B','C','S','A','S','B','C','POP/小動物','活動·限時登入','套裝A','V1'];

test('normalization preserves separators and canonicalizes known login wording', () => {
  assert.deepEqual(splitPreserveSeg('POP/小動物,舞者，泳裝'), ['POP','/','小動物',',','舞者','，','泳裝']);
  assert.equal(canonicalLexAnchor('活動-限时登陆'), '活動·限时登录');
});

test('lexicon aligns CN compounds to repository wording', () => {
  const tw2cn = (s) => s.replace(/活動/g, '活动').replace(/限時/g, '限时').replace(/登入/g, '登录');
  const lexicon = createLexicon({ s2tw: identity, tw2cn });
  lexicon.build([baseRow]);
  assert.equal(lexicon.alignWholeField('活动-限时登录'), '活動·限時登入');
  assert.equal(lexicon.alignCompoundField('POP/小動物'), 'POP/小動物');
});

test('search lookup and filtering keep TW matches and CN-only rows distinct', () => {
  const lookup = buildTwLookup([baseRow]);
  const deps = { s2tw: identity, alignCompoundField: identity, alignWholeField: identity };
  const tw = mergeRow({ id:'001', categoryCn:'发型', nameCn:'春樱', tagsCn:'', sourceCn:'', suitCn:'', version:'V1', fullRow:baseRow }, lookup.slim, deps);
  const cn = mergeRow({ id:'999', categoryCn:'发型', nameCn:'新衣', tagsCn:'', sourceCn:'活動', suitCn:'', version:'V2', fullRow:baseRow }, lookup.slim, deps);
  assert.equal(tw.hasTw, true);
  assert.equal(cn.hasTw, false);
  assert.deepEqual(filterRows([tw, cn], { name:'新衣', suit:'', version:'', source:'', cnOnly:false, category:'' }), [cn]);
  assert.deepEqual(filterRows([tw, cn], { name:'', suit:'', version:'', source:'', cnOnly:true, category:'' }), [cn]);
});

test('staging conversion preserves 18-column shape and serializer output', () => {
  const item = { hasTw:false, key:'髮型|999', type:'髮型', tags:'POP', cnFullRow:[...baseRow] };
  const row = buildStagingRow(item, {}, { s2tw:identity, alignCompoundField:identity, alignWholeField:identity });
  assert.equal(row.length, 18);
  assert.equal(row[1], '髮型');
  assert.equal(row[14], 'POP');
  assert.match(rowToWardrobeLine(row), /^  \[/);
  assert.match(buildStagingSnippet([{ key:item.key, row }], new Date('2026-09-16T00:00:00Z')), /1 筆/);
});

test('manual options derive categories/tags and attribute grades remain constrained', () => {
  const options = collectManualOptions([baseRow], ['POP']);
  assert.deepEqual(options.categories, ['髮型']);
  assert.ok(options.tags.includes('POP'));
  assert.ok(options.tags.includes('小動物'));
  assert.equal(VALID_ATTR.SS, 1);
  assert.equal(VALID_ATTR.X, undefined);
});

test('UI rendering escapes user/data text while preserving row semantics', () => {
  assert.equal(escapeHtml('<x&y>'), '&lt;x&amp;y&gt;');
  const html = resultRowsHtml([{ hasTw:false, cnFullRow:baseRow, key:'髮型|001', id:'001', type:'髮型', name:'<b>x</b>', suit:'', tags:'', source:'', version:'', cnName:'', cnSuit:'', cnSource:'' }]);
  assert.match(html, /&lt;b&gt;x&lt;\/b&gt;/);
  assert.match(html, /class="cn-only"/);
  assert.match(html, /data-key="髮型\|001"/);
});
