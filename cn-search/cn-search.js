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
//     CN strings use a TW lexicon built from data/wardrobe.js (trad?imp key)
//     so wording matches the project (e.g. ?餃 vs ?駁?), then OpenCC fallback.
//     Anchors unify Han-hyphen-Han??and ??餃/?駁????嗥敶?so CN matches tw2cn(TW).
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
		setStatus('閫??銝凌?);
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
			? '?|?蝝Ｗ??? (schema=' + data.schema + ')嚗??? build ???豢??冽??'
			: '';
		var tagsTwNote = (data.schema && data.schema < 3)
			? '?|?撱箄降?? npm run build:cn-index 隞亙神?亙??朣?蝐?tagsTw'
			: '';
		var openccNote = openccLoaded
			? ''
			: '?|?霅血?嚗penCC ?芾??伐?CDN ?航鋡急?嚗?蝪∠?頧?????朣?銝迤蝣?;
		setStatus('?豢?鞈??湔: ' + (data.lastUpdated || '?') + '?|???' + merged.length + ' 蝑? + schemaNote + tagsTwNote + openccNote);
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
		var msg = '? ' + added + ' 蝑?;
		if (dup) msg += '嚗??銴?' + dup;
		if (miss) msg += '嚗 fullRow ' + miss;
		showToast(msg);
	}

	// Per-row '嚗?
	tbody.addEventListener('click', function (ev) {
		var btn = ev.target.closest && ev.target.closest('.btn-add');
		if (!btn || btn.disabled) return;
		var key = btn.getAttribute('data-key');
		var m = mergedByKey[key];
		var result = addToStaging(m);
		if (result.ok) {
			renderStaging();
			showToast(m && m.name ? ('撌脣??伐?' + m.name) : '撌脣???);
		} else if (result.reason === 'dup') {
			showToast('撌脣?怠??');
		} else {
			showToast('閰脩?蝻?fullRow嚗??? build');
		}
	});

	// '嚗??
	btnAddAll.addEventListener('click', function () {
		if (!lastMatched.length) { showToast('瘝?蝚血?????); return; }
		if (lastMatched.length > 500 &&
			!window.confirm('撠???' + lastMatched.length + ' 蝑?怠??嚗Ⅱ摰?')) return;
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
		if (!staging.length) { showToast('?怠???舐征??); return; }
		copyText(makeStagingSnippet(staging))
			.then(function () { showToast('撌脰?鋆?' + staging.length + ' 蝑?芾票蝪?); })
			.catch(function () { showToast('銴ˊ憭望?嚗??寧??頛?畾萸?); });
	});

	btnDownloadStaging.addEventListener('click', function () {
		if (!staging.length) { showToast('?怠???舐征??); return; }
		downloadSnippet();
	});

	btnClearStaging.addEventListener('click', function () {
		if (!staging.length) return;
		if (!window.confirm('皜征?怠?? ' + staging.length + ' 蝑?')) return;
		clearStaging();
		showToast('撌脫?蝛箸摮?);
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

		if (!name) { showToast('隢撓?亙?蝔?); manualNameEl.focus(); return; }
		if (!type) { showToast('隢????); manualTypeEl.focus(); return; }
		if (!id) { showToast('隢撓?亦楊??); manualIdEl.focus(); return; }
		if (!stars) { showToast('隢??蝝?); manualStarsEl.focus(); return; }

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
				showToast('撅祆扼? + (labelEl ? labelEl.textContent : '?') + '???迂 SS/S/A/B/C ?征??);
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
			showToast('?怠??撌脫??詨?憿 + 蝺刻?');
			return;
		}
		if (mergedByKey[key]) {
			var existing = mergedByKey[key];
			var existingLabel = existing.name || '(?芰)';
			if (!window.confirm('蝝Ｗ?銝剖歇摮?詨?憿 + 蝺刻?嚗? + existingLabel + ' (' + key + ')\n隞?隞交????憓?怠?嚗?)) return;
		}

		staging.push({ key: key, row: row });
		stagingKeys[key] = true;
		renderStaging();
		showToast('撌脫??憓?' + name);
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

	setStatus('霈??揣撘葉??);
	fetch('data/cn_search_index.json')
		.then(function (resp) {
			if (!resp.ok) throw new Error('HTTP ' + resp.status + ' ' + resp.statusText);
			return resp.json();
		})
		.then(init)
		.catch(function (err) {
			setStatus('霈?仃??' + err.message);
			countEl.innerHTML =
				'<span class="notice">?⊥?霈??data/cn_search_index.json??蝣箄?嚗? +
				'<br>1. 撌脣銵?<code>node scripts/build-cn-search-index.mjs</code> ?Ｙ?蝝Ｗ?瑼? +
				'<br>2. ?? HTTP 隡箸??券???銝?湔 file:// ??嚗?靘?<code>npx serve .</code>?? +
				'</span>';
		});
})();
