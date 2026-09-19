#!/usr/bin/env node

import {
  absoluteDataSourcePath,
  dataSourceById,
} from './data-source-contract.mjs';
import { validateLevelSource } from './level-pipeline.mjs';

const targets = ['main-levels', 'biguse-levels'];
let failures = 0;

for (const id of targets) {
  const source = dataSourceById(id);
  const path = absoluteDataSourcePath(id);
  if (!source || !path) {
    failures++;
    console.error('[Level Validate] ' + id + ': contract source/path missing');
    continue;
  }

  try {
    const errors = validateLevelSource(path);
    if (errors.length) {
      failures += errors.length;
      for (const error of errors) console.error('[Level Validate] ' + source.path + ': ' + error);
    }
    console.log('[Level Validate] ' + source.path + ': ' + (errors.length ? errors.length + ' error(s)' : 'PASS'));
  } catch (error) {
    failures++;
    console.error('[Level Validate] ' + source.path + ': ' + error.message);
  }
}

if (failures) process.exitCode = 1;
