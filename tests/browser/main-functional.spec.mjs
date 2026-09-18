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

async function openCleanMain(page) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => globalThis.localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect.poll(async () => page.locator('#theme option').count()).toBeGreaterThan(1);
  await expect.poll(async () => page.locator('#categoryTab li').count()).toBeGreaterThan(1);
  await expect(page.locator('#clothes .table-head')).toBeVisible();
}

test('Gate 10H-D Main controls, themes, categories and filters stay functional', async ({ page }) => {
  test.setTimeout(120_000);
  const failures = collectBrowserFailures(page);
  await openCleanMain(page);

  const themeFilter = page.locator('#theme-fliter');
  if (await themeFilter.locator('option').count() > 1) {
    await themeFilter.selectOption({ index: 1 });
    await expect.poll(async () => page.locator('#theme option').count()).toBeGreaterThan(1);
  }
  await themeFilter.selectOption('custom');
  await expect.poll(async () => page.locator('#theme option').count()).toBeGreaterThan(2);

  await page.locator('#theme').selectOption({ index: 1 });
  for (const feature of ['simple', 'cute', 'active', 'pure', 'cool']) {
    await expect(page.locator(`input[name="${feature}"]:checked`)).toHaveCount(1);
  }

  const mainTabs = page.locator('#categoryTab a[data-switch-cate]');
  const tabCount = await mainTabs.count();
  expect(tabCount).toBeGreaterThan(5);
  for (let index = 0; index < tabCount; index++) {
    await mainTabs.nth(index).click();
    await expect(page.locator('#categoryTab li.active')).toHaveCount(1);
  }

  const accessoriesTab = page.locator('#categoryTab a[data-switch-cate="飾品"]');
  await accessoriesTab.click();
  const accessorySubtypes = page.locator('input[name="category-飾品"]');
  expect(await accessorySubtypes.count()).toBeGreaterThan(1);
  const firstSubtype = accessorySubtypes.first();
  await firstSubtype.uncheck({ force: true });
  await firstSubtype.check({ force: true });

  await page.locator('#categoryTab a[data-switch-cate]').first().click();
  const firstFeature = page.locator('input[name="simple"][value="-1"]').locator('..');
  await firstFeature.click();
  await page.locator('#simpleWeight').fill('1.25');
  await page.locator('#simpleWeight').press('Tab');
  await expect(page.locator('#theme')).toHaveValue('custom');

  await page.locator('#tag1').fill('小動物');
  await page.locator('#tag1').press('Tab');
  await page.locator('input[name="tag1method"][value="replace"]').locator('..').click();
  await page.locator('#tag1base').selectOption('S');
  await page.locator('#tag1weight').fill('1.1');
  await page.locator('#tag1weight').press('Tab');

  for (const value of ['sortbyscore', 'balance', 'highscore', 'acc9']) {
    const box = page.locator(`input.fliter[value="${value}"]`);
    await box.click();
    await box.click();
  }

  const lazy = page.locator('input.fliter[value="toulan"]');
  await lazy.click();
  await expect(page.locator('#onekey')).toHaveText('偷懶攻略');
  await lazy.click();
  await expect(page.locator('#onekey')).toHaveText('一鍵攻略');

  for (const label of ['全部', '尚缺材料', '暫不缺材料', '少女級', '公主級', '店', '設計圖', '活動', '3星', '4星', '5星', '套裝部件', '新品']) {
    await page.getByRole('button', { name: label, exact: true }).click();
  }

  await expectNoFailures(failures);
});

test('Gate 10H-D Main search covers button, Enter, suit, wardrobe and cart modes', async ({ page }) => {
  const failures = collectBrowserFailures(page);
  await openCleanMain(page);

  const sample = await page.evaluate(async () => {
    const { clothes } = await import('/model.mjs');
    const named = clothes.find(piece => piece?.name && piece?.id && piece?.type?.mainType);
    const suited = clothes.find(piece => piece?.isSuit);
    return {
      name: named?.name || '',
      id: named?.id || '',
      type: named?.type?.mainType || '',
      suit: suited?.isSuit || '',
    };
  });
  expect(sample.name).not.toBe('');

  await page.locator('#searchResultInput').fill(sample.name);
  await page.locator('#btn-search-result').click();
  const result = page.locator('#searchResultList .name.table-td.search a.button').filter({ hasText: sample.name }).first();
  await expect(result).toBeVisible();
  await result.click();
  await expect(page.locator('#myClothes')).toHaveValue(new RegExp(`${sample.type}:[^|]*${sample.id}`));

  await page.locator('#searchResultInput').fill(sample.name);
  await page.locator('#searchResultInput').press('Enter');
  await expect(page.locator('#searchResultList .name.table-td.search a.button').filter({ hasText: sample.name }).first()).toBeVisible();

  await page.locator('#searchResultMode').click();
  await expect(page.locator('#searchResultMode')).toHaveText('→購物車');
  await page.locator('#searchResultList .name.table-td.search a.button').filter({ hasText: sample.name }).first().click();
  await expect(page.locator('#shoppingCart button[aria-label="從推薦穿戴移除"]').first()).toBeVisible();

  if (sample.suit) {
    await page.locator('#searchResultInput').fill(sample.suit);
    await page.locator('#btn-search-result').click();
    const suit = page.locator('.searchResultSet').filter({ hasText: sample.suit }).first();
    await expect(suit).toBeVisible();
    await suit.click();
    await expect(page.locator('#searchResultList .name.table-td.search a.button').first()).toBeVisible();
  }

  await page.locator('#searchResultCheck').click();
  await expect(page.locator('#searchResult')).toBeHidden();
  await page.locator('#searchResultCheck').click();
  await expect(page.locator('#searchResult')).toBeVisible();

  await expectNoFailures(failures);
});

test('Gate 10H-D Main inventory persistence and recommendation cart lifecycle work', async ({ page }) => {
  const failures = collectBrowserFailures(page);
  await openCleanMain(page);

  const firstName = page.locator('#clothes .table-td.name a.button').first();
  const clothingName = await firstName.innerText();
  await firstName.click();
  const backup = await page.locator('#myClothes').inputValue();
  expect(backup.length).toBeGreaterThan(0);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#clothes .table-td.name.own a.button').filter({ hasText: clothingName }).first()).toBeVisible();
  await expect(page.locator('#myClothes')).toHaveValue(backup);

  const add = page.locator('#clothes button[aria-label="加入推薦穿戴"]').first();
  await add.click();
  await expect(page.locator('#shoppingCart button[aria-label="從推薦穿戴移除"]').first()).toBeVisible();

  await page.locator('#shoppingCart button[aria-label="從推薦穿戴移除"]').first().click();
  await expect(page.locator('#shoppingCart button[aria-label="從推薦穿戴移除"]')).toHaveCount(0);

  await add.click();
  await page.locator('#btn-clear-shopping-cart').click();
  await expect(page.locator('#shoppingCart button[aria-label="從推薦穿戴移除"]')).toHaveCount(0);

  await expectNoFailures(failures);
});

test('Gate 10H-D Main bulk import, add-all and textarea restore work', async ({ page }) => {
  const failures = collectBrowserFailures(page);
  await openCleanMain(page);

  const importSample = await page.evaluate(async () => {
    const { clothes } = await import('/model.mjs');
    const piece = clothes.find(item => item?.type?.mainType && item?.id);
    return { type: piece?.type?.mainType || '', id: piece?.id || '' };
  });
  expect(importSample.type).not.toBe('');
  expect(importSample.id).not.toBe('');

  await page.locator('#importCate').selectOption(importSample.type);
  await page.locator('#importData').fill(importSample.id);
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#btn-import').click();
  await expect(page.locator('#myClothes')).toHaveValue(new RegExp(`${importSample.type}:[^|]*${importSample.id}`));

  await page.evaluate(() => globalThis.localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#myClothes')).toHaveValue('');

  page.once('dialog', dialog => dialog.accept());
  await page.locator('#add_all').click();
  await expect.poll(async () => (await page.locator('#myClothes').inputValue()).length).toBeGreaterThan(0);
  const addAllBackup = await page.locator('#myClothes').inputValue();

  await page.locator('#myClothes').fill('');
  await page.locator('#btn-load-custom-inventory').click();
  await expect(page.locator('#myClothes')).toHaveValue('');

  await page.locator('#myClothes').fill(addAllBackup);
  await page.locator('#btn-load-custom-inventory').click();
  await expect(page.locator('#myClothes')).toHaveValue(addAllBackup);
  await expect(page.locator('#clothes .table-td.name.own').first()).toBeVisible();

  await expectNoFailures(failures);
});

test('Gate 10H-D Main file load and save preserve inventory text', async ({ page }) => {
  const failures = collectBrowserFailures(page);
  await openCleanMain(page);

  const payload = '髮型:001|';
  await page.locator('#fileToLoad').setInputFiles({
    name: 'inventory-functional.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(payload),
  });
  await page.locator('#btn-load-file').click();
  await expect(page.locator('#myClothes')).toHaveValue(payload);

  await page.locator('#btn-load-custom-inventory').click();
  await expect(page.locator('#myClothes')).toHaveValue(payload);

  await page.locator('#inputFileNameToSaveAs').fill('inventory-functional.txt');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#btn-save-text').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('inventory-functional.txt');

  await expectNoFailures(failures);
});

test('Gate 10H-D Main one-key and lazy strategy produce and toggle strategy output', async ({ page }) => {
  test.setTimeout(120_000);
  const failures = collectBrowserFailures(page);
  await openCleanMain(page);

  await page.locator('#theme').selectOption({ index: 1 });
  await page.locator('#onekey').click();
  await expect(page.locator('#StrategyInfo')).toBeVisible();
  await expect.poll(async () => (await page.locator('#StrategyInfo').innerText()).trim().length).toBeGreaterThan(20);
  await expect(page.locator('#onekey')).toHaveText('收起攻略');

  await page.locator('#onekey').click();
  await expect(page.locator('#StrategyInfo')).toBeHidden();
  await expect(page.locator('#onekey')).toHaveText('一鍵攻略');

  await page.locator('input.fliter[value="toulan"]').click();
  await expect(page.locator('#onekey')).toHaveText('偷懶攻略');
  await page.locator('#onekey').click();
  await expect(page.locator('#StrategyInfo')).toBeVisible();
  await expect.poll(async () => (await page.locator('#StrategyInfo').innerText()).trim().length).toBeGreaterThan(20);
  await expect(page.locator('#onekey')).toHaveText('收起攻略');

  await expectNoFailures(failures);
});


test('Gate 10H Final keeps dependency clothing names visible on Main while preserving tooltips', async ({ page }) => {
  const failures = collectBrowserFailures(page);
  await openCleanMain(page);

  for (const sample of [
    { id: '004', name: '運動少年' },
    { id: '007', name: '眷雅公子' },
    { id: '010', name: '完美學長' },
  ]) {
    const link = page.locator('#clickable-髮型' + sample.id + ' a.button');
    await expect(link).toBeVisible();
    await expect(link).toHaveText(sample.name);
    await expect(link).toHaveAttribute('tooltip', /\[材料\]/);
    await expect(link).not.toHaveAttribute('style', /display:\s*none/);
  }

  await expectNoFailures(failures);
});
