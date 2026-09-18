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
  const moduleState = await page.evaluate(() => ({
    wardrobe: typeof globalThis.WardrobeDomain,
    inventory: typeof globalThis.InventoryDomain,
    modelApi: typeof globalThis.createShoppingCart,
    actions: typeof globalThis.MainActions?.run,
  }));
  expect(moduleState).toEqual({ wardrobe: 'undefined', inventory: 'undefined', modelApi: 'undefined', actions: 'function' });
  await expectNoFailures(failures);
});

test('BigUse boots with both carts and native autocomplete', async ({ page }) => {
  const failures = collectBrowserFailures(page);
  await page.goto('/biguse.html', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('#autocomplete1')).toBeVisible();
  await expect(page.locator('#autocomplete2')).toBeVisible();
  await expect(page.locator('#shoppingCart1 .table-head')).toBeVisible();
  await expect(page.locator('#shoppingCart2 .table-head')).toBeVisible();

  const moduleState = await page.evaluate(async () => {
    const { clothes } = await import('/model.mjs');
    return {
      query: (clothes[0]?.name || '').slice(0, 2),
      wardrobe: typeof globalThis.WardrobeDomain,
      inventory: typeof globalThis.InventoryDomain,
      biguse: typeof globalThis.BigUseDomain,
    };
  });
  expect(moduleState.query.length).toBeGreaterThan(0);
  expect(moduleState).toMatchObject({ wardrobe: 'undefined', inventory: 'undefined', biguse: 'undefined' });
  const query = moduleState.query;
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
  const legacyGlobals = await page.evaluate(() => ({
    wardrobe: typeof globalThis.WardrobeDomain,
    inventory: typeof globalThis.InventoryDomain,
  }));
  expect(legacyGlobals).toEqual({ wardrobe: 'undefined', inventory: 'undefined' });
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

test('UI Gate 9D keeps page layouts responsive across desktop and mobile', async ({ page }) => {
  const failures = collectBrowserFailures(page);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect.poll(async () => page.locator('.ui-main-top').evaluate(element => element.ownerDocument.defaultView.getComputedStyle(element).display)).toBe('flex');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => page.locator('.ui-main-top').evaluate(element => element.ownerDocument.defaultView.getComputedStyle(element).display)).toBe('block');

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/biguse.html', { waitUntil: 'domcontentloaded' });
  await expect.poll(async () => page.locator('#shoppingCartCompare').evaluate(element => element.ownerDocument.defaultView.getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(2);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => page.locator('#shoppingCartCompare').evaluate(element => element.ownerDocument.defaultView.getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(1);

  await page.goto('/material.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#intro')).toBeHidden();
  await page.locator('#aIntro').click();
  await expect(page.locator('#intro')).toBeVisible();

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/wardrobechk.html', { waitUntil: 'domcontentloaded' });
  await expect.poll(async () => page.locator('.ui-wardrobe-grid').evaluate(element => element.ownerDocument.defaultView.getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(2);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => page.locator('.ui-wardrobe-grid').evaluate(element => element.ownerDocument.defaultView.getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(1);

  await expectNoFailures(failures);
});

test('UI Gate 9E runs without Bootstrap CSS and preserves project-owned button behavior', async ({ page }) => {
  const failures = collectBrowserFailures(page);

  for (const url of ['/index.html', '/biguse.html', '/material.html', '/wardrobechk.html']) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const stylesheets = await page.locator('link[rel="stylesheet"]').evaluateAll(links => links.map(link => link.getAttribute('href')));
    expect(stylesheets.some(href => href?.includes('bootstrap/'))).toBe(false);
  }

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const firstGroup = page.locator('[data-ui-buttons]').first();
  const radios = firstGroup.locator('input[type="radio"]');
  await expect(radios).toHaveCount(2);
  const radioStyle = await radios.first().evaluate(element => {
    const style = element.ownerDocument.defaultView.getComputedStyle(element);
    return { position: style.position, clip: style.clip };
  });
  expect(radioStyle.position).toBe('absolute');
  expect(radioStyle.clip).not.toBe('auto');

  const labels = firstGroup.locator('label');
  await labels.first().click();
  await expect(labels.first()).toHaveClass(/active/);
  await labels.nth(1).click();
  await expect(labels.first()).not.toHaveClass(/active/);
  await expect(labels.nth(1)).toHaveClass(/active/);

  const baseline = await page.locator('body').evaluate(body => {
    const view = body.ownerDocument.defaultView;
    const link = body.ownerDocument.querySelector('.title a');
    if (!link) throw new Error('expected title link');
    return {
      bodyFontSize: view.getComputedStyle(body).fontSize,
      linkDecoration: view.getComputedStyle(link).textDecorationLine,
    };
  });
  expect(baseline).toEqual({ bodyFontSize: '14px', linkDecoration: 'none' });
  await expectNoFailures(failures);
});

test('UI Gate 9F-2 keeps typography and shared controls visually consistent', async ({ page }) => {
  const failures = collectBrowserFailures(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

  const buttonMetrics = await page.locator('#onekey').evaluate(element => {
    const style = element.ownerDocument.defaultView.getComputedStyle(element);
    return { height: style.height, minHeight: style.minHeight, fontSize: style.fontSize };
  });
  expect(buttonMetrics).toEqual({ height: '34px', minHeight: '34px', fontSize: '14px' });

  const controlMetrics = await page.locator('#searchResultInput').evaluate(element => {
    const style = element.ownerDocument.defaultView.getComputedStyle(element);
    return { height: style.height, minHeight: style.minHeight, fontSize: style.fontSize };
  });
  expect(controlMetrics).toEqual({ height: '30px', minHeight: '30px', fontSize: '12px' });

  const checkWeight = await page.locator('.ui-check > label').first().evaluate(element => element.ownerDocument.defaultView.getComputedStyle(element).fontWeight);
  expect(checkWeight).toBe('400');

  const group = page.locator('.ui-btn-group').first();
  const groupRadii = await group.locator('.ui-btn').evaluateAll(elements => elements.map(element => {
    const style = element.ownerDocument.defaultView.getComputedStyle(element);
    return [style.borderTopLeftRadius, style.borderTopRightRadius];
  }));
  expect(groupRadii[0]).toEqual(['4px', '0px']);
  expect(groupRadii.at(-1)).toEqual(['0px', '4px']);

  const infoButton = page.locator('.front_filter_option.ui-btn-info').first();
  await infoButton.hover();
  await expect.poll(async () => infoButton.evaluate(element => element.ownerDocument.defaultView.getComputedStyle(element).backgroundColor)).toBe('rgb(49, 176, 213)');

  const oneKey = page.locator('#onekey');
  await oneKey.evaluate(element => { element.disabled = true; });
  const disabledStyle = await oneKey.evaluate(element => {
    const style = element.ownerDocument.defaultView.getComputedStyle(element);
    return { cursor: style.cursor, opacity: style.opacity };
  });
  expect(disabledStyle).toEqual({ cursor: 'not-allowed', opacity: '0.65' });

  const fieldsetStyle = await page.locator('fieldset').first().evaluate(element => {
    const style = element.ownerDocument.defaultView.getComputedStyle(element);
    const legend = element.querySelector('legend');
    if (!legend) throw new Error('expected fieldset legend');
    return {
      borderStyle: style.borderTopStyle,
      borderRadius: style.borderTopLeftRadius,
      legendFontSize: element.ownerDocument.defaultView.getComputedStyle(legend).fontSize,
    };
  });
  expect(fieldsetStyle).toEqual({ borderStyle: 'solid', borderRadius: '4px', legendFontSize: '14px' });

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileControlHeight = await page.locator('#searchResultInput').evaluate(element => element.ownerDocument.defaultView.getComputedStyle(element).height);
  expect(mobileControlHeight).toBe('30px');
  await expectNoFailures(failures);
});

test('UI Gate 9F-3 keeps Main and BigUse responsive without clipping or horizontal overflow', async ({ page }) => {
  const failures = collectBrowserFailures(page);
  const widths = [1280, 1024, 768, 390];

  for (const url of ['/index.html', '/biguse.html']) {
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await expect.poll(async () => page.locator('#categoryTab li').count()).toBeGreaterThan(1);

      const fitsViewport = await page.locator('html').evaluate(root => root.scrollWidth <= root.ownerDocument.defaultView.innerWidth);
      expect(fitsViewport, `${url} fits ${width}px viewport`).toBe(true);

      const tabsFit = await page.locator('.ui-tabs').evaluate(element => element.scrollWidth <= element.clientWidth);
      expect(tabsFit, `${url} tabs fit ${width}px viewport`).toBe(true);

      if (url === '/index.html') {
        const weightsFit = await page.locator('.weightContainer').evaluateAll(elements => elements.every(element => element.scrollWidth <= element.clientWidth));
        expect(weightsFit, `Main weight controls fit ${width}px viewport`).toBe(true);

        if (width === 390) {
          const themeFits = await page.locator('.ui-main-theme-controls').evaluate(element => {
            const rect = element.getBoundingClientRect();
            return element.scrollWidth <= element.clientWidth && rect.right <= element.ownerDocument.defaultView.innerWidth;
          });
          expect(themeFits).toBe(true);
        }
      } else {
        const cartSizing = await page.locator('#shoppingCartContainerA').evaluate(panel => {
          const input = panel.querySelector('.ui-cart-search');
          if (!input) throw new Error('expected cart search input');
          const panelWidth = panel.getBoundingClientRect().width;
          const inputWidth = input.getBoundingClientRect().width;
          return Math.abs(panelWidth - inputWidth) <= 1;
        });
        expect(cartSizing, `BigUse cart search fills panel at ${width}px`).toBe(true);
      }
    }
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/biguse.html', { waitUntil: 'domcontentloaded' });
  const query = await page.evaluate(async () => {
    const { clothes } = await import('/model.mjs');
    return (clothes[0]?.name || '').slice(0, 2);
  });
  await page.locator('#autocomplete1').fill(query);
  await expect(page.locator('.native-autocomplete-suggestions .autocomplete-suggestion').first()).toBeVisible();
  const suggestionFits = await page.locator('.native-autocomplete-suggestions').evaluateAll(elements => {
    const element = elements.find(node => node.ownerDocument.defaultView.getComputedStyle(node).display !== 'none');
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const viewportWidth = element.ownerDocument.defaultView.innerWidth;
    return rect.left >= 0 && rect.right <= viewportWidth;
  });
  expect(suggestionFits).toBe(true);

  const previewFits = await page.locator('#imgModel').evaluate(element => {
    element.style.display = 'block';
    const rect = element.getBoundingClientRect();
    const viewportWidth = element.ownerDocument.defaultView.innerWidth;
    return rect.left >= 0 && rect.right <= viewportWidth && rect.top >= 0;
  });
  expect(previewFits).toBe(true);

  await expectNoFailures(failures);
});

test('UI Gate 9F-4 keeps Material, Wardrobe Check and auxiliary layouts responsive', async ({ page }) => {
  const failures = collectBrowserFailures(page);
  const widths = [1280, 1024, 768, 390];

  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/material.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#selectScope')).toBeVisible();
    const materialFits = await page.locator('html').evaluate(root => root.scrollWidth <= root.ownerDocument.defaultView.innerWidth);
    expect(materialFits, `Material fits ${width}px viewport`).toBe(true);
    const materialOverflow = await page.locator('#levelDropInfo').evaluate(element => element.ownerDocument.defaultView.getComputedStyle(element).overflowX);
    expect(materialOverflow).toBe('auto');

    await page.goto('/wardrobechk.html', { waitUntil: 'domcontentloaded' });
    await expect.poll(async () => page.locator('#categoryTab li').count()).toBeGreaterThan(1);
    const wardrobeFits = await page.locator('html').evaluate(root => root.scrollWidth <= root.ownerDocument.defaultView.innerWidth);
    expect(wardrobeFits, `Wardrobe Check fits ${width}px viewport`).toBe(true);
    const tabsFit = await page.locator('.ui-tabs').evaluate(element => element.scrollWidth <= element.clientWidth);
    expect(tabsFit, `Wardrobe tabs fit ${width}px viewport`).toBe(true);
    const columns = await page.locator('.ui-wardrobe-grid').evaluate(element => element.ownerDocument.defaultView.getComputedStyle(element).gridTemplateColumns.split(' ').length);
    expect(columns).toBe(width <= 650 ? 1 : 2);
  }

  await expectNoFailures(failures);

  const auxiliary = await page.context().newPage();
  for (const width of widths) {
    await auxiliary.setViewportSize({ width, height: 900 });
    await auxiliary.goto('/cn-search/index.html', { waitUntil: 'domcontentloaded' });
    await auxiliary.locator('#manual-entry').evaluate(element => { element.open = true; });

    const auxiliaryFits = await auxiliary.locator('html').evaluate(root => root.scrollWidth <= root.ownerDocument.defaultView.innerWidth);
    expect(auxiliaryFits, `auxiliary search fits ${width}px viewport`).toBe(true);
    const attributesFit = await auxiliary.locator('.manual-attrs').evaluate(element => element.scrollWidth <= element.clientWidth);
    expect(attributesFit, `auxiliary manual attributes fit ${width}px viewport`).toBe(true);
    const resultsBehavior = await auxiliary.locator('.results-wrap').evaluate(element => {
      const rect = element.getBoundingClientRect();
      const style = element.ownerDocument.defaultView.getComputedStyle(element);
      return { right: rect.right, viewport: element.ownerDocument.defaultView.innerWidth, overflowX: style.overflowX };
    });
    expect(resultsBehavior.right).toBeLessThanOrEqual(resultsBehavior.viewport);
    expect(resultsBehavior.overflowX).toBe('auto');

    if (width === 390) {
      const mobileColumns = await auxiliary.locator('.manual-attrs').evaluate(element => element.ownerDocument.defaultView.getComputedStyle(element).gridTemplateColumns.split(' ').length);
      expect(mobileColumns).toBe(2);
      const groupsFill = await auxiliary.locator('.manual-grid .filter-group').evaluateAll(elements => elements.every(element => element.getBoundingClientRect().width >= 300));
      expect(groupsFill).toBe(true);
    }
  }
  await auxiliary.close();
});

test('UI Gate 9F-5 keeps the 650px responsive boundary stable across all UI surfaces', async ({ page }) => {
  const failures = collectBrowserFailures(page);
  const widths = [651, 650, 649];

  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });

    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    const mainState = await page.locator('.ui-main-top').evaluate(element => ({
      documentFits: element.ownerDocument.documentElement.scrollWidth <= element.ownerDocument.defaultView.innerWidth,
      display: element.ownerDocument.defaultView.getComputedStyle(element).display,
    }));
    expect(mainState.documentFits).toBe(true);
    expect(mainState.display).toBe(width <= 650 ? 'block' : 'flex');

    await page.goto('/biguse.html', { waitUntil: 'domcontentloaded' });
    const biguseState = await page.locator('#shoppingCartCompare').evaluate(element => ({
      documentFits: element.ownerDocument.documentElement.scrollWidth <= element.ownerDocument.defaultView.innerWidth,
      columns: element.ownerDocument.defaultView.getComputedStyle(element).gridTemplateColumns.split(' ').length,
    }));
    expect(biguseState.documentFits).toBe(true);
    expect(biguseState.columns).toBe(width <= 650 ? 1 : 2);

    await page.goto('/material.html', { waitUntil: 'domcontentloaded' });
    const materialFits = await page.locator('html').evaluate(root => root.scrollWidth <= root.ownerDocument.defaultView.innerWidth);
    expect(materialFits).toBe(true);

    await page.goto('/wardrobechk.html', { waitUntil: 'domcontentloaded' });
    const wardrobeState = await page.locator('.ui-wardrobe-grid').evaluate(element => ({
      documentFits: element.ownerDocument.documentElement.scrollWidth <= element.ownerDocument.defaultView.innerWidth,
      columns: element.ownerDocument.defaultView.getComputedStyle(element).gridTemplateColumns.split(' ').length,
      tabsFit: (() => {
        const tabs = element.ownerDocument.querySelector('.ui-tabs');
        return !!tabs && tabs.scrollWidth <= tabs.clientWidth;
      })(),
    }));
    expect(wardrobeState.documentFits).toBe(true);
    expect(wardrobeState.columns).toBe(width <= 650 ? 1 : 2);
    expect(wardrobeState.tabsFit).toBe(true);
  }

  await expectNoFailures(failures);

  const auxiliary = await page.context().newPage();
  for (const width of widths) {
    await auxiliary.setViewportSize({ width, height: 900 });
    await auxiliary.goto('/cn-search/index.html', { waitUntil: 'domcontentloaded' });
    await auxiliary.locator('#manual-entry').evaluate(element => { element.open = true; });
    const auxiliaryState = await auxiliary.locator('.manual-attrs').evaluate(element => ({
      documentFits: element.ownerDocument.documentElement.scrollWidth <= element.ownerDocument.defaultView.innerWidth,
      columns: element.ownerDocument.defaultView.getComputedStyle(element).gridTemplateColumns.split(' ').length,
      contentFits: element.scrollWidth <= element.clientWidth,
    }));
    expect(auxiliaryState.documentFits).toBe(true);
    expect(auxiliaryState.contentFits).toBe(true);
    expect(auxiliaryState.columns).toBe(width <= 650 ? 2 : 5);
  }
  await auxiliary.close();
});

test('Gate 10H-A keeps Main selector-sensitive workflows error-free', async ({ page }) => {
  test.setTimeout(120_000);
  const failures = collectBrowserFailures(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect.poll(async () => page.locator('#categoryTab li').count()).toBeGreaterThan(1);

  const sample = await page.evaluate(async () => {
    const { clothes } = await import('/model.mjs');
    const named = clothes.find(piece => piece?.name);
    const suited = clothes.find(piece => piece?.isSuit);
    return {
      name: named?.name || '',
      suit: suited?.isSuit || '',
    };
  });
  expect(sample.name.length).toBeGreaterThan(0);

  await page.locator('#searchResultInput').fill(sample.name.slice(0, 2));
  await page.locator('#btn-search-result').click();
  await expect(page.locator('#searchResultList .search').first()).toBeVisible();

  await page.locator('#searchResultInput').fill(sample.name.slice(0, 2));
  await page.locator('#searchResultInput').press('Enter');
  await expect(page.locator('#searchResultList .search').first()).toBeVisible();

  if (sample.suit) {
    await page.locator('#searchResultInput').fill(sample.suit);
    await page.locator('#btn-search-result').click();
    const suitResult = page.locator('.searchResultSet').first();
    await expect(suitResult).toBeVisible();
    await suitResult.click();
    await expect(page.locator('#searchResultList .search').first()).toBeVisible();
  }

  await page.locator('#categoryTab a[data-switch-cate]').first().click();
  await page.locator('input.fliter[value="highscore"]').click();
  await page.waitForTimeout(50);

  if (await page.locator('#showmore').getAttribute('isshowmore') === '1') {
    await page.locator('#showmore').click();
  }
  for (const label of [
    '少女染/進',
    '公主染/進',
    '店染/進',
    '設計圖染/進',
    '活動',
    '夢境',
    '謎之屋限定染/進',
  ]) {
    await page.getByRole('button', { name: '全部', exact: true }).click();
    await page.getByRole('button', { name: label, exact: true }).click();
  }

  await expectNoFailures(failures);
});

test('Gate 10H-B restores CSS-hidden UI through shared show/hide/toggle semantics', async ({ page }) => {
  const failures = collectBrowserFailures(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const highscoreLink = page.locator('.highscore-link').first();
  await expect(highscoreLink).toBeHidden();
  await page.locator('input.fliter[value="highscore"]').click();
  await expect(highscoreLink).toBeVisible();
  await page.locator('input.fliter[value="highscore"]').click();
  await expect(highscoreLink).toBeHidden();

  await page.goto('/biguse.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#imgModel')).toBeHidden();
  const previewCell = page.locator('#clothes .table-body .table-td.image').first();
  await previewCell.click();
  await expect(page.locator('#imgModel')).toBeVisible();
  await page.locator('#imgInfo').click();
  await expect(page.locator('#imgModel')).toBeHidden();
  await previewCell.click();
  await expect(page.locator('#imgModel')).toBeVisible();

  await expect(page.locator('#update_history')).toBeHidden();
  await page.locator('#show_history').click();
  await expect(page.locator('#update_history')).toBeVisible();
  await expect(page.locator('#show_history')).toBeHidden();

  await page.goto('/material.html', { waitUntil: 'domcontentloaded' });
  const inventoryPanel = page.locator('#custInv');
  const cartPanel = page.locator('#custCart');
  await expect(inventoryPanel).toBeHidden();
  await expect(cartPanel).toBeHidden();

  await page.locator('a.showInv').click();
  await expect(inventoryPanel).toBeVisible();
  await page.locator('a.showInv').click();
  await expect(inventoryPanel).toBeHidden();
  await page.locator('a.showInv').click();
  await expect(inventoryPanel).toBeVisible();

  await page.locator('a.showCart').click();
  await expect(cartPanel).toBeVisible();
  await page.locator('a.showCart').click();
  await expect(cartPanel).toBeHidden();
  await page.locator('a.showCart').click();
  await expect(cartPanel).toBeVisible();

  await expectNoFailures(failures);
});

test('Gate 10H-C keyboard activation dispatches exactly one click per Enter or Space', async ({ page }) => {
  const failures = collectBrowserFailures(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

  const showMore = page.locator('#showmore');
  await expect(showMore).toHaveAttribute('role', 'button');
  await expect(showMore).toHaveAttribute('tabindex', '0');
  await expect(showMore).toHaveAttribute('isshowmore', '1');

  await showMore.evaluate(element => {
    globalThis.__gate10hShowMoreClicks = 0;
    element.addEventListener('click', () => { globalThis.__gate10hShowMoreClicks += 1; });
  });
  await showMore.focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => globalThis.__gate10hShowMoreClicks)).toBe(1);
  await expect(showMore).toHaveAttribute('isshowmore', '0');

  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => globalThis.__gate10hShowMoreClicks)).toBe(2);
  await expect(showMore).toHaveAttribute('isshowmore', '1');

  await page.locator('input.fliter[value="highscore"]').click();
  const highscore = page.locator('.highscore-link').first();
  await expect(highscore).toBeVisible();
  await expect(highscore).toHaveAttribute('role', 'button');
  await expect(highscore).toHaveAttribute('tabindex', '0');

  await highscore.evaluate(element => {
    globalThis.__gate10hHighscoreClicks = 0;
    element.addEventListener('click', () => { globalThis.__gate10hHighscoreClicks += 1; });
  });
  await highscore.focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => globalThis.__gate10hHighscoreClicks)).toBe(1);
  await expect(highscore).toHaveClass(/active/);

  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => globalThis.__gate10hHighscoreClicks)).toBe(2);
  await expect(highscore).not.toHaveClass(/active/);

  await expectNoFailures(failures);
});

test('UI Gate 9G visual closeout keeps BigUse mobile A/B actions aligned and non-overlapping', async ({ page }) => {
  const failures = collectBrowserFailures(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/biguse.html', { waitUntil: 'domcontentloaded' });
  await expect.poll(async () => page.locator('#categoryTab li').count()).toBeGreaterThan(1);

  const rows = await page.locator('#clothes .table-row').evaluateAll(elements => elements.slice(0, 12).map(row => {
    const rowRect = row.getBoundingClientRect();
    const buttons = [...row.querySelectorAll('.table-td.icon .ui-btn')].map(button => {
      const rect = button.getBoundingClientRect();
      return {
        text: button.textContent?.trim() || '',
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
      };
    });
    return {
      row: { left: rowRect.left, top: rowRect.top, right: rowRect.right, bottom: rowRect.bottom },
      buttons,
    };
  }));

  let lastBottom = -Infinity;
  for (const row of rows) {
    if (row.buttons.length !== 2) continue;
    const [first, second] = row.buttons;
    expect([first.text, second.text]).toEqual(['A', 'B']);
    expect(Math.abs(first.top - second.top)).toBeLessThanOrEqual(1);
    expect(first.right).toBeLessThanOrEqual(second.left);
    expect(first.top).toBeGreaterThanOrEqual(row.row.top);
    expect(first.bottom).toBeLessThanOrEqual(row.row.bottom);
    expect(second.top).toBeGreaterThanOrEqual(row.row.top);
    expect(second.bottom).toBeLessThanOrEqual(row.row.bottom);
    expect(first.top).toBeGreaterThanOrEqual(lastBottom);
    lastBottom = Math.max(first.bottom, second.bottom);
  }

  const screenshot = await page.screenshot({ type: 'jpeg', quality: 45 });
  expect(screenshot.byteLength).toBeGreaterThan(10_000);
  await expectNoFailures(failures);
});
