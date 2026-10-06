async (page) => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const base = page.url().split('#')[0].split('?')[0];
  const errors = [];
  const onError = (error) => errors.push(error.message);
  page.on('pageerror', onError);
  const results = [];
  const body = [{ type: 'p', text: 'fixture' }];
  const project = (id, type, uses, code, extra = {}) => ({ id, name: id, subtitle: `${id} 副标题`, description: id, type, uses, code, tags: ['T'], artwork: 'browser', url: '', source: '', body, ...extra });
  // 声明顺序既非字典序也非作品里的书写顺序；没有任何作品是「工具」。
  const fixture = [
    project('alpha', '平台', ['SDK', 'Web'], '未开源', { status: '内测', translations: { en: { subtitle: 'Alpha in English', status: 'Beta', body } } }),
    project('beta', '框架', ['CLI', 'SDK'], '开源'),
    project('gamma', '应用', ['Web'], '开源'),
    project('delta', '应用', ['Web', 'CLI'], '未开源'),
    project('eps', '平台', ['Web', 'CLI', 'SDK'], '开源'),
  ];
  const expected = (filter) => fixture
    .filter((entry) => Object.entries(filter).every(([key, value]) => value === '全部' || [].concat(entry[key]).includes(value)))
    .map((entry) => entry.id);
  const serve = async (projects) => {
    await page.unroute('**/content.js*');
    await page.route('**/content.js*', async (route) => {
      const response = await route.fetch();
      const text = await response.text();
      const match = text.match(/^window\.SITE_CONTENT = (\{[\s\S]+\});\s*$/);
      assert(match, 'Expected generated public content.js');
      const content = JSON.parse(match[1]);
      content.projects = projects;
      await route.fulfill({ response, body: `window.SITE_CONTENT = ${JSON.stringify(content)};` });
    });
    await page.goto(`${base}#projects`);
    await page.reload();
    await page.waitForTimeout(400);
  };
  const state = () => page.evaluate(() => ({
    rows: [...document.querySelectorAll('#project-filters .facet-row')].map((row) => ({
      label: row.querySelector('.facet-label').textContent,
      buttons: [...row.querySelectorAll('button')].map((button) => ({ facet: button.dataset.facet, value: button.dataset.value, pressed: button.getAttribute('aria-pressed') === 'true', disabled: button.disabled })),
    })),
    cards: [...document.querySelectorAll('#project-list .project-card')].map((card) => decodeURIComponent(card.getAttribute('href').split('/').pop())),
    count: document.querySelector('#project-count').textContent,
    overflow: document.documentElement.scrollWidth - window.innerWidth,
  }));
  const filterOf = (snapshot) => Object.fromEntries(snapshot.rows.map((row) => [row.buttons[0].facet, row.buttons.find((button) => button.pressed).value]));
  const click = (facet, value) => page.locator(`#project-filters [data-facet="${facet}"][data-value="${value}"]`).click();

  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await serve(fixture);
    let now = await state();
    assert(JSON.stringify(now.rows.map((row) => row.label)) === '["类型","使用","代码"]', `Rows must follow projectFacets: ${JSON.stringify(now.rows.map((row) => row.label))}`);
    assert(JSON.stringify(now.rows.map((row) => row.buttons.map((button) => button.value))) === JSON.stringify([['全部', '平台', '框架', '应用'], ['全部', 'Web', 'CLI', 'SDK'], ['全部', '开源', '未开源']]),
      `Options must be the declared values that some project uses, in declared order: ${JSON.stringify(now.rows)}`);
    assert(now.rows.every((row) => row.buttons[0].pressed && row.buttons.every((button) => !button.disabled)), 'Every row starts at 全部 with nothing disabled');
    assert(JSON.stringify(now.cards) === JSON.stringify(expected({})) && now.count === '5 个作品', `All projects show first: ${JSON.stringify(now)}`);
    results.push('Three rows, declared order, unused value 工具 not offered: PASS');

    await click('type', '平台');
    await click('code', '未开源');
    now = await state();
    assert(JSON.stringify(now.cards) === '["alpha"]' && now.count === '1 个作品', `Rows combine with AND: ${JSON.stringify(now.cards)}`);
    const disabled = now.rows.flatMap((row) => row.buttons.filter((button) => button.disabled).map((button) => `${button.facet}=${button.value}`));
    assert(JSON.stringify(disabled.sort()) === JSON.stringify(['type=框架', 'uses=CLI'].sort()), `Only options that would empty the list are disabled: ${JSON.stringify(disabled)}`);
    await click('type', '全部');
    now = await state();
    assert(JSON.stringify(now.cards) === JSON.stringify(expected({ type: '全部', uses: '全部', code: '未开源' })), `全部 clears only its own row: ${JSON.stringify(now.cards)}`);
    results.push('AND across rows, unreachable options disabled, 全部 resets its row: PASS');

    await click('code', '全部');
    await click('uses', 'CLI');
    now = await state();
    assert(JSON.stringify(now.cards) === '["beta","delta","eps"]', `A multi-valued facet matches any project that lists the value: ${JSON.stringify(now.cards)}`);
    results.push('Multi-valued 使用 matches every project listing the value: PASS');

    let seed = 7;
    const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    for (let step = 0; step < 40; step += 1) {
      now = await state();
      const enabled = now.rows.flatMap((row) => row.buttons.filter((button) => !button.disabled));
      const pick = enabled[Math.floor(random() * enabled.length)];
      await click(pick.facet, pick.value);
      now = await state();
      const filter = filterOf(now);
      assert(now.cards.length > 0, `Clicking enabled options never empties the list; filter ${JSON.stringify(filter)}`);
      assert(JSON.stringify(now.cards) === JSON.stringify(expected(filter)), `Step ${step}: ${JSON.stringify(filter)} shows ${JSON.stringify(now.cards)}, expected ${JSON.stringify(expected(filter))}`);
      for (const row of now.rows) {
        for (const button of row.buttons) {
          if (button.pressed || button.value === '全部') continue;
          const reachable = expected({ ...filter, [button.facet]: button.value }).length > 0;
          assert(button.disabled === !reachable, `Step ${step}: ${button.facet}=${button.value} disabled=${button.disabled} but reachable=${reachable}`);
        }
      }
    }
    results.push('40 seeded random clicks: list never empty, always matches the filter, disabled == unreachable: PASS');

    for (const row of (await state()).rows) await click(row.buttons[0].facet, '全部');
    const card = await page.evaluate(() => {
      const read = (id) => {
        const node = document.querySelector(`#project-list .project-card[href="#projects/${id}"]`);
        return { label: node.querySelector('.project-label').textContent, marks: [...node.querySelectorAll('.facet-tag')].map((tag) => tag.textContent), last: node.querySelector('.item-meta').lastElementChild.textContent };
      };
      return { alpha: read('alpha'), beta: read('beta') };
    });
    assert(card.alpha.label === '平台 / 未开源' && JSON.stringify(card.alpha.marks) === '["Web","SDK"]' && card.alpha.last === '内测', `Card shows single-valued facets in the label and uses in declared order: ${JSON.stringify(card.alpha)}`);
    assert(card.beta.label === '框架 / 开源' && JSON.stringify(card.beta.marks) === '["CLI","SDK"]' && card.beta.last === 'T', `A project without status ends with its tags: ${JSON.stringify(card.beta)}`);
    results.push('Card label, use marks in declared order, optional status: PASS');

    await page.goto(`${base}#projects/alpha`);
    await page.waitForTimeout(300);
    let meta = await page.locator('#reader-meta').textContent();
    assert(meta === 'alpha 副标题 / 平台 / Web · SDK / 未开源 / 内测', `Detail meta lists every facet: ${meta}`);
    await page.locator('#reader-language').click();
    await page.waitForTimeout(200);
    meta = await page.locator('#reader-meta').textContent();
    assert(meta === 'Alpha in English / Platform / Web · SDK / Not open source / Beta', `English detail translates facet values: ${meta}`);
    await page.locator('#reader-language').click();
    await page.goto(`${base}#projects/beta`);
    await page.waitForTimeout(300);
    meta = await page.locator('#reader-meta').textContent();
    assert(meta === 'beta 副标题 / 框架 / CLI · SDK / 开源', `No trailing separator without status: ${meta}`);
    await page.keyboard.press('Escape');
    results.push('Detail meta in Chinese and English, no dangling separator: PASS');

    await serve(fixture.map((entry) => ({ ...entry, code: '开源' })));
    now = await state();
    assert(JSON.stringify(now.rows.map((row) => row.label)) === '["类型","使用"]', `A facet with one value in use hides its row: ${JSON.stringify(now.rows.map((row) => row.label))}`);
    results.push('Single-valued facet row hidden: PASS');

    await serve(fixture);
    await page.setViewportSize({ width: 360, height: 780 });
    await page.waitForTimeout(300);
    now = await state();
    assert(now.overflow <= 0, `Filter rows must not widen the page on mobile: overflow ${now.overflow}px`);
    await click('uses', 'SDK');
    now = await state();
    assert(JSON.stringify(now.cards) === JSON.stringify(expected({ type: '全部', uses: 'SDK', code: '全部' })), `Mobile filtering works: ${JSON.stringify(now.cards)}`);
    results.push('Mobile: no horizontal overflow, filters work: PASS');

    await page.unroute('**/content.js*');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${base}#projects`);
    await page.reload();
    await page.waitForTimeout(400);
    now = await state();
    assert(now.rows.length >= 2 && now.cards.length > 0, `Real content renders filters and cards: ${JSON.stringify(now)}`);
    results.push(`Real content: ${now.rows.map((row) => `${row.label}[${row.buttons.map((button) => button.value).join(' ')}]`).join(' ')}: PASS`);

    assert(!errors.length, `Page errors: ${errors.join(' | ')}`);
    return results.join('\n');
  } finally {
    page.off('pageerror', onError);
    await page.unroute('**/content.js*');
  }
}
