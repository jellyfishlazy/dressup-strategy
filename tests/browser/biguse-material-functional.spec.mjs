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

async function openBigUse(page) {
  await page.goto('/biguse.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#autocomplete1')).toBeVisible();
  await expect(page.locator('#shoppingCart1 .table-head')).toBeVisible();
  await expect.poll(async () => page.locator('#categoryTab a[data-switch-cate]').count()).toBeGreaterThan(5);
}

async function openMaterial(page) {
  await page.goto('/material.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#selectScope')).toBeVisible();
  await expect(page.locator('#degree_level')).toBeVisible();
}

test('Gate 10H-E BigUse A/B cart, autocomplete, copy and clear lifecycle works', async ({ page }) => {
  const failures = collectBrowserFailures(page);
  await openBigUse(page);

  const row = page.locator('#clothes .table-body .table-row').first();
  const addA = row.getByRole('button', { name: 'A', exact: true });
  const addB = row.getByRole('button', { name: 'B', exact: true });
  await expect(addA).toBeVisible();
  await expect(addB).toBeVisible();

  await addA.click();
  await addB.click();
  await expect(page.locator('#shoppingCart1 button[aria-label="從搭配移除"]').first()).toBeVisible();
  await expect(page.locator('#shoppingCart2 button[aria-label="從搭配移除"]').first()).toBeVisible();

  const copy = page.locator('#shoppingCart1 .copy-btn').first();
  await expect(copy).toBeVisible();
  await copy.click();
  await expect(page.locator('#shoppingCart1 .table-row.highlighted')).toHaveCount(1);

  await page.locator('#shoppingCart1 button[aria-label="從搭配移除"]').first().click();
  await expect(page.locator('#shoppingCart1 button[aria-label="從搭配移除"]')).toHaveCount(0);

  const query = await page.evaluate(async () => {
    const { clothes } = await import('/model.mjs');
    return clothes.find(piece => piece?.name)?.name.slice(0, 2) || '';
  });
  expect(query).not.toBe('');

  await page.locator('#autocomplete1').fill(query);
  const suggestionA = page.locator('.native-autocomplete-suggestions .autocomplete-suggestion:visible').first();
  await expect(suggestionA).toBeVisible();
  await suggestionA.click();
  await expect(page.locator('#shoppingCart1 button[aria-label="從搭配移除"]').first()).toBeVisible();

  await page.locator('#autocomplete2').fill(query);
  const suggestionB = page.locator('.native-autocomplete-suggestions .autocomplete-suggestion:visible').first();
  await expect(suggestionB).toBeVisible();
  await suggestionB.click();
  await expect(page.locator('#shoppingCart2 button[aria-label="從搭配移除"]').first()).toBeVisible();

  await page.locator('#btn-clear-cart-a').click();
  await page.locator('#btn-clear-cart-b').click();
  await expect(page.locator('#shoppingCart1 button[aria-label="從搭配移除"]')).toHaveCount(0);
  await expect(page.locator('#shoppingCart2 button[aria-label="從搭配移除"]')).toHaveCount(0);

  await expectNoFailures(failures);
});

test('Gate 10H-E BigUse regular categories, color filters, preview and history stay functional', async ({ page }) => {
  test.setTimeout(120_000);
  const failures = collectBrowserFailures(page);
  await openBigUse(page);

  for (const category of ['髮型', '連身裙', '外套', '上衣', '下著', '鞋子', '妝容']) {
    await page.locator(`#categoryTab a[data-switch-cate="${category}"]`).click();
    await expect(page.locator('#categoryTab li.active')).toHaveCount(1);
  }

  await page.locator('#categoryTab a[data-switch-cate="髮型"]').click();
  const colorButtons = page.locator('.front_filter_option_biguse');
  await expect.poll(async () => colorButtons.count()).toBeGreaterThan(1);

  const before = await page.locator('#clothes .table-body .table-row:visible').count();
  await colorButtons.nth(1).click();
  const filtered = await page.locator('#clothes .table-body .table-row:visible').count();
  expect(filtered).toBeGreaterThan(0);
  expect(filtered).toBeLessThanOrEqual(before);
  await colorButtons.first().click();
  await expect.poll(async () => page.locator('#clothes .table-body .table-row:visible').count()).toBe(before);

  const previewCell = page.locator('#clothes .table-body .table-td.image').first();
  await previewCell.click();
  await expect(page.locator('#imgModel')).toBeVisible();
  await expect(page.locator('#imgInfo')).not.toHaveText('');
  await page.locator('#imgInfo').click();
  await expect(page.locator('#imgModel')).toBeHidden();

  await expect(page.locator('#update_history')).toBeHidden();
  await page.locator('#show_history').click();
  await expect(page.locator('#update_history')).toBeVisible();
  await expect(page.locator('#show_history')).toBeHidden();

  await expectNoFailures(failures);
});

test('Gate 10H-E Material scope switching and part search work with click and Enter', async ({ page }) => {
  const failures = collectBrowserFailures(page);
  await openMaterial(page);

  for (const scope of ['1', '2', '3', '4']) {
    await page.locator('#selectScope').selectOption(scope);
    await expect(page.locator('#degree_level')).toBeVisible();
    await expect(page.locator('#degree_level option')).not.toHaveCount(0);
  }

  await page.locator('#selectScope').selectOption('3');
  await page.locator('#degree_level').selectOption('0');
  await expect(page.locator('#searchById')).toBeVisible();

  await page.locator('#searchById').fill('001');
  await page.locator('#chooseSub a.search').click();
  await expect(page.locator('#levelDropNote')).toContainText('001');
  await expect(page.getByRole('button', { name: '加入材料清單' }).first()).toBeVisible();

  await page.locator('#searchById').fill('001');
  await page.locator('#searchById').press('Enter');
  await expect(page.locator('#levelDropNote')).toContainText('001');

  await expectNoFailures(failures);
});

test('Gate 10H-E Material cart lifecycle, calculation and inventory controls work', async ({ page }) => {
  const failures = collectBrowserFailures(page);
  await openMaterial(page);

  await page.locator('#selectScope').selectOption('3');
  await page.locator('#degree_level').selectOption('0');
  await page.locator('#searchById').fill('001');
  await page.locator('#chooseSub a.search').click();

  await page.getByRole('button', { name: '加入材料清單' }).first().click();
  await page.locator('a.showCart').click();
  await expect(page.locator('#custCart')).toBeVisible();
  await expect(page.locator('#cartCont')).not.toHaveText('');

  const cartText = await page.locator('#cartCont').innerText();
  expect(cartText.trim().length).toBeGreaterThan(0);

  await page.locator('#custCart').getByRole('button', { name: '計算', exact: true }).click();
  await expect(page.locator('#levelDropInfo')).toContainText('購物車');

  await page.locator('#cartCont a').filter({ hasText: '[×]' }).first().click();
  await expect(page.locator('#cartCont')).toHaveText('');

  await page.locator('#selectScope').selectOption('3');
  await page.locator('#degree_level').selectOption('0');
  await page.locator('#searchById').fill('001');
  await page.locator('#chooseSub a.search').click();
  await page.getByRole('button', { name: '加入材料清單' }).first().click();
  await page.locator('#custCart').getByRole('button', { name: '清空', exact: true }).click();
  await expect(page.locator('#cartCont')).toHaveText('');

  await page.locator('a.showInv').click();
  await expect(page.locator('#custInv')).toBeVisible();
  await page.locator('#myClothes').fill('髮型:001|');
  await page.locator('#custInv').getByRole('button', { name: '更新', exact: true }).click();
  await expect(page.locator('#myClothes')).toHaveValue('髮型:001|');

  await page.locator('#custInv').getByRole('button', { name: '清空', exact: true }).click();
  await expect(page.locator('#myClothes')).toHaveValue('');

  await expectNoFailures(failures);
});

test('Gate 10H-E Material level result can export an image', async ({ page }) => {
  const failures = collectBrowserFailures(page);
  await openMaterial(page);

  await page.locator('#selectScope').selectOption('1');
  await page.locator('#level_select').selectOption({ index: 1 });
  await expect(page.locator('#levelDropInfo')).not.toHaveText('');
  const imageButton = page.getByRole('button', { name: '轉為圖檔' });
  await expect(imageButton).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await imageButton.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('download.png');

  await expectNoFailures(failures);
});
