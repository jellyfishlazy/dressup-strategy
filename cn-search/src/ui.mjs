import { rowSummary, rowToWardrobeLine } from './staging.mjs';

/** @typedef {{ hasTw: boolean, cnFullRow: any[] | null, key: string, id: string, type: string, name: string, suit: string, tags: string, source: string, version: string, cnName: string, cnSuit: string, cnSource: string }} SearchDisplayRow */
/** @typedef {{ key: string, row: any[] }} StagingEntry */

/** @param {unknown} value */
export function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** @param {SearchDisplayRow[]} rows @param {number} [cap] */
export function resultRowsHtml(rows, cap = 800) {
  const count = Math.min(rows.length, cap);
  const parts = [];
  for (let i = 0; i < count; i++) {
    const row = rows[i];
    if (!row) continue;
    const rawBits = [];
    if (row.cnName && row.cnName !== row.name) rawBits.push(row.cnName);
    if (row.cnSuit && row.cnSuit !== row.suit) rawBits.push(row.cnSuit);
    if (row.cnSource && row.cnSource !== row.source) rawBits.push(row.cnSource);
    const canAdd = row.hasTw || !!row.cnFullRow;
    const addButton = '<button class="btn-add" data-key="' + escapeHtml(row.key) + '" type="button" title="' +
      (canAdd ? '加入暫存' : '索引缺 fullRow，請重跑 build') + '"' + (canAdd ? '' : ' disabled') + '>＋</button>';
    parts.push(
      '<tr' + (row.hasTw ? '' : ' class="cn-only"') + '>' +
      '<td class="col-add">' + addButton + '</td>' +
      '<td>' + escapeHtml(row.id) + '</td>' +
      '<td>' + escapeHtml(row.type) + '</td>' +
      '<td class="wrap">' + escapeHtml(row.name) + (row.hasTw ? '' : '<span class="cn-tag">陸服</span>') + '</td>' +
      '<td class="wrap">' + escapeHtml(row.suit) + '</td>' +
      '<td class="wrap">' + escapeHtml(row.tags) + '</td>' +
      '<td class="wrap">' + escapeHtml(row.source) + '</td>' +
      '<td>' + escapeHtml(row.version) + '</td>' +
      '<td class="wrap cn-raw">' + escapeHtml(rawBits.join(' / ')) + '</td>' +
      '</tr>'
    );
  }
  if (rows.length > cap) {
    parts.push('<tr><td colspan="9" style="text-align:center;color:#999;padding:10px">… 僅顯示前 ' + cap + ' 筆，但「＋全部」會加入全部 ' + rows.length + ' 筆。</td></tr>');
  }
  return parts.join('');
}

/** @param {StagingEntry[]} staging */
export function stagingRowsHtml(staging) {
  return staging.map((entry) => {
    const summary = rowSummary(entry.row);
    return '<div class="staging-item" data-key="' + escapeHtml(entry.key) + '">' +
      '<div class="meta">' +
      '<b>' + escapeHtml(summary.name) + '</b>' +
      ' <span class="sub">[' + escapeHtml(summary.type) + ' ' + escapeHtml(summary.id) + ']</span>' +
      '<br><span class="sub">' + escapeHtml(summary.suit) + '　' + escapeHtml(summary.version) + '</span>' +
      '</div>' +
      '<pre>' + escapeHtml(rowToWardrobeLine(entry.row)) + '</pre>' +
      '<button class="btn-del" data-key="' + escapeHtml(entry.key) + '" type="button" title="從暫存移除">×</button>' +
      '</div>';
  }).join('');
}
