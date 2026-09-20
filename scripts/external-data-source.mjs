import { existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  cnWardrobeCandidates,
  findCnWardrobe,
  firstExistingFile,
} from '../cn-search/scripts/cn-wardrobe-source.mjs';

export function externalLevelsCandidates({
  envPath = process.env.CN_LEVELS_JS,
  wardrobePath = null,
} = {}) {
  const roots = [];
  if (wardrobePath) roots.push(dirname(resolve(wardrobePath)));

  for (const candidate of cnWardrobeCandidates()) {
    roots.push(dirname(resolve(candidate)));
  }

  return [
    envPath,
    ...roots.map(root => join(root, 'levels.js')),
  ].filter(Boolean);
}

export function findExternalLevels({
  envPath = process.env.CN_LEVELS_JS,
  wardrobePath = null,
} = {}) {
  const candidates = externalLevelsCandidates({ envPath, wardrobePath });
  const found = firstExistingFile(candidates);
  if (found) return found;

  const tried = candidates.map(path => '  - ' + path).join('\n');
  throw new Error(
    'Cannot locate external levels.js. Looked at:\n' +
      tried +
      '\n\nSet the CN_LEVELS_JS environment variable to override.',
  );
}

export function resolveExternalDataSource({
  wardrobePath = null,
  levelsPath = null,
} = {}) {
  const wardrobe = resolve(wardrobePath || findCnWardrobe());
  const levels = resolve(levelsPath || findExternalLevels({ wardrobePath: wardrobe }));

  if (!existsSync(wardrobe) || !statSync(wardrobe).isFile()) {
    throw new Error('external wardrobe.js is not a readable file: ' + wardrobe);
  }
  if (!existsSync(levels) || !statSync(levels).isFile()) {
    throw new Error('external levels.js is not a readable file: ' + levels);
  }

  const wardrobeRoot = dirname(wardrobe);
  const levelsRoot = dirname(levels);

  return {
    wardrobePath: wardrobe,
    levelsPath: levels,
    sourceRoot: wardrobeRoot === levelsRoot ? wardrobeRoot : null,
    sameRoot: wardrobeRoot === levelsRoot,
  };
}
