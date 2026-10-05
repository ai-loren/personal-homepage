async (page) => {
  const { baseURL, localPreview } = await page.evaluate(() => ({
    baseURL: new URL('.', location.href).href,
    localPreview: ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname),
  }));
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const privateText = /ByteDance|字节跳动|Seed AI Infra Engineer|Ads Infra Engineer|ipgen\.ohayoo\.cn|bytedance-logo\.png|bytedance-seed-logo\.png|ocean-engine-logo\.png/i;
  const errors = [];
  const onError = (error) => errors.push(error.message);
  page.on('pageerror', onError);
  const checkTencent = async (label) => {
    const companies = await page.locator('.experience-company').evaluateAll((nodes) => nodes.map((node) => node.dataset.companyId));
    assert(JSON.stringify(companies) === '["tencent"]', `${label}: non-Tencent company displayed`);
    for (const selector of ['[data-profile="role"]', '[data-profile-field="role"]']) {
      assert(await page.locator(selector).textContent() === 'Tencent Hunyuan AI Infra Engineer', `${label}: wrong profile role`);
    }
    assert(!privateText.test(await page.locator('#main').innerHTML()), `${label}: private history leaked into content`);
    assert((await page.locator('[data-role="Hunyuan AI Infra Engineer"] .journey-period').innerText()).includes('2026.09 — 至今'), `${label}: Hunyuan period changed`);
    assert(await page.locator('.journey-item-education').count() === 2, `${label}: education changed`);
    for (const image of await page.locator('[data-company-id="tencent"] img').all()) await image.evaluate((node) => node.decode());
  };
  const results = [];
  try {
    await page.goto(`${baseURL}?careerMode=all#home`);
    await page.reload();
    const contentResponse = await page.request.get(`${baseURL}content.js?careerMode=bytedance`);
    const contentSource = await contentResponse.text();
    assert(contentResponse.ok() && !privateText.test(contentSource), 'Private data is present in raw content response');
    if (localPreview) assert(contentResponse.headers()['cache-control'] === 'no-store', 'Preview must not cache old public content');
    const published = await page.evaluate(() => ({ ids: window.SITE_CONTENT.experience.map((company) => company.id), modes: Object.keys(window.SITE_CONTENT.careerModes) }));
    assert(JSON.stringify(published) === '{"ids":["tencent"],"modes":["tencent"]}', 'Published data or allowed modes are not locked');
    for (const file of ['app.js', 'index.html', 'styles.css']) {
      const response = await page.request.get(`${baseURL}${file}`);
      assert(response.ok() && !privateText.test(await response.text()), `Private history is present in ${file}`);
    }
    for (const path of ['content.js.bak', 'site.config.mjs', 'README.md', '.git/config', '.git/HEAD', '.harness-e2e/career-modes.js', 'scripts/site.mjs', 'assets/bytedance-logo.png', 'assets/bytedance-seed-logo.png', 'assets/ocean-engine-logo.png', 'assets/']) {
      const response = await page.request.get(`${baseURL}${path}`);
      assert(response.status() === 404, `Private path expected HTTP 404: ${path}; got ${response.status()}`);
    }
    const malformedResponse = await page.request.get(`${baseURL}%2e%2e%2fcontent.js`);
    const malformedBody = await malformedResponse.text();
    if (localPreview) assert(malformedResponse.status() === 404, 'Preview did not reject the malformed path');
    else assert(malformedResponse.status() >= 400, `CDN returned success for malformed path: ${malformedResponse.status()}`);
    assert(!privateText.test(malformedBody) && !malformedBody.includes('SITE_CONTENT'), 'Malformed path returned site data');
    results.push(`Malformed-path response: HTTP ${malformedResponse.status()}, no site data`);
    await checkTencent('initial');
    assert(await page.locator('#career-toggle').isDisabled(), 'Career toggle should be disabled');
    assert(await page.locator('#career-current').textContent() === 'Tencent', 'Career label should be fixed to Tencent');
    assert(await page.locator('#career-menu [data-career-mode]').count() === 1, 'Other menu options are present');
    results.push('Tencent-only public data, asset allowlist and private-path denial: PASS');

    await page.evaluate(() => {
      localStorage.setItem('careerMode', 'all');
      sessionStorage.setItem('careerMode', 'bytedance');
      window.SITE_CONTENT.careerMode = 'all';
      window.SITE_CONTENT.careerModes.all = '全部履历';
      window.SITE_CONTENT.careerModes.bytedance = 'ByteDance';
      const toggle = document.querySelector('#career-toggle');
      toggle.disabled = false;
      toggle.click();
      toggle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      const menu = document.querySelector('#career-menu');
      for (const mode of ['all', 'bytedance']) {
        const option = document.createElement('button');
        option.dataset.careerMode = mode;
        menu.append(option);
        option.click();
      }
      const original = menu.querySelector('[data-career-mode="tencent"]');
      original.dataset.careerMode = 'all';
      original.click();
    });
    assert(await page.locator('#career-menu').isHidden(), 'Changing disabled must not open the locked menu');
    for (const view of ['about', 'journey', 'home']) {
      await page.evaluate((name) => { location.hash = name; }, view);
      await page.locator(`[data-view="${view}"]`).waitFor({ state: 'visible' });
      await checkTencent(`tampered/${view}`);
    }
    await page.reload();
    await checkTencent('reload after storage tampering');
    assert(await page.locator('#career-toggle').isDisabled(), 'Reload did not restore locked toggle');
    results.push('DOM/global configuration/storage/URL tampering cannot reveal other history: PASS');

    const serialized = contentSource.match(/^window\.SITE_CONTENT = (\{[\s\S]+\});\s*$/);
    const modified = JSON.parse(serialized[1]);
    modified.careerMode = 'all';
    modified.careerModes = { all: '全部履历', bytedance: 'ByteDance', tencent: 'Tencent' };
    await page.route('**/content.js*', (route) => route.fulfill({ contentType: 'application/javascript', body: `window.SITE_CONTENT = ${JSON.stringify(modified)};` }));
    await page.reload();
    await checkTencent('client-side policy overwritten before app startup');
    assert(!(await page.evaluate(() => JSON.stringify(window.SITE_CONTENT.experience))).includes('bytedance'), 'Client recovered unpublished data');
    await page.unroute('**/content.js*');
    await page.reload();
    results.push('Overriding client policy still cannot restore data never published: PASS');

    for (const width of [1280, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      for (const theme of ['dark', 'light']) {
        if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('.theme-toggle').click();
        for (const view of ['home', 'about', 'journey']) {
          await page.evaluate((name) => { location.hash = name; }, view);
          await page.locator(`[data-view="${view}"]`).waitFor({ state: 'visible' });
          await checkTencent(`${width}/${theme}/${view}`);
          const fits = await page.locator('#career-toggle').evaluate((node) => {
            const rect = node.getBoundingClientRect();
            return node.disabled && rect.left >= 0 && rect.right <= innerWidth;
          });
          assert(fits, `Locked control overflow at ${width}`);
        }
      }
    }
    await page.evaluate(() => { location.hash = 'writing'; });
    await page.locator('#writing-search').fill('苏轼');
    assert(await page.locator('.writing-item').count() > 0, 'Writing search regressed');
    await page.locator('.writing-item').first().click();
    assert(await page.locator('#reader-dialog').isVisible(), 'Reader did not open');
    await page.keyboard.press('Escape');
    assert(await page.locator('#reader-dialog').isHidden(), 'Reader did not close');
    assert(errors.length === 0, `Uncaught errors: ${errors.join('; ')}`);
    results.push('Locked layouts/themes, education and reading flow: PASS');
    return results;
  } finally {
    await page.unroute('**/content.js*');
    await page.evaluate(() => { localStorage.removeItem('careerMode'); sessionStorage.removeItem('careerMode'); });
    page.off('pageerror', onError);
    await page.goto(`${baseURL}#home`);
    await page.reload();
  }
}
