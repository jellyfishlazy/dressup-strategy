#!/usr/bin/env node

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyWardrobeManifest,
  buildWardrobePreview,
  previewLines,
  readWardrobeStagingManifest,
} from './wardrobe-apply.mjs';

function parseArgs(argv) {
  const positional = [];
  const options = {
    apply: false,
    acceptConflicts: false,
  };
  for (const arg of argv) {
    if (arg === '--apply') options.apply = true;
    else if (arg === '--accept-conflicts') options.acceptConflicts = true;
    else if (arg.startsWith('--')) throw new Error('unknown option: ' + arg);
    else positional.push(arg);
  }
  if (positional.length !== 1) {
    throw new Error('usage: node scripts/review-wardrobe-staging.mjs <manifest.json> [--apply] [--accept-conflicts]');
  }
  if (options.acceptConflicts && !options.apply) {
    throw new Error('--accept-conflicts is valid only together with --apply');
  }
  return { manifestPath: positional[0], ...options };
}

export function run(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const manifestPath = resolve(args.manifestPath);
  const manifest = readWardrobeStagingManifest(manifestPath);
  const preview = buildWardrobePreview(manifest);

  for (const line of previewLines(preview)) console.log(line);

  if (!args.apply) {
    if (preview.integrityErrors.length || preview.manifestBlockingErrors || preview.stale || preview.ambiguousTargetKeys.length) {
      console.error('[Preview] BLOCKED: manifest is not safe to apply.');
      process.exitCode = 1;
    } else if (preview.summary.conflictRows > 0) {
      console.log('[Preview] REVIEW REQUIRED: conflicts exist. Apply only after review with --apply --accept-conflicts.');
    } else {
      console.log('[Preview] READY: apply with --apply.');
    }
    return { preview, applied: null };
  }

  const result = applyWardrobeManifest(manifest, {
    acceptConflicts: args.acceptConflicts,
  });

  if (!result.applied) {
    console.log('[Apply] NO-OP: target already matches all staged rows.');
  } else {
    console.log('[Apply] APPLIED: +' + result.addedRows + ' new, ' + result.updatedRows + ' updated.');
    console.log('[Apply] rows: ' + result.rowCount);
    console.log('[Apply] SHA: ' + result.beforeSha256 + ' -> ' + result.afterSha256);
  }
  return { preview, applied: result };
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    run();
  } catch (error) {
    console.error('[Apply] BLOCKED: ' + error.message);
    process.exitCode = 1;
  }
}
