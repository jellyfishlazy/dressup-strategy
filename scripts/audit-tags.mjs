// One-off audit: compare wardrobe [14] tokens vs flist/levels tag strings.
// Run: node scripts/audit-tags.mjs
import fs from 'node:fs';
import vm from 'node:vm';

function loadCtx(path) {
	const ctx = {};
	vm.createContext(ctx);
	vm.runInContext(fs.readFileSync(path, 'utf8'), ctx);
	return ctx;
}

const w = loadCtx('data/wardrobe.js');
const wardrobe = w.wardrobe;
const wardrobeTags = new Set(w.wardrobeTags || []);
const SPLIT = /(\/|,|，)/;
const GLOW = /^(簡約|華麗|可愛|成熟|活潑|優雅|清純|性感|清涼|保暖)\+\d+$/;
const rowTags = new Set();
const rowTagSamples = new Map(); // tag -> first row name for verification
for (const r of wardrobe) {
	const cat = r[1] || '';
	const tg = r[14] || '';
	if (!tg || cat === '螢光之靈') continue;
	for (const p of String(tg).split(SPLIT)) {
		const t = (p || '').trim();
		if (!t || p === '/' || p === ',' || p === '，') continue;
		if (GLOW.test(t)) continue;
		rowTags.add(t);
		if (!rowTagSamples.has(t)) rowTagSamples.set(t, r[0]);
	}
}

// Flist
const fctx = loadCtx('data/flist.js');
const flistTagSet = new Set();
const flistTagDetail = [];
for (const lvl of Object.keys(fctx.Flist || {})) {
	const e = fctx.Flist[lvl];
	if (e && Array.isArray(e.tag)) {
		for (const t of e.tag) {
			flistTagSet.add(t);
			flistTagDetail.push({ lvl, tag: t });
		}
	}
}

// levels.js bonus & filters (parse text, not exec — file uses jQuery)
const lcode = fs.readFileSync('data/levels.js', 'utf8');

// Match e.g. addBonusInfo('B', 0.25, "中式古典") -> capture the 3rd argument string.
// We intentionally avoid using non-greedy across ) since `addBonusInfo(...)` calls are short.
const bonusRe = /(addBonusInfo|replaceBonusInfo|bonusInfo)\s*\(\s*['"][^'"]+['"]\s*,\s*[^,]+,\s*['"]([^'"]+)['"]\s*\)/g;
const bonusTags = new Map();
const bonusOccurrences = []; // { fn, tag, near }
let m;
while ((m = bonusRe.exec(lcode)) !== null) {
	const t = m[2];
	if (!t) continue;
	bonusTags.set(t, (bonusTags.get(t) || 0) + 1);
	const start = Math.max(0, lcode.lastIndexOf('\n', m.index) + 1);
	const end = lcode.indexOf('\n', m.index);
	bonusOccurrences.push({ fn: m[1], tag: t, near: lcode.slice(start, end === -1 ? undefined : end).trim() });
}

const filtRe = /(?:normalFilter|weightedFilter)\s*\(\s*["']([^"']+)["']/g;
const filterTags = new Map();
const filterOccurrences = [];
while ((m = filtRe.exec(lcode)) !== null) {
	const seg = m[1];
	for (const tok of seg.split('/')) {
		if (!tok) continue;
		filterTags.set(tok, (filterTags.get(tok) || 0) + 1);
	}
	const start = Math.max(0, lcode.lastIndexOf('\n', m.index) + 1);
	const end = lcode.indexOf('\n', m.index);
	filterOccurrences.push({ seg, near: lcode.slice(start, end === -1 ? undefined : end).trim() });
}

const allEndStrings = new Set([...bonusTags.keys(), ...filterTags.keys(), ...flistTagSet]);
const orphan = [...allEndStrings].filter(t => !rowTags.has(t)).sort((a, b) => a.localeCompare(b, 'zh-Hant'));

function header(s) { return '\n=== ' + s + ' ==='; }

// Buffered output → write to file directly to avoid PowerShell pipeline reencoding.
const lines = [];
function out(s) { lines.push(String(s)); }
const origLog = console.log;
console.log = out;

console.log(header('wardrobeTags (' + wardrobeTags.size + ')'));
console.log([...wardrobeTags].join(', '));

console.log(header('wardrobe [14] scanned (' + rowTags.size + ')'));
console.log([...rowTags].sort((a, b) => a.localeCompare(b, 'zh-Hant')).join(', '));

console.log(header('Flist "tag" entries (' + flistTagSet.size + ' unique)'));
for (const d of flistTagDetail) console.log('  ' + d.lvl + ' -> ' + d.tag);

console.log(header('levels.js bonus-string occurrences (' + bonusTags.size + ' unique)'));
console.log([...bonusTags.entries()].sort((a, b) => b[1] - a[1]).map(([t, c]) => t + '(' + c + ')').join(', '));

console.log(header('levelFilters tokens (' + filterTags.size + ')'));
console.log([...filterTags.entries()].sort((a, b) => b[1] - a[1]).map(([t, c]) => t + '(' + c + ')').join(', '));

console.log(header('ORPHAN tokens (referenced in flist/levels, not in wardrobe [14])'));
for (const t of orphan) {
	const inFlist = flistTagSet.has(t) ? ' [Flist]' : '';
	const inBonus = bonusTags.has(t) ? ' [bonus×' + bonusTags.get(t) + ']' : '';
	const inFilter = filterTags.has(t) ? ' [levelFilters×' + filterTags.get(t) + ']' : '';
	console.log('  ' + t + inFlist + inBonus + inFilter);
}

console.log(header('Detail: bonus occurrences (line context)'));
for (const o of bonusOccurrences) {
	if (rowTags.has(o.tag)) continue;
	console.log('  ' + o.tag + ' :: ' + o.near);
}

console.log(header('Detail: levelFilters occurrences (line context)'));
for (const o of filterOccurrences) {
	console.log('  ' + o.seg + ' :: ' + o.near);
}

fs.writeFileSync('scripts/audit-tags.out.txt', lines.join('\n') + '\n', 'utf8');
console.log = origLog;
console.log('wrote scripts/audit-tags.out.txt');
