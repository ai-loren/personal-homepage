async (page) => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const results = [];
  const storageKeys = ['personal-space-motion', 'personal-space-ufo-intensity', 'personal-space-ufo-color'];
  const center = (box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
  const controlsState = () => page.locator('.universe').getAttribute('data-ufo-controls');
  const glide = async (from, to, steps, stepMs = 16) => {
    for (let index = 1; index <= steps; index++) {
      await page.mouse.move(from.x + (to.x - from.x) * index / steps, from.y + (to.y - from.y) * index / steps);
      await page.waitForTimeout(stepMs);
    }
  };
  const focusMars = async () => {
    await page.mouse.move(5, 5);
    await page.locator('.universe[data-ufo-controls="hidden"][data-camera-state="overview"]').waitFor({ timeout: 3000 });
    await page.waitForTimeout(400);
    await page.locator('.planet-lab').hover({ force: true });
    try {
      await page.locator('.universe[data-active-body="mars"][data-ufo-controls="visible"]').waitFor({ timeout: 3000 });
    } catch {
      const state = await page.locator('.universe').evaluate((node) => ({ ...node.dataset }));
      throw new Error(`Hovering Mars expected data-active-body="mars"; got ${JSON.stringify({ body: state.activeBody, controls: state.ufoControls, scene: state.scene })}`);
    }
    await page.waitForTimeout(700);
    return center(await page.locator('.planet-lab').boundingBox());
  };

  await page.setViewportSize({ width: 1280, height: 900 });
  const saved = await page.evaluate((keys) => Object.fromEntries(keys.map((key) => [key, localStorage.getItem(key)])), storageKeys);
  try {
    await page.goto(`${page.url().split('#')[0]}#home`);
    await page.reload();
    await page.locator('.universe.three-ready[data-scene="three"]').waitFor({ timeout: 15000 });
    if (await page.locator('html').getAttribute('data-cosmic-motion') !== 'paused') await page.locator('.motion-toggle').click();

    const mars = await focusMars();
    const panel = center(await page.locator('.ufo-controls').boundingBox());
    const corner = { x: mars.x, y: panel.y };
    await glide(mars, corner, 18);
    assert(await controlsState() === 'visible', 'Controls hid while the pointer was heading down toward them');
    await glide(corner, panel, 30);
    assert(await controlsState() === 'visible', 'Controls hid before the pointer reached them on a down-then-right path');
    await page.waitForTimeout(600);
    assert(await controlsState() === 'visible', 'Controls hid while the pointer rested on them');
    results.push('Down-then-right path through empty space reaches the tractor-beam controls: PASS');

    const slider = await page.locator('#ufo-light-intensity').boundingBox();
    const thumb = { x: slider.x + slider.width * .44, y: slider.y + slider.height / 2 };
    await page.mouse.move(thumb.x, thumb.y);
    await page.mouse.down();
    await glide(thumb, { x: slider.x - 160, y: thumb.y + 40 }, 20);
    await page.waitForTimeout(500);
    assert(await controlsState() === 'visible', 'Controls hid while the slider was still being dragged outside the panel');
    await page.mouse.up();
    await page.locator('.universe[data-ufo-controls="hidden"]').waitFor({ timeout: 1500 });
    results.push('Dragging the slider past the panel keeps it open until release: PASS');

    const again = await focusMars();
    await glide(again, center(await page.locator('.terminal-command').boundingBox()), 24);
    await page.locator('.universe[data-ufo-controls="hidden"][data-active-body=""]').waitFor({ timeout: 800 });
    results.push('Moving away from the panel still releases focus promptly: PASS');

    await focusMars();
    await page.locator('.wordmark').hover();
    await page.locator('.universe[data-scene-focus="false"][data-ufo-controls="hidden"][data-camera-state="overview"]').waitFor({ timeout: 3000 });
    results.push('Leaving the hero releases focus and returns the camera: PASS');
    return results;
  } finally {
    await page.mouse.up().catch(() => {});
    await page.evaluate((values) => {
      for (const [key, value] of Object.entries(values)) {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      }
    }, saved);
  }
}
