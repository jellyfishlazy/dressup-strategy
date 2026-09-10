// Smoke-test for the tag refactor — writes UTF-8 file to avoid PS pipeline reencoding.
//   1. Confirm Flist + type+tag levels still match real wardrobe rows.
//   2. Confirm levelBonus tag strings have at least one matching clothing.
//   3. Spot-check that POP/小動物 split now yields two tokens.
// Run: node scripts/verify-level-tags.mjs
import fs from 'node:fs';
import vm from 'node:vm';

const lines = [];
const log = (...args) => lines.push(args.join(' '));

function load(p) { const c = {}; vm.createContext(c); vm.runInContext(fs.readFileSync(p, 'utf8'), c); return c; }
const w = load('data/wardrobe.js');
const fctx = load('data/flist.js');

const SPLIT_RE = /[\/,，]/;

function tagsOf(row) {
	return String(row[14] || '').split(SPLIT_RE).map(s => s.trim()).filter(Boolean);
}

function rowsByType() {
	const map = {};
	for (const r of w.wardrobe) {
		const t = r[1];
		if (!map[t]) map[t] = [];
		map[t].push(r);
	}
	return map;
}
const byType = rowsByType();

// --- (1) Flist with type+tag ---
log('=== Flist levels with type+tag — count of matching wardrobe rows ===');
for (const lvl of Object.keys(fctx.Flist || {})) {
	const e = fctx.Flist[lvl];
	if (!e || !Array.isArray(e.tag) || !Array.isArray(e.type)) continue;
	let matched = 0;
	for (const typ of e.type) {
		for (const row of byType[typ] || []) {
			const tags = tagsOf(row);
			if (tags.some(t => e.tag.includes(t))) matched++;
		}
	}
	log('  ' + lvl + ' type=' + JSON.stringify(e.type) + ' tag=' + JSON.stringify(e.tag) + ' -> ' + matched + ' rows ok');
}

// --- (2) Bonus tags reachable in wardrobe ---
log('\n=== levelBonus tag coverage ===');
const lcode = fs.readFileSync('data/levels.js', 'utf8');
const bonusRe = /(addBonusInfo|replaceBonusInfo|bonusInfo)\s*\(\s*['"][^'"]+['"]\s*,\s*[^,]+,\s*['"]([^'"]+)['"]\s*\)/g;
const bonusTagSet = new Set();
let m;
while ((m = bonusRe.exec(lcode)) !== null) bonusTagSet.add(m[2]);
const allWardrobeTags = new Set();
for (const r of w.wardrobe) for (const t of tagsOf(r)) allWardrobeTags.add(t);
const unreachable = [...bonusTagSet].filter(t => !allWardrobeTags.has(t));
log('  bonus tag strings (unique): ' + bonusTagSet.size);
log('  unreachable (not in any wardrobe [14] token): ' + unreachable.length);
if (unreachable.length) log('    -> ' + unreachable.join(', '));

// --- (3) split sanity check ---
log('\n=== Split sanity check (POP/小動物 etc.) ===');
const samples = w.wardrobe.filter(r => /[\/]/.test(r[14] || '')).slice(0, 5);
for (const r of samples) {
	log('  [' + r[0] + '] [14]="' + r[14] + '" -> tokens=' + JSON.stringify(tagsOf(r)));
}

// --- (4) regression: which levels changed ---
log('\n=== Regression: counts of clothes matched per renamed tag ===');
const renamed = ['小動物', '海軍風', '印度服飾', 'POP', 'OL', '蘿莉塔', '學院風'];
for (const t of renamed) {
	let n = 0;
	for (const r of w.wardrobe) if (tagsOf(r).includes(t)) n++;
	log('  ' + t + ' -> ' + n + ' rows');
}

fs.writeFileSync('scripts/verify-level-tags.out.txt', lines.join('\n') + '\n', 'utf8');
