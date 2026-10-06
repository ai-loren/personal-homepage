async (page) => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const base = page.url().split('#')[0].split('?')[0];
  const errors = [];
  const onError = (error) => errors.push(error.message);
  page.on('pageerror', onError);
  const results = [];
  const snapshot = () => page.evaluate(() => ({
    dialogOpen: document.querySelector('#reader-dialog').open,
    pageVisible: !document.querySelector('#detail-page').hidden,
    shellInPage: document.querySelector('#reader-shell').parentElement.id,
    listVisible: !document.querySelector('[data-view="projects"]').hidden,
    hash: location.hash,
    scrollY: Math.round(window.scrollY),
    title: document.querySelector('#reader-title').textContent,
    back: document.querySelector('#reader-back').hidden ? null : document.querySelector('#reader-back').textContent,
    closeHidden: document.querySelector('#reader-close').hidden,
    mode: document.querySelector('#reader-mode [aria-pressed="true"]').dataset.mode,
    readerIds: document.querySelectorAll('#reader-title').length,
  }));
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${base}#projects`);
    await page.evaluate(() => localStorage.removeItem('personal-space-detail-mode'));
    await page.reload();
    await page.waitForTimeout(500);
    const firstProject = await page.locator('#project-list .project-card').first().getAttribute('href');

    await page.locator('#project-list .project-card').first().click();
    await page.waitForTimeout(300);
    let now = await snapshot();
    assert(now.dialogOpen && !now.pageVisible && now.listVisible && now.mode === 'overlay' && now.back === null && !now.closeHidden, `Default should stay the overlay: ${JSON.stringify(now)}`);
    results.push('Overlay remains the default: PASS');

    await page.locator('#reader-mode [data-mode="page"]').click();
    await page.waitForTimeout(400);
    now = await snapshot();
    assert(!now.dialogOpen && now.pageVisible && now.shellInPage === 'detail-page' && !now.listVisible, `Switching to page mode should move the detail into the page: ${JSON.stringify(now)}`);
    assert(now.hash === firstProject, `URL must stay on the item when switching modes; got ${now.hash}`);
    assert(now.back === '← 返回作品' && now.closeHidden && now.readerIds === 1, `Page mode shows a back button and keeps one reader: ${JSON.stringify(now)}`);
    assert(await page.locator('.site-header').isVisible(), 'Page mode keeps the site header');
    results.push('Switching to page mode keeps the URL, shows the header and a back button: PASS');

    await page.locator('#reader-back').click();
    await page.waitForTimeout(400);
    now = await snapshot();
    assert(!now.pageVisible && now.listVisible && now.hash === '#projects' && !now.dialogOpen, `Back should return to the list: ${JSON.stringify(now)}`);
    results.push('Back button returns to the works list: PASS');

    await page.evaluate(() => window.scrollTo({ top: 600, behavior: 'instant' }));
    await page.locator('#project-list .project-card').nth(1).scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    const listScrollBefore = Math.round(await page.evaluate(() => window.scrollY));
    assert(listScrollBefore > 100, `The list should be scrolled before opening; got ${listScrollBefore}`);
    await page.locator('#project-list .project-card').nth(1).click();
    await page.waitForTimeout(400);
    now = await snapshot();
    assert(now.pageVisible && now.scrollY < 50 && now.mode === 'page', `Page mode is remembered and opens at the top: ${JSON.stringify(now)}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    now = await snapshot();
    assert(now.listVisible && Math.abs(now.scrollY - listScrollBefore) < 40, `Escape returns to the list at the previous scroll position (${listScrollBefore}); got ${now.scrollY}`);
    results.push('Choice persists; Escape returns to the list where you left it: PASS');

    await page.reload();
    await page.goto(`${base}${firstProject}`);
    await page.waitForTimeout(400);
    now = await snapshot();
    assert(now.pageVisible && !now.dialogOpen, 'A deep link opens in the remembered page mode');
    if (await page.locator('#reader-language').isVisible()) {
      const before = await page.locator('#reader-title').textContent();
      await page.locator('#reader-language').click();
      await page.waitForTimeout(300);
      now = await snapshot();
      assert(now.pageVisible && now.shellInPage === 'detail-page', 'Language switch keeps page mode');
      await page.locator('#reader-language').click();
      assert((await page.locator('#reader-title').textContent()) === before, 'Language switch round-trips');
      results.push('Deep links honour page mode; language toggle still works in page mode: PASS');
    } else {
      results.push('Deep links honour page mode: PASS');
    }

    await page.goto(`${base}#lab/goodput`);
    await page.waitForTimeout(400);
    now = await snapshot();
    assert(now.pageVisible && (await page.locator('#reader-back').textContent()) === '← 返回实验', 'Page mode applies to other detail views too');
    await page.locator('.experiment-jump').click();
    await page.waitForTimeout(800);
    assert(await page.locator('#experiment-datasets').isVisible(), 'In-page jumps still work in page mode');
    results.push('Lab detail renders in page mode with working dataset jump: PASS');

    await page.locator('#reader-mode [data-mode="overlay"]').click();
    await page.waitForTimeout(400);
    now = await snapshot();
    assert(now.dialogOpen && !now.pageVisible && now.hash === '#lab/goodput', `Switching back to overlay reopens the dialog on the same item: ${JSON.stringify(now)}`);
    await page.locator('#reader-close').click();
    await page.waitForTimeout(300);
    now = await snapshot();
    assert(!now.dialogOpen && now.hash === '#lab', `Closing the overlay returns to the list: ${now.hash}`);
    results.push('Switching back to overlay and closing behave as before: PASS');

    assert(errors.length === 0, `Uncaught errors: ${errors.join('; ')}`);
    return results;
  } finally {
    page.off('pageerror', onError);
    await page.evaluate(() => localStorage.removeItem('personal-space-detail-mode')).catch(() => {});
  }
}
