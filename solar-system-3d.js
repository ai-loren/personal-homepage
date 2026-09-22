(() => {
  'use strict';

  const THREE = window.THREE;
  const universe = document.querySelector('.universe');
  const canvas = document.querySelector('.solar-system-3d');
  const textures = window.COSMOS_TEXTURES;
  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
  if (!THREE || !universe || !canvas || !textures?.earth) return;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
  } catch {
    return;
  }

  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(39, 1, .1, 80);
  const system = new THREE.Group();
  system.scale.setScalar(1);
  scene.add(system);
  scene.add(new THREE.HemisphereLight(0xb8cee0, 0x130b07, .52));
  scene.add(new THREE.AmbientLight(0x8292a8, .5));
  const rimLight = new THREE.DirectionalLight(0x8bb9dd, .72);
  rimLight.position.set(-5, 3, -4);
  scene.add(rimLight);
  const sunLight = new THREE.PointLight(0xffd28a, 34, 30, 1.35);
  scene.add(sunLight);

  const textureFromImageData = (imageData) => {
    const texture = new THREE.DataTexture(
      new Uint8Array(imageData.data),
      imageData.width,
      imageData.height,
      THREE.RGBAFormat,
    );
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 16);
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.needsUpdate = true;
    return texture;
  };

  const heightTextureFromImageData = (imageData) => {
    const source = imageData.data;
    const pixels = new Uint8Array(source.length);
    for (let index = 0; index < source.length; index += 4) {
      const value = source[index] * .28 + source[index + 1] * .57 + source[index + 2] * .15;
      pixels[index] = value;
      pixels[index + 1] = value;
      pixels[index + 2] = value;
      pixels[index + 3] = 255;
    }
    const texture = new THREE.DataTexture(pixels, imageData.width, imageData.height, THREE.RGBAFormat);
    texture.wrapS = THREE.RepeatWrapping;
    texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 16);
    texture.needsUpdate = true;
    return texture;
  };

  const cloudTextureFromImageData = (imageData) => {
    const source = imageData.data;
    const pixels = new Uint8Array(source.length);
    for (let index = 0; index < source.length; index += 4) {
      const cloud = source[index];
      pixels[index] = 238;
      pixels[index + 1] = 244;
      pixels[index + 2] = 248;
      pixels[index + 3] = cloud;
    }
    const texture = new THREE.DataTexture(pixels, imageData.width, imageData.height, THREE.RGBAFormat);
    texture.wrapS = THREE.RepeatWrapping;
    texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 16);
    texture.needsUpdate = true;
    return texture;
  };

  const makeCoronaTexture = () => {
    const element = document.createElement('canvas');
    element.width = 256;
    element.height = 256;
    const context = element.getContext('2d');
    const gradient = context.createRadialGradient(128, 128, 38, 128, 128, 126);
    gradient.addColorStop(0, 'rgba(255,235,173,.92)');
    gradient.addColorStop(.3, 'rgba(255,171,69,.34)');
    gradient.addColorStop(.62, 'rgba(220,91,28,.1)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(element);
  };

  const ringMaterial = new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    vertexShader: `
      varying float vRadius;
      void main() {
        vRadius = length(position.xy);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
      }
    `,
    fragmentShader: `
      precision highp float;
      varying float vRadius;
      void main() {
        float r = (vRadius - 1.28) / .67;
        float edge = smoothstep(0., .045, r) * (1. - smoothstep(.94, 1., r));
        float cassini = 1. - smoothstep(.012, .032, abs(r - .57));
        float fine = .68 + .22 * sin(r * 155.) + .1 * sin(r * 417.);
        float broad = .68 + .3 * sin(r * 23. + .8);
        vec3 ice = mix(vec3(.38,.3,.2), vec3(.91,.78,.56), clamp(fine*broad,0.,1.));
        float alpha = edge * (.32 + fine * .48) * cassini;
        gl_FragColor = vec4(ice, alpha);
      }
    `,
  });

  const sunMaterial = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormalView;
      void main() {
        vUv = uv;
        vNormalView = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vNormalView;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);
      }
      float fbm(vec2 p) {
        float value=0., amplitude=.5;
        for (int i=0;i<5;i++) {
          value += noise(p)*amplitude;
          p = mat2(1.7,-1.2,1.2,1.7)*p + .17;
          amplitude *= .5;
        }
        return value;
      }
      void main() {
        vec2 p = vec2(vUv.x*18., vUv.y*11.);
        float flow = fbm(p + vec2(uTime*.026, -uTime*.013));
        float granules = noise(vUv*vec2(170.,92.) + vec2(uTime*.01,0.));
        float filaments = fbm(p*2.7 - vec2(uTime*.018,0.));
        float limb = pow(max(vNormalView.z, 0.), .42);
        float spot = smoothstep(.58,.76,fbm(vUv*7. + vec2(.7,-.2))) * smoothstep(.53,.72,noise(vUv*18.));
        vec3 dark = vec3(.66,.075,.008);
        vec3 gold = vec3(1.,.39,.025);
        vec3 hot = vec3(1.,.84,.28);
        vec3 color = mix(dark, gold, smoothstep(.24,.72,flow));
        color = mix(color, hot, clamp(filaments*.55 + granules*.18,0.,1.));
        color *= .42 + limb*.76;
        color *= 1. - spot*.38;
        gl_FragColor = vec4(color,1.);
      }
    `,
  });
  const sun = new THREE.Mesh(new THREE.SphereGeometry(1.05, 64, 48), sunMaterial);
  sun.userData = { body: 'sun', href: '#home', baseScale: 1 };
  system.add(sun);
  const corona = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeCoronaTexture(),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: .8,
  }));
  corona.scale.set(3.65, 3.65, 1);
  sun.add(corona);

  const bodies = [
    { body: 'mercury', radius: .18, orbit: 1.5, angle: .92, speed: .11, inclination: .06 },
    { body: 'venus', radius: .34, orbit: 2.08, angle: .2, speed: .075, inclination: -.05 },
    { body: 'earth', radius: .37, orbit: 2.82, angle: -.22, speed: .057, inclination: .04, href: '#projects' },
    { body: 'mars', radius: .23, orbit: 3.5, angle: -1.08, speed: .046, inclination: .11, href: '#lab' },
    { body: 'jupiter', radius: 1.02, orbit: 4.95, angle: -2.76, speed: .025, inclination: -.08, href: '#journey' },
    { body: 'saturn', radius: .86, orbit: 7.2, angle: -2.02, speed: .019, inclination: .12, href: '#library', ring: true },
    { body: 'uranus', radius: .51, orbit: 8.75, angle: -1.52, speed: .014, inclination: -.1 },
    { body: 'neptune', radius: .5, orbit: 10.1, angle: .38, speed: .011, inclination: .05, href: '#ideas' },
  ];
  const items = [];
  const pickables = [sun];
  const orbitMaterials = new Map();
  const geometryCache = new Map();
  const surfaceMaterials = new Map();
  const cloudMaterials = new Map();
  const getSphere = (segments) => {
    if (!geometryCache.has(segments)) geometryCache.set(segments, new THREE.SphereGeometry(1, segments, Math.round(segments * .68)));
    return geometryCache.get(segments);
  };

  const createOrbit = (radius, inclination, body) => {
    const points = [];
    for (let index = 0; index < 160; index++) {
      const angle = index / 160 * Math.PI * 2;
      points.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 0x58616a, transparent: true, opacity: .2 });
    const line = new THREE.LineLoop(geometry, material);
    line.rotation.z = inclination;
    line.userData.body = body;
    system.add(line);
    orbitMaterials.set(body, material);
  };

  const gassyTint = (body) => ({
    jupiter: 0xd8b48a, saturn: 0xd8c79a, uranus: 0x9fe0e6, neptune: 0x6f8fe0,
    mercury: 0xbfae94, venus: 0xe8b877,
  }[body] || 0x9aa6bb);

  const makeBody = (config) => {
    createOrbit(config.orbit, config.inclination, config.body);
    // 行星轨迹拖尾：沿轨道在行星身后画一段渐隐的发光弧，表现运动轨迹（近头亮、向后淡出）。
    const trailSegments = 34;
    const trailGeometry = new THREE.BufferGeometry();
    const trailPos = new Float32Array((trailSegments + 1) * 3);
    const trailCol = new Float32Array((trailSegments + 1) * 3);
    const trailColor = new THREE.Color(config.body === 'earth' ? 0x6fb6ff : config.body === 'mars' ? 0xd9814f : gassyTint(config.body));
    for (let s = 0; s <= trailSegments; s++) {
      const fade = 1 - s / trailSegments;
      trailCol[s * 3] = trailColor.r * fade;
      trailCol[s * 3 + 1] = trailColor.g * fade;
      trailCol[s * 3 + 2] = trailColor.b * fade;
    }
    trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
    trailGeometry.setAttribute('color', new THREE.BufferAttribute(trailCol, 3));
    const trailLine = new THREE.Line(trailGeometry, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: .5,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    trailLine.rotation.z = config.inclination;
    trailLine.frustumCulled = false;
    system.add(trailLine);
    const pivot = new THREE.Group();
    pivot.rotation.z = config.inclination;
    pivot.rotation.y = config.angle;
    system.add(pivot);
    const textureData = textures[config.body]?.surface;
    const rocky = ['mercury', 'mars'].includes(config.body);
    const gassy = ['jupiter', 'saturn', 'venus', 'uranus', 'neptune'].includes(config.body);
    const surfaceTexture = textureData ? textureFromImageData(textureData) : null;
    const bumpScale = config.body === 'earth' ? .028 : rocky ? .04 : gassy ? .012 : .02;
    const material = new THREE.MeshStandardMaterial({
      map: surfaceTexture,
      color: textureData ? 0xffffff : 0x888888,
      bumpMap: textureData ? heightTextureFromImageData(textureData) : null,
      bumpScale: textureData ? bumpScale : 0,
      roughness: config.body === 'earth' ? .68 : rocky ? .92 : gassy ? .78 : .84,
      metalness: 0,
    });
    surfaceMaterials.set(config.body, material);
    const mesh = new THREE.Mesh(getSphere(config.radius > .5 ? 96 : 72), material);
    mesh.scale.setScalar(config.radius);
    mesh.position.x = config.orbit;
    mesh.rotation.z = config.body === 'earth' ? .4 : config.body === 'saturn' ? .46 : .12;
    mesh.userData = { ...config, baseScale: config.radius };
    pivot.add(mesh);
    pickables.push(mesh);

    // 气态巨行星大气辉光：一层 backside 壳，边缘发光，增加体积感
    if (gassy) {
      const glow = new THREE.Mesh(getSphere(48), new THREE.MeshBasicMaterial({
        color: gassyTint(config.body), transparent: true, opacity: .12,
        side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      glow.scale.setScalar(1.11);
      mesh.add(glow);
    }

    if (config.body === 'earth') {
      const atmosphere = new THREE.Mesh(getSphere(64), new THREE.MeshBasicMaterial({
        color: 0x4f99e7, transparent: true, opacity: .09,
        side: THREE.BackSide, blending: THREE.AdditiveBlending,
      }));
      atmosphere.scale.setScalar(config.radius * 1.06);
      mesh.add(atmosphere);
      const cloudData = textures.earth?.details;
      if (cloudData) {
        const cloudMaterial = new THREE.MeshStandardMaterial({
          map: cloudTextureFromImageData(cloudData),
          transparent: true,
          opacity: .72,
          depthWrite: false,
          roughness: 1,
        });
        cloudMaterials.set('earth', cloudMaterial);
        const clouds = new THREE.Mesh(getSphere(64), cloudMaterial);
        clouds.scale.setScalar(1.018);
        clouds.userData.cloudLayer = true;
        mesh.add(clouds);
      }
      const moonPivot = new THREE.Group();
      moonPivot.rotation.y = 1.15;
      mesh.add(moonPivot);
      const moonMaterial = new THREE.MeshStandardMaterial({
        map: textureFromImageData(textures.moon.surface),
        bumpMap: heightTextureFromImageData(textures.moon.surface),
        bumpScale: .045,
        roughness: 1,
      });
      surfaceMaterials.set('moon', moonMaterial);
      const moon = new THREE.Mesh(getSphere(48), moonMaterial);
      moon.scale.setScalar(.09 / config.radius);
      moon.position.x = 1.72;
      moon.userData = { body: 'moon', href: '#writing', baseScale: .09 / config.radius };
      moonPivot.add(moon);
      pickables.push(moon);
      items.push({ body: 'moon', object: moon, pivot: moonPivot, speed: .33, baseScale: .09 / config.radius, href: '#writing', moon: true });
    }
    if (config.ring) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(1.28, 1.95, 192),
        ringMaterial.clone(),
      );
      ring.rotation.x = Math.PI / 2;
      mesh.add(ring);
    }
    items.push({ body: config.body, object: mesh, pivot, speed: config.speed, baseScale: config.radius, href: config.href, orbit: config.orbit, trail: { line: trailLine, positions: trailPos, segments: trailSegments } });
  };
  bodies.forEach(makeBody);
  window.addEventListener('cosmos:texture-refined', (event) => {
    const { kind, textures: refinedTextures } = event.detail || {};
    const material = surfaceMaterials.get(kind);
    if (!kind || !refinedTextures?.surface || !material) return;
    const oldMap = material.map;
    const oldBumpMap = material.bumpMap;
    material.map = textureFromImageData(refinedTextures.surface);
    material.bumpMap = heightTextureFromImageData(refinedTextures.surface);
    material.needsUpdate = true;
    oldMap?.dispose();
    oldBumpMap?.dispose();

    const cloudMaterial = cloudMaterials.get(kind);
    if (cloudMaterial && refinedTextures.details) {
      const oldCloudMap = cloudMaterial.map;
      cloudMaterial.map = cloudTextureFromImageData(refinedTextures.details);
      cloudMaterial.needsUpdate = true;
      oldCloudMap?.dispose();
    }
  });

  // 小行星带：填充火星(3.5)与木星(4.95)之间的空白，是真实太阳系特征。用一组绕行的小点表现。
  const beltGroup = new THREE.Group();
  system.add(beltGroup);
  const beltCount = 520;
  const beltGeometry = new THREE.BufferGeometry();
  const beltPositions = new Float32Array(beltCount * 3);
  for (let i = 0; i < beltCount; i++) {
    const radius = 3.95 + Math.random() * .95;
    const angle = Math.random() * Math.PI * 2;
    const y = (Math.random() - .5) * .28;
    beltPositions[i * 3] = Math.cos(angle) * radius;
    beltPositions[i * 3 + 1] = y;
    beltPositions[i * 3 + 2] = Math.sin(angle) * radius;
  }
  beltGeometry.setAttribute('position', new THREE.BufferAttribute(beltPositions, 3));
  const beltMaterial = new THREE.PointsMaterial({
    color: 0xb9a888, size: .045, sizeAttenuation: true,
    transparent: true, opacity: .74, depthWrite: false,
  });
  const beltPoints = new THREE.Points(beltGeometry, beltMaterial);
  beltGroup.add(beltPoints);
  beltGroup.rotation.z = .04;

  // 远景星尘：稀疏微光点，增加纵深，环绕整个系统外围。
  const dustCount = 260;
  const dustGeometry = new THREE.BufferGeometry();
  const dustPositions = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    const radius = 7 + Math.random() * 12;
    const theta = Math.random() * Math.PI * 2;
    const phi = (Math.random() - .5) * 1.1;
    dustPositions[i * 3] = Math.cos(theta) * radius * Math.cos(phi);
    dustPositions[i * 3 + 1] = Math.sin(phi) * radius * .55;
    dustPositions[i * 3 + 2] = Math.sin(theta) * radius * Math.cos(phi);
  }
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dustPoints = new THREE.Points(dustGeometry, new THREE.PointsMaterial({
    color: 0x9fb4d6, size: .05, sizeAttenuation: true,
    transparent: true, opacity: .5, depthWrite: false,
  }));
  scene.add(dustPoints);

  // 流星：周期性从画面外划入的短生命光尾。复用一个对象池，随机方向与时机。
  const meteors = [];
  const meteorCount = 3;
  for (let i = 0; i < meteorCount; i++) {
    const trailGeometry = new THREE.BufferGeometry();
    const trailPositions = new Float32Array(2 * 3);
    trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
    const trailMaterial = new THREE.LineBasicMaterial({
      color: 0xfff1d0, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const trail = new THREE.Line(trailGeometry, trailMaterial);
    trail.frustumCulled = false;
    scene.add(trail);
    meteors.push({ trail, material: trailMaterial, positions: trailPositions, life: 0, duration: 0, delay: 1 + Math.random() * 5, from: new THREE.Vector3(), dir: new THREE.Vector3(), speed: 0, length: 1 });
  }
  const spawnMeteor = (meteor) => {
    // 从系统上方外围随机一点出发，斜向掠过内侧，方向带随机偏转。
    const edgeAngle = Math.random() * Math.PI * 2;
    const startRadius = 11 + Math.random() * 4;
    meteor.from.set(Math.cos(edgeAngle) * startRadius, 3 + Math.random() * 4, Math.sin(edgeAngle) * startRadius);
    meteor.dir.set(-meteor.from.x, -meteor.from.y * .5 - 1, -meteor.from.z).normalize();
    meteor.dir.x += (Math.random() - .5) * .7;
    meteor.dir.z += (Math.random() - .5) * .7;
    meteor.dir.normalize();
    meteor.speed = 9 + Math.random() * 7;
    meteor.length = 1.1 + Math.random() * 1.2;
    meteor.duration = 1.1 + Math.random() * .8;
    meteor.life = 0;
  };

  // 外星飞碟聚光灯：hover 某个星球时，正上方降下一只旋转飞碟，向下打出锥形光束 + 真实聚光灯，
  // 把转到太阳前方、正对相机那面几乎全黑的星球从上到下照亮（否则 fly-to 飞近只看到背光暗面）。
  const ufo = new THREE.Group();
  ufo.visible = false;
  scene.add(ufo);
  const craft = new THREE.Group(); // 只缩放飞碟，光束与聚光灯使用世界尺寸单独计算
  ufo.add(craft);
  const spinningHull = new THREE.Group();
  craft.add(spinningHull);

  const saucerProfile = [
    [0, .2], [.3, .18], [.62, .13], [1, 0], [.72, -.16], [.3, -.24], [0, -.25],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const saucer = new THREE.Mesh(
    new THREE.LatheGeometry(saucerProfile, 44),
    new THREE.MeshStandardMaterial({
      color: 0x71889a, metalness: .72, roughness: .3,
      emissive: 0x102b3c, emissiveIntensity: .18, transparent: true, opacity: 1,
    }),
  );
  spinningHull.add(saucer);

  const cabinFloor = new THREE.Mesh(
    new THREE.CylinderGeometry(.36, .48, .09, 40),
    new THREE.MeshStandardMaterial({ color: 0x1d3143, metalness: .72, roughness: .34, emissive: 0x091a29, emissiveIntensity: .16 }),
  );
  cabinFloor.position.y = .11;
  craft.add(cabinFloor);

  const alienPilot = new THREE.Group();
  alienPilot.position.y = .13;
  craft.add(alienPilot);
  const alienSkin = new THREE.MeshStandardMaterial({
    color: 0x72cf8d, roughness: .56, metalness: 0,
    emissive: 0x163b27, emissiveIntensity: .05,
  });
  const alienBody = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), alienSkin);
  alienBody.scale.set(.14, .17, .1);
  alienBody.position.y = -.1;
  alienPilot.add(alienBody);
  const alienBelly = new THREE.Mesh(
    new THREE.SphereGeometry(1, 22, 16),
    new THREE.MeshStandardMaterial({ color: 0xc8efd0, roughness: .62, emissive: 0x294f34, emissiveIntensity: .03 }),
  );
  alienBelly.scale.set(.09, .11, .028);
  alienBelly.position.set(0, -.09, .098);
  alienPilot.add(alienBelly);
  const alienHead = new THREE.Mesh(new THREE.SphereGeometry(1, 36, 26), alienSkin);
  alienHead.scale.set(.24, .27, .2);
  alienHead.position.y = .14;
  alienPilot.add(alienHead);

  const alienEarGeometry = new THREE.SphereGeometry(1, 20, 14);
  const leftEar = new THREE.Mesh(alienEarGeometry, alienSkin);
  leftEar.scale.set(.055, .085, .04);
  leftEar.position.set(-.205, .13, .015);
  leftEar.rotation.z = -.24;
  alienPilot.add(leftEar);
  const rightEar = leftEar.clone();
  rightEar.position.x = .205;
  rightEar.rotation.z = .24;
  alienPilot.add(rightEar);

  const alienFaceMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x071019, roughness: .08, metalness: .08,
    clearcoat: 1, clearcoatRoughness: .08,
  });
  const alienEyeGeometry = new THREE.SphereGeometry(1, 20, 14);
  const leftEye = new THREE.Mesh(alienEyeGeometry, alienFaceMaterial);
  leftEye.scale.set(.068, .092, .042);
  leftEye.position.set(-.09, .18, .182);
  leftEye.rotation.z = .26;
  alienPilot.add(leftEye);
  const rightEye = leftEye.clone();
  rightEye.position.x = .09;
  rightEye.rotation.z = -.26;
  alienPilot.add(rightEye);

  const eyeShineMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const eyeShineGeometry = new THREE.SphereGeometry(.013, 12, 8);
  const leftEyeShine = new THREE.Mesh(eyeShineGeometry, eyeShineMaterial);
  leftEyeShine.position.set(-.108, .212, .219);
  alienPilot.add(leftEyeShine);
  const rightEyeShine = leftEyeShine.clone();
  rightEyeShine.position.x = .072;
  alienPilot.add(rightEyeShine);

  const alienNose = new THREE.Mesh(new THREE.SphereGeometry(.018, 14, 10), alienSkin);
  alienNose.scale.set(.72, .9, .82);
  alienNose.position.set(0, .11, .198);
  alienPilot.add(alienNose);
  const alienSmile = new THREE.Mesh(
    new THREE.TorusGeometry(.04, .006, 8, 20, Math.PI),
    alienFaceMaterial,
  );
  alienSmile.position.set(0, .07, .202);
  alienSmile.rotation.z = Math.PI;
  alienPilot.add(alienSmile);

  const cheekMaterial = new THREE.MeshBasicMaterial({
    color: 0xffb6c7, transparent: true, opacity: .68,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const cheekGeometry = new THREE.SphereGeometry(.018, 14, 10);
  const leftCheek = new THREE.Mesh(cheekGeometry, cheekMaterial);
  leftCheek.position.set(-.135, .095, .19);
  alienPilot.add(leftCheek);
  const rightCheek = leftCheek.clone();
  rightCheek.position.x = .135;
  alienPilot.add(rightCheek);

  const alienArmGeometry = new THREE.SphereGeometry(1, 18, 12);
  const leftArm = new THREE.Mesh(alienArmGeometry, alienSkin);
  leftArm.scale.set(.042, .115, .044);
  leftArm.position.set(-.145, -.065, .035);
  leftArm.rotation.z = -.62;
  alienPilot.add(leftArm);
  const rightArm = leftArm.clone();
  rightArm.position.x = .145;
  rightArm.rotation.z = .62;
  alienPilot.add(rightArm);
  const alienHandGeometry = new THREE.SphereGeometry(.045, 16, 12);
  const leftHand = new THREE.Mesh(alienHandGeometry, alienSkin);
  leftHand.scale.set(1.2, .7, .72);
  leftHand.position.set(-.16, -.025, .11);
  alienPilot.add(leftHand);
  const rightHand = leftHand.clone();
  rightHand.position.x = .16;
  alienPilot.add(rightHand);

  const antennaMaterial = new THREE.MeshStandardMaterial({
    color: 0x7bd496, roughness: .52, emissive: 0x16482d, emissiveIntensity: .06,
  });
  const antennaGeometry = new THREE.CylinderGeometry(.012, .018, .15, 12);
  const leftAntenna = new THREE.Mesh(antennaGeometry, antennaMaterial);
  leftAntenna.position.set(-.075, .37, 0);
  leftAntenna.rotation.z = -.34;
  alienPilot.add(leftAntenna);
  const rightAntenna = leftAntenna.clone();
  rightAntenna.position.x = .075;
  rightAntenna.rotation.z = .34;
  alienPilot.add(rightAntenna);
  const antennaTipMaterial = new THREE.MeshStandardMaterial({
    color: 0xa5ffc0, roughness: .25,
    emissive: 0x45d979, emissiveIntensity: .24,
  });
  const antennaTipGeometry = new THREE.SphereGeometry(.035, 18, 12);
  const leftAntennaTip = new THREE.Mesh(antennaTipGeometry, antennaTipMaterial);
  leftAntennaTip.position.set(-.1, .44, 0);
  alienPilot.add(leftAntennaTip);
  const rightAntennaTip = leftAntennaTip.clone();
  rightAntennaTip.position.x = .1;
  alienPilot.add(rightAntennaTip);

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(.57, 40, 24, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshPhysicalMaterial({
      color: 0xa9d3df, metalness: 0, roughness: .12,
      transparent: true, opacity: .22, transmission: .3,
      emissive: 0x17394b, emissiveIntensity: .08,
      side: THREE.DoubleSide, depthWrite: false,
    }),
  );
  dome.position.y = .1;
  dome.renderOrder = 4;
  craft.add(dome);
  const cabinLight = new THREE.PointLight(0xd9fff0, .22, 1.15, 2);
  cabinLight.position.set(-.28, .4, .3);
  craft.add(cabinLight);

  const domeTrim = new THREE.Mesh(
    new THREE.TorusGeometry(.57, .035, 12, 44),
    new THREE.MeshStandardMaterial({ color: 0x8499aa, metalness: .82, roughness: .28, emissive: 0x122a3b, emissiveIntensity: .12 }),
  );
  domeTrim.rotation.x = Math.PI / 2;
  domeTrim.position.y = .1;
  craft.add(domeTrim);

  const rimMaterial = new THREE.MeshBasicMaterial({ color: 0xd8edff, transparent: true, opacity: .24, blending: THREE.AdditiveBlending, depthWrite: false });
  const rimLights = new THREE.Mesh(new THREE.TorusGeometry(.7, .055, 14, 44), rimMaterial);
  rimLights.rotation.x = Math.PI / 2;
  rimLights.position.y = -.02;
  spinningHull.add(rimLights);
  const bulbMaterial = new THREE.MeshBasicMaterial({
    color: 0xbfeaff, transparent: true, opacity: .28,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const bulbGeometry = new THREE.SphereGeometry(.045, 14, 10);
  for (let index = 0; index < 8; index++) {
    const angle = index / 8 * Math.PI * 2;
    const bulb = new THREE.Mesh(bulbGeometry, bulbMaterial);
    bulb.position.set(Math.cos(angle) * .72, -.035, Math.sin(angle) * .72);
    spinningHull.add(bulb);
  }
  const emitterMaterial = new THREE.MeshBasicMaterial({ color: 0xf4fbff, transparent: true, opacity: .24, blending: THREE.AdditiveBlending, depthWrite: false });
  const emitter = new THREE.Mesh(new THREE.SphereGeometry(.17, 20, 12), emitterMaterial);
  emitter.position.y = -.21;
  spinningHull.add(emitter);

  // 光束：向下张开的锥体（apex 在碟底、base 在星球表面）；shader 做边缘发光 + 纵向渐变，加色混合出体积感。
  const beamMaterial = new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0 }, uColor: { value: new THREE.Color(0xe8f4ff) } },
    transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      varying float vY; varying vec3 vN;
      void main(){ vY = uv.y; vN = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }
    `,
    fragmentShader: `
      precision highp float;
      uniform float uOpacity; uniform vec3 uColor;
      varying float vY; varying vec3 vN;
      void main(){
        float rim = pow(1. - abs(vN.z), 1.4);
        float vert = mix(.92, .3, vY);            // vY=0 在星球端更亮，vY=1 在飞碟端收拢
        float a = (rim * .72 + .16) * vert * uOpacity;
        gl_FragColor = vec4(uColor, a);
      }
    `,
  });
  // 光束：顶细底宽的单位锥（高 1、底半径 1、顶半径 .14），apex 朝上贴飞碟、base 朝下落到星球；
  // 每帧只用非等比缩放调整半径与长度，避免重建 geometry 造成 GC 抖动。
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(.14, 1, 1, 46, 1, true), beamMaterial);
  beam.visible = false;
  scene.add(beam);

  // 真实聚光灯：放在飞碟处朝星球中心打，营造从上而下的锥形照射。
  const abductLight = new THREE.SpotLight(0xf1f7ff, 0, 16, Math.PI / 6, .82, 1.1);
  scene.add(abductLight);
  scene.add(abductLight.target);
  // 补光：贴相机侧的点光，专门提亮星球正对观众那面（垂直聚光灯只亮顶冠，解决不了"太暗"）。
  const abductFill = new THREE.PointLight(0xe2efff, 0, 6, 1.4);
  scene.add(abductFill);

  const ufoControls = document.querySelector('[data-ufo-controls]');
  const ufoIntensityInput = document.querySelector('#ufo-light-intensity');
  const ufoIntensityOutput = document.querySelector('.ufo-light-output');
  const ufoColorButtons = [...document.querySelectorAll('[data-ufo-color]')];
  const ufoPalettes = {
    moon: { css: '#e8f4ff', beam: 0xe8f4ff, spot: 0xf1f7ff, fill: 0xe2efff, rim: 0xd8edff, emitter: 0xf4fbff, bulb: 0xbfeaff },
    glacier: { css: '#8fd8ff', beam: 0xa8e2ff, spot: 0xd7f1ff, fill: 0x8bcff2, rim: 0x7acfff, emitter: 0xe6f7ff, bulb: 0x73cfff },
    aurora: { css: '#bfffe4', beam: 0xc8ffe9, spot: 0xdcfff1, fill: 0xb8f7e2, rim: 0x8fffd4, emitter: 0xe5fff7, bulb: 0x80f5cf },
    ion: { css: '#d8ff94', beam: 0xddffad, spot: 0xefffcf, fill: 0xc8ef86, rim: 0xbcff72, emitter: 0xf4ffd9, bulb: 0xb6f25d },
    nebula: { css: '#ddd2ff', beam: 0xddd2ff, spot: 0xeee7ff, fill: 0xcfc0ff, rim: 0xb8a7ff, emitter: 0xf3efff, bulb: 0xc5b8ff },
    rose: { css: '#ffb8db', beam: 0xffc6e1, spot: 0xffe3f1, fill: 0xf4a9ce, rim: 0xff9fce, emitter: 0xfff0f7, bulb: 0xff9acb },
    solar: { css: '#ffc485', beam: 0xffd0a0, spot: 0xffe4c2, fill: 0xffb874, rim: 0xffa95e, emitter: 0xfff0da, bulb: 0xff9e50 },
    warm: { css: '#fff1d6', beam: 0xfff1d6, spot: 0xfff6e5, fill: 0xffe9c5, rim: 0xffddb2, emitter: 0xfffbef, bulb: 0xffe4bf },
  };
  let ufoIntensity = 55;
  let ufoIntensityScale = 1;
  let ufoColor = 'moon';
  let hoverLeaveTimer = 0;
  let hoverExitGrace = null;
  let hoverExitDeadline = 0;
  let lastBodyPointer = null;
  const pointerClient = { x: Number.NaN, y: Number.NaN };

  const readStoredUfoSetting = (key) => {
    try { return localStorage.getItem(key); } catch { return null; }
  };
  const storeUfoSetting = (key, value) => {
    try { localStorage.setItem(key, value); } catch { /* Browser storage may be unavailable. */ }
  };
  const applyUfoIntensity = (value, persist = true) => {
    ufoIntensity = clamp(Number(value) || 55, 20, 100);
    ufoIntensityScale = ufoIntensity / 55;
    if (ufoIntensityInput) ufoIntensityInput.value = String(ufoIntensity);
    if (ufoIntensityOutput) ufoIntensityOutput.value = `${ufoIntensity}%`;
    if (ufoControls) ufoControls.style.setProperty('--ufo-level', `${ufoIntensity}%`);
    universe.dataset.ufoIntensity = String(ufoIntensity);
    if (persist) storeUfoSetting('personal-space-ufo-intensity', String(ufoIntensity));
  };
  const applyUfoColor = (value, persist = true) => {
    ufoColor = ufoPalettes[value] ? value : 'moon';
    const palette = ufoPalettes[ufoColor];
    beamMaterial.uniforms.uColor.value.setHex(palette.beam);
    abductLight.color.setHex(palette.spot);
    abductFill.color.setHex(palette.fill);
    rimMaterial.color.setHex(palette.rim);
    emitterMaterial.color.setHex(palette.emitter);
    bulbMaterial.color.setHex(palette.bulb);
    if (ufoControls) ufoControls.style.setProperty('--ufo-control-color', palette.css);
    for (const button of ufoColorButtons) {
      const selected = button.dataset.ufoColor === ufoColor;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
    universe.dataset.ufoColor = ufoColor;
    universe.dataset.ufoLight = ufoColor === 'moon' ? 'moonlight' : ufoColor;
    if (persist) storeUfoSetting('personal-space-ufo-color', ufoColor);
  };

  applyUfoIntensity(readStoredUfoSetting('personal-space-ufo-intensity') || 55, false);
  applyUfoColor(readStoredUfoSetting('personal-space-ufo-color') || 'moon', false);
  ufoIntensityInput?.addEventListener('input', (event) => applyUfoIntensity(event.currentTarget.value));
  for (const button of ufoColorButtons) {
    button.addEventListener('click', () => applyUfoColor(button.dataset.ufoColor));
  }

  const bodyNodes = new Map(
    [...universe.querySelectorAll('[data-body]')].map((node) => [node.dataset.body, node]),
  );
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(2, 2);
  const cameraTarget = new THREE.Vector2();
  let hoveredBody = null;
  let lastFrame = performance.now();
  let lastRender = 0;
  let running = true;
  let emptyFrames = 0;

  const homePos = new THREE.Vector3();
  const desiredPos = new THREE.Vector3();
  const focusPoint = new THREE.Vector3();
  const camLookAt = new THREE.Vector3(0, 0, 0);
  const bodyWorld = new THREE.Vector3();
  const focusDir = new THREE.Vector3();
  const objectByBody = new Map(items.map((item) => [item.body, item.object]));
  objectByBody.set('sun', sun);
  const radiusByBody = new Map(items.map((item) => [item.body, item.baseScale]));
  radiusByBody.set('sun', 1.05);

  // 飞碟聚光灯状态：present 平滑淡入淡出（0→1），target 为当前 hover 星球的世界坐标。
  let ufoPresent = 0;
  const ufoTarget = new THREE.Vector3();
  const ufoScale = new THREE.Vector3();
  const camToBody = new THREE.Vector3();
  const ufoPos = new THREE.Vector3();
  const beamDir = new THREE.Vector3();
  const beamDirNeg = new THREE.Vector3();
  const camUp = new THREE.Vector3();
  const camRight = new THREE.Vector3();
  const ufoScreen = new THREE.Vector3();
  const upAxis = new THREE.Vector3(0, 1, 0);
  const ufoQuat = new THREE.Quaternion();

  const setHovered = (body) => {
    if (body) {
      clearTimeout(hoverLeaveTimer);
      hoverLeaveTimer = 0;
    }
    if (hoveredBody === body) return;
    if (hoveredBody) bodyNodes.get(hoveredBody)?.classList.remove('is-three-hovered');
    hoveredBody = body;
    if (!body) {
      hoverExitGrace = null;
      lastBodyPointer = null;
      hoverExitDeadline = 0;
    }
    if (body) bodyNodes.get(body)?.classList.add('is-three-hovered');
    universe.dataset.activeBody = body || '';
    universe.dataset.sceneFocus = body ? 'true' : 'false';
    const controlsVisible = Boolean(body && body !== 'sun');
    universe.dataset.ufoControls = controlsVisible ? 'visible' : 'hidden';
    ufoControls?.setAttribute('aria-hidden', String(!controlsVisible));
    canvas.style.cursor = body && (bodyNodes.get(body)?.matches('a')) ? 'pointer' : 'default';
  };
  const pointerWithinNode = (node) => {
    if (!node || !Number.isFinite(pointerClient.x) || !Number.isFinite(pointerClient.y)) return false;
    const rect = node.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const radius = Math.min(rect.width, rect.height) / 2;
    return Math.hypot(pointerClient.x - centerX, pointerClient.y - centerY) <= radius;
  };
  const shouldRetainHoveredBody = (includeControlFocus = true) => {
    const activeNode = hoveredBody && bodyNodes.get(hoveredBody);
    return Boolean(ufoControls?.matches(':hover'))
      || Boolean(includeControlFocus && ufoControls?.contains(document.activeElement))
      || pointerWithinNode(activeNode)
      || Boolean(activeNode?.contains(document.activeElement));
  };
  const scheduleHoverClear = (delay = 120, includeControlFocus = true) => {
    clearTimeout(hoverLeaveTimer);
    hoverLeaveTimer = window.setTimeout(() => {
      const retained = shouldRetainHoveredBody(includeControlFocus);
      const corridorRemaining = hoverExitGrace
        ? Math.max(0, hoverExitDeadline - performance.now())
        : 0;
      if (retained) return;
      if (corridorRemaining > 0) {
        scheduleHoverClear(corridorRemaining, includeControlFocus);
        return;
      }
      setHovered(null);
    }, delay);
  };
  const pointInTriangle = (point, first, second, third) => {
    const sign = (left, right, top) => (
      (left.x - top.x) * (right.y - top.y) - (right.x - top.x) * (left.y - top.y)
    );
    const sideA = sign(point, first, second);
    const sideB = sign(point, second, third);
    const sideC = sign(point, third, first);
    return !((sideA < 0 || sideB < 0 || sideC < 0)
      && (sideA > 0 || sideB > 0 || sideC > 0));
  };
  const makeControlCorridor = (origin) => {
    if (!ufoControls || hoveredBody === 'sun') return null;
    const rect = ufoControls.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const horizontal = Math.abs(centerX - origin.x) > Math.abs(centerY - origin.y);
    const padding = 28;

    if (horizontal) {
      const edgeX = centerX > origin.x ? rect.left - padding : rect.right + padding;
      return {
        origin,
        first: { x: edgeX, y: rect.top - padding },
        second: { x: edgeX, y: rect.bottom + padding },
      };
    }
    const edgeY = centerY > origin.y ? rect.top - padding : rect.bottom + padding;
    return {
      origin,
      first: { x: rect.left - padding, y: edgeY },
      second: { x: rect.right + padding, y: edgeY },
    };
  };

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    renderer.setSize(rect.width, rect.height, false);
    camera.aspect = rect.width / Math.max(rect.height, 1);
    const mobile = rect.width < 500;
    camera.position.set(0, mobile ? 10.2 : 9.6, mobile ? 16.4 : 15.6);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    universe.dataset.layout = 'fitted';
  };

  const projectLabels = (now) => {
    const rect = canvas.getBoundingClientRect();
    const host = universe.getBoundingClientRect();
    const offsetX = rect.left - host.left;
    const offsetY = rect.top - host.top;
    const vector = new THREE.Vector3();
    const world = new THREE.Vector3();
    const edge = new THREE.Vector3();
    const cameraRight = new THREE.Vector3();
    const worldScale = new THREE.Vector3();
    const labelDirection = { mercury: -1, moon: -1 };
    const mobile = rect.width < 440;
    const mobileLabelOffsets = {
      mercury: { x: -18, y: -5 },
      moon: { x: 20, y: -9 },
      earth: { x: 30, y: -3 },
      mars: { x: 16, y: 14 },
      jupiter: { x: -22, y: -4 },
      saturn: { x: -20, y: 7 },
      neptune: { x: 16, y: -4 },
    };
    for (const item of items) {
      const node = bodyNodes.get(item.body);
      if (!node) continue;
      item.object.getWorldPosition(world);
      item.object.getWorldScale(worldScale);
      vector.copy(world).project(camera);
      cameraRight.set(1, 0, 0).applyQuaternion(camera.quaternion).multiplyScalar(worldScale.x);
      edge.copy(world).add(cameraRight).project(camera);
      const x = (vector.x * .5 + .5) * rect.width + offsetX;
      const y = (-vector.y * .5 + .5) * rect.height + offsetY;
      const radiusPixels = Math.max(5, Math.abs(edge.x - vector.x) * rect.width * .5);
      const labelOffset = mobile ? mobileLabelOffsets[item.body] : null;
      const labelY = (
        labelDirection[item.body] === -1 ? -(radiusPixels + 43) : radiusPixels + 14
      ) + (labelOffset?.y || 0);
      const visible = vector.z < 1;
      const last = item.labelPos || (item.labelPos = { x: NaN, y: NaN, t: 0 });
      // The hit-area is a DOM element that tracks the 3D projection. With orbital motion every frame
      // shifts it, and a pointer (Playwright, or a real fast cursor) can never satisfy the
      // "stable across two frames" hover check. Throttle position writes to ~180ms so the element is
      // stationary within any short sampling window; the focused body freezes outright while it flies in.
      const frozen = hoveredBody === item.body;
      const settled = Math.abs(x - last.x) < .6 && Math.abs(y - last.y) < .6;
      if (!frozen && (now - last.t > 180 || settled)) {
        node.style.setProperty('--scene-x', `${x.toFixed(1)}px`);
        node.style.setProperty('--scene-y', `${y.toFixed(1)}px`);
        last.x = x;
        last.y = y;
        last.t = now;
      }
      node.style.setProperty('--scene-depth', `${clamp((1 - vector.z) * .68, .82, 1.08).toFixed(2)}`);
      const hitSize = Math.max(46, radiusPixels * 2.0);
      if (!frozen && Math.abs(hitSize - (item.lastHit ?? NaN)) > 1) {
        node.style.setProperty('--hit-size', `${hitSize.toFixed(1)}px`);
        item.lastHit = hitSize;
      }
      node.style.setProperty('--label-x', `${labelOffset?.x || 0}px`);
      node.style.setProperty('--label-y', `${labelY.toFixed(1)}px`);
      node.toggleAttribute('data-behind-camera', !visible);
    }
    sun.getWorldPosition(vector);
    vector.project(camera);
    const sunNode = bodyNodes.get('sun');
    sunNode.style.setProperty('--scene-x', `${((vector.x * .5 + .5) * rect.width + offsetX).toFixed(1)}px`);
    sunNode.style.setProperty('--scene-y', `${((-vector.y * .5 + .5) * rect.height + offsetY).toFixed(1)}px`);
  };

  // Temp vectors reused each pick call to avoid allocation in hot path.
  const _pickScreenPos = { x: 0, y: 0 };
  const _pickWorldPos = new THREE.Vector3();
  const _pickA = new THREE.Vector3();
  const _pickB = new THREE.Vector3();
  const screenDistFromPointer = (world) => {
    _pickWorldPos.copy(world).project(camera);
    _pickScreenPos.x = _pickWorldPos.x;
    _pickScreenPos.y = _pickWorldPos.y;
    return Math.hypot(pointer.x - _pickScreenPos.x, pointer.y - _pickScreenPos.y);
  };

  const pick = () => {
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(pickables, false);
    if (hits.length === 1) {
      emptyFrames = 0;
      setHovered(hits[0].object.userData.body || null, 'raycast');
    } else if (hits.length > 1) {
      // When planets overlap on screen, pick the one whose 2D center is closest
      // to the mouse — respects user intent over arbitrary 3D depth order.
      let bestHit = hits[0];
      let bestDist = screenDistFromPointer((objectByBody.get(hits[0].object.userData.body) || sun).getWorldPosition(_pickA));
      for (let i = 1; i < hits.length; i++) {
        const obj = objectByBody.get(hits[i].object.userData.body);
        const dist = obj ? screenDistFromPointer(obj.getWorldPosition(_pickB)) : Infinity;
        if (dist < bestDist) {
          bestDist = dist;
          bestHit = hits[i];
        }
      }
      emptyFrames = 0;
      setHovered(bestHit.object.userData.body || null, 'raycast');
    } else if (hoveredBody) {
      emptyFrames += 1;
      if (emptyFrames > 6) setHovered(null);
    }
  };
  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    cameraTarget.x = pointer.x;
    cameraTarget.y = pointer.y;
    pick();
  }, { passive: true });
  canvas.addEventListener('pointerleave', () => {
    pointer.set(2, 2);
    cameraTarget.set(0, 0);
    setHovered(null);
  });
  canvas.addEventListener('click', () => {
    const node = hoveredBody && bodyNodes.get(hoveredBody);
    if (node?.matches('a')) location.hash = node.getAttribute('href');
  });
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    running = false;
    universe.classList.remove('three-ready');
    delete universe.dataset.scene;
  }, { once: true });
  for (const [body, node] of bodyNodes) {
    node.addEventListener('pointerenter', (event) => {
      pointerClient.x = event.clientX;
      pointerClient.y = event.clientY;
      lastBodyPointer = { x: pointerClient.x, y: pointerClient.y };
      hoverExitGrace = null;
      hoverExitDeadline = 0;
      setHovered(body, 'dom');
    });
    const leaveBody = (event) => {
      if (hoveredBody !== body) return;
      pointerClient.x = event.clientX;
      pointerClient.y = event.clientY;
      const rect = node.getBoundingClientRect();
      hoverExitGrace = makeControlCorridor(lastBodyPointer || {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });
      hoverExitDeadline = performance.now() + 520;
      const movingToControls = Boolean(ufoControls?.contains(event.relatedTarget))
        || Boolean(hoverExitGrace && pointInTriangle(
          pointerClient,
          hoverExitGrace.origin,
          hoverExitGrace.first,
          hoverExitGrace.second,
        ));
      if (!movingToControls) {
        hoverExitGrace = null;
        hoverExitDeadline = 0;
        setHovered(null);
        return;
      }
      scheduleHoverClear();
    };
    node.addEventListener('pointerleave', leaveBody);
    node.addEventListener('mouseleave', leaveBody);
    node.addEventListener('focusin', () => setHovered(body, 'focus'));
    node.addEventListener('focusout', () => scheduleHoverClear(100));
  }
  const handleHoverPointerMove = (event) => {
    const point = { x: event.clientX, y: event.clientY };
    pointerClient.x = point.x;
    pointerClient.y = point.y;
    const activeNode = hoveredBody && bodyNodes.get(hoveredBody);
    if (!activeNode || ufoControls?.matches(':hover') || ufoControls?.contains(event.target)) return;
    if (pointerWithinNode(activeNode)) {
      lastBodyPointer = point;
      hoverExitGrace = null;
      hoverExitDeadline = 0;
      clearTimeout(hoverLeaveTimer);
      return;
    }
    if (!hoverExitGrace) {
      const rect = activeNode.getBoundingClientRect();
      hoverExitGrace = makeControlCorridor(lastBodyPointer || {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });
      hoverExitDeadline = performance.now() + 520;
      scheduleHoverClear();
    }
    if (!hoverExitGrace) return;
    const nearExit = Math.hypot(
      point.x - hoverExitGrace.origin.x,
      point.y - hoverExitGrace.origin.y,
    ) < 24;
    if (nearExit) return;
    if (performance.now() < hoverExitDeadline && pointInTriangle(
      point,
      hoverExitGrace.origin,
      hoverExitGrace.first,
      hoverExitGrace.second,
    )) {
      scheduleHoverClear(140);
      return;
    }
    hoverExitGrace = null;
    hoverExitDeadline = 0;
    setHovered(null);
  };
  document.addEventListener('pointermove', handleHoverPointerMove, { passive: true });
  document.addEventListener('mousemove', handleHoverPointerMove, { passive: true });
  ufoControls?.addEventListener('pointerenter', () => {
    hoverExitGrace = null;
    hoverExitDeadline = 0;
    clearTimeout(hoverLeaveTimer);
  });
  ufoControls?.addEventListener('pointerleave', () => {
    scheduleHoverClear(120, false);
  });
  ufoControls?.addEventListener('focusin', () => clearTimeout(hoverLeaveTimer));
  ufoControls?.addEventListener('focusout', () => scheduleHoverClear(100));

  const animate = (now) => {
    requestAnimationFrame(animate);
    if (!running) return;
    if (document.hidden || now - lastRender < 30) return;
    const delta = Math.min((now - lastFrame) / 1000, .08);
    lastFrame = now;
    lastRender = now;
    const paused = document.documentElement.dataset.cosmicMotion === 'paused';
    const onHome = !document.querySelector('[data-view="home"]').hidden;
    if (!onHome) return;
    if (!paused) {
      const timeScale = parseFloat(document.documentElement.dataset.timeScale || '1') || 1;
      sunMaterial.uniforms.uTime.value = now / 1000;
      for (const item of items) {
        item.object.rotation.y += delta * timeScale * (hoveredBody === item.body ? 1.8 : .28);
        item.object.children.find((child) => child.userData.cloudLayer)?.rotateY(delta * timeScale * .08);
        item.pivot.rotation.y += delta * item.speed * timeScale * .34;
        // 更新拖尾弧：从行星当前角度沿轨道向后铺一段，随公转移动
        if (item.trail) {
          const head = item.pivot.rotation.y;
          const span = .55; // 拖尾弧跨越的弧度
          const r = item.orbit;
          const pos = item.trail.positions;
          const seg = item.trail.segments;
          for (let s = 0; s <= seg; s++) {
            const a = head - (s / seg) * span;
            pos[s * 3] = Math.cos(a) * r;
            pos[s * 3 + 1] = 0;
            pos[s * 3 + 2] = Math.sin(a) * r;
          }
          item.trail.line.geometry.attributes.position.needsUpdate = true;
        }
      }
      // 小行星带整体缓慢绕行
      beltGroup.rotation.y += delta * timeScale * .02;
      dustPoints.rotation.y += delta * timeScale * .004;
      // 流星：倒计时到点后生成，生命期内推进并淡入淡出，结束后重排下一次
      for (const meteor of meteors) {
        if (meteor.life <= 0) {
          meteor.delay -= delta * timeScale;
          if (meteor.delay <= 0) { spawnMeteor(meteor); }
          else { meteor.material.opacity = 0; continue; }
        }
        meteor.life += delta * timeScale;
        const progress = meteor.life / meteor.duration;
        if (progress >= 1) {
          meteor.material.opacity = 0;
          meteor.life = 0;
          meteor.delay = 2.5 + Math.random() * 6;
          continue;
        }
        const traveled = meteor.speed * meteor.life;
        const hx = meteor.from.x + meteor.dir.x * traveled;
        const hy = meteor.from.y + meteor.dir.y * traveled;
        const hz = meteor.from.z + meteor.dir.z * traveled;
        const p = meteor.positions;
        p[0] = hx; p[1] = hy; p[2] = hz;
        p[3] = hx - meteor.dir.x * meteor.length;
        p[4] = hy - meteor.dir.y * meteor.length;
        p[5] = hz - meteor.dir.z * meteor.length;
        meteor.trail.geometry.attributes.position.needsUpdate = true;
        meteor.material.opacity = Math.sin(progress * Math.PI) * .9;
      }
    }
    for (const item of items) {
      const target = hoveredBody === item.body ? 1.12 : 1;
      const current = item.object.scale.x / item.baseScale;
      const next = THREE.MathUtils.lerp(current, target, .12);
      item.object.scale.setScalar(item.baseScale * next);
      const material = orbitMaterials.get(item.body);
      if (material) {
        material.opacity = THREE.MathUtils.lerp(material.opacity, hoveredBody === item.body ? .82 : .2, .12);
        material.color.lerp(new THREE.Color(hoveredBody === item.body ? 0xd3b88b : 0x58616a), .12);
      }
    }
    const homeY = rectWidth() < 500 ? 10.2 : 9.6;
    const homeZ = rectWidth() < 500 ? 16.4 : 15.6;
    homePos.set(cameraTarget.x * .38, homeY + cameraTarget.y * .22, homeZ);
    const focusObject = hoveredBody && objectByBody.get(hoveredBody);
    if (focusObject) {
      focusObject.getWorldPosition(bodyWorld);
      const radius = radiusByBody.get(hoveredBody) || .4;
      // camera sits outside the body along the origin→body ray, so the focused body fills the
      // foreground while everything nearer the center recedes and shrinks by perspective.
      focusDir.copy(bodyWorld);
      if (focusDir.lengthSq() < .0001) focusDir.set(0, 0, 1);
      focusDir.normalize();
      const standoff = radius * 3.1 + 1.15;
      desiredPos.copy(bodyWorld).addScaledVector(focusDir, standoff);
      desiredPos.y += radius * .85 + .35;
      focusPoint.copy(bodyWorld);
    } else {
      desiredPos.copy(homePos);
      focusPoint.set(0, 0, 0);
    }
    const baseEase = focusObject ? .12 : .2;
    const ease = 1 - Math.pow(1 - baseEase, delta * 60);
    camera.position.lerp(desiredPos, ease);
    camLookAt.lerp(focusPoint, ease);
    camera.lookAt(camLookAt);
    const cameraHomeDistance = camera.position.distanceTo(homePos);
    universe.dataset.cameraState = focusObject
      ? 'focused'
      : cameraHomeDistance < .75
        ? 'overview'
        : 'returning';

    // 飞碟聚光灯：hover 非太阳天体时淡入并停在星球前上方，锥形光束斜射照亮正对观众的暗面。
    const ufoBody = hoveredBody && hoveredBody !== 'sun' ? objectByBody.get(hoveredBody) : null;
    ufoPresent = THREE.MathUtils.lerp(ufoPresent, ufoBody ? 1 : 0, ufoBody ? .1 : .16);
    if (ufoPresent > .002 || ufoBody) {
      if (ufoBody) {
        ufoBody.getWorldPosition(ufoTarget);
        ufoBody.getWorldScale(ufoScale);
      }
      const bodyRadius = ufoScale.x || .4;
      // 飞碟先相对相机停在星球斜上方，再按屏幕投影收进安全区；否则超宽屏聚焦大行星时碟身会越过 Canvas 顶边。
      camToBody.copy(camera.position).sub(ufoTarget);
      const camDist = camToBody.length();
      camToBody.normalize();
      camUp.set(0, 1, 0).applyQuaternion(camera.quaternion).normalize(); // 相机的屏幕上方
      camRight.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
      const bob = Math.sin(now / 620) * camDist * .008;
      const upOff = camDist * .14 + bodyRadius * .42 + bob;
      const backOff = camDist * .18 + bodyRadius * .3;
      const sideOff = camDist * .025 + bodyRadius * .18;
      ufoPos.copy(ufoTarget)
        .addScaledVector(camUp, upOff)
        .addScaledVector(camRight, sideOff)
        .addScaledVector(camToBody, backOff);
      const craftScale = clamp(camDist * .05, .12, .46);

      const ufoDepth = camera.position.distanceTo(ufoPos);
      const halfHeight = ufoDepth * Math.tan(THREE.MathUtils.degToRad(camera.fov * .5));
      const halfWidth = halfHeight * camera.aspect;
      const maxNdcY = rectWidth() < 500 ? .48 : .58;
      const minNdcY = -.68;
      const maxNdcX = rectWidth() < 500 ? .7 : .78;
      ufoScreen.copy(ufoPos).project(camera);
      if (ufoScreen.y > maxNdcY) ufoPos.addScaledVector(camUp, -(ufoScreen.y - maxNdcY) * halfHeight);
      if (ufoScreen.y < minNdcY) ufoPos.addScaledVector(camUp, (minNdcY - ufoScreen.y) * halfHeight);
      ufoScreen.copy(ufoPos).project(camera);
      if (ufoScreen.x > maxNdcX) ufoPos.addScaledVector(camRight, -(ufoScreen.x - maxNdcX) * halfWidth);
      if (ufoScreen.x < -maxNdcX) ufoPos.addScaledVector(camRight, (-maxNdcX - ufoScreen.x) * halfWidth);

      // 光束轴：飞碟 → 星球中心
      beamDir.copy(ufoTarget).sub(ufoPos);
      const beamLen = beamDir.length();
      beamDir.normalize();
      // 碟身与光束都让本地 +Y 对齐到 −beamDir：碟底朝星球、光束窄端贴飞碟。
      beamDirNeg.copy(beamDir).negate();
      ufoQuat.setFromUnitVectors(upAxis, beamDirNeg);

      ufo.visible = ufoPresent > .002;
      beam.visible = ufoPresent > .002;
      ufo.position.copy(ufoPos);
      ufo.quaternion.copy(ufoQuat);
      craft.scale.setScalar(craftScale * ufoPresent);
      spinningHull.rotation.y += delta * .85;
      alienPilot.position.y = .13 + Math.sin(now / 430) * .008;
      alienPilot.lookAt(camera.position);
      alienPilot.rotateY(.14 + Math.sin(now / 920) * .035);
      alienPilot.rotateZ(Math.sin(now / 520) * .055);
      const breathing = 1 + Math.sin(now / 360) * .025;
      alienBody.scale.y = .17 * breathing;
      leftArm.rotation.z = -.62 + Math.sin(now / 470) * .045;
      rightArm.rotation.z = .62 - Math.sin(now / 470) * .045;
      leftHand.position.y = -.025 + Math.sin(now / 470) * .006;
      rightHand.position.y = leftHand.position.y;
      const blinkDistance = Math.abs((now % 4200) - 4050);
      const blink = blinkDistance < 120 ? .18 + blinkDistance / 120 * .82 : 1;
      leftEye.scale.y = .092 * blink;
      rightEye.scale.y = .092 * blink;
      leftEyeShine.visible = blink > .45;
      rightEyeShine.visible = blink > .45;
      const antennaPulse = 1 + Math.sin(now / 250) * .12;
      leftAntennaTip.scale.setScalar(antennaPulse);
      rightAntennaTip.scale.setScalar(antennaPulse);
      antennaTipMaterial.emissiveIntensity = .2 + Math.sin(now / 250) * .05;
      cabinLight.intensity = (.16 + Math.sin(now / 420) * .025) * ufoPresent;
      const craftGlowScale = clamp(.62 + ufoIntensityScale * .12, .62, .84);
      rimMaterial.opacity = (.12 + Math.sin(now / 180) * .035) * ufoPresent * craftGlowScale;
      emitterMaterial.opacity = (.17 + Math.sin(now / 150) * .045) * ufoPresent * craftGlowScale;
      bulbMaterial.opacity = (.19 + Math.sin(now / 210) * .055) * ufoPresent * craftGlowScale;
      saucer.material.opacity = ufoPresent;
      dome.material.opacity = .16 * ufoPresent;

      // 光束锥：单位锥（+Y 顶细 / -Y 底宽）沿飞碟→星球轴，base 落到星球上缘。
      const beamBotR = bodyRadius * .94;
      beam.position.copy(ufoPos).addScaledVector(beamDir, beamLen / 2);
      beam.quaternion.copy(ufoQuat);
      beam.scale.set(beamBotR, beamLen, beamBotR);
      beamMaterial.uniforms.uOpacity.value = ufoPresent * clamp(.16 * ufoIntensityScale, .055, .28);

      // 飞碟仅作叙事点缀；灯光预算集中到星球表面，确保视觉重心仍是被聚焦的天体。
      const planetLightScale = clamp(.82 + ufoIntensityScale * .34, .9, 1.45);
      abductLight.position.copy(ufoPos);
      abductLight.target.position.copy(ufoTarget);
      abductLight.intensity = ufoPresent * (3.5 + bodyRadius * 2.5) * planetLightScale;
      abductLight.distance = beamLen + bodyRadius * 2 + 2;
      abductLight.angle = Math.atan2(beamBotR, beamLen) + .12;
      // 补光贴相机侧，提亮正对观众那面（斜聚光灯仍可能留边缘暗区）。
      abductFill.position.copy(ufoTarget).addScaledVector(camToBody, bodyRadius + .6);
      abductFill.position.y += bodyRadius * .4;
      abductFill.intensity = ufoPresent * (5.5 + bodyRadius * 4.5) * planetLightScale;
      abductFill.distance = bodyRadius * 4 + 3;

      ufoScreen.copy(ufoPos).project(camera);
      universe.dataset.ufoState = ufoBody ? 'active' : 'leaving';
      universe.dataset.ufoFrame = (
        Math.abs(ufoScreen.x) <= maxNdcX + .01
        && ufoScreen.y <= maxNdcY + .01
        && ufoScreen.y >= minNdcY - .01
      ) ? 'safe' : 'edge';
    } else {
      ufo.visible = false;
      beam.visible = false;
      abductLight.intensity = 0;
      abductFill.intensity = 0;
      universe.dataset.ufoState = 'idle';
      universe.dataset.ufoFrame = 'safe';
    }

    renderer.render(scene, camera);
    projectLabels(now);
  };
  const rectWidth = () => universe.getBoundingClientRect().width;
  new ResizeObserver(resize).observe(universe);
  resize();
  renderer.render(scene, camera);
  projectLabels(performance.now());
  universe.classList.add('three-ready');
  universe.dataset.scene = 'three';
  universe.dataset.decor = 'belt-meteors';
  universe.dataset.ufoState = 'idle';
  universe.dataset.ufoFrame = 'safe';
  universe.dataset.ufoLight = ufoColor === 'moon' ? 'moonlight' : ufoColor;
  universe.dataset.ufoStyle = 'chibi-alien-3d';
  universe.dataset.ufoSize = 'compact';
  universe.dataset.hoverEmphasis = 'planet';
  universe.dataset.hoverRelease = 'bounded-fast-return-v2';
  universe.dataset.cameraState = 'overview';
  universe.dataset.ufoControls = 'hidden';
  const startupMs = performance.now();
  universe.dataset.startupMs = String(Math.round(startupMs));
  universe.dataset.startupPerformance = startupMs < 3000 ? 'fast' : 'slow';
  window.dispatchEvent(new CustomEvent('cosmos:three-ready'));
  requestAnimationFrame(animate);
})();
