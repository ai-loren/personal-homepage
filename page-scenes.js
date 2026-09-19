(() => {
  'use strict';

  const root = document.documentElement;
  const canvas = document.querySelector('#page-art');
  const context = canvas?.getContext('2d');
  if (!context) return;

  const tau = Math.PI * 2;
  let width = innerWidth;
  let height = innerHeight;
  let dpr = 1;
  let frame = 0;
  let lastDraw = 0;
  let pointerX = 0;
  let pointerY = 0;
  const randomFor = (seed) => {
    let value = seed >>> 0;
    return () => {
      value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
      return value / 4294967296;
    };
  };

  const hexToRgba = (hex, alpha) => {
    const value = hex.replace('#', '');
    const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
    const int = parseInt(full, 16);
    return `rgba(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}, ${alpha})`;
  };

  // 缓存一小块噪点纹理，用低不透明度 overlay 铺满全屏，给背景加一层细腻胶片颗粒感（比纯渐变更"高级"）。
  let noisePattern = null;
  function getNoisePattern() {
    if (noisePattern) return noisePattern;
    const size = 150;
    const off = document.createElement('canvas');
    off.width = off.height = size;
    const octx = off.getContext('2d');
    const image = octx.createImageData(size, size);
    const random = randomFor(20240517);
    for (let index = 0; index < image.data.length; index += 4) {
      const shade = 118 + Math.floor(random() * 140);
      image.data[index] = shade;
      image.data[index + 1] = shade;
      image.data[index + 2] = shade;
      image.data[index + 3] = 255;
    }
    octx.putImageData(image, 0, 0);
    noisePattern = context.createPattern(off, 'repeat');
    return noisePattern;
  }

  const palettes = {
    about: { dark: ['#b4976d', '#8b765d', '#493d35'], light: ['#6f5a41', '#97816b', '#c4ae91'] },
    writing: { dark: ['#d1c7ad', '#8291a6', '#3d4a5d'], light: ['#49443d', '#837b6e', '#c2b7a5'] },
    projects: { dark: ['#74b8d0', '#366f8c', '#193c50'], light: ['#315d69', '#6793a0', '#abc5ca'] },
    lab: { dark: ['#d1845e', '#8f442d', '#54261c'], light: ['#7d3d2a', '#ad6a4f', '#d19a7d'] },
    journey: { dark: ['#a7c4d7', '#547c98', '#29475f'], light: ['#3e6278', '#7593a5', '#b6c6cf'] },
    library: { dark: ['#d4b77f', '#8d7040', '#4b351a'], light: ['#71572f', '#9f8353', '#cdb88c'] },
    ideas: { dark: ['#e0a04e', '#a26026', '#542913'], light: ['#734319', '#a97034', '#d1a366'] },
  };

  function resize() {
    width = innerWidth;
    height = innerHeight;
    dpr = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(performance.now());
  }

  function line(x1, y1, x2, y2, color, alpha = 1, lineWidth = 1) {
    context.globalAlpha = alpha;
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.beginPath();
    context.moveTo(x1, y1);
    context.lineTo(x2, y2);
    context.stroke();
  }

  function ellipse(x, y, rx, ry, rotation, color, alpha = 1, lineWidth = 1) {
    context.globalAlpha = alpha;
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.beginPath();
    context.ellipse(x, y, rx, ry, rotation, 0, tau);
    context.stroke();
  }

  function drawAtlas(color, alpha, seed, spacing = 190) {
    const random = randomFor(seed);
    context.save();
    context.translate(pointerX * 8, pointerY * 5);
    for (let x = -spacing; x < width + spacing; x += spacing) {
      for (let y = -spacing; y < height + spacing; y += spacing) {
        const cx = x + random() * spacing;
        const cy = y + random() * spacing;
        const count = 3 + Math.floor(random() * 4);
        let previous = null;
        for (let index = 0; index < count; index++) {
          const point = {
            x: cx + (random() - .5) * spacing * .72,
            y: cy + (random() - .5) * spacing * .72,
          };
          context.globalAlpha = alpha * (.45 + random() * .75);
          context.fillStyle = color;
          context.beginPath();
          context.arc(point.x, point.y, .5 + random() * 1.3, 0, tau);
          context.fill();
          if (previous) line(previous.x, previous.y, point.x, point.y, color, alpha * .34, .55);
          previous = point;
        }
      }
    }
    context.restore();
  }

  function drawMap(color, alpha, seed) {
    const random = randomFor(seed);
    context.save();
    context.translate(pointerX * 5, pointerY * 3);
    context.strokeStyle = color;
    context.lineWidth = .7;
    for (let index = 0; index < 16; index++) {
      context.globalAlpha = alpha * (.45 + random() * .4);
      context.beginPath();
      let x = -80 + random() * (width + 160);
      let y = -40 + random() * (height + 80);
      context.moveTo(x, y);
      for (let segment = 0; segment < 9; segment++) {
        x += (random() - .42) * 100;
        y += 35 + random() * 65;
        context.quadraticCurveTo(
          x + (random() - .5) * 80,
          y + (random() - .5) * 45,
          x,
          y,
        );
      }
      context.stroke();
    }
    for (let radius = 90; radius < Math.max(width, height) * .8; radius += 120) {
      ellipse(width * .8, height * .35, radius, radius * .54, -.18, color, alpha * .32, .7);
    }
    context.restore();
  }

  // 程序化星云：一层底色晕染抬升死黑 + 多团拉长的柔和色斑 + 细丝状云缕，堆出有色彩、有体积的深空。
  function drawNebula(colors, light, seed) {
    const random = randomFor(seed);
    context.save();
    // 底色晕染：一大团贯穿画面的极淡渐变，让背景不再是纯黑，而是有色温的深空。
    context.globalCompositeOperation = light ? 'multiply' : 'screen';
    const wash = context.createLinearGradient(0, 0, width, height);
    wash.addColorStop(0, hexToRgba(colors[2], light ? .1 : .14));
    wash.addColorStop(.5, hexToRgba(colors[1], light ? .05 : .07));
    wash.addColorStop(1, hexToRgba(colors[0], light ? .08 : .1));
    context.fillStyle = wash;
    context.fillRect(0, 0, width, height);
    // 云团：拉长并随机旋转的径向色斑，比正圆更像真实星云。
    const clouds = 8;
    for (let index = 0; index < clouds; index++) {
      const cx = random() * width + pointerX * 12;
      const cy = random() * height + pointerY * 8;
      const radius = Math.min(width, height) * (.3 + random() * .55);
      const tint = colors[index % colors.length];
      const rotation = random() * tau;
      const stretch = .5 + random() * .7;
      const gradient = context.createRadialGradient(0, 0, 0, 0, 0, radius);
      gradient.addColorStop(0, hexToRgba(tint, light ? .12 : .2));
      gradient.addColorStop(.4, hexToRgba(tint, light ? .06 : .09));
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      context.save();
      context.translate(cx, cy);
      context.rotate(rotation);
      context.scale(1, stretch);
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(0, 0, radius, 0, tau);
      context.fill();
      context.restore();
    }
    // 云缕：一些半透明曲线丝，模拟星云内的气体细丝，增加层次。
    context.lineCap = 'round';
    for (let index = 0; index < 14; index++) {
      let x = random() * width;
      let y = random() * height;
      context.globalAlpha = (light ? .04 : .07) * (.5 + random());
      context.strokeStyle = colors[index % colors.length];
      context.lineWidth = 20 + random() * 60;
      context.beginPath();
      context.moveTo(x, y);
      for (let segment = 0; segment < 3; segment++) {
        const nx = x + (random() - .5) * 260;
        const ny = y + (random() - .5) * 180;
        context.quadraticCurveTo(x + (random() - .5) * 160, y + (random() - .5) * 120, nx, ny);
        x = nx; y = ny;
      }
      context.stroke();
    }
    context.restore();
  }

  // 斜向尘带：一条柔和的对角光带（类银河），给空旷区域一条贯穿的结构线。
  function drawDustBand(colors, light, seed) {
    const random = randomFor(seed);
    context.save();
    context.globalCompositeOperation = light ? 'multiply' : 'screen';
    const angle = -.5 + random() * .3;
    context.translate(width * .5 + pointerX * 10, height * .5 + pointerY * 8);
    context.rotate(angle);
    const bandLength = Math.max(width, height) * 1.6;
    const bandWidth = Math.min(width, height) * .5;
    const gradient = context.createLinearGradient(0, -bandWidth / 2, 0, bandWidth / 2);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(.5, hexToRgba(colors[1], light ? .05 : .08));
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = gradient;
    context.fillRect(-bandLength / 2, -bandWidth / 2, bandLength, bandWidth);
    // 带内散布密集微尘点，强化"银河"质感
    context.fillStyle = light ? '#6a6152' : '#f0f2f6';
    for (let index = 0; index < 220; index++) {
      const bx = (random() - .5) * bandLength;
      const by = (random() - .5) * bandWidth * (.4 + random() * .5);
      context.globalAlpha = (light ? .1 : .22) * random();
      context.beginPath();
      context.arc(bx, by, random() * .8 + .2, 0, tau);
      context.fill();
    }
    context.restore();
  }

  // 分层星场：远景细密微光 + 中景普通星点 + 近景亮星（带光晕和十字星芒），四层视差营造纵深。
  function drawStarfield(colors, light, seed) {
    const random = randomFor(seed);
    context.save();
    const layers = [
      { count: 300, depth: 2, size: [.35, .8], alpha: light ? .2 : .36 },
      { count: 150, depth: 5, size: [.6, 1.3], alpha: light ? .26 : .52 },
      { count: 60, depth: 9, size: [1, 1.8], alpha: light ? .32 : .66 },
      { count: 22, depth: 14, size: [1.5, 2.8], alpha: light ? .42 : .9 },
    ];
    const starTints = light
      ? ['#5a5248', '#6b5a44', '#4d5560']
      : ['#eef1f6', '#cdd8ef', '#f5e6c8', '#d9c4f0'];
    for (let layerIndex = 0; layerIndex < layers.length; layerIndex++) {
      const layer = layers[layerIndex];
      const bright = layerIndex === layers.length - 1;
      const shiftX = pointerX * layer.depth;
      const shiftY = pointerY * layer.depth;
      for (let index = 0; index < layer.count; index++) {
        const x = random() * width + shiftX;
        const y = random() * height + shiftY;
        const size = layer.size[0] + random() * (layer.size[1] - layer.size[0]);
        const twinkle = layerIndex >= 2 ? .65 + random() * .35 : 1;
        const tint = random() < .35 ? colors[0] : starTints[Math.floor(random() * starTints.length)];
        if (bright) {
          const halo = context.createRadialGradient(x, y, 0, x, y, size * 7);
          halo.addColorStop(0, hexToRgba(tint, layer.alpha * .5 * twinkle));
          halo.addColorStop(1, 'rgba(0,0,0,0)');
          context.fillStyle = halo;
          context.beginPath();
          context.arc(x, y, size * 7, 0, tau);
          context.fill();
          // 十字星芒
          context.globalAlpha = layer.alpha * .5 * twinkle;
          context.strokeStyle = tint;
          context.lineWidth = .6;
          context.beginPath();
          context.moveTo(x - size * 6, y); context.lineTo(x + size * 6, y);
          context.moveTo(x, y - size * 6); context.lineTo(x, y + size * 6);
          context.stroke();
        }
        context.globalAlpha = layer.alpha * twinkle;
        context.fillStyle = tint;
        context.beginPath();
        context.arc(x, y, size, 0, tau);
        context.fill();
      }
    }
    context.restore();
  }

  // 暗角 + 胶片颗粒：收边聚焦，并铺一层极淡噪点，消除纯色渐变的"塑料感"。
  function drawVignetteAndGrain(light) {
    context.save();
    const vignette = context.createRadialGradient(
      width * .5, height * .46, Math.min(width, height) * .2,
      width * .5, height * .5, Math.max(width, height) * .75,
    );
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, light ? 'rgba(40,32,20,.18)' : 'rgba(0,0,0,.5)');
    context.fillStyle = vignette;
    context.fillRect(0, 0, width, height);
    context.globalAlpha = light ? .015 : .028;
    context.globalCompositeOperation = 'overlay';
    context.fillStyle = getNoisePattern();
    context.fillRect(0, 0, width, height);
    context.restore();
  }

  function drawSphere(x, y, radius, colors, alpha = 1, craters = false, options = {}) {
    const { atmosphere = true, bands = false, terminator = true } = options;
    context.save();
    context.globalAlpha = alpha;
    // 外圈大气辉光：在星体外缘晕开一圈同色光，增加体积与"被恒星照亮"的通透感。
    if (atmosphere) {
      const halo = context.createRadialGradient(x, y, radius * .82, x, y, radius * 1.32);
      halo.addColorStop(0, hexToRgba(colors[0], 0));
      halo.addColorStop(.5, hexToRgba(colors[0], alpha * .22));
      halo.addColorStop(1, hexToRgba(colors[0], 0));
      context.fillStyle = halo;
      context.beginPath();
      context.arc(x, y, radius * 1.32, 0, tau);
      context.fill();
      context.globalAlpha = alpha;
    }
    const glow = context.createRadialGradient(x - radius * .22, y - radius * .28, radius * .05, x, y, radius * 1.04);
    glow.addColorStop(0, colors[0]);
    glow.addColorStop(.48, colors[1]);
    glow.addColorStop(.82, colors[2]);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = glow;
    context.beginPath();
    context.arc(x, y, radius, 0, tau);
    context.fill();
    context.beginPath();
    context.arc(x, y, radius * .92, 0, tau);
    context.clip();
    const random = randomFor(Math.round(radius * 197 + x));
    // 气态行星：叠横向色带，模拟木星/土星式湍流条纹。
    if (bands) {
      context.globalAlpha = alpha * .5;
      const bandCount = 9;
      for (let index = 0; index < bandCount; index++) {
        const by = y - radius * .85 + (radius * 1.7 / bandCount) * (index + .5);
        const bandWidth = radius * (.06 + random() * .08);
        context.fillStyle = index % 2 ? hexToRgba(colors[1], .5) : hexToRgba(colors[0], .35);
        context.beginPath();
        context.ellipse(x, by, radius * .92, bandWidth, 0, 0, tau);
        context.fill();
      }
      context.globalAlpha = alpha;
    }
    for (let index = 0; index < (craters ? 90 : 38); index++) {
      const angle = random() * tau;
      const distance = Math.sqrt(random()) * radius * .82;
      const size = radius * (.008 + random() * (craters ? .075 : .035));
      context.globalAlpha = alpha * (.07 + random() * .14);
      context.fillStyle = index % 3 ? colors[2] : colors[0];
      context.beginPath();
      context.ellipse(
        x + Math.cos(angle) * distance,
        y + Math.sin(angle) * distance,
        size,
        size * .65,
        angle,
        0,
        tau,
      );
      context.fill();
    }
    // 明暗终结线：从右下方压暗，形成球体的受光/背光过渡，立刻从"平面圆"变"立体球"。
    if (terminator) {
      const shade = context.createRadialGradient(
        x - radius * .35, y - radius * .4, radius * .1,
        x + radius * .3, y + radius * .35, radius * 1.15,
      );
      shade.addColorStop(0, 'rgba(0,0,0,0)');
      shade.addColorStop(.6, 'rgba(0,0,0,0)');
      shade.addColorStop(1, `rgba(0,0,0,${alpha * .72})`);
      context.globalAlpha = 1;
      context.fillStyle = shade;
      context.beginPath();
      context.arc(x, y, radius * .92, 0, tau);
      context.fill();
      // 受光侧高光
      const spec = context.createRadialGradient(
        x - radius * .32, y - radius * .36, 0,
        x - radius * .32, y - radius * .36, radius * .6,
      );
      spec.addColorStop(0, hexToRgba(colors[0], alpha * .5));
      spec.addColorStop(1, 'rgba(0,0,0,0)');
      context.fillStyle = spec;
      context.beginPath();
      context.arc(x, y, radius * .92, 0, tau);
      context.fill();
    }
    context.restore();
  }

  function drawWriting(colors, light) {
    drawAtlas(colors[1], light ? .12 : .1, 7304, 170);
    const phaseY = Math.max(120, height * .13);
    const startX = Math.max(70, width * .28);
    const gap = Math.min(78, width * .065);
    for (let index = 0; index < 9; index++) {
      const radius = Math.max(8, Math.min(17, width * .012));
      const x = startX + gap * index;
      context.save();
      context.globalAlpha = light ? .5 : .34;
      context.fillStyle = colors[0];
      context.beginPath();
      context.arc(x, phaseY, radius, 0, tau);
      context.fill();
      context.globalCompositeOperation = 'destination-out';
      context.beginPath();
      const offset = (index - 4) / 4 * radius * 1.8;
      context.arc(x + offset, phaseY, radius * .98, 0, tau);
      context.fill();
      context.restore();
    }
    const radius = Math.min(width, height) * .24;
    drawSphere(width + radius * .18, height * .78, radius, colors, light ? .14 : .2, true);
  }

  function drawProjects(colors, light) {
    drawAtlas(colors[0], light ? .08 : .15, 3235, 205);
    const radius = Math.min(width, height) * .43;
    const earthX = -radius * .04;
    const earthY = height * .76;
    drawSphere(earthX, earthY, radius, colors, light ? .2 : .52, false);
    context.save();
    context.beginPath();
    context.arc(earthX, earthY, radius * .92, 0, tau);
    context.clip();
    context.translate(earthX, earthY);
    context.rotate(-.22);
    context.globalAlpha = light ? .12 : .22;
    context.fillStyle = light ? '#587267' : '#5d795f';
    const landforms = [
      [-.32, -.3, .27, .16, -.32],
      [-.16, -.04, .18, .32, .28],
      [.18, -.27, .34, .13, .08],
      [.28, .08, .22, .31, -.2],
      [-.43, .24, .17, .12, .35],
    ];
    for (const [x, y, rx, ry, rotation] of landforms) {
      context.beginPath();
      context.ellipse(x * radius, y * radius, rx * radius, ry * radius, rotation, 0, tau);
      context.fill();
    }
    // 夜面城市微光：在地球背光侧（右下）点一簇暖色微光，模拟夜晚城市灯带的细节。
    if (!light) {
      const cityRandom = randomFor(88231);
      context.globalCompositeOperation = 'screen';
      for (let index = 0; index < 60; index++) {
        const angle = cityRandom() * tau;
        const distance = (.35 + cityRandom() * .55) * radius;
        const px = Math.cos(angle) * distance;
        const py = Math.sin(angle) * distance;
        if (px + py < radius * .1) continue; // 只点在背光侧
        context.globalAlpha = .18 + cityRandom() * .3;
        context.fillStyle = '#ffd9a0';
        context.beginPath();
        context.arc(px, py, .4 + cityRandom() * .8, 0, tau);
        context.fill();
      }
    }
    context.restore();
    context.save();
    context.translate(width * .89 + pointerX * 10, height * .76 + pointerY * 7);
    context.rotate(-.28);
    context.globalAlpha = light ? .25 : .48;
    context.strokeStyle = colors[0];
    context.lineWidth = 1;
    context.strokeRect(-22, -12, 44, 24);
    context.strokeRect(-85, -17, 54, 34);
    context.strokeRect(31, -17, 54, 34);
    line(-58, -17, -58, 17, colors[0], .45);
    line(58, -17, 58, 17, colors[0], .45);
    ellipse(0, 20, 16, 7, 0, colors[0], .48);
    context.restore();
    context.save();
    context.setLineDash([3, 10]);
    ellipse(width * .5, height * 1.02, width * .67, height * .28, -.06, colors[0], light ? .14 : .32, 1);
    context.restore();
  }

  function drawAbout(colors, light) {
    drawAtlas(colors[1], light ? .09 : .13, 1027, 215);
    const radius = Math.min(width, height) * .36;
    drawSphere(width + radius * .08, height * .54, radius, colors, light ? .16 : .32, false, { bands: true });
    for (let index = 1; index <= 7; index++) {
      ellipse(width * .82, height * .53, radius * (.36 + index * .17), radius * (.1 + index * .035), -.32, colors[0], light ? .09 : .14, .7);
    }
    for (let index = 0; index < 12; index++) {
      const angle = index / 12 * tau;
      line(
        width * .82,
        height * .53,
        width * .82 + Math.cos(angle) * radius * 1.6,
        height * .53 + Math.sin(angle) * radius * .62,
        colors[1],
        light ? .07 : .1,
        .6,
      );
    }
  }

  function drawLab(colors, light) {
    drawMap(colors[1], light ? .08 : .09, 9442);
    const horizon = height * .78;
    context.save();
    context.beginPath();
    context.moveTo(0, height);
    for (let x = 0; x <= width; x += 24) {
      const y = horizon + Math.sin(x / 95) * 25 + Math.sin(x / 31) * 8;
      context.lineTo(x, y);
    }
    context.lineTo(width, height);
    context.closePath();
    const gradient = context.createLinearGradient(0, horizon, 0, height);
    gradient.addColorStop(0, `${colors[0]}88`);
    gradient.addColorStop(1, `${colors[2]}cc`);
    context.fillStyle = gradient;
    context.globalAlpha = light ? .22 : .38;
    context.fill();
    context.restore();
    for (let index = 0; index < 9; index++) {
      ellipse(width * .78, height * .67, 70 + index * 42, 24 + index * 15, -.12, colors[0], light ? .08 : .13, .8);
    }
    drawSphere(width * .9, height * .2, Math.min(width, height) * .11, colors, light ? .18 : .34, true);
  }

  function drawJourney(colors, light) {
    drawAtlas(colors[0], light ? .09 : .18, 7781, 185);
    const radius = Math.min(width, height) * .28;
    drawSphere(-radius * .12, height * .7, radius, colors, light ? .16 : .3, false, { bands: true });
    context.save();
    context.setLineDash([2, 8]);
    context.beginPath();
    context.moveTo(width * .12, height * .78);
    context.bezierCurveTo(width * .25, height * .22, width * .68, height * .91, width * 1.06, height * .2);
    context.strokeStyle = colors[0];
    context.globalAlpha = light ? .2 : .38;
    context.lineWidth = 1.2;
    context.stroke();
    context.restore();
    for (let index = 0; index < 7; index++) {
      const progress = index / 6;
      const x = width * (.12 + progress * .88);
      const y = height * (.7 - Math.sin(progress * Math.PI * 2.2) * .22);
      context.globalAlpha = light ? .35 : .68;
      context.fillStyle = colors[0];
      context.beginPath();
      context.arc(x, y, index === 6 ? 3 : 1.8, 0, tau);
      context.fill();
    }
  }

  function drawLibrary(colors, light) {
    drawAtlas(colors[1], light ? .06 : .1, 1124, 240);
    const x = width * .9;
    const y = height * .5;
    const radius = Math.min(width, height) * .2;
    drawSphere(x, y, radius, colors, light ? .17 : .32, false, { bands: true });
    for (let index = 0; index < 5; index++) {
      ellipse(x, y, radius * (1.45 + index * .12), radius * (.36 + index * .035), -.18, colors[index % 2], light ? .16 : .3, 1 + index * .15);
    }
    context.save();
    context.globalAlpha = light ? .08 : .12;
    context.strokeStyle = colors[0];
    for (let xGrid = 0; xGrid < width; xGrid += 92) line(xGrid, 0, xGrid, height, colors[0], light ? .06 : .09, .5);
    for (let yGrid = 0; yGrid < height; yGrid += 68) line(0, yGrid, width, yGrid, colors[0], light ? .06 : .09, .5);
    context.restore();
  }

  function drawIdeas(colors, light, time) {
    drawMap(colors[1], light ? .12 : .09, 5001);
    const x = width * .9;
    const y = height * .45;
    const radius = Math.min(width, height) * .12;
    const halo = context.createRadialGradient(x, y, radius * .35, x, y, radius * 2.3);
    halo.addColorStop(0, 'rgba(0,0,0,1)');
    halo.addColorStop(.34, colors[0]);
    halo.addColorStop(.49, `${colors[1]}88`);
    halo.addColorStop(.72, `${colors[2]}22`);
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    context.globalAlpha = light ? .46 : .7;
    context.fillStyle = halo;
    context.fillRect(x - radius * 2.5, y - radius * 2.5, radius * 5, radius * 5);
    context.save();
    context.translate(x, y);
    context.rotate(-.2);
    for (let index = 0; index < 110; index++) {
      const angle = index * .47 + time / 15000;
      const orbit = radius * (.75 + (index % 19) / 12);
      context.globalAlpha = (light ? .18 : .32) * (1 - (index % 19) / 25);
      context.fillStyle = index % 4 ? colors[0] : colors[1];
      context.beginPath();
      context.arc(Math.cos(angle) * orbit, Math.sin(angle) * orbit * .28, .5 + index % 3 * .35, 0, tau);
      context.fill();
    }
    context.restore();
    context.globalAlpha = 1;
    context.fillStyle = light ? '#3a2517' : '#020202';
    context.beginPath();
    context.arc(x, y, radius * .56, 0, tau);
    context.fill();
    // 光子环：事件视界外缘一圈高亮细环，是黑洞最有辨识度的细节。
    context.save();
    const ring = context.createRadialGradient(x, y, radius * .5, x, y, radius * .74);
    ring.addColorStop(0, 'rgba(0,0,0,0)');
    ring.addColorStop(.62, hexToRgba(colors[0], light ? .5 : .9));
    ring.addColorStop(.8, hexToRgba(colors[1], light ? .3 : .6));
    ring.addColorStop(1, 'rgba(0,0,0,0)');
    context.globalCompositeOperation = 'screen';
    context.fillStyle = ring;
    context.beginPath();
    context.arc(x, y, radius * .74, 0, tau);
    context.fill();
    context.restore();
  }

  function draw(time) {
    context.clearRect(0, 0, width, height);
    const page = root.dataset.page || 'home';
    canvas.dataset.scene = page;
    canvas.dataset.renderer = 'canvas';
    if (page === 'home') return;
    const light = root.dataset.theme === 'light';
    const colors = palettes[page]?.[light ? 'light' : 'dark'] || palettes.about.dark;
    // 通用深空氛围层（星云 + 分层星场），每个栏目用不同 seed，保证画面既统一又各有星图。
    const sceneSeed = { about: 1027, writing: 7304, projects: 3235, lab: 9442, journey: 7781, library: 1124, ideas: 5001 }[page] || 42;
    drawNebula(colors, light, sceneSeed);
    drawDustBand(colors, light, sceneSeed + 409);
    drawStarfield(colors, light, sceneSeed + 811);
    if (page === 'about') drawAbout(colors, light);
    if (page === 'writing') drawWriting(colors, light);
    if (page === 'projects') drawProjects(colors, light);
    if (page === 'lab') drawLab(colors, light);
    if (page === 'journey') drawJourney(colors, light);
    if (page === 'library') drawLibrary(colors, light);
    if (page === 'ideas') drawIdeas(colors, light, time);
    drawVignetteAndGrain(light);
    context.globalAlpha = 1;
  }

  function animate(time) {
    frame = requestAnimationFrame(animate);
    if (document.hidden || time - lastDraw < 90) return;
    lastDraw = time;
    if (root.dataset.cosmicMotion === 'paused') return;
    if (root.dataset.page === 'ideas') draw(time);
  }

  window.addEventListener('pointermove', (event) => {
    pointerX = event.clientX / Math.max(innerWidth, 1) * 2 - 1;
    pointerY = event.clientY / Math.max(innerHeight, 1) * 2 - 1;
  }, { passive: true });
  new MutationObserver(() => draw(performance.now())).observe(root, {
    attributes: true,
    attributeFilter: ['data-page', 'data-theme', 'data-cosmic-motion'],
  });
  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('pagehide', () => cancelAnimationFrame(frame));
  resize();
  frame = requestAnimationFrame(animate);
})();
