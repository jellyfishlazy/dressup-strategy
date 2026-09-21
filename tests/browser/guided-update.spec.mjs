import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import net from 'node:net';
import {
  mkdtempSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

let port;
let root;
let child;
let baseURL;

async function freePort() {
  const server = net.createServer();
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  await new Promise(resolveClose => server.close(resolveClose));
  return address.port;
}

async function waitFor(url, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await globalThis.fetch(url, {
        signal: globalThis.AbortSignal.timeout(800),
        cache: 'no-store',
      });
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolveWait => globalThis.setTimeout(resolveWait, 120));
  }
  throw lastError || new Error('Guided Update server did not become ready');
}

test.beforeAll(async () => {
  port = await freePort();
  root = mkdtempSync(join(tmpdir(), 'gate12l-browser-'));
  baseURL = 'http://127.0.0.1:' + port;
  child = spawn(process.execPath, [
    'scripts/guided-update-server.mjs',
    '--port=' + port,
    '--workspace=' + join(root, 'workspace'),
    '--output-root=' + join(root, 'staging'),
  ], {
    cwd: resolve('.'),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  await waitFor(baseURL + '/__guided_update_health');
});

test.afterAll(async () => {
  if (child && !child.killed) child.kill();
  if (root) rmSync(root, { recursive: true, force: true });
});

test('Gate 12L desktop Guided Update loads six-step local workflow without browser errors', async ({ page }) => {
  const failures = [];
  page.on('pageerror', error => failures.push('pageerror: ' + error.message));
  page.on('console', message => {
    if (message.type() === 'error') failures.push('console.error: ' + message.text());
  });

  await page.goto(baseURL + '/guided-update/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('h1')).toHaveText('Guided Update');
  await expect(page.locator('#server-status')).toHaveText('Local API 已連線');
  await expect(page.locator('#create-session-form')).toBeVisible();
  await expect(page.locator('.gu-stepbar a')).toHaveCount(6);

  for (const id of [
    'step-session',
    'step-collect',
    'step-completeness',
    'step-review',
    'step-apply',
    'step-closeout',
  ]) {
    await expect(page.locator('#' + id)).toBeVisible();
  }

  await expect(page.locator('#execute-apply')).toBeDisabled();
  await expect(page.locator('#complete-closeout')).toBeDisabled();
  expect(failures).toEqual([]);
});

test('Gate 12L mobile Guided Update collapses the workflow to one-column content', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseURL + '/guided-update/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#server-status')).toHaveText('Local API 已連線');

  const layout = await page.evaluate(() => {
    const stepbar = globalThis.getComputedStyle(globalThis.document.querySelector('.gu-stepbar'));
    const collection = globalThis.getComputedStyle(globalThis.document.querySelector('.gu-collection-grid'));
    const metrics = globalThis.getComputedStyle(globalThis.document.querySelector('#completeness-summary'));
    return {
      stepColumns: stepbar.gridTemplateColumns.split(' ').filter(Boolean).length,
      collectionColumns: collection.gridTemplateColumns.split(' ').filter(Boolean).length,
      metricColumns: metrics.gridTemplateColumns.split(' ').filter(Boolean).length,
    };
  });

  expect(layout.stepColumns).toBe(2);
  expect(layout.collectionColumns).toBe(1);
  expect(layout.metricColumns).toBe(1);
  await expect(page.locator('#wardrobe-search-form')).toBeVisible();
  await expect(page.locator('#levels-search-form')).toBeVisible();
});
