import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = new URL('../', import.meta.url);
export const sources = ['wardrobe.js', 'data/wardrobe.js', 'data/biguse_wardrobe.js', 'data/material_wardrobe.js'];

export function loadWardrobe(file) {
  const context = {};
  vm.runInNewContext(readFileSync(file, 'utf8'), context, { filename: String(file), timeout: 10000 });
  return context.wardrobe;
}

export function validateRows(rows, file, knownDuplicates = []) {
  const errors = [];
  if (!Array.isArray(rows) || rows.length === 0) return [`${file}: expected a non-empty wardrobe array`];
  const groups = new Map();
  rows.forEach((row, index) => {
    const label = `${file}: row ${index + 1}`;
    if (!Array.isArray(row) || row.length !== 18) {
      errors.push(`${label}: expected 18 fields, got ${Array.isArray(row) ? row.length : typeof row}`);
      return;
    }
    for (const [column, name] of [[0, 'name'], [1, 'type'], [2, 'id']]) {
      if (typeof row[column] !== 'string' || !row[column].trim()) errors.push(`${label}: required ${name} (column ${column}) must be a non-empty string`);
    }
    const key = JSON.stringify([row[1], row[2]]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ row, index: index + 1 });
  });
  const expected = new Map(knownDuplicates.map(group => [JSON.stringify([group[0][1], group[0][2]]), group]));
  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    if (JSON.stringify(group.map(entry => entry.row)) !== JSON.stringify(expected.get(key))) {
      errors.push(`${file}: duplicate (type,id) ${key} at rows ${group.map(entry => entry.index).join(', ')}; fix source data (do not broaden the baseline without review)`);
    }
    expected.delete(key);
  }
  for (const key of expected.keys()) errors.push(`${file}: stale duplicate baseline ${key}; remove its entry from scripts/known-wardrobe-duplicates.json`);
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const baseline = JSON.parse(readFileSync(new URL('scripts/known-wardrobe-duplicates.json', root), 'utf8'));
  let failures = 0;
  for (const file of sources) {
    try {
      const rows = loadWardrobe(new URL(file, root));
      const errors = validateRows(rows, file, baseline[file]);
      errors.forEach(error => console.error(error));
      failures += errors.length;
      console.log(`${file}: ${rows?.length ?? 0} rows; ${errors.length} errors; ${baseline[file]?.length ?? 0} documented legacy duplicate groups`);
    } catch (error) {
      failures++;
      console.error(`${file}: cannot load wardrobe: ${error.message}`);
    }
  }
  process.exitCode = failures ? 1 : 0;
}
