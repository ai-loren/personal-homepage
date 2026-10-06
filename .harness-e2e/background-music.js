async (page) => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const base = page.url().split('#')[0].split('?')[0];
  const errors = [];
  const onError = (error) => errors.push(error.message);
  page.on('pageerror', onError);
  const results = [];
  const state = () => page.evaluate(() => {
    const audio = document.querySelector('#background-music');
    return {
      playing: !audio.paused,
      src: audio.getAttribute('src') || '',
      volume: audio.volume,
      slider: document.querySelector('#music-volume').value,
      label: document.querySelector('#music-state').textContent,
      offIconVisible: getComputedStyle(document.querySelector('#music-toggle .music-off-icon')).display !== 'none',
      onIconVisible: getComputedStyle(document.querySelector('#music-toggle .music-on-icon')).display !== 'none',
      csp: window.__cspViolations || [],
    };
  });
  const clickPage = () => page.mouse.click(200, 520);
  const waitPlaying = () => page.waitForFunction(() => {
    const audio = document.querySelector('#background-music');
    return !audio.paused && audio.currentTime > 0.2;
  }, null, { timeout: 15000 });
  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => window.__cspViolations.push(`${event.violatedDirective} ${event.blockedURI}`));
  });
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${base}#home`);
    await page.evaluate(() => { localStorage.removeItem('personal-space-music'); localStorage.removeItem('personal-space-music-volume'); });
    await page.reload();
    await page.waitForTimeout(800);
    const tracks = await page.evaluate(() => window.SITE_CONTENT.music?.tracks?.length || 0);
    if (!tracks) {
      assert(await page.locator('#music-control').isHidden(), 'Without published tracks the music control must stay hidden');
      results.push('No published tracks: music control stays hidden: PASS');
      return results;
    }

    let now = await state();
    assert(Math.abs(now.volume - 0.5) < 0.01 && now.slider === '50', `New visitors start at 50% volume; got ${now.volume} / ${now.slider}`);
    assert(now.src.includes('cornfield-chase'), `Autoplay should load the first track on page load; got ${now.src}`);
    const autoplayed = now.playing;
    if (!autoplayed) {
      assert(now.label === '点一下页面就开始播放' && now.onIconVisible && !now.offIconVisible, `Blocked autoplay should keep the note lit and invite a click; got "${now.label}"`);
      assert(await page.locator('#music-hint').isVisible(), 'Blocked autoplay should show the click hint');
      await clickPage();
    }
    await waitPlaying();
    now = await state();
    assert(now.onIconVisible && !now.offIconVisible && now.label === '正在播放', 'Playing shows the plain note');
    assert(await page.locator('#music-hint').isHidden(), 'The click hint disappears once music plays');
    results.push(`Fresh visit plays Cornfield Chase at 50% (${autoplayed ? 'autoplay allowed' : 'autoplay blocked, started on first click'}): PASS`);

    await page.locator('#music-toggle').click();
    await page.locator('#music-volume').fill('70');
    now = await state();
    assert(Math.abs(now.volume - 0.7) < 0.01 && (await page.locator('#music-volume-value').textContent()) === '70%', `Volume slider should drive audio.volume; got ${now.volume}`);
    results.push('Volume slider controls playback volume: PASS');

    await page.evaluate(() => { const audio = document.querySelector('#background-music'); audio.currentTime = Math.max(0, audio.duration - 0.4); });
    await page.waitForFunction(() => document.querySelector('#background-music').getAttribute('src').includes('no-time-for-caution'), null, { timeout: 10000 });
    await page.waitForFunction(() => !document.querySelector('#background-music').paused, null, { timeout: 10000 });
    await page.evaluate(() => { const audio = document.querySelector('#background-music'); audio.currentTime = Math.max(0, audio.duration - 0.4); });
    await page.waitForFunction(() => document.querySelector('#background-music').getAttribute('src').includes('cornfield-chase'), null, { timeout: 10000 });
    results.push('Playlist advances to No Time for Caution and loops back: PASS');

    await page.locator('#music-play').click();
    now = await state();
    assert(!now.playing && now.offIconVisible && now.label === '已关闭', 'Turning music off pauses and shows the crossed-out note');
    await page.keyboard.press('Escape');
    await page.reload();
    await page.waitForTimeout(800);
    await clickPage();
    await page.waitForTimeout(800);
    now = await state();
    assert(!now.playing && now.label === '已关闭' && Math.abs(now.volume - 0.7) < 0.01, 'A visitor who turned music off must not get autoplay or click-to-start, and keeps their volume');
    results.push('Turning music off sticks across reloads and keeps the saved volume: PASS');

    await page.locator('#music-toggle').click();
    await page.locator('#music-play').click();
    await waitPlaying();
    await page.reload();
    await page.waitForTimeout(800);
    if (!(await state()).playing) await clickPage();
    await waitPlaying();
    results.push('Turning music back on resumes playback after reload: PASS');

    assert((await state()).csp.length === 0, `CSP violations: ${(await state()).csp.join('; ')}`);
    assert(errors.length === 0, `Uncaught errors: ${errors.join('; ')}`);
    results.push('No CSP violations or page errors: PASS');
    return results;
  } finally {
    page.off('pageerror', onError);
    await page.evaluate(() => {
      document.querySelector('#background-music')?.pause();
      localStorage.removeItem('personal-space-music');
      localStorage.removeItem('personal-space-music-volume');
    }).catch(() => {});
  }
}
