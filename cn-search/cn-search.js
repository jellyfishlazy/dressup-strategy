import { WARDROBE_FIELD_COUNT, WARDROBE_FIELD_INDEX as FIELD } from '../src/domain/wardrobe/schema.mjs';
import { createLexicon } from './src/normalization.mjs';
import { buildTwLookup, mergeRow as mergeSearchRow, filterRows } from './src/search.mjs';
import { buildStagingRow as makeStagingRow, buildStagingSnippet as makeStagingSnippet } from './src/staging.mjs';
import { resultRowsHtml, stagingRowsHtml } from './src/ui.mjs';
import { VALID_ATTR, collectManualOptions as collectOptions } from './src/manual-entry.mjs';

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

	var opencc = globalThis.OpenCC;
	var s2tw = (opencc && opencc.Converter)
		? opencc.Converter({ from: 'cn', to: 'tw' })
		: function (s) { return s; };

	var tw2cn = (opencc && opencc.Converter)
		? opencc.Converter({ from: 'tw', to: 'cn' })
		: function (s) { return s; };

	var openccLoaded = !!(opencc && opencc.Converter);
	var lexicon = createLexicon({ s2tw: s2tw, tw2cn: tw2cn });

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
		var matched = filterRows(merged, {
			name: qName.value,
			suit: qSuit.value,
			version: qVersion.value,
			source: qSource.value,
			cnOnly: qCnOnly.checked,
			category: categorySelect.value
		});
		lastMatched = matched;
		render(matched);
	}

	function render(rows) {
		countEl.textContent = '符合 ' + rows.length + ' 筆 / 共 ' + merged.length + ' 筆';
		tbody.innerHTML = resultRowsHtml(rows);
	}

	function scheduleRefresh() {
		if (renderTimer) clearTimeout(renderTimer);
		renderTimer = setTimeout(refresh, 120);
	}

	function init(data) {
		setStatus('解析中…');
		var lookup = buildTwLookup(globalThis.wardrobe);
		var twByKey = lookup.slim;
		fullTwByKey = lookup.full;
		lexicon.build(globalThis.wardrobe);
		merged = (data.rows || []).map(function (cn) {
			return mergeSearchRow(cn, twByKey, {
				s2tw: s2tw,
				alignCompoundField: lexicon.alignCompoundField,
				alignWholeField: lexicon.alignWholeField
			});
		});
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
		stagingListEl.innerHTML = stagingRowsHtml(staging);
	}

	function addToStaging(merged) {
		if (!merged) return { ok: false, reason: 'missing' };
		if (stagingKeys[merged.key]) return { ok: false, reason: 'dup' };
		var row = makeStagingRow(merged, fullTwByKey, {
			s2tw: s2tw,
			alignCompoundField: lexicon.alignCompoundField,
			alignWholeField: lexicon.alignWholeField
		});
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
		var text = makeStagingSnippet(staging);
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
		copyText(makeStagingSnippet(staging))
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

	function initManualEntry() {
		if (!manualTypeEl || !manualTagsEl) return;
		var opts = collectOptions(globalThis.wardrobe, globalThis.wardrobeTags);

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

		var row = new Array(WARDROBE_FIELD_COUNT);
		for (var z = 0; z < WARDROBE_FIELD_COUNT; z++) row[z] = '';
		row[FIELD.name] = name;
		row[FIELD.type] = type;
		row[FIELD.id] = id;
		row[FIELD.stars] = stars;

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

		row[FIELD.tags] = getCheckedManualTags().join(',');
		row[FIELD.source] = manualSourceEl.value.trim();
		row[FIELD.suit] = manualSuitEl.value.trim();
		row[FIELD.version] = manualVersionEl.value.trim();

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
