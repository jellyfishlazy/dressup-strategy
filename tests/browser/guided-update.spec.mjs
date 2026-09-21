import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import net from 'node:net';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
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

function wardrobeRow(name, type, id, source, suit) {
  return [
    name, type, id, '5',
    '', 'S', '', 'A', '', 'B', '', 'A', 'C', '',
    '现代流行', source, suit, 'V1',
    'extra-a', 'extra-b',
  ];
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
  const externalWardrobe = join(root, 'external-wardrobe.js');
  const externalLevels = join(root, 'external-levels.js');
  const canonicalWardrobe = join(root, 'canonical-wardrobe.js');

  writeFileSync(externalWardrobe, [
    'var wardrobe = ' + JSON.stringify([
      wardrobeRow('春樱', '发型', '001', '活动-限时登录', '樱花套装'),
      wardrobeRow('星夜发饰', '发型', '002', '活动-限时登录', '星夜套装'),
    ]) + ';',
    "var wardrobe_lastupd = '2026/9/21';",
    '',
  ].join('\n'), 'utf8');

  writeFileSync(canonicalWardrobe, [
    'var wardrobe = ' + JSON.stringify([[
      '春櫻', '髮型', '001', '5',
      '', 'S', '', 'A', '', 'B', '', 'A', 'C', '',
      'POP', '活動·限時登入', '櫻花套裝', 'V1',
    ]]) + ';',
    '',
  ].join('\n'), 'utf8');

  writeFileSync(externalLevels, [
    'var themeFilter = [];',
    'var competitionsRaw = {};',
    'var extraRaw = {};',
    'var tasksRaw = {};',
    'var levelsRaw = {"III-90-1": [1,1,1,1,1]};',
    'var dreamWeavingRaw = {};',
    'var levelFilters = {};',
    'var levelBonus = {};',
    'var addSkillsInfo = {};',
    'var addHintInfo = {};',
    '',
  ].join('\n'), 'utf8');

  baseURL = 'http://127.0.0.1:' + port;
  child = spawn(process.execPath, [
    'scripts/guided-update-server.mjs',
    '--port=' + port,
    '--workspace=' + join(root, 'workspace'),
    '--output-root=' + join(root, 'staging'),
    '--wardrobe-source=' + externalWardrobe,
    '--levels-source=' + externalLevels,
    '--canonical-wardrobe=' + canonicalWardrobe,
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
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.hostname === '127.0.0.1' && response.status() >= 400) {
      failures.push('http ' + response.status() + ': ' + url.pathname);
    }
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

  await expect(page.locator('#step-collect .gu-prerequisite')).toBeVisible();
  await expect(page.locator('#step-collect .gu-prerequisite')).toContainText('請先完成 Step 1');
  await expect(page.locator('#wardrobe-query')).toBeDisabled();
  await expect(page.locator('#wardrobe-search-form button[type="submit"]')).toBeDisabled();
  await expect(page.locator('#execute-apply')).toBeDisabled();
  await expect(page.locator('#complete-closeout')).toBeDisabled();

  await page.locator('#wardrobe-search-form').evaluate(form => {
    form.dispatchEvent(new globalThis.Event('submit', { bubbles: true, cancelable: true }));
  });
  await expect(page.locator('#global-error')).toBeVisible();
  await expect(page.locator('#global-error')).toContainText(
    '操作無法完成：請先完成 Step 1：建立或啟用一個進行中的「本次更新」。',
  );

  await page.locator('#session-name').fill('Browser bilingual update');
  await page.locator('#create-session-button').click();
  await expect(page.locator('#session-badge')).toHaveText('進行中');
  await expect(page.locator('#step-collect .gu-prerequisite')).toBeHidden();
  await expect(page.locator('#wardrobe-query')).toBeEnabled();

  await page.locator('#wardrobe-source').fill('活動');
  await page.locator('#wardrobe-search-form button[type="submit"]').click();
  await expect(page.locator('#wardrobe-search-summary')).toContainText('符合 2 筆');
  await expect(page.locator('#wardrobe-results-body tr')).toHaveCount(2);
  await expect(page.locator('#wardrobe-results')).toContainText('春櫻');
  await expect(page.locator('#wardrobe-results')).toContainText('星夜髮飾');
  await expect(page.locator('#wardrobe-results')).toContainText('春樱');

  await expect(page.locator('#wardrobe-add-all')).toHaveText('加入全部 2 筆');
  await page.locator('#wardrobe-add-all').click();
  await expect(page.locator('#wardrobe-count')).toHaveText('2');
  await expect(page.locator('#wardrobe-selected .gu-selected-item')).toHaveCount(2);
  await expect(page.locator('#wardrobe-search-summary')).toContainText('已加入 2 筆');

  await page.locator('#wardrobe-manual-entry').evaluate(details => { details.open = true; });
  await page.locator('#manual-name').fill('手動補髮');
  await page.locator('#manual-type').selectOption('髮型');
  await page.locator('#manual-id').fill('M001');
  await page.locator('#manual-stars').selectOption('4');
  await page.locator('#manual-source').fill('手動補資料');
  await page.locator('#manual-suit').fill('手動套裝');
  await page.locator('#manual-version').fill('VManual');
  await page.locator('#wardrobe-manual-form button[type="submit"]').click();
  await expect(page.locator('#wardrobe-count')).toHaveText('3');
  await expect(page.locator('#wardrobe-selected .gu-selected-item')).toHaveCount(3);
  await expect(page.locator('#wardrobe-selected')).toContainText('手動新增');
  await expect(page.locator('#wardrobe-selected')).toContainText('手動補髮');
  await expect(page.locator('#wardrobe-selected')).toContainText('外部來源');

  await page.route('**/__guided_update_api', async route => {
    const body = route.request().postDataJSON();
    if (body?.action === 'wardrobe.search') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          result: {
            sessionId: 'old-server',
            total: 37541,
            offset: 0,
            limit: 50,
            items: [],
            sourceHash: '0'.repeat(64),
            warnings: [],
          },
        }),
      });
      return;
    }
    await route.continue();
  });

  await page.locator('#wardrobe-query').fill('版本不一致測試');
  await page.locator('#wardrobe-search-form button[type="submit"]').click();
  await expect(page.locator('#global-error')).toContainText('Guided Update 前後端版本不一致');
  await expect(page.locator('#wardrobe-search-summary')).toContainText('搜尋條件已變更');

  expect(failures).toEqual([]);
});

test('Gate 12L mobile Guided Update collapses the workflow to one-column content', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseURL + '/guided-update/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#server-status')).toHaveText('Local API 已連線');

  const layout = await page.evaluate(() => {
    const stepbar = globalThis.getComputedStyle(globalThis.document.querySelector('.gu-stepbar'));
    const step2 = globalThis.getComputedStyle(globalThis.document.querySelector('.gu-step2-stack'));
    const filters = globalThis.getComputedStyle(globalThis.document.querySelector('.gu-search-filters-always'));
    const attrs = globalThis.getComputedStyle(globalThis.document.querySelector('.gu-manual-attrs'));
    const metrics = globalThis.getComputedStyle(globalThis.document.querySelector('#completeness-summary'));
    return {
      stepColumns: stepbar.gridTemplateColumns.split(' ').filter(Boolean).length,
      step2Columns: step2.gridTemplateColumns.split(' ').filter(Boolean).length,
      filterColumns: filters.gridTemplateColumns.split(' ').filter(Boolean).length,
      attrColumns: attrs.gridTemplateColumns.split(' ').filter(Boolean).length,
      metricColumns: metrics.gridTemplateColumns.split(' ').filter(Boolean).length,
    };
  });

  expect(layout.stepColumns).toBe(2);
  expect(layout.step2Columns).toBe(1);
  expect(layout.filterColumns).toBe(1);
  expect(layout.attrColumns).toBe(2);
  expect(layout.metricColumns).toBe(1);
  await expect(page.locator('#wardrobe-search-form')).toBeVisible();
  await expect(page.locator('#levels-search-form')).toBeVisible();
});
