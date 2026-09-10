// CN wardrobe search page logic.
//
// Loads:
//   - global `wardrobe` from data/wardrobe.js (TW, already loaded)
//   - data/cn_search_index.json via fetch (CN slim index)
//   - OpenCC via CDN (script tag) for fallback s2tw conversion
//
// Behavior:
//   - Joins CN rows to TW rows by (category, id) using a manual CN->TW
//     category map. Categories differ by vocabulary, not just characters,
//     so OpenCC is not reliable for the join key.
//   - Display fields are taken from TW when a match exists; otherwise the
//     CN strings use a TW lexicon built from data/wardrobe.js (trad→simp key)
//     so wording matches the project (e.g. 登入 vs 登錄), then OpenCC fallback.
//     Anchors unify Han-hyphen-Han→· and 限时登入/登陆→限时登录 so CN matches tw2cn(TW).
//   - Search matches each filter token against a haystack of both the TW
//     and the original CN strings, so users can type either form.

(function () {
	'use strict';

	// CN category -> TW category. Hand-mapped from the two `wardrobe.js`
	// files; do not derive via OpenCC alone because several pairs differ
	// in vocabulary (連衣裙 vs 連身裙, 上裝 vs 上衣, 下裝 vs 下著,
	// 髮卡 vs 髮夾, 手飾·雙 vs 手飾·手套, 地面 vs 地板, ...).
	var CN2TW_CATEGORY = {
		'发型': '髮型',
		'连衣裙': '連身裙',
		'外套': '外套',
		'上装': '上衣',
		'下装': '下著',
		'袜子-袜套': '襪子-腿飾',
		'袜子-袜子': '襪子-襪子',
		'鞋子': '鞋子',
		'饰品-头饰·发饰': '飾品-頭飾·髮飾',
		'饰品-头饰·头纱': '飾品-頭飾·頭紗',
		'饰品-头饰·发卡': '飾品-頭飾·髮夾',
		'饰品-头饰·耳朵': '飾品-頭飾·耳朵',
		'饰品-耳饰': '飾品-耳飾',
		'饰品-颈饰·围巾': '飾品-頸飾·圍巾',
		'饰品-颈饰·项链': '飾品-頸飾·項鍊',
		'饰品-手饰·右': '飾品-手飾·右',
		'饰品-手饰·左': '飾品-手飾·左',
		'饰品-手饰·双': '飾品-手飾·手套',
		'饰品-手持·右': '飾品-手持·右',
		'饰品-手持·左': '飾品-手持·左',
		'饰品-手持·双': '飾品-手持·雙',
		'饰品-腰饰': '飾品-腰飾',
		'饰品-特殊·面饰': '飾品-特殊·面飾',
		'饰品-特殊·胸饰': '飾品-特殊·胸飾',
		'饰品-特殊·纹身': '飾品-特殊·紋身',
		'饰品-特殊·翅膀': '飾品-特殊·翅膀',
		'饰品-特殊·尾巴': '飾品-特殊·尾巴',
		'饰品-特殊·前景': '飾品-特殊·前景',
		'饰品-特殊·后景': '飾品-特殊·後景',
		'饰品-特殊·顶饰': '飾品-特殊·頂飾',
		'饰品-特殊·地面': '飾品-特殊·地板',
		'饰品-皮肤': '飾品-皮膚',
		'妆容': '妝容',
		'萤光之灵': '螢光之靈'
	};

	var s2tw = (typeof OpenCC !== 'undefined' && OpenCC.Converter)
		? OpenCC.Converter({ from: 'cn', to: 'tw' })
		: function (s) { return s; };

	var tw2cn = (typeof OpenCC !== 'undefined' && OpenCC.Converter)
		? OpenCC.Converter({ from: 'tw', to: 'cn' })
		: function (s) { return s; };

	var openccLoaded = typeof OpenCC !== 'undefined' && !!OpenCC.Converter;

	// Maps simplified-Chinese anchor -> canonical TW string from data/wardrobe.js.
	var lexByKey = Object.create(null);

	var SPLIT_SEG = /(\/|,|，)/;

	// CN decoded sources often use ASCII hyphen between segments (活动-限时登录)
	// while data/wardrobe.js uses middle dot (活動·限時登入). Lexicon keys use tw2cn(TW)
	// → simplified with · , so lookups must normalize Han-hyphen-Han → Han·Han .
	function normalizeHanHyphenToDot(s) {
		if (!s) return s;
		var out = String(s);
		var prev;
		var re = /([\u4e00-\u9fff\u3400-\u4dbf\u3040-\u30ff\u3007])[\u002d\uFF0D\u2013\u2014]([\u4e00-\u9fff\u3400-\u4dbf\u3040-\u30ff\u3007])/g;
		do {
			prev = out;
			out = out.replace(re, '$1·$2');
		} while (out !== prev);
		return out;
	}

	// Mainland strings use 登录 / 登陆; OpenCC tw→cn may emit 限时登入 for 限时登入,
	// which does not equal game's 限时登录 — lex misses and s2tw yields 登錄.
	function unifyLimitedLoginWording(s) {
		return String(s)
			.replace(/限时登入/g, '限时登录')
			.replace(/限时登陆/g, '限时登录')
			.replace(/限時登入/g, '限时登录')
			.replace(/限時登陸/g, '限时登录');
	}

	function canonicalLexAnchor(s) {
		if (!s) return s;
		return unifyLimitedLoginWording(normalizeHanHyphenToDot(String(s)));
	}

	function splitPreserveSeg(s) {
		if (!s) return [];
		return String(s).split(SPLIT_SEG);
	}

	function registerLexEntry(twStr) {
		if (!twStr || typeof twStr !== 'string') return;
		var t = twStr.trim();
		if (!t) return;
		var key = canonicalLexAnchor(tw2cn(t));
		var prev = lexByKey[key];
		if (!prev) {
			lexByKey[key] = t;
			return;
		}
		if (prev === t) return;
		// Prefer longer TW phrase when two phrases collapse to the same simp key.
		if (t.length > prev.length) lexByKey[key] = t;
	}

	function registerLexFieldPieces(str) {
		if (!str || typeof str !== 'string') return;
		registerLexEntry(str);
		var parts = splitPreserveSeg(str);
		for (var i = 0; i < parts.length; i++) {
			var p = parts[i];
			if (!p || p === '/' || p === ',' || p === '，') continue;
			registerLexEntry(p.trim());
		}
	}

	function buildTwLexicon() {
		lexByKey = Object.create(null);
		if (typeof wardrobe === 'undefined' || !wardrobe || !wardrobe.length) return;
		for (var i = 0; i < wardrobe.length; i++) {
			var row = wardrobe[i];
			registerLexFieldPieces(row[14] || '');
			registerLexFieldPieces(row[15] || '');
			registerLexFieldPieces(row[16] || '');
			registerLexEntry(row[17] || '');
		}
	}

	function alignWholeField(cnSimpStr) {
		if (!cnSimpStr) return '';
		var raw = String(cnSimpStr);
		var canon = canonicalLexAnchor(raw);
		if (lexByKey[canon]) return lexByKey[canon];
		if (lexByKey[raw]) return lexByKey[raw];
		var k = canonicalLexAnchor(tw2cn(s2tw(canon)));
		if (lexByKey[k]) return lexByKey[k];
		k = canonicalLexAnchor(tw2cn(s2tw(raw)));
		if (lexByKey[k]) return lexByKey[k];
		return s2tw(canon);
	}

	function alignCompoundField(cnStr) {
		if (!cnStr) return '';
		var raw = String(cnStr);
		var canonFull = canonicalLexAnchor(raw);
		if (lexByKey[canonFull]) return lexByKey[canonFull];
		if (lexByKey[raw]) return lexByKey[raw];
		var parts = splitPreserveSeg(canonFull);
		if (parts.length <= 1) return alignWholeField(raw);
		var out = [];
		for (var j = 0; j < parts.length; j++) {
			var p = parts[j];
			if (p === '/' || p === ',' || p === '，') out.push(p);
			else out.push(alignWholeField(p.trim()));
		}
		return out.join('');
	}

	var statusEl = document.getElementById('status');
	var countEl = document.getElementById('count');
		var tbody = document.querySelector('#results tbody');
		var categorySelect = document.getElementById('q-category');
	var qName = document.getElementById('q-name');
	var qSuit = document.getElementById('q-suit');
	var qVersion = document.getElementById('q-version');
	var qSource = document.getElementById('q-source');
	var qCnOnly = document.getElementById('q-cn-only');
	var btnClear = document.getElementById('btn-clear');
	var btnAddAll = document.getElementById('btn-add-all');
	var btnCopyStaging = document.getElementById('btn-copy-staging');
	var btnDownloadStaging = document.getElementById('btn-download-staging');
	var btnClearStaging = document.getElementById('btn-clear-staging');
	var stagingCountEl = document.getElementById('staging-count');
	var stagingListEl = document.getElementById('staging-list');
	var stagingEmptyEl = document.getElementById('staging-empty');
	var toastEl = document.getElementById('toast');
	var manualNameEl = document.getElementById('m-name');
	var manualTypeEl = document.getElementById('m-type');
	var manualIdEl = document.getElementById('m-id');
	var manualStarsEl = document.getElementById('m-stars');
	var manualSuitEl = document.getElementById('m-suit');
	var manualSourceEl = document.getElementById('m-source');
	var manualVersionEl = document.getElementById('m-version');
	var manualTagsEl = document.getElementById('m-tags');
	var manualTagsEmptyEl = document.getElementById('m-tags-empty');
	var manualAttrInputs = document.querySelectorAll('#manual-entry input[data-attr]');
	var btnManualAdd = document.getElementById('btn-manual-add');
	var btnManualReset = document.getElementById('btn-manual-reset');

	var merged = [];
	var mergedByKey = Object.create(null);
	var fullTwByKey = Object.create(null);
	var lastMatched = [];
	var staging = [];
	var stagingKeys = Object.create(null);
	var renderTimer = null;
	var toastTimer = null;

	function setStatus(msg) { statusEl.textContent = msg; }

	function showToast(msg) {
		toastEl.textContent = msg;
		toastEl.classList.add('show');
		if (toastTimer) clearTimeout(toastTimer);
		toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 1600);
	}

	function buildTwLookup() {
		// `wardrobe` is the global array defined by data/wardrobe.js.
		// Builds two maps in one pass: a slim object for rendering, and
		// fullTwByKey -> full 18-column array clones for staging.
		var map = Object.create(null);
		if (typeof wardrobe === 'undefined' || !wardrobe || !wardrobe.length) {
			console.warn('TW wardrobe global not found.');
			return map;
		}
		for (var i = 0; i < wardrobe.length; i++) {
			var row = wardrobe[i];
			var key = row[1] + '|' + row[2];
			map[key] = {
				name: row[0],
				type: row[1],
				id: row[2],
				tags: row[14] || '',
				source: row[15] || '',
				suit: row[16] || '',
				version: row[17] || ''
			};
			fullTwByKey[key] = row.slice();
		}
		return map;
	}

	function mergeRow(cn, twByKey) {
		var typeTw = CN2TW_CATEGORY[cn.categoryCn] || s2tw(cn.categoryCn || '');
		var tw = twByKey[typeTw + '|' + cn.id];

		var name, suit, tags, source, version, hasTw;
		if (tw) {
			hasTw = true;
			name = tw.name;
			suit = tw.suit;
			tags = tw.tags;
			source = tw.source;
			version = tw.version;
		} else {
			hasTw = false;
			name = s2tw(cn.nameCn || '');
			suit = alignCompoundField(cn.suitCn || '');
			tags = Object.prototype.hasOwnProperty.call(cn, 'tagsTw')
				? (cn.tagsTw == null ? '' : String(cn.tagsTw))
				: alignCompoundField(cn.tagsCn || '');
			source = alignCompoundField(cn.sourceCn || '');
			version = alignWholeField(cn.version || '') || (cn.version || '');
		}

		// Build search haystacks combining TW + CN so users can paste
		// either traditional or simplified text.
		var hayName = (name + '|' + (cn.nameCn || '')).toLowerCase();
		var suitFallback = s2tw(cn.suitCn || '');
		var haySuit = (suit + '|' + (cn.suitCn || '') + '|' + suitFallback).toLowerCase();
		var srcFallback = s2tw(cn.sourceCn || '');
		var tagRaw = cn.tagsCn || '';
		var tagS2tw = s2tw(tagRaw);
		var haySource = (source + '|' + (cn.sourceCn || '') + '|' + srcFallback + '|' +
			tags + '|' + tagRaw + '|' + tagS2tw).toLowerCase();
		var hayVersion = (version + '|' + (cn.version || '')).toLowerCase();

		return {
			hasTw: hasTw,
			id: cn.id,
			type: typeTw,
			typeCn: cn.categoryCn,
			key: typeTw + '|' + cn.id,
			name: name,
			suit: suit,
			tags: tags,
			source: source,
			version: version,
			cnName: cn.nameCn || '',
			cnSuit: cn.suitCn || '',
			cnSource: cn.sourceCn || '',
			cnFullRow: Array.isArray(cn.fullRow) ? cn.fullRow : null,
			hayName: hayName,
			haySuit: haySuit,
			haySource: haySource,
			hayVersion: hayVersion
		};
	}

	function tokens(s) {
		if (!s) return [];
		return s.trim().split(/\s+/).filter(Boolean).map(function (t) { return t.toLowerCase(); });
	}

	function matchAll(hay, qs) {
		for (var i = 0; i < qs.length; i++) {
			if (hay.indexOf(qs[i]) < 0) return false;
		}
		return true;
	}

	function populateCategoryOptions() {
		var seen = Object.create(null);
		for (var i = 0; i < merged.length; i++) {
			seen[merged[i].type] = (seen[merged[i].type] || 0) + 1;
		}
		var keys = Object.keys(seen).sort();
		for (var k = 0; k < keys.length; k++) {
			var opt = document.createElement('option');
			opt.value = keys[k];
			opt.textContent = keys[k] + ' (' + seen[keys[k]] + ')';
			categorySelect.appendChild(opt);
		}
	}

	function refresh() {
		// User input may be either TW or CN; convert TW->? we can't easily,
		// but each haystack already contains the CN original too, so
		// matching either form works as long as the user's text appears
		// verbatim in at least one of them.
		var nt = tokens(qName.value);
		var st = tokens(qSuit.value);
		var vt = tokens(qVersion.value);
		var ot = tokens(qSource.value);
		var cnOnly = qCnOnly.checked;
		var cat = categorySelect.value;

		var matched = [];
		for (var i = 0; i < merged.length; i++) {
			var r = merged[i];
			if (cnOnly && r.hasTw) continue;
			if (cat && r.type !== cat) continue;
			if (nt.length && !matchAll(r.hayName, nt)) continue;
			if (st.length && !matchAll(r.haySuit, st)) continue;
			if (vt.length && !matchAll(r.hayVersion, vt)) continue;
			if (ot.length && !matchAll(r.haySource, ot)) continue;
			matched.push(r);
		}
		lastMatched = matched;
		render(matched);
	}

	function escapeHtml(s) {
		return String(s == null ? '' : s)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;');
	}

	function render(rows) {
		var total = merged.length;
		countEl.textContent = '符合 ' + rows.length + ' 筆 / 共 ' + total + ' 筆';

		var cap = 800;
		var n = Math.min(rows.length, cap);
		var parts = [];
		for (var i = 0; i < n; i++) {
			var r = rows[i];
			var rawBits = [];
			if (r.cnName && r.cnName !== r.name) rawBits.push(r.cnName);
			if (r.cnSuit && r.cnSuit !== r.suit) rawBits.push(r.cnSuit);
			if (r.cnSource && r.cnSource !== r.source) rawBits.push(r.cnSource);
			var canAdd = r.hasTw || !!r.cnFullRow;
			var addBtn = '<button class="btn-add" data-key="' + escapeHtml(r.key) + '" type="button" title="' +
				(canAdd ? '加入暫存' : '索引缺 fullRow，請重跑 build') + '"' +
				(canAdd ? '' : ' disabled') + '>＋</button>';
			parts.push(
				'<tr' + (r.hasTw ? '' : ' class="cn-only"') + '>' +
				'<td class="col-add">' + addBtn + '</td>' +
				'<td>' + escapeHtml(r.id) + '</td>' +
				'<td>' + escapeHtml(r.type) + '</td>' +
				'<td class="wrap">' + escapeHtml(r.name) + (r.hasTw ? '' : '<span class="cn-tag">陸服</span>') + '</td>' +
				'<td class="wrap">' + escapeHtml(r.suit) + '</td>' +
				'<td class="wrap">' + escapeHtml(r.tags) + '</td>' +
				'<td class="wrap">' + escapeHtml(r.source) + '</td>' +
				'<td>' + escapeHtml(r.version) + '</td>' +
				'<td class="wrap cn-raw">' + escapeHtml(rawBits.join(' / ')) + '</td>' +
				'</tr>'
			);
		}
		if (rows.length > cap) {
			parts.push('<tr><td colspan="9" style="text-align:center;color:#999;padding:10px">… 僅顯示前 ' + cap + ' 筆，但「＋全部」會加入全部 ' + rows.length + ' 筆。</td></tr>');
		}
		tbody.innerHTML = parts.join('');
	}

	function scheduleRefresh() {
		if (renderTimer) clearTimeout(renderTimer);
		renderTimer = setTimeout(refresh, 120);
	}

	function init(data) {
		setStatus('解析中…');
		var twByKey = buildTwLookup();
		buildTwLexicon();
		merged = (data.rows || []).map(function (cn) { return mergeRow(cn, twByKey); });
		for (var i = 0; i < merged.length; i++) mergedByKey[merged[i].key] = merged[i];
		populateCategoryOptions();
		initManualEntry();
		var schemaNote = (data.schema && data.schema < 2)
			? '　|　索引舊版 (schema=' + data.schema + ')，請重跑 build 才能加入陸服獨有項目'
			: '';
		var tagsTwNote = (data.schema && data.schema < 3)
			? '　|　建議重跑 npm run build:cn-index 以寫入台服對齊標籤 tagsTw'
			: '';
		var openccNote = openccLoaded
			? ''
			: '　|　警告：OpenCC 未載入（CDN 可能被擋）；簡繁轉換與語料對齊將不正確';
		setStatus('陸服資料更新: ' + (data.lastUpdated || '?') + '　|　共 ' + merged.length + ' 筆' + schemaNote + tagsTwNote + openccNote);
		refresh();
	}

	// ---- Staging ---------------------------------------------------------

	// Indices for CN-only staging: rating slots get plain s2tw; name [0]
	// never uses lexicon; [14]-[17] use lexicon alignment.
	var ATTR_INDICES = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

	function buildStagingRow(m) {
		// Returns an 18-element array matching the schema of data/wardrobe.js.
		if (m.hasTw) {
			var tw = fullTwByKey[m.key];
			if (tw) return tw.slice(0, 18);
		}
		if (!m.cnFullRow) return null;
		var row = m.cnFullRow.slice(0, 18);
		for (var ai = 0; ai < ATTR_INDICES.length; ai++) {
			var ix = ATTR_INDICES[ai];
			if (typeof row[ix] === 'string' && row[ix]) row[ix] = s2tw(row[ix]);
		}
		if (typeof row[0] === 'string' && row[0]) row[0] = s2tw(row[0]);
		if (typeof row[2] === 'string' && row[2]) row[2] = String(row[2]);
		row[1] = m.type || row[1];
		row[14] = m.tags != null ? m.tags : '';
		if (typeof row[15] === 'string') row[15] = alignCompoundField(row[15]);
		if (typeof row[16] === 'string') row[16] = alignCompoundField(row[16]);
		if (typeof row[17] === 'string') {
			var v0 = row[17];
			row[17] = alignWholeField(v0) || v0;
		}
		return row;
	}

	function rowSummary(row) {
		return {
			name: row[0] || '',
			type: row[1] || '',
			id: row[2] || '',
			suit: row[16] || '',
			version: row[17] || ''
		};
	}

	function renderStaging() {
		stagingCountEl.textContent = staging.length + ' 筆';
		if (!staging.length) {
			stagingListEl.style.display = 'none';
			stagingListEl.innerHTML = '';
			stagingEmptyEl.style.display = '';
			return;
		}
		stagingEmptyEl.style.display = 'none';
		stagingListEl.style.display = '';
		var parts = [];
		for (var i = 0; i < staging.length; i++) {
			var entry = staging[i];
			var s = rowSummary(entry.row);
			parts.push(
				'<div class="staging-item" data-key="' + escapeHtml(entry.key) + '">' +
					'<div class="meta">' +
						'<b>' + escapeHtml(s.name) + '</b>' +
						' <span class="sub">[' + escapeHtml(s.type) + ' ' + escapeHtml(s.id) + ']</span>' +
						'<br><span class="sub">' + escapeHtml(s.suit) + '　' + escapeHtml(s.version) + '</span>' +
					'</div>' +
					'<pre>' + escapeHtml(rowToWardrobeLine(entry.row)) + '</pre>' +
					'<button class="btn-del" data-key="' + escapeHtml(entry.key) + '" type="button" title="從暫存移除">×</button>' +
				'</div>'
			);
		}
		stagingListEl.innerHTML = parts.join('');
	}

	function addToStaging(merged) {
		if (!merged) return { ok: false, reason: 'missing' };
		if (stagingKeys[merged.key]) return { ok: false, reason: 'dup' };
		var row = buildStagingRow(merged);
		if (!row) return { ok: false, reason: 'no-fullrow' };
		staging.push({ key: merged.key, row: row });
		stagingKeys[merged.key] = true;
		return { ok: true };
	}

	function removeFromStaging(key) {
		if (!stagingKeys[key]) return false;
		for (var i = 0; i < staging.length; i++) {
			if (staging[i].key === key) { staging.splice(i, 1); break; }
		}
		delete stagingKeys[key];
		return true;
	}

	function clearStaging() {
		staging = [];
		stagingKeys = Object.create(null);
		renderStaging();
	}

	function rowToWardrobeLine(row) {
		// Mirrors the literal style in data/wardrobe.js: '...','...',... ,
		// using single-quoted strings. JSON.stringify produces double-quoted
		// strings with proper escapes; we convert to single quotes and
		// escape any embedded single quotes.
		var parts = [];
		for (var i = 0; i < 18; i++) {
			var v = row[i];
			if (typeof v === 'string') {
				var json = JSON.stringify(v);
				// json is "..." with internal " and \\ escaped; convert to '...'
				var body = json.slice(1, -1).replace(/\\"/g, '"').replace(/'/g, "\\'");
				parts.push("'" + body + "'");
			} else if (v == null) {
				parts.push("''");
			} else {
				parts.push(String(v));
			}
		}
		return '  [' + parts.join(',') + '],';
	}

	function buildStagingSnippet() {
		var header =
			'// data/wardrobe.js 片段（' + staging.length + ' 筆）\n' +
			'// 產生時間：' + new Date().toLocaleString() + '\n' +
			'// 將下列各列貼到 var wardrobe = [ ... ] 內適當位置；請自行檢查編號重複。\n';
		var lines = staging.map(function (e) { return rowToWardrobeLine(e.row); });
		return header + lines.join('\n') + '\n';
	}

	function copyText(text) {
		if (navigator.clipboard && navigator.clipboard.writeText) {
			return navigator.clipboard.writeText(text);
		}
		return new Promise(function (resolve, reject) {
			try {
				var ta = document.createElement('textarea');
				ta.value = text;
				ta.style.position = 'fixed';
				ta.style.left = '-9999px';
				document.body.appendChild(ta);
				ta.select();
				document.execCommand('copy');
				document.body.removeChild(ta);
				resolve();
			} catch (e) { reject(e); }
		});
	}

	function downloadSnippet() {
		var text = buildStagingSnippet();
		var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
		var url = URL.createObjectURL(blob);
		var a = document.createElement('a');
		var stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
		a.href = url;
		a.download = 'wardrobe-staging-' + stamp + '.js';
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		setTimeout(function () { URL.revokeObjectURL(url); }, 500);
	}

	function summarizeAddResults(results) {
		var added = 0, dup = 0, miss = 0;
		for (var i = 0; i < results.length; i++) {
			if (results[i].ok) added++;
			else if (results[i].reason === 'dup') dup++;
			else miss++;
		}
		var msg = '加入 ' + added + ' 筆';
		if (dup) msg += '，略過重複 ' + dup;
		if (miss) msg += '，無 fullRow ' + miss;
		showToast(msg);
	}

	// Per-row '＋'
	tbody.addEventListener('click', function (ev) {
		var btn = ev.target.closest && ev.target.closest('.btn-add');
		if (!btn || btn.disabled) return;
		var key = btn.getAttribute('data-key');
		var m = mergedByKey[key];
		var result = addToStaging(m);
		if (result.ok) {
			renderStaging();
			showToast(m && m.name ? ('已加入：' + m.name) : '已加入');
		} else if (result.reason === 'dup') {
			showToast('已在暫存區');
		} else {
			showToast('該筆缺 fullRow，請重跑 build');
		}
	});

	// '＋全部'
	btnAddAll.addEventListener('click', function () {
		if (!lastMatched.length) { showToast('沒有符合的項目'); return; }
		if (lastMatched.length > 500 &&
			!window.confirm('將加入 ' + lastMatched.length + ' 筆至暫存區，確定？')) return;
		var results = [];
		for (var i = 0; i < lastMatched.length; i++) results.push(addToStaging(lastMatched[i]));
		renderStaging();
		summarizeAddResults(results);
	});

	// Staging list: single-row delete
	stagingListEl.addEventListener('click', function (ev) {
		var btn = ev.target.closest && ev.target.closest('.btn-del');
		if (!btn) return;
		var key = btn.getAttribute('data-key');
		if (removeFromStaging(key)) renderStaging();
	});

	btnCopyStaging.addEventListener('click', function () {
		if (!staging.length) { showToast('暫存區是空的'); return; }
		copyText(buildStagingSnippet())
			.then(function () { showToast('已複製 ' + staging.length + ' 筆到剪貼簿'); })
			.catch(function () { showToast('複製失敗，請改用「下載片段」'); });
	});

	btnDownloadStaging.addEventListener('click', function () {
		if (!staging.length) { showToast('暫存區是空的'); return; }
		downloadSnippet();
	});

	btnClearStaging.addEventListener('click', function () {
		if (!staging.length) return;
		if (!window.confirm('清空暫存區 ' + staging.length + ' 筆？')) return;
		clearStaging();
		showToast('已清空暫存');
	});

	renderStaging();

	// ---- Manual entry ----------------------------------------------------

	// Valid attribute grades. Empty string means "not applicable for this axis".
	var VALID_ATTR = { '': 1, 'C': 1, 'B': 1, 'A': 1, 'S': 1, 'SS': 1 };

	// model.js reads 螢光之靈 row[14] as "中文屬性+數值" bonuses, not comma-style tags — exclude from picker (A+B).
	var GLOW_BONUS_TAG =
		/^(簡約|華麗|可愛|成熟|活潑|優雅|清純|性感|清涼|保暖)\+\d+$/;

	function shouldSkipTagFromPicker(category, token) {
		if (category === '螢光之靈') return true;
		return GLOW_BONUS_TAG.test(token);
	}

	function mergePickerTags(canonicalOrdered, scannedSet) {
		// Preserve order from canonicalOrdered (from data/wardrobe.js wardrobeTags), then append scan-only leftovers sorted zh-TW.
		var tagSeen = Object.create(null);
		var out = [];

		function pushOrdered(name) {
			if (!name || tagSeen[name]) return;
			tagSeen[name] = true;
			out.push(name);
		}

		if (canonicalOrdered && canonicalOrdered.length) {
			for (var c = 0; c < canonicalOrdered.length; c++) pushOrdered(canonicalOrdered[c]);
		}

		var extra = [];
		for (var k in scannedSet) {
			if (Object.prototype.hasOwnProperty.call(scannedSet, k) && !tagSeen[k]) extra.push(k);
		}
		extra.sort(function (a, b) { return a.localeCompare(b, 'zh-Hant', { numeric: true }); });
		for (var e = 0; e < extra.length; e++) pushOrdered(extra[e]);
		return out;
	}

	function collectManualOptions() {
		// Categories from wardrobe; tags = wardrobeTags order (when present) merged with scanned [14].
		var catSet = Object.create(null);
		var tagSet = Object.create(null);
		if (typeof wardrobe !== 'undefined' && wardrobe && wardrobe.length) {
			for (var i = 0; i < wardrobe.length; i++) {
				var row = wardrobe[i];
				var cat = row[1] || '';
				if (cat) catSet[cat] = true;
				var tagStr = row[14] || '';
				if (!tagStr) continue;
				if (shouldSkipTagFromPicker(cat, tagStr.trim())) continue;
				var parts = splitPreserveSeg(tagStr);
				for (var j = 0; j < parts.length; j++) {
					var p = parts[j];
					if (!p || p === '/' || p === ',' || p === '，') continue;
					var t = p.trim();
					if (!t || shouldSkipTagFromPicker(cat, t)) continue;
					tagSet[t] = true;
				}
			}
		}
		var tagList;
		if (typeof wardrobeTags !== 'undefined' && wardrobeTags && wardrobeTags.length) {
			tagList = mergePickerTags(wardrobeTags, tagSet);
		} else {
			tagList = Object.keys(tagSet).sort(function (a, b) {
				return a.localeCompare(b, 'zh-Hant', { numeric: true });
			});
		}
		return {
			categories: Object.keys(catSet).sort(),
			tags: tagList
		};
	}

	function initManualEntry() {
		if (!manualTypeEl || !manualTagsEl) return;
		var opts = collectManualOptions();

		for (var i = 0; i < opts.categories.length; i++) {
			var opt = document.createElement('option');
			opt.value = opts.categories[i];
			opt.textContent = opts.categories[i];
			manualTypeEl.appendChild(opt);
		}

		manualTagsEl.innerHTML = '';
		if (!opts.tags.length) {
			if (manualTagsEmptyEl) manualTagsEmptyEl.style.display = '';
		} else {
			if (manualTagsEmptyEl) manualTagsEmptyEl.style.display = 'none';
			for (var j = 0; j < opts.tags.length; j++) {
				var lbl = document.createElement('label');
				lbl.className = 'tag-check';
				var cb = document.createElement('input');
				cb.type = 'checkbox';
				cb.value = opts.tags[j];
				lbl.appendChild(cb);
				lbl.appendChild(document.createTextNode(' ' + opts.tags[j]));
				manualTagsEl.appendChild(lbl);
			}
		}

		for (var k = 0; k < manualAttrInputs.length; k++) {
			manualAttrInputs[k].addEventListener('input', onManualAttrInput);
			manualAttrInputs[k].addEventListener('blur', onManualAttrBlur);
		}

		if (btnManualAdd) btnManualAdd.addEventListener('click', handleManualAdd);
		if (btnManualReset) btnManualReset.addEventListener('click', function () {
			resetManualForm(true);
			manualNameEl.focus();
		});
	}

	function onManualAttrInput(ev) {
		var v = ev.target.value;
		var up = v.toUpperCase();
		if (v !== up) ev.target.value = up;
		ev.target.classList.remove('invalid');
	}

	function onManualAttrBlur(ev) {
		var v = ev.target.value.trim().toUpperCase();
		ev.target.value = v;
		if (!VALID_ATTR[v]) ev.target.classList.add('invalid');
		else ev.target.classList.remove('invalid');
	}

	function getCheckedManualTags() {
		var checked = manualTagsEl.querySelectorAll('input[type=checkbox]:checked');
		var out = [];
		for (var i = 0; i < checked.length; i++) out.push(checked[i].value);
		return out;
	}

	function handleManualAdd() {
		var name = manualNameEl.value.trim();
		var type = manualTypeEl.value;
		var id = manualIdEl.value.trim();
		var stars = manualStarsEl.value;

		if (!name) { showToast('請輸入名稱'); manualNameEl.focus(); return; }
		if (!type) { showToast('請選擇類別'); manualTypeEl.focus(); return; }
		if (!id) { showToast('請輸入編號'); manualIdEl.focus(); return; }
		if (!stars) { showToast('請選擇星級'); manualStarsEl.focus(); return; }

		var row = new Array(18);
		for (var z = 0; z < 18; z++) row[z] = '';
		row[0] = name;
		row[1] = type;
		row[2] = id;
		row[3] = stars;

		// Validate every attr cell, then assign.
		for (var i = 0; i < manualAttrInputs.length; i++) {
			var inp = manualAttrInputs[i];
			var v = inp.value.trim().toUpperCase();
			if (!VALID_ATTR[v]) {
				inp.classList.add('invalid');
				inp.focus();
				var labelEl = inp.parentNode && inp.parentNode.querySelector('label');
				showToast('屬性「' + (labelEl ? labelEl.textContent : '?') + '」僅允許 SS/S/A/B/C 或空白');
				return;
			}
			inp.classList.remove('invalid');
			var ix = parseInt(inp.getAttribute('data-attr'), 10);
			if (ix >= 4 && ix <= 13) row[ix] = v;
		}

		row[14] = getCheckedManualTags().join(',');
		row[15] = manualSourceEl.value.trim();
		row[16] = manualSuitEl.value.trim();
		row[17] = manualVersionEl.value.trim();

		var key = type + '|' + id;
		if (stagingKeys[key]) {
			showToast('暫存區已有相同類別 + 編號');
			return;
		}
		if (mergedByKey[key]) {
			var existing = mergedByKey[key];
			var existingLabel = existing.name || '(未知)';
			if (!window.confirm('索引中已存在相同類別 + 編號：' + existingLabel + ' (' + key + ')\n仍要以手動資料新增至暫存？')) return;
		}

		staging.push({ key: key, row: row });
		stagingKeys[key] = true;
		renderStaging();
		showToast('已手動新增：' + name);
		resetManualForm(false);
		manualNameEl.focus();
	}

	function resetManualForm(full) {
		manualNameEl.value = '';
		manualIdEl.value = '';
		manualStarsEl.value = '';
		for (var i = 0; i < manualAttrInputs.length; i++) {
			manualAttrInputs[i].value = '';
			manualAttrInputs[i].classList.remove('invalid');
		}
		var checked = manualTagsEl.querySelectorAll('input[type=checkbox]:checked');
		for (var j = 0; j < checked.length; j++) checked[j].checked = false;
		if (full) {
			manualTypeEl.value = '';
			manualSuitEl.value = '';
			manualSourceEl.value = '';
			manualVersionEl.value = '';
		}
	}

	// ---- Filter wiring ---------------------------------------------------

	[qName, qSuit, qVersion, qSource].forEach(function (el) {
		el.addEventListener('input', scheduleRefresh);
	});
	qCnOnly.addEventListener('change', refresh);
	categorySelect.addEventListener('change', refresh);
	btnClear.addEventListener('click', function () {
		qName.value = qSuit.value = qVersion.value = qSource.value = '';
		qCnOnly.checked = false;
		categorySelect.value = '';
		refresh();
	});

	setStatus('讀取陸服索引中…');
	fetch('data/cn_search_index.json')
		.then(function (resp) {
			if (!resp.ok) throw new Error('HTTP ' + resp.status + ' ' + resp.statusText);
			return resp.json();
		})
		.then(init)
		.catch(function (err) {
			setStatus('讀取失敗：' + err.message);
			countEl.innerHTML =
				'<span class="notice">無法讀取 data/cn_search_index.json。請確認：' +
				'<br>1. 已執行 <code>node scripts/build-cn-search-index.mjs</code> 產生索引檔。' +
				'<br>2. 透過 HTTP 伺服器開啟（不可直接 file:// 開啟），例：<code>npx serve .</code>。' +
				'</span>';
		});
})();
