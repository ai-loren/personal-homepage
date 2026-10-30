async (page) => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const { base } = await page.evaluate(() => ({ base: new URL('.', location.href).href }));
  const results = [];
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  // 被扣住的请求在页面跳走时会被浏览器取消，之后再放行会报 already handled，所以放行一律吞掉这类错误。
  let mode = 'hold';
  let seen = 0;
  const pending = [];
  await page.route('**/content-details.json*', async (route) => {
    if (route.request().url().includes('probe=1')) return route.continue().catch(() => {});
    seen += 1;
    if (mode === 'fail') return route.fulfill({ status: 503, body: 'down' }).catch(() => {});
    if (mode === 'hold') await new Promise((resolve) => pending.push(resolve));
    return route.continue().catch(() => {});
  });
  const releaseAll = () => pending.splice(0).forEach((resolve) => resolve());
  const arrived = async (since) => {
    for (let waited = 0; seen <= since && waited < 8000; waited += 100) await page.waitForTimeout(100);
    assert(seen > since, 'The page should request the details by itself');
  };
  const fresh = async (url) => {
    releaseAll();
    await page.goto('about:blank');
    await page.goto(url);
  };

  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    let since = seen;
    await fresh(`${base}#home`);
    await page.waitForFunction(() => document.querySelectorAll('#writing-list .writing-item').length > 0);
    assert(await page.evaluate(() => !('body' in (window.SITE_CONTENT.articles[0] || {}))), 'content.js must not carry article bodies');
    assert(/\d+ 分钟阅读/.test(await page.locator('#writing-list .writing-item').first().innerText()), 'Reading time renders before any body arrives');
    await arrived(since);
    releaseAll();
    results.push('Lists and reading times render from content.js first; the details are fetched afterwards while idle: PASS');

    mode = 'hold';
    const article = await page.evaluate(() => window.SITE_CONTENT.articles[0]);
    since = seen;
    await fresh(`${base}#writing/${article.id}`);
    await page.locator('#reader-title').waitFor({ state: 'visible' });
    assert(await page.locator('#reader-title').innerText() === article.title, 'The title shows while the body is on its way');
    assert(await page.locator('.reader-loading').innerText() === '正在载入正文…', 'A deep link shows the loading line until the body arrives');
    await arrived(since);
    releaseAll();
    await page.locator('.reader-loading').waitFor({ state: 'detached', timeout: 10000 });
    assert((await page.locator('#reader-body').innerText()).trim().length > 20, 'The body fills in once the details arrive');
    await page.waitForTimeout(500);
    assert(seen - since === 1, `Details are fetched once; got ${seen - since}`);
    results.push('A deep link shows the title, then the body once the details arrive, from one request: PASS');

    mode = 'hold';
    since = seen;
    await fresh(`${base}#writing`);
    await page.waitForFunction(() => document.querySelectorAll('#writing-list .writing-item').length > 0);
    const probe = await page.evaluate(async () => {
      const details = await (await fetch(`./${window.SITE_CONTENT.details.file}?probe=1`)).json();
      const listed = window.SITE_CONTENT.articles.map((item) => `${item.title}${item.summary}${item.category}`).join('\n');
      for (const item of window.SITE_CONTENT.articles) {
        const text = (details.articles[item.id]?.body || []).map((block) => block.text || '').join('\n');
        const word = [...text.matchAll(/[\u3400-\u9fff]{4}/g)].map((match) => match[0]).find((candidate) => !listed.includes(candidate));
        if (word) return { id: item.id, title: item.title, word };
      }
      return {};
    });
    assert(probe.word, 'Fixture needs a body-only phrase to search for');
    await page.locator('#writing-search').fill(probe.word);
    await page.waitForTimeout(200);
    const before = await page.locator('#writing-list .writing-item h2').allInnerTexts();
    assert(!before.includes(probe.title), 'Before the details arrive, a body-only phrase does not match');
    await arrived(since);
    releaseAll();
    await page.waitForFunction((title) => [...document.querySelectorAll('#writing-list .writing-item h2')].some((node) => node.textContent === title), probe.title, { timeout: 10000 });
    results.push(`Searching "${probe.word}" loads the bodies and then finds "${probe.title}": PASS`);

    mode = 'fail';
    const project = await page.evaluate(() => window.SITE_CONTENT.projects[0].id);
    await fresh(`${base}#projects/${project}`);
    await page.locator('#reader-body .tool-missing').waitFor({ timeout: 10000 });
    assert(/正文没有加载出来（content-details\.json 返回 503）。刷新页面再试一次。/.test(await page.locator('#reader-body').innerText()), 'A failed load says what failed and what to do');
    results.push('A failed details request says what failed and to refresh, instead of loading forever: PASS');
  } finally {
    mode = 'pass';
    releaseAll();
    await page.unroute('**/content-details.json*');
  }
  return results;
}
