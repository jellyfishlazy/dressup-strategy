// Rewrite legacy tag strings in level data files to match canonical wardrobe tags.
// Idempotent: safe to re-run.
// Run: node scripts/rename-level-tags.mjs
import fs from 'node:fs';

// Old -> new mapping (decided 2026-05-15 with user).
// We deliberately keep `運動系` as-is (user opted out of mapping it).
const RENAME = [
	{ from: '動物風', to: '小動物' },
	{ from: '動物系', to: '小動物' },
	{ from: '航海風', to: '海軍風' },
	{ from: '異域風', to: '印度服飾' },
	{ from: '酷潮風', to: 'POP' },
	{ from: '洛麗塔', to: '蘿莉塔' },
	{ from: '學院系', to: '學院風' },
	{ from: '輕熟風', to: 'OL' },
	// Lowercase "pop" only when it appears as a quoted standalone token.
	{ from: 'pop', to: 'POP', quotedOnly: true },
];

const TARGETS = [
	'data/levels.js',
	'data/biguse_levels.js',
];

function patchFile(path) {
	if (!fs.existsSync(path)) return { path, missing: true };
	const orig = fs.readFileSync(path, 'utf8');
	let out = orig;
	const changes = [];
	for (const r of RENAME) {
		const before = out;
		if (r.quotedOnly) {
			out = out.replace(/"pop"/g, '"POP"').replace(/'pop'/g, "'POP'");
		} else {
			// Only replace when the token sits inside quotes, to avoid mangling
			// comments or function/identifier names. We tolerate either single or
			// double quotes.
			const re = new RegExp('(["\'])' + escapeRe(r.from) + '\\1', 'g');
			out = out.replace(re, '$1' + r.to + '$1');
		}
		const delta = countDelta(before, out, r.from);
		if (delta !== 0) changes.push(r.from + ' -> ' + r.to + ' x' + delta);
	}
	if (out !== orig) fs.writeFileSync(path, out, 'utf8');
	return { path, changes };
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function countDelta(before, after, needle) {
	// Approximate: count occurrences of needle in before vs after.
	const cb = (before.match(new RegExp(escapeRe(needle), 'g')) || []).length;
	const ca = (after.match(new RegExp(escapeRe(needle), 'g')) || []).length;
	return cb - ca;
}

const reports = TARGETS.map(patchFile);
for (const r of reports) {
	if (r.missing) { console.log(r.path + ': missing, skipped'); continue; }
	if (!r.changes.length) { console.log(r.path + ': no changes'); continue; }
	console.log(r.path + ':');
	for (const c of r.changes) console.log('  ' + c);
}
