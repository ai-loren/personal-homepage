async (page) => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const base = page.url().split('#')[0].split('?')[0];
  const errors = [];
  const onError = (error) => errors.push(error.message);
  page.on('pageerror', onError);
  const results = [];
  const read = () => page.evaluate(() => ({
    position: document.querySelector('[data-out="position"]')?.textContent,
    title: document.querySelector('.trace-detail-title')?.textContent,
    fields: Object.fromEntries([...document.querySelectorAll('.trace-fields dt')].map((dt) => [dt.textContent, dt.nextElementSibling.textContent])),
    stats: [...document.querySelectorAll('.trace-stats li')].map((node) => node.textContent),
    pressed: document.querySelector('.trace-sample[aria-pressed="true"]')?.dataset.sample,
    future: document.querySelectorAll('.trace-step.is-future').length,
    steps: document.querySelectorAll('.trace-step').length,
    error: document.querySelector('[data-out="error"]').hidden ? '' : document.querySelector('[data-out="error"]').textContent,
    count: document.querySelectorAll('.trace').length,
  }));
  const at = (state) => Number(state.position.match(/第 (\d+) \//)[1]);

  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${base}#projects`);
    await page.evaluate(() => { localStorage.setItem('personal-space-detail-mode', 'page'); });
    await page.reload();
    await page.waitForTimeout(500);
    assert(await page.locator('#project-list .project-card[href="#projects/agent-trace-replay"] .trace-art').count() === 1, 'The works page shows the trace replay card with its artwork');
    const demoLabel = await page.locator('[data-view="projects"] [data-demo-label]').count();
    assert(demoLabel === 0, 'The works page no longer says its projects are demos');

    await page.goto(`${base}#projects/agent-trace-replay`);
    await page.waitForTimeout(400);
    let now = await read();
    assert(now.count === 1 && now.pressed === 'oom' && now.position === '第 1 / 16 步 · +0:00' && now.stats.includes('16 步') && now.steps === 16 && now.future === 15, `Default trace: ${JSON.stringify(now)}`);
    results.push('Tool mounts with the first built-in trace at step 1: PASS');

    await page.locator('.trace-sample[data-sample="denied"]').click();
    for (let step = 0; step < 8; step += 1) await page.locator('[data-act="next"]').click();
    now = await read();
    assert(now.pressed === 'denied' && now.stats.includes('授权 2 次（批准 1 · 拒绝 1）'), `Denied trace stats: ${JSON.stringify(now.stats)}`);
    assert(now.position === '第 9 / 22 步 · +0:31' && now.title === '被拒绝：bash' && now.fields['等待'] === '26.6 秒' && now.future === 13, `Step 9 is the denial: ${JSON.stringify(now)}`);
    await page.locator('.trace-scrub').fill('21');
    now = await read();
    assert(now.title === '完成' && now.future === 0, `The scrubber jumps to the end: ${JSON.stringify(now)}`);
    await page.locator('.trace-step').nth(4).click();
    await page.keyboard.press('ArrowLeft');
    now = await read();
    assert(at(now) === 4, `Clicking a step then ArrowLeft lands on step 4: ${now.position}`);
    results.push('Switch traces, step, scrub, click and use the keyboard: PASS');

    await page.locator('[data-act="speed"]').click();
    await page.locator('[data-act="speed"]').click();
    assert(await page.locator('[data-act="speed"]').textContent() === '4×', 'Speed cycles to 4×');
    const before = at(await read());
    await page.locator('[data-act="play"]').click();
    await page.waitForTimeout(1200);
    const playing = at(await read());
    await page.locator('[data-act="play"]').click();
    const paused = at(await read());
    await page.waitForTimeout(800);
    const still = at(await read());
    assert(playing > before && still === paused, `Play advances and pause holds: ${before} → ${playing}, paused at ${paused}, then ${still}`);
    results.push(`Playback at 4× advanced ${playing - before} steps in 1.2 s and stopped on pause: PASS`);

    await page.evaluate(() => { window.__traceInjected = false; });
    const hostile = [
      { t: 0, type: 'turn.started', turn: 1, prompt: 'hello' },
      { t: 1, type: 'message', role: 'assistant', text: '<img src=x onerror="window.__traceInjected = true"><script>window.__traceInjected = true</script>' },
      { t: 2, type: 'memory.write', key: '<b>owner</b>', value: 'loren' },
    ].map((event) => JSON.stringify(event)).join('\n');
    await page.locator('.trace-load summary').click();
    await page.locator('.trace-input').fill(hostile);
    await page.locator('[data-act="load"]').click();
    await page.waitForTimeout(300);
    now = await read();
    const injected = await page.evaluate(() => ({ flag: window.__traceInjected, imgs: document.querySelectorAll('.trace img, .trace script, .trace b b').length, text: document.querySelectorAll('.trace-step-text')[1]?.textContent }));
    assert(now.pressed === 'custom' && now.steps === 3 && now.error === '', `The pasted trace loads as its own entry: ${JSON.stringify(now)}`);
    assert(injected.flag === false && injected.imgs === 0 && injected.text.startsWith('<img src=x onerror='), `Pasted HTML stays text and never runs: ${JSON.stringify(injected)}`);
    results.push('Pasted HTML and scripts are shown as text and never run: PASS');

    await page.locator('.trace-input').fill('{"t": 0, "type": "turn.started"}\n{"t": 1, type: "oops"}');
    await page.locator('[data-act="load"]').click();
    const broken = await read();
    assert(/^第 2 行不是合法的 JSON：.*每行应当是一个完整的 JSON 对象/.test(broken.error) && broken.steps === 3 && broken.pressed === 'custom', `A broken paste explains the line and keeps the current trace: ${JSON.stringify(broken)}`);
    const fileText = ['{"t":0,"type":"turn.started","turn":1}', '{"t":4,"type":"tool.call","id":"a","name":"bash","input":{"command":"ls"}}', '{"t":5,"type":"tool.result","toolCallId":"a","ok":true,"output":"README.md"}', '{"t":6,"type":"turn.completed","turn":1}'].join('\n');
    await page.locator('.trace-file input').evaluate((input, text) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([text], 'run.jsonl', { type: 'text/plain' }));
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, fileText);
    await page.waitForTimeout(300);
    now = await read();
    assert(now.steps === 4 && now.error === '' && now.stats.includes('1 次工具调用'), `Opening a file replays it: ${JSON.stringify(now)}`);
    results.push('Bad paste names the line; an opened file replays locally: PASS');

    await page.locator('.trace-sample[data-sample="resumed"]').click();
    for (let step = 0; step < 10; step += 1) await page.locator('[data-act="next"]').click();
    const beforeSwitch = await read();
    await page.locator('#reader-mode [data-mode="overlay"]').click();
    await page.waitForTimeout(300);
    const afterSwitch = await read();
    assert(afterSwitch.count === 1 && afterSwitch.pressed === 'resumed' && afterSwitch.position === beforeSwitch.position && afterSwitch.title === '中断', `Switching to the overlay keeps the trace and the step: ${JSON.stringify({ beforeSwitch, afterSwitch })}`);
    assert(afterSwitch.fields['被打断的调用'] === 'run_eval', `The interruption names the call it cut off: ${JSON.stringify(afterSwitch.fields)}`);
    await page.locator('#reader-mode [data-mode="page"]').click();
    await page.waitForTimeout(300);
    results.push('Trace and step survive switching between overlay and page: PASS');

    await page.locator('.reader-refs a[href="#projects/managed-agent"]').click();
    await page.waitForTimeout(400);
    const linked = await page.evaluate(() => ({ hash: location.hash, title: document.querySelector('#reader-title').textContent }));
    assert(linked.hash === '#projects/managed-agent' && linked.title.startsWith('Managed Agent'), `The in-site link opens Managed-Agent: ${JSON.stringify(linked)}`);
    results.push('In-site link opens the Managed-Agent project: PASS');

    await page.goto(`${base}#projects/agent-trace-replay`);
    await page.waitForTimeout(300);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    const layout = await page.evaluate(() => {
      const steps = document.querySelector('.trace-steps').getBoundingClientRect();
      const detail = document.querySelector('.trace-detail').getBoundingClientRect();
      return { overflow: document.documentElement.scrollWidth - innerWidth, stacked: detail.top >= steps.bottom - 1 };
    });
    assert(layout.overflow <= 0 && layout.stacked, `Mobile: no horizontal overflow and the detail sits under the timeline: ${JSON.stringify(layout)}`);
    results.push('Mobile: timeline and detail stack without overflow: PASS');

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.route('**/tools/agent-trace-replay/agent-trace-replay.js*', (route) => route.fulfill({ status: 404, body: '' }));
    await page.goto(`${base}#projects/agent-trace-replay`);
    await page.reload();
    await page.waitForTimeout(500);
    const fallback = await page.locator('.site-tool').textContent();
    assert(/这个工具没有加载出来.*刷新页面再试一次/.test(fallback), `A missing tool explains what to do: ${fallback}`);
    await page.unroute('**/tools/agent-trace-replay/agent-trace-replay.js*');
    results.push('Missing tool script shows a recoverable message: PASS');

    const unexpected = errors.filter((message) => !/agent-trace-replay/.test(message));
    assert(!unexpected.length, `Page errors: ${unexpected.join(' | ')}`);
    return results.join('\n');
  } finally {
    page.off('pageerror', onError);
    await page.unroute('**/tools/agent-trace-replay/agent-trace-replay.js*');
    await page.evaluate(() => localStorage.removeItem('personal-space-detail-mode'));
  }
}
