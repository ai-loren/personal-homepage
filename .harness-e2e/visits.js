async (page) => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const { base, pageOrigin } = await page.evaluate(() => ({ base: new URL('.', location.href).href, pageOrigin: location.origin }));
  const results = [];
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${base}#home`);
  const { endpoint, since, counter } = await page.evaluate(() => {
    const visits = window.SITE_CONTENT.visits || {};
    return { ...visits, counter: visits.endpoint ? new URL(visits.endpoint).origin : '' };
  });
  if (!endpoint) {
    assert(await page.locator('#visits-line').count() === 0, 'Without visits.endpoint the counter line must not be published');
    return ['No endpoint configured: no counter line: PASS'];
  }

  const calls = [];
  let mode = 'ok';
  await page.route(`${counter}/**`, async (route) => {
    const request = route.request();
    calls.push({ method: request.method(), path: request.url().slice(counter.length).split(/[?#]/)[0], body: request.postData(), type: request.headers()['content-type'] || '' });
    const headers = { 'Access-Control-Allow-Origin': pageOrigin, 'Cache-Control': 'no-store' };
    if (mode === 'fail') return route.fulfill({ status: 500, contentType: 'application/json', headers, body: '{"error":"database"}' });
    if (mode === 'garbage') return route.fulfill({ status: 200, contentType: 'application/json', headers, body: '{"travelers":"many","visits":-1}' });
    return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify({ travelers: 1234, visits: 5678, counted: true }) });
  });
  const forget = () => page.evaluate(() => { localStorage.removeItem('personal-space-traveler'); localStorage.removeItem('personal-space-nocount'); });
  const load = async (url) => {
    await page.goto('about:blank');
    await page.goto(url);
    await page.waitForFunction(() => {
      const line = document.querySelector('#visits-line');
      return line && (line.hidden || line.dataset.state === 'ready');
    }, null, { timeout: 10000 });
  };
  const visitCalls = () => calls.filter((call) => call.path === '/visit');
  const statsCalls = () => calls.filter((call) => call.path === '/stats');

  try {
    await forget();
    await load(`${base}#home`);
    const text = await page.locator('#visits-line').innerText();
    assert(await page.locator('.visits-since').innerText() === `from ${since}`, `The line should start with "from ${since}"; got "${text}"`);
    assert(await page.locator('[data-visits="travelers"]').innerText() === '1,234', `Travelers should read 1,234; got "${text}"`);
    assert(await page.locator('[data-visits="visits"]').innerText() === '5,678', `Visits should read 5,678; got "${text}"`);
    assert(/旅人 \/ TRAVELERS\s*1,234[\s\S]*到访 \/ VISITS\s*5,678/.test(text), `Labels and numbers should read in order; got "${text}"`);
    assert(visitCalls().length === 1 && statsCalls().length === 0, `One page load reports one visit; got ${JSON.stringify(calls)}`);
    const first = visitCalls()[0];
    assert(first.method === 'POST' && /^text\/plain/.test(first.type), `The report is a simple text/plain POST; got ${first.method} ${first.type}`);
    const id = JSON.parse(first.body).id;
    assert(/^[0-9a-f]{32}$/.test(id), `The traveler id is 32 hex characters; got ${id}`);
    assert(await page.evaluate(() => localStorage.getItem('personal-space-traveler')) === id, 'The traveler id is kept in localStorage');
    results.push(`Line reads "from ${since} 旅人 / TRAVELERS 1,234 · 到访 / VISITS 5,678" from one text/plain POST: PASS`);

    for (const hash of ['#about', '#projects', '#writing', '#home']) {
      await page.evaluate((value) => { location.hash = value; }, hash);
      await page.waitForTimeout(150);
    }
    assert(visitCalls().length === 1, `Moving between sections must not report again; got ${visitCalls().length} reports`);
    await load(`${base}#home`);
    assert(visitCalls().length === 2 && JSON.parse(visitCalls()[1].body).id === id, 'A reload reports again with the same traveler id');
    results.push('Section changes do not report; a reload reports once with the same traveler: PASS');

    await load(`${base}?nocount#home`);
    await load(`${base}#home`);
    assert(visitCalls().length === 2 && statsCalls().length === 2, `After ?nocount the browser only reads totals; got ${JSON.stringify(calls.slice(2))}`);
    assert(await page.locator('[data-visits="visits"]').innerText() === '5,678', 'Read-only mode still shows the totals');
    await load(`${base}?count#home`);
    assert(visitCalls().length === 3, '?count turns counting back on');
    results.push('?nocount keeps this browser out of the count until ?count: PASS');

    for (const failure of ['fail', 'garbage']) {
      mode = failure;
      await load(`${base}#home`);
      assert(await page.locator('#visits-line').isHidden(), `A ${failure} answer hides the line instead of showing dashes`);
    }
    mode = 'ok';
    results.push('A failing or malformed counter hides the line: PASS');
  } finally {
    await page.unroute(`${counter}/**`);
    await forget();
  }
  return results;
}
