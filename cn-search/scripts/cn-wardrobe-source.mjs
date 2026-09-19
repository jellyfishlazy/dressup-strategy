import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const CN_SEARCH_ROOT = resolve(here, '..');
export const REPO_ROOT = resolve(CN_SEARCH_ROOT, '..');

export function cnWardrobeCandidates(envPath = process.env.CN_WARDROBE_JS) {
  return [
    envPath,
    join(CN_SEARCH_ROOT, 'vendor', 'nikkiup2u3-cn', 'wardrobe.js'),
    join(REPO_ROOT, 'vendor', 'nikkiup2u3-cn', 'wardrobe.js'),
    resolve(REPO_ROOT, '..', 'nikkiup2u3_data-gh-pages', 'wardrobe.js'),
    resolve(REPO_ROOT, '..', '..', 'nikkiup2u3_data-gh-pages', 'wardrobe.js'),
  ].filter(Boolean);
}

export function firstExistingFile(candidates) {
  for (const path of candidates) {
    if (existsSync(path) && statSync(path).isFile()) return resolve(path);
  }
  return null;
}

export function findCnWardrobe({ envPath = process.env.CN_WARDROBE_JS } = {}) {
  const candidates = cnWardrobeCandidates(envPath);
  const found = firstExistingFile(candidates);
  if (found) return found;

  const tried = candidates.map(path => '  - ' + path).join('\n');
  throw new Error(
    'Cannot locate external CN wardrobe.js. Looked at:\n' +
      tried +
      '\n\nSet the CN_WARDROBE_JS environment variable to override.',
  );
}

export function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
