(() => {
  'use strict';

  const root = document.documentElement;
  const home = document.querySelector('[data-view="home"]');
  const universe = document.querySelector('.universe');
  const motionButton = document.querySelector('.motion-toggle');
  const starCanvas = document.querySelector('#starfield');
  const starsContext = starCanvas.getContext('2d');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const textureStore = window.COSMOS_TEXTURES = window.COSMOS_TEXTURES || {};
  const textureCache = new Map();
  const tau = Math.PI * 2;
  let seed = 91731;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
  const mix = (a, b, amount) => a + (b - a) * amount;
  const hash = (x, y) => {
    let value = Math.imul(x, 374761393) + Math.imul(y, 668265263);
    value = Math.imul(value ^ (value >>> 13), 1274126177);
    return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
  };
  function noise(x, y) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const dx = x - ix;
    const dy = y - iy;
    const sx = dx * dx * (3 - 2 * dx);
    const sy = dy * dy * (3 - 2 * dy);
    return mix(mix(hash(ix, iy), hash(ix + 1, iy), sx), mix(hash(ix, iy + 1), hash(ix + 1, iy + 1), sx), sy);
  }
  function terrain(x, y) {
    return noise(x, y) * .54 + noise(x * 2, y * 2) * .28 + noise(x * 4, y * 4) * .13 + noise(x * 8, y * 8) * .05;
  }
  function terrainHi(x, y) {
    return noise(x, y) * .5 + noise(x * 2.03, y * 2.03) * .25 + noise(x * 4.1, y * 4.1) * .13
      + noise(x * 8.2, y * 8.2) * .07 + noise(x * 16.4, y * 16.4) * .035 + noise(x * 32.8, y * 32.8) * .015;
  }
  const ridged = (x, y) => 1 - Math.abs(terrainHi(x, y) * 2 - 1);

  function createSun(canvas) {
    const context = canvas.getContext('2d');
    if (!context) return null;
    const size = canvas.width;
    const center = size / 2;
    const radius = size * .3;
    const surface = document.createElement('canvas');
    surface.width = size;
    surface.height = size;
    const surfaceContext = surface.getContext('2d');
    const image = surfaceContext.createImageData(size, size);
    const spots = [
      { x: -.28, y: -.14, radius: .085, depth: .66 },
      { x: .23, y: .17, radius: .055, depth: .55 },
      { x: .36, y: -.22, radius: .032, depth: .48 },
      { x: -.08, y: .31, radius: .026, depth: .42 },
    ];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const nx = (x - center) / radius;
        const ny = (y - center) / radius;
        const distance = Math.hypot(nx, ny);
        if (distance >= 1) continue;
        const offset = (y * size + x) * 4;
        const granule = terrain(x / 5.2, y / 5.2);
        const broad = terrain(x / 25, y / 25);
        const limb = Math.sqrt(Math.max(0, 1 - distance * distance));
        let heat = .54 + granule * .38 + broad * .16;
        let spotDepth = 0;
        for (const spot of spots) {
          const spotDistance = Math.hypot(nx - spot.x, ny - spot.y);
          spotDepth = Math.max(spotDepth, clamp(1 - spotDistance / spot.radius) * spot.depth);
        }
        heat *= 1 - spotDepth;
        const edge = .48 + limb * .52;
        image.data[offset] = (174 + heat * 80) * edge;
        image.data[offset + 1] = (56 + heat * 139) * edge;
        image.data[offset + 2] = (8 + heat * 48) * edge;
        image.data[offset + 3] = clamp((1 - distance) * radius * 1.8) * 255;
      }
    }
    surfaceContext.putImageData(image, 0, 0);
    canvas.dataset.renderer = 'canvas';
    let sourceElapsed = 0;
    let renderedElapsed = 0;
    const host = canvas.closest('.solar-center');
    const draw = (elapsed) => {
      const delta = sourceElapsed === 0 ? 0 : clamp(elapsed - sourceElapsed, 0, 120);
      sourceElapsed = elapsed;
      renderedElapsed += delta * (host.matches(':hover, :focus-within') ? 2.8 : 1);
      context.clearRect(0, 0, size, size);

      const corona = context.createRadialGradient(center, center, radius * .86, center, center, radius * 1.46);
      corona.addColorStop(0, 'rgba(255, 206, 112, .52)');
      corona.addColorStop(.18, 'rgba(246, 154, 56, .24)');
      corona.addColorStop(.58, 'rgba(219, 94, 26, .08)');
      corona.addColorStop(1, 'rgba(0, 0, 0, 0)');
      context.fillStyle = corona;
      context.fillRect(0, 0, size, size);
      context.drawImage(surface, 0, 0);

      context.save();
      context.beginPath();
      context.arc(center, center, radius * .98, 0, tau);
      context.clip();
      context.globalCompositeOperation = 'screen';
      context.translate(center, center);
      context.rotate(renderedElapsed / 52000);
      for (let index = 0; index < 11; index++) {
        const phase = renderedElapsed / (3700 + index * 260) + index * 1.73;
        const ring = radius * (.18 + index * .065);
        context.strokeStyle = `rgba(255, ${154 + index * 5}, ${52 + index * 3}, ${.055 + (index % 3) * .018})`;
        context.lineWidth = 1 + (index % 2) * .6;
        context.beginPath();
        context.ellipse(Math.sin(phase) * 4, Math.cos(phase * .8) * 3, ring, ring * (.76 + Math.sin(phase) * .08), phase * .08, phase, phase + Math.PI * 1.35);
        context.stroke();
      }
      context.restore();

      context.save();
      context.globalCompositeOperation = 'lighter';
      context.strokeStyle = 'rgba(255, 211, 121, .34)';
      context.lineWidth = 1.1;
      for (let index = 0; index < 3; index++) {
        const angle = renderedElapsed / 11000 + index * tau / 3;
        const x = center + Math.cos(angle) * radius * .93;
        const y = center + Math.sin(angle) * radius * .93;
        context.beginPath();
        context.arc(x, y, 7 + index * 2, angle + 1.9, angle + 4.2);
        context.stroke();
      }
      context.restore();
    };
    draw(0);
    return draw;
  }

  function makeTexture(kind) {
    if (textureCache.has(kind)) return textureCache.get(kind);
    const textureWidth = 2048;
    const textureHeight = textureWidth / 2;
    const canvas = document.createElement('canvas');
    canvas.width = textureWidth;
    canvas.height = textureHeight;
    const context = canvas.getContext('2d');
    if (!context) return null;
    let land;
    if (kind === 'earth') {
      const continents = [
        [[-168,71],[-151,70],[-141,60],[-130,56],[-124,48],[-124,40],[-117,31],[-110,24],[-103,18],[-97,16],[-90,20],[-86,21],[-83,12],[-77,8],[-80,9],[-88,15],[-97,21],[-98,28],[-88,30],[-82,26],[-81,31],[-75,35],[-69,44],[-59,48],[-63,53],[-77,60],[-94,64],[-110,70],[-136,69]],
        [[-81,12],[-72,12],[-61,9],[-51,3],[-35,-6],[-39,-16],[-48,-27],[-54,-35],[-63,-41],[-69,-55],[-75,-48],[-74,-33],[-79,-16],[-81,-4],[-78,3]],
        [[-54,83],[-28,80],[-20,72],[-42,60],[-52,65],[-62,76]],
        [[-17,15],[-17,22],[-10,29],[-6,36],[10,37],[25,32],[33,31],[35,23],[43,12],[51,11],[44,0],[40,-13],[32,-26],[20,-35],[12,-29],[11,-17],[7,-5],[9,4],[1,6],[-8,5]],
        [[-10,36],[-9,43],[-2,44],[-5,49],[4,52],[9,55],[7,59],[19,70],[30,71],[31,60],[44,66],[60,69],[79,72],[103,78],[118,73],[137,71],[160,70],[179,65],[177,52],[159,60],[155,48],[142,45],[136,36],[124,39],[121,29],[110,20],[108,11],[103,1],[99,9],[98,19],[91,22],[88,21],[80,8],[76,9],[72,20],[66,25],[57,25],[52,16],[43,13],[34,28],[35,35],[29,41],[27,36],[21,38],[20,43],[15,39],[12,45],[7,44],[3,41],[-1,37]],
        [[112,-22],[114,-32],[129,-35],[136,-34],[146,-39],[153,-28],[147,-18],[142,-11],[137,-15],[130,-12],[123,-16]],
        [[47,-13],[50,-16],[47,-25],[44,-25],[44,-18]],
        [[130,31],[134,34],[137,36],[141,41],[145,44],[144,39],[139,34]],
        [[-8,50],[-5,59],[0,58],[2,52]], [[-11,51],[-11,55],[-6,55],[-6,51]],
        [[95,6],[105,-5],[116,-8],[128,-8],[133,-5],[127,1],[117,4],[108,1]],
        [[166,-35],[174,-41],[178,-38],[174,-34]], [[166,-46],[171,-44],[174,-40],[171,-41]],
      ];
      context.fillStyle = 'white';
      for (const points of continents) {
        const projected = points.map(([longitude, latitude]) => [
          (longitude + 180) / 360 * textureWidth, (90 - latitude) / 180 * textureHeight,
        ]);
        const last = projected[projected.length - 1];
        context.beginPath();
        context.moveTo((last[0] + projected[0][0]) / 2, (last[1] + projected[0][1]) / 2);
        projected.forEach(([x, y], index) => {
          const next = projected[(index + 1) % projected.length];
          context.quadraticCurveTo(x, y, (x + next[0]) / 2, (y + next[1]) / 2);
        });
        context.closePath();
        context.fill();
      }
      land = context.getImageData(0, 0, textureWidth, textureHeight).data;
    }
    const image = context.createImageData(textureWidth, textureHeight);
    const details = context.createImageData(textureWidth, textureHeight);
    for (let y = 0; y < textureHeight; y++) {
      const latitude = 90 - y / textureHeight * 180;
      for (let x = 0; x < textureWidth; x++) {
        const offset = (y * textureWidth + x) * 4;
        const fine = terrain(x / 26, y / 26);
        const grain = terrainHi(x / 6, y / 6);
        let color;
        if (kind === 'earth') {
          const longitude = x / textureWidth * 360 - 180;
          const warpX = Math.round(clamp(x + (noise(x / 20, y / 20) - .5) * 8, 0, textureWidth - 1));
          const warpY = Math.round(clamp(y + (noise(y / 18, x / 18) - .5) * 6, 0, textureHeight - 1));
          const isLand = land[(warpY * textureWidth + warpX) * 4 + 3] > 100;
          details.data[offset + 1] = isLand ? 255 : 0;
          if (isLand) {
            let dry = 0;
            if (longitude > -18 && longitude < 67) dry = clamp(1 - Math.abs(latitude - 24 + (fine - .5) * 10) / 13);
            if (longitude > 112 && longitude < 145) dry = clamp(1 - Math.abs(latitude + 25 + (fine - .5) * 7) / 12);
            const relief = (grain - .5) * 26;
            const green = [37 + fine * 45 + relief, 68 + fine * 50 + relief, 44 + fine * 30 + relief * .7];
            const sand = [160 + fine * 43 + relief, 139 + fine * 35 + relief, 94 + fine * 32 + relief * .7];
            color = green.map((channel, index) => mix(channel, sand[index], Math.sqrt(dry)));
          } else {
            const depth = terrainHi(x / 40, y / 40);
            color = [10 + fine * 12 + depth * 10, 44 + fine * 18 + depth * 14, 74 + fine * 32 + depth * 20];
          }
          if (latitude < -70 || latitude > 76) {
            const ice = clamp((Math.abs(latitude) - 70) / 11 + fine * .2);
            color = color.map((channel) => mix(channel, 224, ice));
          }
          const cloudX = x / 78 + Math.sin(y / 68) * 1.3;
          const cloud = terrain(cloudX, y / 46 + Math.sin(x / 116) * .8);
          const cover = clamp((cloud - .52) * 5);
          const filaments = terrainHi(x / 12, y / 9) * .34 + .66;
          details.data[offset] = cover * filaments * 255;
          const settled = isLand && Math.abs(latitude) < 60 && Math.abs(latitude) > 10 && fine > .57;
          details.data[offset + 2] = settled && hash(x, y) > .94 ? Math.pow(hash(y, x), 2) * 255 : 0;
        } else if (kind === 'jupiter') {
          const turb = (terrainHi(x / 30, y / 60) - .5) * 9;
          const band = Math.sin((y + turb) / 14.4) * .5 + Math.sin((y + turb) / 38 + fine * 4) * .22;
          const swirl = (terrainHi(x / 10, y / 20) - .5) * 26;
          const stormX = ((x - textureWidth * .62 + textureWidth * .5) % textureWidth) - textureWidth * .5;
          const stormY = y - textureHeight * .64;
          const storm = clamp(1 - Math.sqrt((stormX / 132) ** 2 + (stormY / 46) ** 2));
          color = [
            173 + band * 45 + fine * 24 + storm * 42 + swirl,
            137 + band * 34 + fine * 20 - storm * 25 + swirl * .8,
            101 + band * 27 + fine * 18 - storm * 32 + swirl * .6,
          ];
        } else if (kind === 'saturn') {
          const turb = (terrainHi(x / 34, y / 66) - .5) * 7;
          const band = Math.sin((y + turb) / 11) * .42 + Math.sin((y + turb) / 32) * .2;
          const swirl = (terrainHi(x / 12, y / 22) - .5) * 16;
          color = [183 + band * 35 + fine * 18 + swirl, 157 + band * 30 + fine * 15 + swirl * .85, 111 + band * 23 + fine * 12 + swirl * .6];
        } else if (kind === 'venus') {
          const swirl = terrain(x / 48 + Math.sin(y / 44), y / 24);
          const wisp = (terrainHi(x / 9, y / 14) - .5) * 22;
          color = [179 + swirl * 50 + wisp, 132 + swirl * 43 + wisp * .8, 68 + swirl * 31 + wisp * .5];
        } else if (kind === 'uranus') {
          const turb = (terrainHi(x / 40, y / 80) - .5) * 5;
          const band = Math.sin((y + turb) / 24) * 4 + fine * 8;
          const wisp = (terrainHi(x / 14, y / 26) - .5) * 10;
          color = [116 + band + wisp, 184 + band + wisp, 190 + band + wisp];
        } else if (kind === 'neptune') {
          const turb = (terrainHi(x / 30, y / 60) - .5) * 8;
          const band = Math.sin((y + turb) / 16 + fine * 2) * 10;
          const wisp = (terrainHi(x / 11, y / 18) - .5) * 16;
          const stormX = ((x - textureWidth * .57 + textureWidth * .5) % textureWidth) - textureWidth * .5;
          const stormY = y - textureHeight * .56;
          const storm = clamp(1 - Math.sqrt((stormX / 84) ** 2 + (stormY / 34) ** 2));
          color = [31 + fine * 20 - storm * 14 + wisp * .5, 83 + band + fine * 19 - storm * 32 + wisp, 157 + band + fine * 38 - storm * 51 + wisp];
        } else if (kind === 'mars') {
          const broad = terrain(x / 88, y / 70);
          const rock = (terrainHi(x / 8, y / 8) - .5) * 30;
          const polar = clamp((Math.abs(latitude) - 72) / 10);
          color = [128 + fine * 57 - broad * 18 + rock, 56 + fine * 35 - broad * 12 + rock * .7, 32 + fine * 24 - broad * 8 + rock * .5];
          color = color.map((channel) => mix(channel, 207, polar));
        } else {
          const broad = terrain(x / 122, y / 96);
          const rock = (terrainHi(x / 7, y / 7) - .5) * (kind === 'mercury' ? 40 : 34);
          const base = kind === 'mercury' ? 116 : 148;
          const shade = base + fine * 62 - clamp((.52 - broad) * 4) * (kind === 'mercury' ? 72 : 100) + rock;
          color = [shade * 1.03, shade * 1.015, shade * .97];
        }
        image.data[offset] = color[0];
        image.data[offset + 1] = color[1];
        image.data[offset + 2] = color[2];
        image.data[offset + 3] = 255;
        details.data[offset + 3] = 255;
      }
    }
    context.putImageData(image, 0, 0);
    if (['moon', 'mercury', 'mars'].includes(kind)) {
      const craterCount = kind === 'moon' ? 6400 : kind === 'mercury' ? 4200 : 1300;
      for (let index = 0; index < craterCount; index++) {
        const x = random() * textureWidth;
        const y = random() * textureHeight;
        const radius = 1 + Math.pow(random(), 3.5) * 20;
        context.save();
        context.translate(x, y);
        context.scale(1, .82);
        const crater = context.createRadialGradient(-radius * .24, -radius * .3, 0, 0, 0, radius);
        const craterShadow = kind === 'mars' ? 'rgba(57, 25, 18, .25)' : 'rgba(50, 50, 48, .34)';
        const craterFloor = kind === 'mars' ? 'rgba(86, 37, 22, .18)' : 'rgba(64, 63, 59, .22)';
        const craterRim = kind === 'mars' ? 'rgba(213, 112, 68, .25)' : 'rgba(224, 220, 207, .4)';
        crater.addColorStop(0, craterShadow);
        crater.addColorStop(.63, craterFloor);
        crater.addColorStop(.83, craterRim);
        crater.addColorStop(1, 'rgba(200, 199, 187, 0)');
        context.fillStyle = crater;
        context.beginPath();
        context.arc(0, 0, radius, 0, tau);
        context.fill();
        context.restore();
      }
    }
    const textures = { surface: context.getImageData(0, 0, textureWidth, textureHeight), details };
    textureCache.set(kind, textures);
    return textures;
  }

  function createGlobe(canvas) {
    const kind = canvas.dataset.world;
    const context = canvas.getContext('2d');
    if (!context) return null;
    const textures = makeTexture(kind);
    if (!textures) return null;
    textureStore[kind] = textures;
    const textureWidth = textures.surface.width;
    const textureHeight = textures.surface.height;
    const texture = textures.surface.data;
    const size = canvas.width;
    const image = context.createImageData(size, size);
    const pixels = [];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const nx = (x + .5) / size * 2 - 1;
        const ny = 1 - (y + .5) / size * 2;
        const radius = Math.hypot(nx, ny);
        if (radius >= 1) continue;
        const nz = Math.sqrt(1 - radius * radius);
        const light = Math.max(0, nx * -.48 + ny * .42 + nz * .77);
        const longitude = Math.atan2(nx, nz);
        const latitude = Math.asin(ny);
        const rim = kind === 'earth' ? Math.pow(1 - nz, 5) * (.12 + light * .7) : 0;
        const offset = (y * size + x) * 4;
        image.data[offset + 3] = clamp((1 - radius) * size) * 255;
        pixels.push({
          offset, u: (longitude / tau + .5) * textureWidth,
          row: Math.min(textureHeight - 1, Math.floor((.5 - latitude / Math.PI) * textureHeight)) * textureWidth,
          light: .075 + Math.pow(light, .85) * .96, rim,
        });
      }
    }
    const icons = [...document.querySelectorAll(`[data-celestial-icon="${kind}"]`)].map((node) => {
      const icon = document.createElement('canvas');
      icon.width = 64;
      icon.height = 64;
      node.append(icon);
      return icon.getContext('2d');
    });
    const drawFallback = (elapsed, updateIcons = false) => {
      const shift = (elapsed / (kind === 'earth' ? 180000 : 260000) * textureWidth + (kind === 'earth' ? .0234 : .3) * textureWidth) % textureWidth;
      for (const pixel of pixels) {
        const offset = (pixel.row + Math.floor((pixel.u + shift) % textureWidth)) * 4;
        const clouds = textures.details.data[offset] / 255;
        image.data[pixel.offset] = mix(texture[offset], 226, clouds) * pixel.light + pixel.rim * 65;
        image.data[pixel.offset + 1] = mix(texture[offset + 1], 233, clouds) * pixel.light + pixel.rim * 137;
        image.data[pixel.offset + 2] = mix(texture[offset + 2], 238, clouds) * pixel.light + pixel.rim * 225;
      }
      context.putImageData(image, 0, 0);
      if (updateIcons) icons.forEach((icon) => {
        if (!icon) return;
        icon.clearRect(0, 0, 64, 64);
        icon.drawImage(canvas, 0, 0, 64, 64);
      });
    };
    drawFallback(0, true);
    canvas.dataset.renderer = 'canvas';
    let sourceElapsed = 0;
    let renderedElapsed = 0;
    const interactiveNode = canvas.closest('[data-orbit]');
    const useGPU = kind === 'earth' || kind === 'moon';
    let renderer = useGPU ? window.createGlobeRenderer?.(canvas, textures, kind, () => {
      renderer = null;
      drawFallback(renderedElapsed);
    }) : null;
    return (elapsed) => {
      const delta = sourceElapsed === 0 ? 0 : clamp(elapsed - sourceElapsed, 0, 120);
      sourceElapsed = elapsed;
      const focused = interactiveNode?.matches(':hover, :focus-within') ?? false;
      renderedElapsed += delta * (focused ? 5.5 : 1);
      if (renderer) renderer.draw(renderedElapsed);
      else drawFallback(renderedElapsed);
    };
  }

  const cosmicRenderers = [
    createSun(document.querySelector('.solar-surface')),
    ...[...document.querySelectorAll('[data-world]')].map(createGlobe),
  ].filter(Boolean);
  const stars = Array.from({ length: 160 }, () => ({
    x: random(), y: random(), radius: .35 + random() * 1.05,
    phase: random() * tau, speed: .35 + random() * .7,
    alpha: .15 + random() * .5, flare: random() > .94, warm: random() > .75,
  }));
  let width = innerWidth;
  let height = innerHeight;
  let starColor = '';
  let goldColor = '';
  let elapsed = 0;
  let animationId = 0;
  let lastFrame = null;
  let previousCosmosFrame = -Infinity;
  let isHomeVisible = !home.hidden;
  let userPaused = false;
  try { userPaused = localStorage.getItem('personal-space-motion') === 'paused'; } catch {}
  let pointerX = 0;
  let pointerY = 0;
  let targetX = 0;
  let targetY = 0;

  function drawStars(time) {
    if (!starsContext) return;
    const context = starsContext;
    context.clearRect(0, 0, width, height);
    for (const star of stars) {
      const pulse = .65 + Math.sin(time / 1000 * star.speed + star.phase) * .35;
      const x = star.x * width + pointerX * star.radius * 7;
      const y = star.y * height + pointerY * star.radius * 5;
      context.globalAlpha = star.alpha * (.4 + pulse * .6);
      context.fillStyle = star.warm ? goldColor : starColor;
      context.beginPath();
      context.arc(x, y, star.radius, 0, tau);
      context.fill();
      if (star.flare) {
        context.globalAlpha *= .6;
        context.strokeStyle = context.fillStyle;
        context.lineWidth = .6;
        context.beginPath();
        context.moveTo(x - 5, y); context.lineTo(x + 5, y);
        context.moveTo(x, y - 5); context.lineTo(x, y + 5);
        context.stroke();
      }
    }
    const cycle = (time + 4300) % 11000;
    if (cycle < 1400 && !userPaused && !reducedMotion.matches) {
      const progress = cycle / 1400;
      const event = Math.floor((time + 4300) / 11000);
      const x = width * (.56 + hash(event, 9) * .3) - progress * 290;
      const y = height * (.08 + hash(event, 17) * .32) + progress * 170;
      const tail = context.createLinearGradient(x, y, x + 110, y - 64);
      tail.addColorStop(0, starColor);
      tail.addColorStop(1, 'transparent');
      context.globalAlpha = Math.sin(progress * Math.PI) * .65;
      context.strokeStyle = tail;
      context.lineWidth = 1.3;
      context.beginPath();
      context.moveTo(x, y); context.lineTo(x + 110, y - 64);
      context.stroke();
      context.fillStyle = starColor;
      context.beginPath(); context.arc(x, y, 1.4, 0, tau); context.fill();
    }
    context.globalAlpha = 1;
  }

  function resize() {
    width = innerWidth;
    height = innerHeight;
    const ratio = Math.min(devicePixelRatio || 1, 1.5);
    starCanvas.width = Math.round(width * ratio);
    starCanvas.height = Math.round(height * ratio);
    starsContext?.setTransform(ratio, 0, 0, ratio, 0, 0);
    const style = getComputedStyle(root);
    starColor = style.getPropertyValue(root.dataset.theme === 'light' ? '--muted' : '--star-light').trim();
    goldColor = style.getPropertyValue('--accent').trim();
    drawStars(elapsed);
  }
  function animate(now) {
    animationId = 0;
    if (lastFrame === null) lastFrame = now;
    const delta = now - lastFrame;
    if (delta >= 40) {
      elapsed += Math.min(delta, 80);
      lastFrame = now;
      pointerX += (targetX - pointerX) * .07;
      pointerY += (targetY - pointerY) * .07;
      drawStars(elapsed);
      if (!universe.classList.contains('three-ready') && elapsed - previousCosmosFrame >= 80) {
        cosmicRenderers.forEach((draw) => draw(elapsed));
        previousCosmosFrame = elapsed;
      }
    }
    animationId = requestAnimationFrame(animate);
  }
  function syncMotion() {
    cancelAnimationFrame(animationId);
    animationId = 0;
    lastFrame = null;
    const paused = userPaused || reducedMotion.matches;
    root.dataset.cosmicMotion = paused ? 'paused' : 'playing';
    motionButton.setAttribute('aria-pressed', String(paused));
    motionButton.setAttribute('aria-label', paused ? '播放星空动效' : '暂停星空动效');
    motionButton.title = reducedMotion.matches ? '系统已启用减少动态效果' : motionButton.getAttribute('aria-label');
    motionButton.disabled = reducedMotion.matches;
    drawStars(elapsed);
    if (!universe.classList.contains('three-ready')) cosmicRenderers.forEach((draw) => draw(elapsed));
    if (!paused && !document.hidden && isHomeVisible) animationId = requestAnimationFrame(animate);
  }

  motionButton.addEventListener('click', () => {
    userPaused = !userPaused;
    try { localStorage.setItem('personal-space-motion', userPaused ? 'paused' : 'playing'); } catch {}
    syncMotion();
  });

  const timeSteps = [.25, .5, 1, 2, 5, 10, 20];
  const slowerButton = document.querySelector('.time-slower');
  const fasterButton = document.querySelector('.time-faster');
  const scaleReadout = document.querySelector('.time-scale-readout');
  let timeIndex = 2;
  try {
    const savedIndex = timeSteps.indexOf(parseFloat(localStorage.getItem('personal-space-timescale')));
    if (savedIndex >= 0) timeIndex = savedIndex;
  } catch {}
  const formatScale = (value) => (Number.isInteger(value) ? `${value}×` : `${value.toString().replace(/^0/, '')}×`);
  function syncTimeScale() {
    const scale = timeSteps[timeIndex];
    root.dataset.timeScale = String(scale);
    if (scaleReadout) scaleReadout.textContent = formatScale(scale);
    if (slowerButton) slowerButton.disabled = timeIndex === 0;
    if (fasterButton) fasterButton.disabled = timeIndex === timeSteps.length - 1;
    try { localStorage.setItem('personal-space-timescale', String(scale)); } catch {}
  }
  slowerButton?.addEventListener('click', () => {
    timeIndex = Math.max(0, timeIndex - 1);
    syncTimeScale();
  });
  fasterButton?.addEventListener('click', () => {
    timeIndex = Math.min(timeSteps.length - 1, timeIndex + 1);
    syncTimeScale();
  });
  syncTimeScale();
  home.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse' || reducedMotion.matches || userPaused) return;
    targetX = event.clientX / innerWidth * 2 - 1;
    targetY = event.clientY / innerHeight * 2 - 1;
  }, { passive: true });
  home.addEventListener('pointerleave', () => { targetX = 0; targetY = 0; });
  universe.querySelectorAll('[data-orbit]').forEach((node) => {
    const activate = () => {
      universe.dataset.activeOrbit = node.dataset.orbit;
      universe.dataset.activeBody = node.dataset.body;
    };
    const deactivate = () => {
      if (universe.dataset.activeBody !== node.dataset.body) return;
      delete universe.dataset.activeOrbit;
      delete universe.dataset.activeBody;
    };
    node.addEventListener('pointerenter', activate);
    node.addEventListener('pointerleave', deactivate);
    node.addEventListener('focusin', activate);
    node.addEventListener('focusout', deactivate);
  });
  new IntersectionObserver(([entry]) => {
    isHomeVisible = entry.isIntersecting;
    syncMotion();
  }).observe(home);
  new MutationObserver(resize).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  document.addEventListener('visibilitychange', syncMotion);
  reducedMotion.addEventListener('change', syncMotion);
  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('pagehide', () => cancelAnimationFrame(animationId));
  window.addEventListener('pageshow', syncMotion);
  resize();
  syncMotion();
})();
