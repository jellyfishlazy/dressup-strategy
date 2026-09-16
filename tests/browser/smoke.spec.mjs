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

test('main matcher boots and renders its primary controls', async ({ page }) => {
  const failures = collectBrowserFailures(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

  await expect.poll(async () => page.locator('#theme option').count()).toBeGreaterThan(1);
  await expect.poll(async () => page.locator('#categoryTab li').count()).toBeGreaterThan(1);
  await expect(page.locator('#clothes .table-head')).toBeVisible();

  const firstTab = page.locator('#categoryTab li a').first();
  await firstTab.click();
  await expect(page.locator('#categoryTab li.active')).toHaveCount(1);
  await expectNoFailures(failures);
});

test('BigUse boots with both carts and native autocomplete', async ({ page }) => {
  const failures = collectBrowserFailures(page);
  await page.goto('/biguse.html', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('#autocomplete1')).toBeVisible();
  await expect(page.locator('#autocomplete2')).toBeVisible();
  await expect(page.locator('#shoppingCart1 .table-head')).toBeVisible();
  await expect(page.locator('#shoppingCart2 .table-head')).toBeVisible();

  const query = await page.evaluate(() => (globalThis.clothes?.[0]?.name || '').slice(0, 2));
  expect(query.length).toBeGreaterThan(0);
  await page.locator('#autocomplete1').fill(query);
  await expect(page.locator('.native-autocomplete-suggestions .autocomplete-suggestion').first()).toBeVisible();
  await expectNoFailures(failures);
});

test('Material boots and builds its dynamic scope controls', async ({ page }) => {
  const failures = collectBrowserFailures(page);
  await page.goto('/material.html', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('#selectScope')).toBeVisible();
  await expect(page.locator('#degree_level')).toBeVisible();
  await page.locator('#selectScope').selectOption('2');
  await expect(page.locator('#degree_level')).toBeVisible();
  await expectNoFailures(failures);
});

test('Wardrobe Check boots and renders category navigation', async ({ page }) => {
  const failures = collectBrowserFailures(page);
  await page.goto('/wardrobechk.html', { waitUntil: 'domcontentloaded' });

  await expect.poll(async () => page.locator('#categoryTab li').count()).toBeGreaterThan(1);
  await expect(page.locator('#myClothes')).toHaveCount(1);
  await expect(page.locator('#check_container_left')).toHaveCount(1);
  await expect(page.locator('#check_container_right')).toHaveCount(1);
  await page.locator('#categoryTab li a').nth(1).click();
  await expect(page.locator('#categoryTab li.active')).toHaveCount(1);
  const legacyGlobals = await page.evaluate(() => ({
    wardrobe: typeof globalThis.WardrobeDomain,
    inventory: typeof globalThis.InventoryDomain,
  }));
  expect(legacyGlobals).toEqual({ wardrobe: 'undefined', inventory: 'undefined' });
  await expectNoFailures(failures);
});

test('browser can import the Gate 7A ESM domain entries from static hosting', async ({ page }) => {
  const failures = collectBrowserFailures(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

  const result = await page.evaluate(async () => {
    const [wardrobe, inventory, biguse] = await Promise.all([
      import('/src/domain/wardrobe/index.mjs'),
      import('/src/domain/inventory/index.mjs'),
      import('/src/domain/biguse/index.mjs'),
    ]);
    const row = ['name', '髮型', '001', '5', '', '', '', '', '', '', '', '', '', '', '', '', '', ''];
    return {
      wardrobeCount: wardrobe.WARDROBE_FIELD_COUNT,
      wardrobeId: wardrobe.rowToWardrobeItem(row).id,
      inventory: inventory.serialize({ 1: ['001'] }),
      close: biguse.compareScores(100, 100).close,
    };
  });

  expect(result).toEqual({ wardrobeCount: 18, wardrobeId: '001', inventory: '1:001|', close: true });
  await expectNoFailures(failures);
});
