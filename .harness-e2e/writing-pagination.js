async (page) => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const errors = [];
  const onError = (error) => errors.push(error.message);
  page.on('pageerror', onError);
  const state = () => page.evaluate(() => ({
    items: [...document.querySelectorAll('#writing-list .writing-item')].map((node) => node.getAttribute('href')),
    summary: document.querySelector('#writing-pagination .pagination-summary')?.textContent || '',
    current: document.querySelector('#writing-pagination [aria-current="page"]')?.textContent || '',
    hidden: document.querySelector('#writing-pagination').hidden,
  }));
  const total = await page.evaluate(() => window.SITE_CONTENT.articles.length);
  const results = [];
  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${page.url().split('#')[0]}#writing`);
    await page.reload();
    await page.locator('#writing-list .writing-item').first().waitFor();

    let now = await state();
    const pages = Math.ceil(total / 10);
    assert(now.items.length === Math.min(10, total), `Default page expected ${Math.min(10, total)} items; got ${now.items.length}`);
    assert(now.summary.includes(`共 ${total} 条`) && now.summary.includes(`第 1 / ${pages} 页`), `Summary expected total ${total} and ${pages} pages; got "${now.summary}"`);
    const firstPage = now.items;
    await page.locator('#writing-pagination .pagination-step', { hasText: '下一页' }).click();
    now = await state();
    assert(now.current === '2' && now.items.every((href) => !firstPage.includes(href)), 'Next page should show page 2 with different articles');
    await page.locator(`#writing-pagination [data-page="${pages}"].pagination-page`).click();
    now = await state();
    assert(now.items.length === total - (pages - 1) * 10, `Last page expected ${total - (pages - 1) * 10} items; got ${now.items.length}`);
    assert(await page.locator('#writing-pagination .pagination-step', { hasText: '下一页' }).isDisabled(), 'Next should be disabled on the last page');
    results.push(`Default ${pages} pages × 10, next and last page: PASS`);

    await page.locator('#writing-filters [data-category="技术"]').click();
    now = await state();
    const techTotal = await page.evaluate(() => window.SITE_CONTENT.articles.filter((article) => article.category === '技术').length);
    assert(now.current === '1' && now.summary.includes(`共 ${techTotal} 条`), `Category change should reset to page 1 with ${techTotal} items; got "${now.summary}"`);
    await page.locator('#writing-page-size').selectOption('20');
    now = await state();
    assert(now.items.length === Math.min(20, techTotal) && now.summary.includes(`第 1 / ${Math.ceil(techTotal / 20)} 页`), `Page size 20 expected ${Math.ceil(techTotal / 20)} pages; got "${now.summary}"`);
    results.push('Category filter resets page; page size selector re-paginates: PASS');

    await page.locator('#writing-filters [data-category="全部"]').click();
    await page.locator('#writing-search').fill('苏轼');
    now = await state();
    assert(now.items.length > 0 && now.current === '1', 'Search should show matches starting from page 1');
    await page.locator('#writing-search').fill('no-matching-article-xyz');
    now = await state();
    assert(now.hidden && await page.locator('#writing-empty').isVisible(), 'Empty search should hide pagination and show the empty state');
    await page.locator('#writing-search').fill('');
    results.push('Search resets page and hides pagination when empty: PASS');

    await page.locator('#writing-page-size').selectOption('10');
    await page.locator('#writing-pagination').screenshot({ path: '/tmp/pagination-desktop.png' });
    await page.setViewportSize({ width: 390, height: 900 });
    await page.locator('#writing-pagination').scrollIntoViewIfNeeded();
    const fits = await page.locator('#writing-pagination').evaluate((node) => node.scrollWidth <= node.clientWidth + 1 && node.getBoundingClientRect().right <= innerWidth);
    assert(fits, 'Pagination overflows horizontally at 390px');
    await page.locator('#writing-pagination').screenshot({ path: '/tmp/pagination-mobile.png' });
    results.push('Mobile pagination fits within 390px: PASS');

    assert(errors.length === 0, `Uncaught errors: ${errors.join('; ')}`);
    return results;
  } finally {
    page.off('pageerror', onError);
  }
}
