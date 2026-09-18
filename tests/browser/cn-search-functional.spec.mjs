import { test, expect } from '@playwright/test';

function collectBrowserFailures(page) {
  const failures = [];
  page.on('pageerror', error => failures.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') failures.push(`console.error: ${message.text()}`);
  });
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.hostname === '127.0.0.1' && response.status() >= 400) {
      failures.push(`http ${response.status()}: ${url.pathname}`);
    }
  });
  return failures;
}

async function expectNoFailures(failures) {
  expect(failures, failures.join('\n')).toEqual([]);
}

async function openSearch(page) {
  await page.goto('/cn-search/index.html', { waitUntil: 'domcontentloaded' });
  await expect.poll(async () => page.locator('#q-category option').count()).toBeGreaterThan(1);
  await expect.poll(async () => (await page.locator('#count').innerText()).trim()).not.toBe('—');
  await expect(page.locator('#status')).toContainText('陸服資料更新');
  await expect(page.locator('#results tbody tr').first()).toBeVisible();
}

async function visibleSamples(page) {
  return page.locator('#results tbody tr').evaluateAll(rows => {
    const data = rows.map(row => Array.from(row.querySelectorAll('td')).map(td => (td.textContent || '').trim()));
    const valid = data.filter(cols => cols.length >= 8);
    const first = valid[0] || [];
    return {
      first: { type: first[2] || '', name: first[3] || '' },
      suit: (valid.find(cols => cols[4]) || [])[4] || '',
      source: (valid.find(cols => cols[6]) || [])[6] || '',
      version: (valid.find(cols => cols[7]) || [])[7] || '',
    };
  });
}

test('Gate 10H-F CN Search initializes and all search filters remain functional', async ({ page }) => {
  const failures = collectBrowserFailures(page);
  await openSearch(page);

  const baseline = await page.locator('#count').innerText();
  expect(baseline).toMatch(/符合 \d+ 筆 \/ 共 \d+ 筆/);
  const samples = await visibleSamples(page);
  expect(samples.first.name).not.toBe('');
  expect(samples.first.type).not.toBe('');

  await page.locator('#q-name').fill(samples.first.name);
  await expect.poll(async () => page.locator('#count').innerText()).not.toBe(baseline);

  if (samples.suit) {
    await page.locator('#btn-clear').click();
    await page.locator('#q-suit').fill(samples.suit);
    await expect(page.locator('#results tbody tr').first()).toBeVisible();
  }

  if (samples.version) {
    await page.locator('#btn-clear').click();
    await page.locator('#q-version').fill(samples.version);
    await expect(page.locator('#results tbody tr').first()).toBeVisible();
  }

  if (samples.source) {
    await page.locator('#btn-clear').click();
    await page.locator('#q-source').fill(samples.source);
    await expect(page.locator('#results tbody tr').first()).toBeVisible();
  }

  await page.locator('#btn-clear').click();
  await page.locator('#q-category').selectOption(samples.first.type);
  await expect(page.locator('#results tbody tr').first()).toBeVisible();

  await page.locator('#q-cn-only').check();
  await expect(page.locator('#results tbody tr.cn-only').first()).toBeVisible();

  await page.locator('#btn-clear').click();
  await expect(page.locator('#q-name')).toHaveValue('');
  await expect(page.locator('#q-suit')).toHaveValue('');
  await expect(page.locator('#q-version')).toHaveValue('');
  await expect(page.locator('#q-source')).toHaveValue('');
  await expect(page.locator('#q-category')).toHaveValue('');
  await expect(page.locator('#q-cn-only')).not.toBeChecked();

  await expectNoFailures(failures);
});

test('Gate 10H-F CN Search staging supports add, duplicate guard, copy, download, remove and clear', async ({ page, context }) => {
  const failures = collectBrowserFailures(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:8000' });
  await openSearch(page);

  const firstRow = page.locator('#results tbody tr').filter({ has: page.locator('button.btn-add:not([disabled])') }).first();
  const name = ((await firstRow.locator('td').nth(3).innerText()) || '').trim();
  const type = ((await firstRow.locator('td').nth(2).innerText()) || '').trim();
  expect(name).not.toBe('');
  expect(type).not.toBe('');

  await page.locator('#q-name').fill(name);
  await page.locator('#q-category').selectOption(type);
  await expect(page.locator('#results tbody button.btn-add:not([disabled])').first()).toBeVisible();

  const add = page.locator('#results tbody button.btn-add:not([disabled])').first();
  await add.click();
  await expect(page.locator('#staging-count')).toHaveText('1 筆');

  await add.click();
  await expect(page.locator('#staging-count')).toHaveText('1 筆');
  await expect(page.locator('#toast')).toContainText('已在暫存區');

  await page.locator('#btn-copy-staging').click();
  await expect(page.locator('#toast')).toContainText('已複製');
  const clipboard = await page.evaluate(() => globalThis.navigator.clipboard.readText());
  expect(clipboard).toContain('data/wardrobe.js');
  expect(clipboard).toContain(name);

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#btn-download-staging').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^wardrobe-staging-.*\.js$/);

  await page.locator('#staging-list .btn-del').first().click();
  await expect(page.locator('#staging-count')).toHaveText('0 筆');

  await page.locator('#btn-add-all').click();
  await expect.poll(async () => parseInt(await page.locator('#staging-count').innerText(), 10)).toBeGreaterThan(0);

  page.once('dialog', dialog => dialog.accept());
  await page.locator('#btn-clear-staging').click();
  await expect(page.locator('#staging-count')).toHaveText('0 筆');

  await expectNoFailures(failures);
});

test('Gate 10H-F manual entry validates attributes, adds a row and resets cleanly', async ({ page }) => {
  const failures = collectBrowserFailures(page);
  await openSearch(page);

  await page.locator('#manual-entry').evaluate(element => { element.open = true; });
  await expect(page.locator('#m-type option')).not.toHaveCount(1);
  await expect(page.locator('#m-tags input[type="checkbox"]').first()).toBeVisible();

  await page.locator('#btn-manual-add').click();
  await expect(page.locator('#toast')).toContainText('請輸入名稱');

  await page.locator('#m-name').fill('Gate10H Audit Item');
  await page.locator('#m-type').selectOption({ index: 1 });
  await page.locator('#m-id').fill('999999');
  await page.locator('#m-stars').selectOption('5');

  const firstAttr = page.locator('#manual-entry input[data-attr]').first();
  await firstAttr.fill('X');
  await page.locator('#btn-manual-add').click();
  await expect(firstAttr).toHaveClass(/invalid/);
  await expect(page.locator('#toast')).toContainText('僅允許');

  await firstAttr.fill('S');
  await page.locator('#btn-manual-add').click();
  await expect(page.locator('#staging-count')).toHaveText('1 筆');
  await expect(page.locator('#staging-list')).toContainText('Gate10H Audit Item');

  await page.locator('#btn-manual-reset').click();
  await expect(page.locator('#m-name')).toHaveValue('');
  await expect(page.locator('#m-id')).toHaveValue('');
  await expect(page.locator('#m-type')).toHaveValue('');

  await expectNoFailures(failures);
});
