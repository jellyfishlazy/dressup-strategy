import { createHash } from 'node:crypto';
import {
  readdirSync,
  readFileSync,
  statSync,
} from 'node:fs';
import {
  extname,
  join,
  relative,
  resolve,
} from 'node:path';
import { fileURLToPath } from 'node:url';

export const GUIDED_UPDATE_SERVER_SIGNATURE = 'dressup-strategy-guided-update-v2';

const REPO_ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const RUNTIME_DIRS = Object.freeze([
  join(REPO_ROOT, 'scripts'),
  join(REPO_ROOT, 'cn-search', 'src'),
  join(REPO_ROOT, 'cn-search', 'scripts'),
  join(REPO_ROOT, 'src', 'domain', 'wardrobe'),
]);
const RUNTIME_FILES = Object.freeze([
  join(REPO_ROOT, 'package-lock.json'),
]);
const RUNTIME_EXTENSIONS = new Set(['.mjs', '.js', '.json']);

function collectRuntimeFiles(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectRuntimeFiles(path, out);
      continue;
    }
    if (!entry.isFile() || !RUNTIME_EXTENSIONS.has(extname(entry.name).toLowerCase())) continue;
    out.push(path);
  }
}

export function guidedUpdateRuntimeFingerprint() {
  const files = [];
  for (const dir of RUNTIME_DIRS) {
    if (statSync(dir).isDirectory()) collectRuntimeFiles(dir, files);
  }
  files.push(...RUNTIME_FILES);
  files.sort((a, b) => a.localeCompare(b));

  const hash = createHash('sha256');
  for (const path of files) {
    const rel = relative(REPO_ROOT, path).replaceAll('\\', '/');
    hash.update(rel, 'utf8');
    hash.update('\0');
    hash.update(readFileSync(path));
    hash.update('\0');
  }
  return hash.digest('hex');
}

export function guidedUpdateRepoRoot() {
  return REPO_ROOT;
}
