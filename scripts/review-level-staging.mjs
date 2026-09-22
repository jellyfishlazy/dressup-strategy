#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyLevelManifest,
  assertLevelStagingManifest,
  buildLevelPreview,
  previewLevelLines,
} from './level-pipeline.mjs';

function parseArgs(argv) {
  const positional = [];
  const options = { apply: false, acceptConflicts: false };
  for (const arg of argv) {
    if (arg === '--apply') options.apply = true;
    else if (arg === '--accept-conflicts') options.acceptConflicts = true;
    else if (arg.startsWith('--')) throw new Error('unknown option: ' + arg);
    else positional.push(arg);
  }
  if (positional.length !== 1) {
    throw new Error('usage: node scripts/review-level-staging.mjs <manifest.json> [--apply] [--accept-conflicts]');
  }
  if (options.acceptConflicts && !options.apply) {
    throw new Error('--accept-conflicts is valid only together with --apply');
  }
  return { manifestPath: positional[0], ...options };
}

function readManifest(path) {
  return assertLevelStagingManifest(JSON.parse(readFileSync(resolve(path), 'utf8')));
}

export function run(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const manifest = readManifest(args.manifestPath);
  const preview = buildLevelPreview(manifest);
  for (const line of previewLevelLines(preview)) console.log(line);

  if (!args.apply) {
    if (preview.integrityErrors.length || preview.stale || preview.blockingErrors.length) {
      console.error('[Level Preview] BLOCKED: manifest is not safe to apply.');
      process.exitCode = 1;
    } else if (preview.summary.conflictEntries > 0) {
      console.log('[Level Preview] REVIEW REQUIRED: use --apply --accept-conflicts after reviewing conflicts.');
    } else {
      console.log('[Level Preview] READY: apply with --apply.');
    }
    return { preview, applied: null };
  }

  const result = applyLevelManifest(manifest, { acceptConflicts: args.acceptConflicts });
  if (!result.applied) {
    console.log('[Level Apply] NO-OP: target already matches all staged entries.');
  } else {
    console.log('[Level Apply] APPLIED: +' + result.newEntries + ' new, ' + result.updatedEntries + ' updated.');
    console.log('[Level Apply] SHA: ' + result.beforeSha256 + ' -> ' + result.afterSha256);
  }
  return { preview, applied: result };
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    run();
  } catch (error) {
    console.error('[Level Apply] BLOCKED: ' + error.message);
    process.exitCode = 1;
  }
}
