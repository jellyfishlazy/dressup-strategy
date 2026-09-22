import { test, expect } from '@playwright/test';

function collectBrowserFailures(page) {
  const failures = [];
  page.on('pageerror', error => failures.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') failures.push(`console.error: ${message.text()}`);
  });
  return failures;
}

test('Gate 10H-G BigUse switch-all renders in bounded chunks and remains interactive', async ({ page }) => {
  test.setTimeout(60_000);
  const failures = collectBrowserFailures(page);
  await page.goto('/biguse.html', { waitUntil: 'domcontentloaded' });

  const all = page.locator('#categoryTab a[data-switch-cate="switchall"]');
  const started = Date.now();
  await all.click();
  const elapsed = Date.now() - started;

  const rows = page.locator('#clothes .table-body .table-row');
  await expect(rows).toHaveCount(500);
  const loadMore = page.locator('#clothes .biguse-load-more button');
  await expect(loadMore).toHaveText(/500 \/ \d+/);
  const firstLabel = await loadMore.textContent();
  const totalMatch = firstLabel?.match(/500 \/ (\d+)/);
  expect(totalMatch, 'load-more label should expose the current total wardrobe count').not.toBeNull();
  const total = Number(totalMatch[1]);
  expect(total).toBeGreaterThan(1000);
  expect(elapsed).toBeLessThan(20_000);

  const addA = rows.first().getByRole('button', { name: 'A', exact: true });
  await addA.click();
  await expect(page.locator('#shoppingCart1 button[aria-label="從搭配移除"]').first()).toBeVisible();

  const moreStarted = Date.now();
  await loadMore.click();
  const moreElapsed = Date.now() - moreStarted;
  await expect(rows).toHaveCount(1000);
  await expect(loadMore).toContainText('1000 / ' + total);
  expect(moreElapsed).toBeLessThan(10_000);

  await page.locator('#categoryTab a[data-switch-cate="妝容"]').click();
  await expect(page.locator('#clothes .biguse-load-more')).toHaveCount(0);
  await expect(page.locator('#clothes .table-body .table-row').first()).toBeVisible();

  expect(failures, failures.join('\n')).toEqual([]);
});
