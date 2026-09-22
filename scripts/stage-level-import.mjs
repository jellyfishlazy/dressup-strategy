#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildLevelStagingManifest,
  manifestHasBlockingLevelErrors,
} from './level-pipeline.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const positional = [];
  const options = { target: null, output: null };
  for (const arg of argv) {
    if (arg.startsWith('--target=')) options.target = arg.slice('--target='.length);
    else if (arg.startsWith('--output=')) options.output = arg.slice('--output='.length);
    else if (arg.startsWith('--')) throw new Error('unknown option: ' + arg);
    else positional.push(arg);
  }
  if (positional.length !== 1) {
    throw new Error('usage: node scripts/stage-level-import.mjs <input.json> [--target=main-levels] [--output=path]');
  }
  return { input: positional[0], ...options };
}

function safeStamp(date) {
  return date.toISOString().replace(/[:.]/g, '-');
}

export function run(argv = process.argv.slice(2), now = new Date()) {
  const args = parseArgs(argv);
  const inputPath = resolve(repoRoot, args.input);
  const inputText = readFileSync(inputPath, 'utf8');
  const manifest = buildLevelStagingManifest({
    inputText,
    inputPath: args.input,
    targetId: args.target,
    createdAt: now,
  });

  const outputPath = args.output
    ? resolve(repoRoot, args.output)
    : join(repoRoot, '.staging', 'levels', safeStamp(now) + '-' + basename(inputPath).replace(/[^a-zA-Z0-9._-]/g, '_') + '.json');

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  const summary = manifest.summary;
  console.log('[Level Staging] target: ' + manifest.target.id + ' (' + manifest.target.path + ')');
  console.log(
    '[Level Staging] entries: new ' + summary.newEntries +
    '; unchanged ' + summary.unchangedEntries +
    '; conflict ' + summary.conflictEntries +
    '; invalid ' + summary.invalidEntries +
    '; duplicate ' + summary.duplicateEntries,
  );
  console.log('[Level Staging] manifest: ' + outputPath);

  if (manifestHasBlockingLevelErrors(manifest)) {
    for (const error of manifest.errors) {
      console.error('[Level Staging] ' + error.table + '|' + error.key + ': ' + error.message);
    }
    console.error('[Level Staging] BLOCKED: fix level staging errors before preview/apply.');
    process.exitCode = 1;
  } else {
    console.log('[Level Staging] READY: preview the manifest before apply.');
  }
  return { manifest, outputPath };
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    run();
  } catch (error) {
    console.error('[Level Staging] ERROR: ' + error.message);
    process.exitCode = 1;
  }
}
