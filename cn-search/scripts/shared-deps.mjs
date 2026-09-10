import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const moduleRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function sharedNodeModulesPath() {
  const candidates = [
    process.env.CN_SEARCH_NODE_MODULES,
    resolve(moduleRoot, '..', '..', 'my-projects', 'node_modules'),
  ].filter(Boolean);

  for (const p of candidates) {
    if (existsSync(join(p, 'opencc-js', 'package.json'))) return p;
  }
  return null;
}

export async function importOpencc() {
  const base = sharedNodeModulesPath();
  if (!base) {
    throw new Error(
      'opencc-js not found. Install in my-projects: cd ../../my-projects && npm install'
    );
  }

  const pkgPath = join(base, 'opencc-js', 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const exportEntry = pkg.exports?.['.']?.import ?? './dist/esm/full.js';
  const entryPath = join(base, 'opencc-js', exportEntry.replace(/^\.\//, ''));
  return import(pathToFileURL(entryPath).href);
}
