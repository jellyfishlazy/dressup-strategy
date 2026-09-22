#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildWardrobeStagingManifest,
  manifestHasBlockingErrors,
} from './wardrobe-staging.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const positional = [];
  const options = { target: 'wardrobe', output: null };
  for (const arg of argv) {
    if (arg.startsWith('--target=')) options.target = arg.slice('--target='.length);
    else if (arg.startsWith('--output=')) options.output = arg.slice('--output='.length);
    else if (arg.startsWith('--')) throw new Error('unknown option: ' + arg);
    else positional.push(arg);
  }
  if (positional.length !== 1) {
    throw new Error('usage: node scripts/stage-wardrobe-import.mjs <input-file> [--target=wardrobe] [--output=path]');
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

  const manifest = buildWardrobeStagingManifest({
    inputText,
    inputPath: args.input,
    targetId: args.target,
    createdAt: now,
  });

  const outputPath = args.output
    ? resolve(repoRoot, args.output)
    : join(repoRoot, '.staging', 'wardrobe', safeStamp(now) + '-' + basename(inputPath).replace(/[^a-zA-Z0-9._-]/g, '_') + '.json');

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  const s = manifest.summary;
  console.log('[Staging] target: ' + manifest.target.id + ' (' + manifest.target.path + ')');
  console.log('[Staging] input: ' + args.input + ' [' + manifest.input.format + ']');
  console.log('[Staging] rows: ' + s.totalRows + '; new ' + s.newRows + '; unchanged ' + s.unchangedRows + '; conflict ' + s.conflictRows + '; invalid ' + s.invalidRows + '; duplicate ' + s.duplicateRows + '; parse errors ' + s.parseErrors);
  console.log('[Staging] manifest: ' + outputPath);

  if (manifestHasBlockingErrors(manifest)) {
    console.error('[Staging] BLOCKED: fix parse/row/duplicate errors before Gate 11C.');
    process.exitCode = 1;
  } else {
    console.log('[Staging] READY: no blocking staging errors. Conflicts remain review-only until Gate 11C.');
  }

  return { manifest, outputPath };
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    run();
  } catch (error) {
    console.error('[Staging] ERROR: ' + error.message);
    process.exitCode = 1;
  }
}
