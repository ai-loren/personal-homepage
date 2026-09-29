async (page, fixture) => {
  const origin = await page.evaluate(() => location.origin);
  const response = await page.request.get(`${origin}/content.js`);
  if (!response.ok()) throw new Error(`Cannot load content.js: HTTP ${response.status()}`);
  const source = fixture || await response.text();
  const serialized = source.match(/^window\.SITE_CONTENT = (\{[\s\S]+\});\s*$/);
  if (!serialized) throw new Error('Expected generated public content.js');
  const sourceContent = JSON.parse(serialized[1]);
  if (!sourceContent.careerModes.all) throw new Error('This suite requires an isolated all-mode fixture. Use career-locked.js for the locked public site; do not expose private source over HTTP.');
  const errors = [];
  const onError = (error) => errors.push(error.message);
  page.on('pageerror', onError);
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const roles = {
    tencent: 'Tencent Hunyuan AI Infra Engineer',
    bytedance: 'Bytedance Seed AI Infra Engineer',
  };
  const companiesByMode = {
    all: ['tencent', 'bytedance'],
    bytedance: ['bytedance'],
    tencent: ['tencent'],
  };
  const routePattern = '**/content.js*';
  const loadMode = async (mode, transform = () => {}) => {
    const content = JSON.parse(JSON.stringify(sourceContent));
    content.careerMode = mode;
    transform(content);
    await page.unroute(routePattern);
    await page.route(routePattern, (route) => route.fulfill({
      contentType: 'application/javascript',
      body: `window.SITE_CONTENT = ${JSON.stringify(content)};`,
    }));
    await page.goto('about:blank');
    await page.goto(`${origin}/#home`);
    await page.locator('#about-content .about-facts').waitFor({ state: 'attached' });
  };
  const checkCareer = async (ids, label) => {
    const actual = await page.locator('.experience-company').evaluateAll((nodes) => nodes.map((node) => node.dataset.companyId));
    assert(JSON.stringify(actual) === JSON.stringify(ids), `${label}: company filter/order ${JSON.stringify(actual)}`);
    const summary = ids.map((id) => roles[id]).join('\n') || '未展示职业经历';
    const mode = ids.length === 2 ? 'all' : ids[0];
    const checked = await page.locator('#career-menu [aria-checked="true"]').evaluateAll((nodes) => nodes.map((node) => node.dataset.careerMode));
    assert(JSON.stringify(checked) === JSON.stringify(mode ? [mode] : []), `${label}: menu selection disagrees with content`);
    assert(await page.locator('#career-current').textContent() === ({ all: '全部履历', bytedance: 'ByteDance', tencent: 'Tencent' }[mode] || '职业展示'), `${label}: incorrect trigger label`);
    for (const selector of ['[data-profile="role"]', '[data-profile-field="role"]']) {
      assert(await page.locator(selector).textContent() === summary, `${label}: incorrect role text in ${selector}`);
      assert(await page.locator(selector).evaluate((node) => getComputedStyle(node).whiteSpace) === 'pre-line', `${label}: roles must be separate lines`);
    }
    const careerHTML = await page.locator('#work-experience-list').innerHTML();
    assert(!/undefined|NaN|src=""/.test(careerHTML), `${label}: missing data leaked into markup`);
    for (const id of Object.keys(roles).filter((id) => !ids.includes(id))) {
      const forbidden = id === 'tencent' ? /Tencent|Hunyuan|腾讯/i : /ByteDance|字节跳动|Seed AI|Ads Infra|ocean-engine/i;
      assert(!forbidden.test(await page.locator('#main').innerHTML()), `${label}: hidden company exists in career content`);
    }
    assert(await page.locator('.journey-item-education').count() === 2, `${label}: education changed`);
    assert(!await page.locator('.hero-profile-meta').innerText().then((text) => text.includes('当前职位')), `${label}: historical roles labeled current`);
    const current = await page.locator('.experience-role .journey-degree').allTextContents();
    assert(current.length === Number(ids.includes('tencent')), `${label}: incorrect current-role count`);
    if (ids.includes('bytedance')) {
      const company = page.locator('[data-company-id="bytedance"]');
      assert(await company.locator('.experience-role').count() === 2, `${label}: ByteDance roles missing`);
      assert(!(await company.innerText()).includes('至今'), `${label}: ByteDance still current`);
      const companyHeader = await company.locator('.experience-company-header').innerText();
      assert(companyHeader.includes('2024.04 — 2026.09'), `${label}: incorrect company period`);
      assert(companyHeader.includes('2 年 6 个月'), `${label}: incorrect company duration`);
      const seedPeriod = company.locator('[data-role="Seed AI Infra Engineer"] .journey-period');
      assert((await seedPeriod.innerText()).includes('2026.01 — 2026.09'), `${label}: incorrect Seed period`);
      assert(await seedPeriod.locator('small').textContent() === '9 个月', `${label}: incorrect Seed duration`);
      assert(await company.locator('[data-role="Ads Infra Engineer"] .journey-period small').textContent() === '1 年 9 个月', `${label}: historical duration regression`);
    }
    if (ids.includes('tencent')) {
      const company = page.locator('[data-company-id="tencent"]');
      assert(await company.locator('[data-role="Hunyuan AI Infra Engineer"]').count() === 1, `${label}: Hunyuan missing`);
      assert((await company.locator('.journey-period').innerText()).includes('2026.09 — 至今'), `${label}: incorrect Hunyuan period`);
      assert((await company.locator('.experience-company-header').innerText()).includes('2026.09 — 至今'), `${label}: incorrect Tencent period`);
      assert(await company.locator('.experience-highlights, .experience-skills, .experience-location').count() === 0, `${label}: unprovided Tencent data rendered`);
      assert(await company.locator('.experience-brand-text').count() === 0, `${label}: text placeholders remain`);
      const logoSelectors = [
        '.experience-company-logo img[src="./assets/tencent-logo.png"][alt="Tencent"]',
        '.experience-role-logo img[src="./assets/tencent-hunyuan-logo.png"][alt="Tencent Hunyuan"]',
      ];
      assert(await company.locator('img').count() === 2, `${label}: expected two brand images`);
      for (const selector of logoSelectors) {
        const image = company.locator(selector);
        assert(await image.count() === 1, `${label}: wrong brand image ${selector}`);
        await image.evaluate((node) => node.decode());
        assert(await image.evaluate((node) => node.naturalWidth > 0 && node.naturalHeight > 0), `${label}: brand image failed to load`);
      }
    }
  };
  const toggle = page.locator('#career-toggle');
  const menu = page.locator('#career-menu');
  const checkClosed = async (label) => {
    assert(await menu.isHidden() && await toggle.getAttribute('aria-expanded') === 'false', `${label}: menu did not close`);
  };
  const selectMode = async (mode) => {
    const url = page.url();
    await toggle.click();
    assert(await menu.isVisible() && await toggle.getAttribute('aria-expanded') === 'true', 'Menu did not open');
    assert(await menu.getByRole('menuitemradio').count() === 3, 'Menu must have three choices');
    await menu.locator(`[data-career-mode="${mode}"]`).click();
    await checkClosed(mode);
    assert(await toggle.evaluate((node) => document.activeElement === node), 'Selection should restore trigger focus');
    assert(page.url() === url, 'Selecting a career mode changed the route');
    await checkCareer(companiesByMode[mode], `menu/${mode}`);
  };
  const baselineWidths = new Map();
  const checkLayout = async (view, label, recordBaseline = false) => {
    await page.evaluate((name) => { location.hash = name; }, view);
    await page.locator(`[data-view="${view}"]`).waitFor({ state: 'visible' });
    await page.evaluate(() => document.fonts.ready);
    const layout = await page.evaluate((name) => {
      const selector = name === 'home' ? '[data-profile="role"]' : name === 'about' ? '[data-profile-field="role"]' : '.experience-company';
      return {
        key: `${innerWidth}/${document.documentElement.dataset.theme}/${name}`,
        pageWidth: document.documentElement.scrollWidth,
        careerFits: [...document.querySelectorAll(selector)].every((node) => {
          const rect = node.getBoundingClientRect();
          return rect.left >= -1 && rect.right <= innerWidth + 1 && node.scrollWidth <= node.clientWidth + 1;
        }),
      };
    }, view);
    assert(layout.careerFits, `${label}/${view}: career region overflows`);
    // 首页隐藏轨道存在既有溢出；新增模式不能扩大单公司模式的整页宽度。
    if (recordBaseline) baselineWidths.set(layout.key, layout.pageWidth);
    else assert(layout.pageWidth <= baselineWidths.get(layout.key) + 1, `${label}/${view}: increased page overflow`);
  };
  const results = [];
  try {
    await page.goto('about:blank');
    await page.goto(`${origin}/#home`);
    const defaultMode = await page.evaluate(() => window.SITE_CONTENT.careerMode);
    assert(Object.hasOwn(companiesByMode, defaultMode), 'Default careerMode must be valid');
    await checkCareer(companiesByMode[defaultMode], `default/${defaultMode}`);
    await page.setViewportSize({ width: 1280, height: 900 });
    await loadMode('bytedance');
    const storedBefore = await page.evaluate(() => JSON.stringify(Object.entries(localStorage).sort()));
    for (const mode of ['tencent', 'all', 'bytedance']) await selectMode(mode);
    await page.locator('.theme-toggle').focus();
    await page.keyboard.press('Tab');
    assert(await toggle.evaluate((node) => document.activeElement === node), 'Trigger is not reachable by Tab');
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowDown');
    await checkCareer(companiesByMode.bytedance, 'keyboard/uncommitted');
    await page.keyboard.press('Enter');
    await checkCareer(companiesByMode.tencent, 'keyboard/enter');
    await checkClosed('keyboard/enter');
    await toggle.press('ArrowUp');
    await page.keyboard.press('Home');
    assert(await menu.locator('[data-career-mode="all"]').evaluate((node) => document.activeElement === node), 'Home should focus first choice');
    await page.keyboard.press('End');
    assert(await menu.locator('[data-career-mode="tencent"]').evaluate((node) => document.activeElement === node), 'End should focus last choice');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Escape');
    await checkClosed('escape');
    await checkCareer(companiesByMode.tencent, 'escape/no-change');
    assert(await toggle.evaluate((node) => document.activeElement === node), 'Escape did not restore focus');
    await toggle.press('ArrowDown');
    await page.keyboard.press('Space');
    await checkCareer(companiesByMode.all, 'keyboard/space');
    await checkClosed('keyboard/space');
    await toggle.click();
    await page.keyboard.press('Tab');
    await checkClosed('tab');
    assert(!await toggle.evaluate((node) => document.activeElement === node), 'Tab trapped focus on trigger');
    await toggle.click();
    await page.keyboard.press('Shift+Tab');
    await checkClosed('shift-tab');
    assert(await page.locator('.theme-toggle').evaluate((node) => document.activeElement === node), 'Shift+Tab did not move to previous control');
    await toggle.click();
    await page.locator('.wordmark').click();
    await checkClosed('outside-click');
    await toggle.click();
    await toggle.click();
    await checkClosed('toggle-click');
    assert(await page.evaluate(() => JSON.stringify(Object.entries(localStorage).sort())) === storedBefore, 'Career selection persisted in localStorage');
    results.push('mouse, keyboard, dismissal and no persistence: PASS');

    await page.evaluate(() => { location.hash = 'journey'; });
    await page.locator('[data-view="journey"]').waitFor({ state: 'visible' });
    await selectMode('tencent');
    for (const view of ['home', 'about']) {
      await page.evaluate((name) => { location.hash = name; }, view);
      await page.locator(`[data-view="${view}"]`).waitFor({ state: 'visible' });
      await checkCareer(companiesByMode.tencent, `route/${view}`);
    }
    await page.goBack();
    await checkCareer(companiesByMode.tencent, 'history');
    await page.evaluate(() => { location.hash = 'writing'; });
    await page.locator('#writing-search').fill('小');
    const writingCount = await page.locator('.writing-item').count();
    await selectMode('all');
    assert(await page.locator('#writing-search').inputValue() === '小' && await page.locator('.writing-item').count() === writingCount, 'Switch reset writing search');
    await page.reload();
    await checkCareer(companiesByMode.bytedance, 'refresh/bytedance');
    await loadMode('tencent');
    await selectMode('all');
    await page.reload();
    await checkCareer(companiesByMode.tencent, 'refresh/configured-tencent');
    results.push('route/history/search preservation and configured refresh default: PASS');

    await loadMode('bytedance');
    for (const width of [1440, 1280, 1100, 1024, 768, 600, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      for (const theme of ['dark', 'light']) {
        if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('.theme-toggle').click();
        await toggle.click();
        await page.evaluate(() => document.fonts.ready);
        const fits = await page.evaluate(() => {
          const nodes = [...document.querySelectorAll('.site-header > *, .header-actions > *, #career-toggle, #career-menu')];
          return nodes.filter((node) => node.getBoundingClientRect().width).every((node) => {
            const rect = node.getBoundingClientRect();
            return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight && node.scrollWidth <= node.clientWidth + 1;
          });
        });
        assert(fits, `Menu/header overflow at ${width}/${theme}`);
        await page.keyboard.press('Escape');
      }
      for (const mode of ['all', 'tencent', 'bytedance']) await selectMode(mode);
      if (width <= 760) {
        await page.locator('.menu-toggle').click();
        await toggle.click();
        assert(await page.locator('#mobile-nav').isHidden() && await menu.isVisible(), 'Mobile navigation overlaps career menu');
        await page.locator('.menu-toggle').click();
        assert(await menu.isHidden() && await page.locator('#mobile-nav').isVisible(), 'Career menu overlaps mobile navigation');
        await page.keyboard.press('Escape');
      }
    }
    results.push('menu layouts, themes, live switching and mobile navigation: PASS');
    for (const width of [1280, 600, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await loadMode('bytedance');
      for (const theme of ['dark', 'light']) {
        if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('.theme-toggle').click();
        for (const view of ['home', 'about', 'journey']) await checkLayout(view, `baseline/${width}/${theme}`, true);
      }
    }
    for (const mode of Object.keys(companiesByMode)) {
      for (const width of [1280, 600, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await loadMode(mode);
        await checkCareer(companiesByMode[mode], `${mode}/${width}`);
        for (const theme of ['dark', 'light']) {
          if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('.theme-toggle').click();
          for (const view of ['home', 'about', 'journey']) await checkLayout(view, `${mode}/${width}/${theme}`);
        }
        results.push(`${mode}/${width}: PASS`);
      }
    }
    await loadMode('invalid');
    await checkCareer([], 'invalid');
    results.push('invalid mode fails closed: PASS');
    await loadMode('all', (content) => { content.experience.find((company) => company.id === 'bytedance').roles[0].end = ''; });
    assert(await page.locator('[data-company-id="bytedance"] .experience-company-identity p').textContent() === '正式 · 2024.04 — 已离职', 'Missing end: company end inferred from Ads');
    assert(await page.locator('[data-role="Seed AI Infra Engineer"] .journey-period').textContent() === '2026.01 — 已离职', 'Missing end: guessed Seed date or duration');
    results.push('missing historical date: PASS');
    await loadMode('all', (content) => {
      const company = content.experience.find((entry) => entry.id === 'tencent');
      company.start = '';
      company.roles[0].start = '';
    });
    assert(await page.locator('[data-company-id="tencent"] .experience-company-identity p').textContent() === '在职', 'Missing start: guessed Tencent date or duration');
    assert(await page.locator('[data-role="Hunyuan AI Infra Engineer"] .journey-period').textContent() === '在职', 'Missing start: guessed Hunyuan date or duration');
    results.push('missing current start date: PASS');
    await loadMode('all', (content) => { content.experience.find((company) => company.id === 'bytedance').roles[0].end = '2026-08'; });
    assert((await page.locator('[data-company-id="bytedance"] .experience-company-header').innerText()).includes('2024.04 — 2026.08'), 'Completed dates: incorrect company end');
    assert(await page.locator('[data-role="Seed AI Infra Engineer"] .journey-period small').textContent() === '8 个月', 'Completed dates: incorrect Seed duration');
    const now = new Date();
    const months = (now.getFullYear() - 2026) * 12 + now.getMonth() - 8 + 1;
    const duration = [Math.floor(months / 12) ? `${Math.floor(months / 12)} 年` : '', months % 12 ? `${months % 12} 个月` : ''].filter(Boolean).join(' ');
    assert(await page.locator('[data-role="Hunyuan AI Infra Engineer"] .journey-period small').textContent() === duration, 'Completed dates: incorrect current duration');
    results.push('completed dates: PASS');
    const noJS = await page.context().browser().newContext({ javaScriptEnabled: false });
    try {
      const fallback = await noJS.newPage();
      await fallback.goto(origin);
      assert(!/Tencent|Hunyuan|ByteDance|字节跳动|腾讯/i.test(await fallback.locator('body').innerText()), 'No-JS fallback reveals company');
    } finally {
      await noJS.close();
    }
    assert(errors.length === 0, `Uncaught page errors: ${errors.join('; ')}`);
    results.push('no-JS fallback and runtime errors: PASS');
    return results;
  } finally {
    await page.unroute(routePattern);
    page.off('pageerror', onError);
    await page.goto('about:blank');
    await page.goto(`${origin}/#home`);
  }
}
