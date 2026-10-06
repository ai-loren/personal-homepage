async (page) => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const base = page.url().split('#')[0].split('?')[0];
  const errors = [];
  const onError = (error) => errors.push(error.message);
  page.on('pageerror', onError);
  const results = [];
  const read = () => page.evaluate(() => {
    const text = (selector) => document.querySelector(selector)?.textContent ?? null;
    const form = document.querySelector('.ckpt-form');
    return {
      state: document.querySelector('.ckpt')?.dataset.state,
      total: text('[data-out="total"]'),
      best: text('[data-out="best"]'),
      cluster: text('[data-out="cluster"]'),
      legend: [...document.querySelectorAll('.ckpt-legend b')].map((node) => node.textContent),
      error: document.querySelector('[data-out="error"]').hidden ? '' : text('[data-out="error"]'),
      tips: [...document.querySelectorAll('.ckpt-tip')].map((tip) => ({ label: tip.querySelector('span').textContent, result: tip.querySelector('b').textContent })),
      chart: { paths: document.querySelectorAll('.ckpt-chart .ckpt-curve').length, best: document.querySelectorAll('.ckpt-chart .ckpt-dot.is-best').length, current: document.querySelectorAll('.ckpt-chart .ckpt-dot.is-current').length },
      values: Object.fromEntries([...form.elements].filter((element) => element.name).map((element) => [element.name, element.value])),
      peek: { display: getComputedStyle(document.querySelector('.ckpt-peek')).display, text: document.querySelector('.ckpt-peek').textContent },
      count: document.querySelectorAll('.ckpt').length,
    };
  });
  const expected = (patch) => page.evaluate((patch) => {
    const tool = window.SITE_TOOLS['ckpt-goodput'];
    const result = tool.estimate({ gpus: 1024, mtbfHours: 35000, intervalMinutes: 120, saveSeconds: 540, restartMinutes: 55, ...patch });
    return { total: `${(result.current.goodput * 100).toFixed(1)}%`, optimal: tool.duration(result.optimal) };
  }, patch);

  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${base}#projects`);
    await page.evaluate(() => { localStorage.setItem('personal-space-detail-mode', 'page'); });
    await page.reload();
    await page.waitForTimeout(500);
    const cardTotal = await page.locator('#project-list .project-card[href="#projects/ckpt-goodput"] .ckpt-art strong').evaluate((node) => `${node.firstChild.textContent}%`);
    const defaults = await expected({});
    assert(cardTotal === defaults.total, `The card shows ${cardTotal} but the default configuration gives ${defaults.total}`);
    results.push(`Card number matches the default estimate (${cardTotal}): PASS`);

    await page.goto(`${base}#projects/ckpt-goodput`);
    await page.waitForTimeout(400);
    let now = await read();
    const sum = now.legend.reduce((total, value) => total + Number(value.replace('%', '')), 0);
    assert(now.count === 1 && now.state === 'ok' && now.total === defaults.total && now.legend[0] === defaults.total, `Default view: ${JSON.stringify(now)}`);
    assert(Math.abs(sum - 100) <= 0.2 && now.legend.every((value) => /^\d+\.\d%$/.test(value)), `The four shares add up to 100%: ${now.legend.join(' + ')}`);
    assert(now.best.includes(defaults.optimal) && /每 34 小时 11 分中断一次/.test(now.cluster), `Optimum and cluster MTBF are shown: ${now.best} / ${now.cluster}`);
    assert(now.chart.paths === 1 && now.chart.best === 1 && now.chart.current === 1 && now.peek.display === 'none', `Chart with both markers, no peek on desktop: ${JSON.stringify(now.chart)}`);
    results.push('Tool mounts with goodput, four shares, optimum and chart: PASS');

    await page.fill('.ckpt-form input[name="gpus"]', '4096');
    now = await read();
    const big = await expected({ gpus: 4096 });
    assert(now.total === big.total && now.best.includes(big.optimal) && /每 8 小时 33 分中断一次/.test(now.cluster), `4096 GPUs: ${JSON.stringify({ total: now.total, best: now.best, cluster: now.cluster })}`);
    const firstTip = now.tips[0];
    assert(firstTip, 'The tool suggests at least one improvement at 4096 GPUs');
    await page.locator('.ckpt-tip').first().click();
    const applied = await read();
    const promised = firstTip.result.match(/到 ([\d.]+%)/)[1];
    assert(applied.total === promised, `Applying "${firstTip.label}" promised ${promised}; shows ${applied.total}`);
    assert(JSON.stringify(applied.values) !== JSON.stringify(now.values) && applied.values.gpus === '4096', `The tip changes the inputs it names: ${JSON.stringify(applied.values)}`);
    results.push(`More GPUs shorten the optimum; "${firstTip.label}" delivers what it promises: PASS`);

    await page.fill('.ckpt-form input[name="saveSeconds"]', '0');
    now = await read();
    assert(now.state === 'error' && /每次保存停顿需要大于 0.*异步保存/.test(now.error) && now.peek.text.includes('配置有误'), `Pause 0: ${JSON.stringify(now)}`);
    await page.fill('.ckpt-form input[name="saveSeconds"]', '540');
    await page.fill('.ckpt-form input[name="gpus"]', '1.5');
    now = await read();
    assert(now.state === 'error' && /卡数需要是正整数.*「1\.5」/.test(now.error), `Fractional GPUs: ${JSON.stringify(now.error)}`);
    await page.fill('.ckpt-form input[name="gpus"]', '1024');
    now = await read();
    assert(now.error === '' && now.state === 'ok', `Fixing the input clears the error: ${JSON.stringify(now)}`);
    results.push('Bad input explains what to fill in, and clears once fixed: PASS');

    const before = await read();
    await page.locator('#reader-mode [data-mode="overlay"]').click();
    await page.waitForTimeout(300);
    const after = await read();
    assert(after.count === 1 && JSON.stringify(after.values) === JSON.stringify(before.values) && after.total === before.total, `Switching to the overlay keeps the inputs: ${JSON.stringify({ before: before.values, after: after.values })}`);
    await page.locator('#reader-mode [data-mode="page"]').click();
    await page.waitForTimeout(300);
    results.push('Inputs survive switching between overlay and page: PASS');

    await page.locator('.reader-refs a[href="#lab/goodput"]').click();
    await page.waitForTimeout(400);
    const lab = await page.evaluate(() => ({ hash: location.hash, title: document.querySelector('#reader-title').textContent }));
    assert(lab.hash === '#lab/goodput' && lab.title === '千卡训练的有效训练时间', `The lab link opens the experiment: ${JSON.stringify(lab)}`);
    results.push('In-site link opens the matching lab experiment: PASS');

    await page.goto(`${base}#projects/ckpt-goodput`);
    await page.waitForTimeout(300);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    await page.locator('.ckpt-form input[name="restartMinutes"]').scrollIntoViewIfNeeded();
    now = await read();
    const layout = await page.evaluate(() => {
      const peek = document.querySelector('.ckpt-peek').getBoundingClientRect();
      return { overflow: document.documentElement.scrollWidth - innerWidth, peekVisible: peek.top < innerHeight && peek.bottom > 0 };
    });
    assert(layout.overflow <= 0, `No horizontal overflow on mobile: ${layout.overflow}px`);
    assert(now.peek.display !== 'none' && layout.peekVisible && now.peek.text.includes(now.total), `The summary bar follows the form on mobile: ${JSON.stringify({ peek: now.peek, layout })}`);
    results.push('Mobile: single column, sticky summary shows the live goodput: PASS');

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.route('**/tools/ckpt-goodput/ckpt-goodput.js*', (route) => route.fulfill({ status: 404, body: '' }));
    await page.goto(`${base}#projects/ckpt-goodput`);
    await page.reload();
    await page.waitForTimeout(500);
    const fallback = await page.locator('.site-tool').textContent();
    assert(/这个工具没有加载出来.*刷新页面再试一次/.test(fallback), `A missing tool explains what to do: ${fallback}`);
    await page.unroute('**/tools/ckpt-goodput/ckpt-goodput.js*');
    results.push('Missing tool script shows a recoverable message: PASS');

    const unexpected = errors.filter((message) => !/ckpt-goodput/.test(message));
    assert(!unexpected.length, `Page errors: ${unexpected.join(' | ')}`);
    return results.join('\n');
  } finally {
    page.off('pageerror', onError);
    await page.unroute('**/tools/ckpt-goodput/ckpt-goodput.js*');
    await page.evaluate(() => localStorage.removeItem('personal-space-detail-mode'));
  }
}
