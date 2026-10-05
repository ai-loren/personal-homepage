async (page) => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const base = page.url().split('#')[0].split('?')[0];
  const errors = [];
  const onError = (error) => errors.push(error.message);
  page.on('pageerror', onError);
  const results = [];
  const violations = () => page.evaluate(() => window.__cspViolations || []);
  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__cspViolations.push(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });
  const stubWidget = `<!doctype html><html><body><script>
    window.__messages = [];
    addEventListener('message', (event) => window.__messages.push(event.data));
    parent.postMessage({ giscus: { resizeHeight: 640 } }, '*');
  </script></body></html>`;
  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.route('https://giscus.app/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: stubWidget }));

    for (const view of ['home', 'about', 'writing', 'projects', 'lab', 'journey', 'library', 'ideas']) {
      await page.goto(`${base}#${view}`);
      await page.reload();
      await page.waitForTimeout(400);
    }
    for (const detail of ['writing/engineering-and-algorithms', 'lab/goodput', 'ideas/continual-learning']) {
      await page.goto(`${base}#${detail}`);
      await page.waitForTimeout(400);
    }
    let found = await violations();
    assert(found.length === 0, `CSP violations on built-in pages: ${found.join('; ')}`);
    results.push('All pages and detail views render under the CSP with zero violations: PASS');

    await page.route('**/content.js*', async (route) => {
      const response = await route.fetch();
      const body = (await response.text()).replace(/"categoryId": "[^"]*"/, '"categoryId": ""');
      await route.fulfill({ response, body });
    });
    await page.goto(`${base}#ideas/continual-learning`);
    await page.reload();
    await page.waitForTimeout(500);
    assert(await page.locator('#reader-dialog').evaluate((node) => node.open), 'Opening a question should show the detail dialog');
    assert(await page.locator('#question-replies iframe').count() === 0, 'Unconfigured replies must not create an iframe');
    assert(await page.locator('.replies-pending').isVisible(), 'Unconfigured replies should explain they are pending');
    results.push('Without a category id the reply area shows a pending notice and loads nothing: PASS');

    await page.unroute('**/content.js*');
    const site = await page.evaluate(() => window.SITE_CONTENT.comments.site);
    const onProduction = site.startsWith(base) || base.startsWith(site);
    if (!onProduction) {
      await page.goto(`${base}#ideas`);
      await page.reload();
      await page.goto(`${base}#ideas/continual-learning`);
      await page.waitForTimeout(500);
      assert(await page.locator('#question-replies iframe').count() === 0, 'A non-production origin must not embed giscus (giscus.json refuses it)');
      const link = page.locator('#question-replies .replies-site-link');
      assert(await link.getAttribute('href') === `${site}#ideas/continual-learning`, `Notice should link to the same question on ${site}; got ${await link.getAttribute('href')}`);
      assert(await link.getAttribute('rel') === 'noopener noreferrer' && await link.getAttribute('target') === '_blank', 'Production link must open safely in a new tab');
      results.push('On a non-production origin the reply area links to the production question instead of loading giscus: PASS');
    }

    await page.route('**/content.js*', async (route) => {
      const response = await route.fetch();
      const body = (await response.text())
        .replace(/"site": "[^"]*"/, `"site": "${base}"`)
        .replace('"title": "模型能不能边用边学，而不必等下一次重训？"', '"title": "<img src=x onerror=alert(1)>"');
      await route.fulfill({ response, body });
    });
    await page.goto(`${base}?giscus=${encodeURIComponent('<script>alert(1)</script>')}#ideas/continual-learning`);
    await page.reload();
    await page.waitForTimeout(800);

    assert(!page.url().includes('giscus='), `A malformed session must be stripped from the URL; got ${page.url()}`);
    assert(await page.evaluate(() => localStorage.getItem('giscus-session')) === null, 'A malformed session must not be stored');
    assert(await page.locator('#reader-title img, #ideas-list img').count() === 0, 'Question titles must render as text, never as markup');
    assert((await page.locator('#reader-title').textContent()) === '<img src=x onerror=alert(1)>', 'Escaped title text should be shown verbatim');

    const frame = page.locator('#question-replies iframe');
    assert(await frame.count() === 1, 'Configured replies should mount exactly one iframe');
    const query = Object.fromEntries((await frame.getAttribute('src')).split('?')[1].split('&').map((pair) => pair.split('=').map((part) => decodeURIComponent(part.replace(/\+/g, ' ')))));
    const src = { get: (key) => query[key], has: (key) => Object.hasOwn(query, key) };
    assert((await frame.getAttribute('src')).startsWith('https://giscus.app/zh-CN/widget?'), 'Iframe must point at giscus');
    assert(src.get('term') === 'question:continual-learning', `Each question maps to its own thread; got ${src.get('term')}`);
    assert(src.get('origin').endsWith('#ideas/continual-learning'), `Login must return to the same question; got ${src.get('origin')}`);
    assert(src.get('strict') === '1' && src.get('repoId') === 'R_kgDOUhJb1g' && src.get('categoryId') === 'DIC_kwDOUhJb1s4DHHEI' && src.get('category') === 'Announcements', 'Repo, category and strict matching must be passed through');
    assert(!src.has('session'), 'No session should be sent before login');
    const sandbox = (await frame.getAttribute('sandbox')).split(' ');
    assert(['allow-scripts', 'allow-same-origin', 'allow-popups', 'allow-top-navigation-by-user-activation'].every((token) => sandbox.includes(token)) && !sandbox.includes('allow-top-navigation'), `Unexpected sandbox: ${sandbox.join(' ')}`);
    results.push('Iframe targets giscus with a per-question term, strict mode and a restrictive sandbox: PASS');

    await page.waitForFunction(() => document.querySelector('#question-replies iframe')?.style.height === '640px');
    await page.evaluate(() => window.postMessage({ giscus: { resizeHeight: 9999 } }, '*'));
    await page.waitForTimeout(200);
    assert(await frame.evaluate((node) => node.style.height) === '640px', 'Messages not sent by the giscus iframe must be ignored');
    results.push('Only messages from the giscus iframe can resize it: PASS');

    const before = await page.locator('html').getAttribute('data-theme');
    await page.locator('.theme-toggle').evaluate((node) => node.click());
    await page.waitForTimeout(300);
    const widget = page.frames().find((candidate) => candidate.url().startsWith('https://giscus.app/'));
    const received = await widget.evaluate(() => window.__messages);
    const expected = before === 'dark' ? 'noborder_light' : 'transparent_dark';
    assert(received.some((message) => message?.giscus?.setConfig?.theme === expected), `Theme change should reach giscus; got ${JSON.stringify(received)}`);
    await page.locator('.theme-toggle').evaluate((node) => node.click());
    results.push('Theme toggles are forwarded to the reply iframe: PASS');

    await page.locator('#reader-close').click();
    const tornDown = await page.waitForFunction(() => !document.querySelector('#reader-dialog').open && !document.querySelector('#question-replies iframe'), null, { timeout: 2000 }).then(() => true, () => false);
    assert(tornDown, `Closing the question should tear the iframe down; dialog open=${await page.locator('#reader-dialog').evaluate((node) => node.open)}, iframes=${await page.locator('#question-replies iframe').count()}`);
    found = await violations();
    assert(found.length === 0, `CSP violations with replies enabled: ${found.join('; ')}`);
    assert(errors.length === 0, `Uncaught errors: ${errors.join('; ')}`);
    results.push('Closing removes the iframe; no CSP violations or errors with replies enabled: PASS');
    return results;
  } finally {
    page.off('pageerror', onError);
    await page.unroute('**/content.js*');
    await page.unroute('https://giscus.app/**');
  }
}
