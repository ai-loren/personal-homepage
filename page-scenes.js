(() => {
  'use strict';

  const root = document.documentElement;
  const canvas = document.querySelector('#page-art');
  let context = canvas?.getContext('2d');
  const textures = window.COSMOS_TEXTURES;
  if (!context || !textures) return;

  const tau = Math.PI * 2;
  const sceneByPage = {
    about: {
      body: 'mercury',
      x: .9,
      y: .42,
      radius: .31,
      turn: .08,
      tint: '#b89a78',
      glow: '#d6b27f',
      starSeed: 1027,
    },
    writing: {
      body: 'moon',
      x: .89,
      y: .39,
      radius: .32,
      turn: .61,
      tint: '#8fa2ba',
      glow: '#c5d5e8',
      starSeed: 7304,
    },
    projects: {
      body: 'earth',
      x: .91,
      y: .48,
      radius: .37,
      turn: .71,
      tint: '#4d8eb4',
      glow: '#7cc9ed',
      starSeed: 3235,
      satellites: true,
    },
    lab: {
      body: 'mars',
      x: .9,
      y: .48,
      radius: .34,
      turn: .19,
      tint: '#a65436',
      glow: '#d4845b',
      starSeed: 9442,
    },
    journey: {
      body: 'jupiter',
      x: .93,
      y: .43,
      radius: .42,
      turn: .63,
      tint: '#b98463',
      glow: '#d7b089',
      starSeed: 7781,
    },
    library: {
      body: 'saturn',
      x: .88,
      y: .46,
      radius: .27,
      turn: .38,
      tint: '#b59561',
      glow: '#e0c58d',
      starSeed: 1124,
      rings: true,
    },
    ideas: {
      body: 'neptune',
      x: .9,
      y: .43,
      radius: .34,
      turn: .52,
      tint: '#315c98',
      glow: '#6d9bd2',
      starSeed: 5001,
    },
  };

  const spriteCache = new Map();
  let width = innerWidth;
  let height = innerHeight;
  let dpr = 1;
  let frame = 0;
  let lastDraw = 0;
  let pointerX = 0;
  let pointerY = 0;
  const sceneStartedAt = performance.now();

  const mainContext = context;
  const backdrop = document.createElement('canvas');
  const backdropContext = backdrop.getContext('2d');
  let backdropKey = '';

  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
  const mix = (from, to, amount) => from + (to - from) * amount;
  const hexToRgb = (hex) => {
    const value = Number.parseInt(hex.slice(1), 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  };
  const rgba = (hex, alpha) => {
    const [red, green, blue] = hexToRgb(hex);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  };
  const randomFor = (seed) => {
    let value = seed >>> 0;
    return () => {
      value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
      return value / 4294967296;
    };
  };

  function buildPlanetSprite(scene) {
    const key = `${scene.body}:${scene.turn}`;
    if (spriteCache.has(key)) return spriteCache.get(key);

    const source = textures[scene.body];
    if (!source?.surface) return null;

    const size = 960;
    const sprite = document.createElement('canvas');
    sprite.width = size;
    sprite.height = size;
    const spriteContext = sprite.getContext('2d');
    const image = spriteContext.createImageData(size, size);
    const output = image.data;
    const surface = source.surface.data;
    const details = source.details?.data;
    const sourceWidth = source.surface.width;
    const sourceHeight = source.surface.height;
    const atmosphere = hexToRgb(scene.glow);
    const light = [-.5, -.4, .77];

    for (let y = 0; y < size; y++) {
      const normalY = 1 - (y + .5) / size * 2;
      for (let x = 0; x < size; x++) {
        const normalX = (x + .5) / size * 2 - 1;
        const radiusSquared = normalX * normalX + normalY * normalY;
        if (radiusSquared >= 1) continue;

        const normalZ = Math.sqrt(1 - radiusSquared);
        const longitude = Math.atan2(normalX, normalZ) / tau + .5 + scene.turn;
        const latitude = Math.asin(normalY);
        const sampleX = Math.floor(((longitude % 1 + 1) % 1) * sourceWidth);
        const sampleY = Math.min(
          sourceHeight - 1,
          Math.max(0, Math.floor((.5 - latitude / Math.PI) * sourceHeight)),
        );
        const sourceOffset = (sampleY * sourceWidth + sampleX) * 4;
        const outputOffset = (y * size + x) * 4;
        const diffuse = Math.max(0, normalX * light[0] + normalY * light[1] + normalZ * light[2]);
        const shade = .075 + Math.pow(diffuse, .72) * .96;
        const rim = Math.pow(1 - normalZ, 3.2);
        const cloud = scene.body === 'earth' && details ? details[sourceOffset] / 255 : 0;

        for (let channel = 0; channel < 3; channel++) {
          const surfaceColor = mix(surface[sourceOffset + channel], 235, cloud * .76);
          output[outputOffset + channel] = clamp(
            surfaceColor * shade + atmosphere[channel] * rim * .34,
            0,
            255,
          );
        }
        output[outputOffset + 3] = clamp((1 - Math.sqrt(radiusSquared)) * size * .72) * 255;
      }
    }

    spriteContext.putImageData(image, 0, 0);
    spriteCache.set(key, sprite);
    return sprite;
  }

  function drawDeepSpace(scene, lightTheme) {
    context.save();
    const wash = context.createLinearGradient(0, 0, width, height);
    if (lightTheme) {
      wash.addColorStop(0, rgba(scene.tint, .025));
      wash.addColorStop(.58, rgba(scene.tint, .055));
      wash.addColorStop(1, rgba(scene.tint, .12));
    } else {
      wash.addColorStop(0, 'rgba(1, 4, 8, .08)');
      wash.addColorStop(.48, rgba(scene.tint, .035));
      wash.addColorStop(1, rgba(scene.tint, .16));
    }
    context.fillStyle = wash;
    context.fillRect(0, 0, width, height);

    const random = randomFor(scene.starSeed);

    // 两团错位星云：主色浓、辉光色淡，用 screen 叠加出体积感。
    const nebulae = [
      { hex: scene.tint, cx: .82, cy: .44, spread: .58, alpha: lightTheme ? .08 : .16 },
      { hex: scene.glow, cx: .64 + random() * .12, cy: .3 + random() * .16, spread: .4, alpha: lightTheme ? .05 : .1 },
    ];
    for (const nebula of nebulae) {
      const cloud = context.createRadialGradient(
        width * (nebula.cx + pointerX * .008),
        height * (nebula.cy + pointerY * .008),
        0,
        width * nebula.cx,
        height * nebula.cy,
        Math.max(width, height) * nebula.spread,
      );
      cloud.addColorStop(0, rgba(nebula.hex, nebula.alpha));
      cloud.addColorStop(.4, rgba(nebula.hex, nebula.alpha * .45));
      cloud.addColorStop(1, 'rgba(0,0,0,0)');
      context.globalCompositeOperation = lightTheme ? 'multiply' : 'screen';
      context.fillStyle = cloud;
      context.fillRect(0, 0, width, height);
    }
    context.globalCompositeOperation = 'source-over';

    // 远景尘埃层：大量极小暗星，营造深度。
    const dustCount = Math.min(720, Math.round(width * height / 2600));
    for (let index = 0; index < dustCount; index++) {
      const x = (random() * width + pointerX * 3 + width) % width;
      const y = (random() * height + pointerY * 2 + height) % height;
      context.globalAlpha = (lightTheme ? .05 : .1) + random() * (lightTheme ? .08 : .22);
      context.fillStyle = random() > .8 ? '#ecd6ae' : '#c3d2e6';
      context.beginPath();
      context.arc(x, y, .2 + random() * .5, 0, tau);
      context.fill();
    }

    // 近景亮星层：更亮更大，少量特亮星带十字光芒。
    const starCount = Math.min(320, Math.round(width * height / 5200));
    for (let index = 0; index < starCount; index++) {
      const depth = .3 + random() * .7;
      const x = (random() * width + pointerX * 7 * depth + width) % width;
      const y = (random() * height + pointerY * 5 * depth + height) % height;
      const flare = random() > .955;
      const radius = flare ? 1.4 + random() * 1.4 : .3 + random() * .85;
      const warm = random() > .8;
      const color = warm ? '#f2ddb2' : '#dbe7f4';
      const alpha = (lightTheme ? .12 : .22) + random() * (lightTheme ? .22 : .5);
      if (flare) {
        const glow = context.createRadialGradient(x, y, 0, x, y, radius * 4.2);
        glow.addColorStop(0, rgba(warm ? '#fff0d0' : '#eef5ff', alpha * .9));
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        context.globalAlpha = 1;
        context.fillStyle = glow;
        context.beginPath();
        context.arc(x, y, radius * 4.2, 0, tau);
        context.fill();
        context.globalAlpha = alpha * .6;
        context.strokeStyle = color;
        context.lineWidth = .6;
        const spike = radius * 3.4;
        context.beginPath();
        context.moveTo(x - spike, y);
        context.lineTo(x + spike, y);
        context.moveTo(x, y - spike);
        context.lineTo(x, y + spike);
        context.stroke();
      }
      context.globalAlpha = alpha;
      context.fillStyle = color;
      context.beginPath();
      context.arc(x, y, radius, 0, tau);
      context.fill();
    }
    context.globalAlpha = 1;

    context.globalCompositeOperation = lightTheme ? 'multiply' : 'screen';
    context.translate(width * .56 + pointerX * 6, height * .58 + pointerY * 4);
    context.rotate(-.27);
    const bandLength = Math.max(width, height) * 1.65;
    const bandWidth = Math.min(width, height) * .35;
    const band = context.createLinearGradient(0, -bandWidth / 2, 0, bandWidth / 2);
    band.addColorStop(0, 'rgba(0,0,0,0)');
    band.addColorStop(.5, rgba(scene.glow, lightTheme ? .018 : .027));
    band.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = band;
    context.fillRect(-bandLength / 2, -bandWidth / 2, bandLength, bandWidth);
    context.restore();
  }

  function drawAtmosphere(scene, x, y, radius, lightTheme) {
    context.save();
    context.globalCompositeOperation = lightTheme ? 'multiply' : 'screen';
    const halo = context.createRadialGradient(x, y, radius * .82, x, y, radius * 1.32);
    halo.addColorStop(0, 'rgba(0,0,0,0)');
    halo.addColorStop(.38, rgba(scene.glow, lightTheme ? .11 : .22));
    halo.addColorStop(.65, rgba(scene.glow, lightTheme ? .045 : .08));
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = halo;
    context.beginPath();
    context.arc(x, y, radius * 1.32, 0, tau);
    context.fill();
    context.restore();
  }

  function drawSaturnRings(scene, x, y, radius, front, lightTheme) {
    context.save();
    context.translate(x, y);
    context.rotate(-.18);
    context.scale(1, .29);
    context.globalCompositeOperation = lightTheme ? 'multiply' : 'screen';
    const start = front ? 0 : Math.PI;
    const end = front ? Math.PI : tau;
    const ringColors = ['#66553c', '#c8ac78', '#e1cca2', '#8c7650', '#dac292'];
    for (let index = 0; index < 28; index++) {
      const ringRadius = radius * (1.24 + index * .026);
      context.globalAlpha = (lightTheme ? .14 : .25) + (index % 5) * .025;
      context.strokeStyle = ringColors[index % ringColors.length];
      context.lineWidth = Math.max(1.1, radius * .005);
      context.beginPath();
      context.arc(0, 0, ringRadius, start, end);
      context.stroke();
    }
    context.restore();
  }

  function drawSatelliteOrbitPaths(x, y, radius, elapsed, lightTheme, compact) {
    const orbitSpecs = [
      { rx: 2.1, ry: .72, rotation: -.035, phase: 3.8, speed: .022, scale: .94, variant: 'relay' },
      { rx: 1.5, ry: .44, rotation: .025, phase: 3.85, speed: -.032, scale: .8, variant: 'survey' },
      { rx: .95, ry: .56, rotation: -.11, phase: 4.2, speed: .044, scale: .7, variant: 'telescope' },
    ];
    const compactOrbitSpecs = [
      { rx: .92, ry: .58, rotation: -.08, phase: 3.95, speed: .035, scale: .62, variant: 'survey' },
      { rx: .62, ry: .92, rotation: .04, phase: 4.55, speed: -.042, scale: .55, variant: 'telescope' },
    ];
    const activeOrbits = compact ? compactOrbitSpecs : orbitSpecs;
    const satellites = [];

    context.save();
    context.lineCap = 'round';
    for (let index = 0; index < activeOrbits.length; index++) {
      const orbit = activeOrbits[index];
      const rx = radius * orbit.rx;
      const ry = radius * orbit.ry;
      const phase = orbit.phase + elapsed * orbit.speed;

      context.save();
      context.translate(x, y);
      context.globalCompositeOperation = lightTheme ? 'multiply' : 'screen';
      context.strokeStyle = lightTheme ? 'rgba(39, 91, 116, .2)' : 'rgba(140, 207, 230, .2)';
      context.lineWidth = compact ? .55 : .8;
      context.setLineDash(index === 1 ? [2, 7] : []);
      context.beginPath();
      context.ellipse(0, 0, rx, ry, orbit.rotation, 0, tau);
      context.stroke();

      context.setLineDash([]);
      context.strokeStyle = lightTheme ? 'rgba(48, 108, 133, .24)' : 'rgba(167, 224, 242, .34)';
      context.lineWidth = compact ? .7 : 1.05;
      context.beginPath();
      context.ellipse(0, 0, rx, ry, orbit.rotation, phase - .62, phase + .08);
      context.stroke();
      context.restore();

      const localX = rx * Math.cos(phase);
      const localY = ry * Math.sin(phase);
      const cosRotation = Math.cos(orbit.rotation);
      const sinRotation = Math.sin(orbit.rotation);
      const worldX = x + localX * cosRotation - localY * sinRotation;
      const worldY = y + localX * sinRotation + localY * cosRotation;
      const derivativeX = -rx * Math.sin(phase);
      const derivativeY = ry * Math.cos(phase);
      const tangentX = derivativeX * cosRotation - derivativeY * sinRotation;
      const tangentY = derivativeX * sinRotation + derivativeY * cosRotation;

      satellites.push({
        x: worldX,
        y: worldY,
        rotation: Math.atan2(tangentY, tangentX),
        scale: orbit.scale,
        variant: orbit.variant,
      });
    }
    context.restore();
    return satellites;
  }

  function drawSolarPanel(x, y, widthValue, heightValue, lightTheme) {
    context.save();
    context.translate(x, y);
    const panel = context.createLinearGradient(0, 0, 0, heightValue);
    panel.addColorStop(0, lightTheme ? '#3c6b82' : '#183e58');
    panel.addColorStop(.48, lightTheme ? '#254e65' : '#0c2b42');
    panel.addColorStop(1, lightTheme ? '#173c51' : '#071d31');
    context.fillStyle = panel;
    context.strokeStyle = lightTheme ? 'rgba(36, 81, 101, .82)' : 'rgba(129, 196, 221, .72)';
    context.lineWidth = .85;
    context.beginPath();
    context.roundRect(0, 0, widthValue, heightValue, 1.5);
    context.fill();
    context.stroke();

    context.strokeStyle = lightTheme ? 'rgba(223, 238, 242, .28)' : 'rgba(183, 224, 238, .34)';
    context.lineWidth = .45;
    for (let column = 1; column < 4; column++) {
      const panelX = widthValue * column / 4;
      context.beginPath();
      context.moveTo(panelX, 1);
      context.lineTo(panelX, heightValue - 1);
      context.stroke();
    }
    context.beginPath();
    context.moveTo(1, heightValue / 2);
    context.lineTo(widthValue - 1, heightValue / 2);
    context.stroke();
    context.restore();
  }

  function drawSatellite(satellite, index, lightTheme, compact) {
    const baseScale = clamp(Math.min(width, height) / 900, .7, 1.45)
      * satellite.scale
      * (compact ? .7 : 1);
    context.save();
    context.translate(satellite.x, satellite.y);
    context.rotate(satellite.rotation + (index === 1 ? .18 : -.08));
    context.scale(baseScale, baseScale);
    context.globalAlpha = lightTheme ? .48 : .9;
    context.shadowColor = lightTheme ? 'rgba(34, 91, 119, .22)' : 'rgba(112, 205, 236, .42)';
    context.shadowBlur = 13;

    const panelWidth = satellite.variant === 'telescope' ? 25 : 31;
    const panelHeight = satellite.variant === 'survey' ? 15 : 18;
    context.strokeStyle = lightTheme ? '#496777' : '#89adbe';
    context.lineWidth = 1.2;
    context.beginPath();
    context.moveTo(-17, 0);
    context.lineTo(-23, 0);
    context.moveTo(17, 0);
    context.lineTo(23, 0);
    context.stroke();
    drawSolarPanel(-23 - panelWidth, -panelHeight / 2, panelWidth, panelHeight, lightTheme);
    drawSolarPanel(23, -panelHeight / 2, panelWidth, panelHeight, lightTheme);

    context.shadowBlur = 8;
    const bus = context.createLinearGradient(-15, -12, 15, 12);
    bus.addColorStop(0, lightTheme ? '#8b7448' : '#8f7545');
    bus.addColorStop(.38, '#d7b66f');
    bus.addColorStop(.68, lightTheme ? '#9b7f4e' : '#6d5633');
    bus.addColorStop(1, '#e0c88e');
    context.fillStyle = bus;
    context.strokeStyle = lightTheme ? '#66583c' : '#d8c396';
    context.lineWidth = 1;
    context.beginPath();
    context.roundRect(-15, -12, 30, 24, 4);
    context.fill();
    context.stroke();

    context.strokeStyle = 'rgba(70, 53, 29, .42)';
    context.lineWidth = .55;
    context.beginPath();
    context.moveTo(-12, -5);
    context.lineTo(12, -5);
    context.moveTo(-12, 4);
    context.lineTo(12, 4);
    context.stroke();

    if (satellite.variant === 'relay') {
      context.strokeStyle = lightTheme ? '#5d6c72' : '#b7cad1';
      context.lineWidth = 1.1;
      context.beginPath();
      context.moveTo(0, -12);
      context.lineTo(0, -25);
      context.stroke();
      context.fillStyle = lightTheme ? '#c3c9c8' : '#dbe7e8';
      context.beginPath();
      context.ellipse(0, -27, 10, 4.5, 0, Math.PI, tau);
      context.fill();
      context.stroke();
      context.fillStyle = '#72c8e5';
      context.beginPath();
      context.arc(0, -25, 1.7, 0, tau);
      context.fill();
    } else if (satellite.variant === 'survey') {
      context.fillStyle = lightTheme ? '#5f747e' : '#8da9b4';
      context.beginPath();
      context.roundRect(-6, -19, 12, 8, 2);
      context.fill();
      context.fillStyle = '#83d7ed';
      context.beginPath();
      context.arc(0, -17, 2.4, 0, tau);
      context.fill();
    } else {
      const telescope = context.createLinearGradient(0, -24, 0, -10);
      telescope.addColorStop(0, '#cbd7da');
      telescope.addColorStop(1, '#5f747c');
      context.fillStyle = telescope;
      context.beginPath();
      context.roundRect(-5, -27, 10, 17, 3);
      context.fill();
      context.fillStyle = '#183e55';
      context.beginPath();
      context.ellipse(0, -27, 5, 2.5, 0, 0, tau);
      context.fill();
    }

    context.strokeStyle = lightTheme ? '#596d74' : '#c8d7dc';
    context.lineWidth = .85;
    context.beginPath();
    context.moveTo(11, 8);
    context.lineTo(22, 19);
    context.stroke();
    context.fillStyle = '#d8b56a';
    context.beginPath();
    context.arc(23, 20, 1.6, 0, tau);
    context.fill();
    context.restore();
  }

  function drawPlanetScene(scene, lightTheme, elapsed) {
    const sprite = buildPlanetSprite(scene);
    if (!sprite) return;

    const compact = width < 600;
    const radius = Math.min(width, height) * scene.radius * (compact ? .72 : 1);
    const x = width * (compact ? 1.04 : scene.x);
    const y = height * (compact ? .3 : scene.y);
    const satellites = scene.satellites
      ? drawSatelliteOrbitPaths(x, y, radius, elapsed, lightTheme, compact)
      : [];
    drawAtmosphere(scene, x, y, radius, lightTheme);
    if (scene.rings) drawSaturnRings(scene, x, y, radius, false, lightTheme);

    context.save();
    context.globalAlpha = lightTheme ? .32 : .82;
    context.drawImage(sprite, x - radius, y - radius, radius * 2, radius * 2);
    context.restore();

    if (scene.rings) drawSaturnRings(scene, x, y, radius, true, lightTheme);
    for (let index = 0; index < satellites.length; index++) {
      drawSatellite(satellites[index], index, lightTheme, compact);
    }
  }

  function drawVignette(lightTheme) {
    context.save();
    const vignette = context.createRadialGradient(
      width * .55,
      height * .46,
      Math.min(width, height) * .18,
      width * .55,
      height * .48,
      Math.max(width, height) * .82,
    );
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, lightTheme ? 'rgba(45,35,22,.08)' : 'rgba(0,2,6,.48)');
    context.fillStyle = vignette;
    context.fillRect(0, 0, width, height);

    const readableArea = context.createLinearGradient(0, 0, width, 0);
    readableArea.addColorStop(0, lightTheme ? 'rgba(255,255,255,.035)' : 'rgba(2,5,9,.36)');
    readableArea.addColorStop(.56, lightTheme ? 'rgba(255,255,255,.015)' : 'rgba(2,5,9,.13)');
    readableArea.addColorStop(.78, 'rgba(0,0,0,0)');
    context.fillStyle = readableArea;
    context.fillRect(0, 0, width, height);
    context.restore();
  }

  function renderBackdrop(scene, lightTheme) {
    const key = `${scene.body}:${scene.turn}:${lightTheme ? 'l' : 'd'}:${backdrop.width}x${backdrop.height}`;
    if (backdropKey === key) return;
    context = backdropContext;
    backdropContext.setTransform(dpr, 0, 0, dpr, 0, 0);
    backdropContext.clearRect(0, 0, width, height);
    drawDeepSpace(scene, lightTheme);
    context = mainContext;
    backdropKey = key;
  }

  function draw() {
    context = mainContext;
    context.clearRect(0, 0, width, height);
    const page = root.dataset.page || 'home';
    const scene = sceneByPage[page];
    canvas.dataset.scene = page;
    canvas.dataset.renderer = scene ? 'photographic-canvas' : 'idle';
    canvas.dataset.sceneBody = scene?.body || '';
    canvas.dataset.orbitalSatellites = scene?.satellites ? 'three' : 'none';
    canvas.dataset.satelliteOrbits = scene?.satellites ? 'three' : 'none';
    if (!scene) return;

    const lightTheme = root.dataset.theme === 'light';
    const elapsed = (performance.now() - sceneStartedAt) / 1000;
    renderBackdrop(scene, lightTheme);
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.drawImage(backdrop, 0, 0);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawPlanetScene(scene, lightTheme, elapsed);
    drawVignette(lightTheme);
    context.globalAlpha = 1;
  }

  function resize() {
    width = innerWidth;
    height = innerHeight;
    dpr = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    backdrop.width = canvas.width;
    backdrop.height = canvas.height;
    backdropKey = '';
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function animate(time) {
    frame = requestAnimationFrame(animate);
    const scene = sceneByPage[root.dataset.page || 'home'];
    if (document.hidden || root.dataset.cosmicMotion === 'paused') return;
    if (!scene?.satellites) {
      cancelAnimationFrame(frame);
      frame = 0;
      return;
    }
    if (time - lastDraw < 1000 / 60) return;
    lastDraw = time;
    draw();
  }

  function requestAnimation() {
    if (!frame) frame = requestAnimationFrame(animate);
  }

  window.addEventListener('cosmos:texture-refined', (event) => {
    const kind = event.detail?.kind;
    if (!kind) return;
    for (const key of spriteCache.keys()) {
      if (key.startsWith(`${kind}:`)) spriteCache.delete(key);
    }
    if (sceneByPage[root.dataset.page]?.body === kind) draw();
  });
  new MutationObserver(() => {
    draw();
    requestAnimation();
  }).observe(root, {
    attributes: true,
    attributeFilter: ['data-page', 'data-theme'],
  });
  window.addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) requestAnimation();
  });
  window.addEventListener('pagehide', () => {
    cancelAnimationFrame(frame);
    frame = 0;
  });
  resize();
  requestAnimation();
})();
