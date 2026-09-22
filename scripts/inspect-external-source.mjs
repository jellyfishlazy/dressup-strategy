#!/usr/bin/env node

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readExternalSourceSnapshot } from './external-source-reader.mjs';

function parseArgs(argv) {
  const options = {};
  for (const arg of argv) {
    if (arg.startsWith('--wardrobe=')) options.wardrobePath = resolve(arg.slice('--wardrobe='.length));
    else if (arg.startsWith('--levels=')) options.levelsPath = resolve(arg.slice('--levels='.length));
    else throw new Error('unknown option: ' + arg);
  }
  return options;
}

export function externalSourceSummary(snapshot) {
  return {
    sourceRoot: snapshot.sourceRoot,
    sameRoot: snapshot.sameRoot,
    files: snapshot.files,
    hashes: snapshot.hashes,
    wardrobe: {
      count: snapshot.wardrobe.count,
      columnLengths: snapshot.wardrobe.columnLengths,
      lastUpdated: snapshot.wardrobe.lastUpdated,
      warnings: snapshot.wardrobe.warnings.length,
    },
    levels: {
      counts: snapshot.levels.counts,
      warnings: snapshot.levels.warnings.length,
    },
    warnings: snapshot.warnings,
  };
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    const snapshot = readExternalSourceSnapshot(parseArgs(process.argv.slice(2)));
    const summary = externalSourceSummary(snapshot);

    console.log('[External Source] root: ' + (summary.sourceRoot || '(mixed roots)'));
    console.log('[External Source] wardrobe: ' + summary.files.wardrobe);
    console.log('[External Source] levels: ' + summary.files.levels);
    console.log(
      '[External Source] wardrobe rows: ' +
      summary.wardrobe.count +
      '; columns ' +
      JSON.stringify(summary.wardrobe.columnLengths) +
      '; warnings ' +
      summary.wardrobe.warnings,
    );
    console.log(
      '[External Source] level bundles: ' +
      summary.levels.counts.bundles +
      '; orphan metadata ' +
      summary.levels.counts.orphanMetadata +
      '; warnings ' +
      summary.levels.warnings,
    );

    for (const warning of summary.warnings) {
      console.warn(
        '[External Source] WARNING: ' +
        (warning.table ? warning.table + '|' : '') +
        (warning.key || warning.kind) +
        ' - ' +
        warning.message,
      );
    }

    console.log('[External Source] READ PASS');
  } catch (error) {
    console.error('[External Source] ERROR: ' + error.message);
    process.exitCode = 1;
  }
}
