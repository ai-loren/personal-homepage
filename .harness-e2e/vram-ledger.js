async (page) => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const base = page.url().split('#')[0].split('?')[0];
  const errors = [];
  const onError = (error) => errors.push(error.message);
  page.on('pageerror', onError);
  const results = [];
  const read = () => page.evaluate(() => {
    const text = (selector) => document.querySelector(selector)?.textContent ?? null;
    const form = document.querySelector('.vram-form');
    return {
      state: document.querySelector('.vram')?.dataset.state,
      verdict: text('[data-out="verdict"]'),
      total: text('[data-out="total"]'),
      parts: ['weights', 'grads', 'optimizer', 'activations'].map((key) => text(`[data-out="${key}"]`)),
      error: document.querySelector('[data-out="error"]').hidden ? '' : text('[data-out="error"]'),
      tips: [...document.querySelectorAll('.vram-tip')].map((tip) => ({ label: tip.querySelector('span').textContent, saving: tip.querySelector('b').textContent })),
      values: Object.fromEntries([...form.elements].filter((element) => element.name).map((element) => [element.name, element.value])),
      customHidden: document.querySelector('.vram-custom').hidden,
      params: text('[data-out="params"]'),
      peek: { display: getComputedStyle(document.querySelector('.vram-peek')).display, text: document.querySelector('.vram-peek').textContent },
      count: document.querySelectorAll('.vram').length,
    };
  });
  const expected = (patch) => page.evaluate((patch) => {
    const tool = window.SITE_TOOLS['vram-ledger'];
    const model = tool.MODELS.find((entry) => entry.id === (patch.model || 'llama3-8b'));
    const config = { seq: 4096, micro: 1, tp: 1, pp: 1, dp: 8, zero: 1, recompute: 'none', attention: 'flash', memory: 80, ...patch, model };
    const result = tool.estimate(config);
    return { total: (result.total / 1024 ** 3).toFixed(1), level: result.level };
  }, patch);

  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${base}#projects`);
    await page.evaluate(() => { localStorage.setItem('personal-space-detail-mode', 'page'); });
    await page.reload();
    await page.waitForTimeout(500);
    const cardTotal = await page.locator('#project-list .project-card[href="#projects/vram-ledger"] .ledger-art strong').evaluate((node) => node.firstChild.textContent);
    const defaults = await expected({});
    assert(cardTotal === defaults.total, `The card shows ${cardTotal} but the default configuration totals ${defaults.total}`);
    results.push(`Card number matches the default estimate (${cardTotal} GiB): PASS`);

    await page.goto(`${base}#projects/vram-ledger`);
    await page.waitForTimeout(400);
    let now = await read();
    assert(now.count === 1 && now.state === 'fit' && now.verdict === '放得下' && now.total === defaults.total, `Default view: ${JSON.stringify(now)}`);
    assert(now.parts.every((part) => /^\d+\.\d GiB$/.test(part)) && now.customHidden && now.peek.display === 'none', `Legend, custom fields and peek on desktop: ${JSON.stringify(now)}`);
    results.push('Tool mounts in page mode with the default verdict: PASS');

    await page.selectOption('.vram-form select[name="model"]', 'llama3-70b');
    now = await read();
    const big = await expected({ model: 'llama3-70b' });
    assert(now.state === 'over' && now.verdict === '放不下' && now.total === big.total && now.values.layers === '80', `70B preset: ${JSON.stringify(now)}`);
    assert(now.tips.length > 0, '70B on eight cards must offer ways to save memory');
    const firstTip = now.tips[0];
    await page.locator('.vram-tip').first().click();
    const applied = await read();
    const remaining = firstTip.saving.match(/剩 ([\d.]+)/)[1];
    assert(applied.total === remaining, `Applying "${firstTip.label}" should leave ${remaining} GiB; shows ${applied.total}`);
    assert(JSON.stringify(applied.values) !== JSON.stringify(now.values) && applied.values.model === 'llama3-70b', `The tip changes the form, not the model: ${JSON.stringify(applied.values)}`);
    results.push(`Preset switch and "${firstTip.label}" tip: PASS`);

    await page.fill('.vram-form input[name="dp"]', '0');
    now = await read();
    assert(now.state === 'error' && /DP需要是正整数.*「0」.*填一个大于 0 的整数/.test(now.error) && now.peek.text.includes('配置有误'), `DP = 0: ${JSON.stringify(now)}`);
    await page.fill('.vram-form input[name="dp"]', '8');
    await page.selectOption('.vram-form select[name="model"]', 'qwen25-7b');
    await page.selectOption('.vram-form select[name="pp"]', '8');
    now = await read();
    assert(now.state === 'error' && /PP 要能整除层数.*28 ÷ 8.*1 \/ 2 \/ 4/.test(now.error), `PP 8 on 28 layers: ${JSON.stringify(now)}`);
    await page.selectOption('.vram-form select[name="pp"]', '4');
    now = await read();
    assert(now.error === '' && now.state !== 'error', `Fixing PP clears the error: ${JSON.stringify(now)}`);
    results.push('Bad input explains what to change, and clears once fixed: PASS');

    await page.selectOption('.vram-form select[name="model"]', 'custom');
    now = await read();
    assert(!now.customHidden && now.values.layers === '28' && now.values.hidden === '3584', `Custom starts from the last preset: ${JSON.stringify(now.values)}`);
    const paramsBefore = now.params;
    await page.fill('.vram-form input[name="layers"]', '56');
    now = await read();
    assert(now.params !== paramsBefore && now.state !== 'error', `Editing a custom dimension recomputes: ${paramsBefore} -> ${now.params}`);
    results.push('Custom model starts from the preset and recomputes: PASS');

    const before = await read();
    await page.locator('#reader-mode [data-mode="overlay"]').click();
    await page.waitForTimeout(300);
    const after = await read();
    assert(after.count === 1 && JSON.stringify(after.values) === JSON.stringify(before.values) && after.total === before.total, `Switching to the overlay keeps the inputs: ${JSON.stringify({ before: before.values, after: after.values })}`);
    await page.locator('#reader-mode [data-mode="page"]').click();
    await page.waitForTimeout(300);
    results.push('Inputs survive switching between overlay and page: PASS');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    await page.locator('.vram-form select[name="gpu"]').scrollIntoViewIfNeeded();
    now = await read();
    const layout = await page.evaluate(() => {
      const peek = document.querySelector('.vram-peek').getBoundingClientRect();
      return { overflow: document.documentElement.scrollWidth - innerWidth, peekBottom: Math.round(innerHeight - peek.bottom), peekVisible: peek.top < innerHeight && peek.bottom > 0 };
    });
    assert(layout.overflow <= 0, `No horizontal overflow on mobile: ${layout.overflow}px`);
    assert(now.peek.display !== 'none' && layout.peekVisible && now.peek.text.includes(now.total), `The summary bar follows the form on mobile: ${JSON.stringify({ peek: now.peek, layout })}`);
    results.push('Mobile: single column, sticky summary shows the live total: PASS');

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.route('**/tools/vram-ledger.js*', (route) => route.fulfill({ status: 404, body: '' }));
    await page.goto(`${base}#projects/vram-ledger`);
    await page.reload();
    await page.waitForTimeout(500);
    const fallback = await page.locator('.site-tool').textContent();
    assert(/这个工具没有加载出来.*刷新页面再试一次/.test(fallback), `A missing tool explains what to do: ${fallback}`);
    await page.unroute('**/tools/vram-ledger.js*');
    results.push('Missing tool script shows a recoverable message: PASS');

    const unexpected = errors.filter((message) => !/vram-ledger/.test(message));
    assert(!unexpected.length, `Page errors: ${unexpected.join(' | ')}`);
    return results.join('\n');
  } finally {
    page.off('pageerror', onError);
    await page.unroute('**/tools/vram-ledger.js*');
    await page.evaluate(() => localStorage.removeItem('personal-space-detail-mode'));
  }
}
