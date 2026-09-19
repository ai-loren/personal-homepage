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
        const clouds = new THREE.Mesh(getSphere(64), new THREE.MeshStandardMaterial({
          map: cloudTextureFromImageData(cloudData),
          transparent: true,
          opacity: .72,
          depthWrite: false,
          roughness: 1,
        }));
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
  const craft = new THREE.Group(); // 只缩放碟身，光束/聚光灯用世界尺寸单独算
  ufo.add(craft);

  const saucerProfile = [
    [0, .34], [.26, .22], [.46, .14], [1, 0], [.46, -.11], [.16, -.15], [0, -.16],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const saucer = new THREE.Mesh(
    new THREE.LatheGeometry(saucerProfile, 44),
    new THREE.MeshStandardMaterial({ color: 0x93a7bd, metalness: .82, roughness: .32, emissive: 0x1b2f42, emissiveIntensity: .7, transparent: true, opacity: 1 }),
  );
  craft.add(saucer);
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(.3, 30, 18, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x9fe8ff, metalness: .1, roughness: .12, transparent: true, opacity: .55, emissive: 0x2f7ea0, emissiveIntensity: .6 }),
  );
  dome.position.y = .12;
  craft.add(dome);
  const rimMaterial = new THREE.MeshBasicMaterial({ color: 0xffd873, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false });
  const rimLights = new THREE.Mesh(new THREE.TorusGeometry(.7, .055, 14, 44), rimMaterial);
  rimLights.rotation.x = Math.PI / 2;
  rimLights.position.y = -.02;
  craft.add(rimLights);
  const emitterMaterial = new THREE.MeshBasicMaterial({ color: 0xffe9b0, transparent: true, opacity: .95, blending: THREE.AdditiveBlending, depthWrite: false });
  const emitter = new THREE.Mesh(new THREE.SphereGeometry(.17, 20, 12), emitterMaterial);
  emitter.position.y = -.12;
  craft.add(emitter);

  // 光束：向下张开的锥体（apex 在碟底、base 在星球表面）；shader 做边缘发光 + 纵向渐变，加色混合出体积感。
  const beamMaterial = new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0 }, uColor: { value: new THREE.Color(0xffdb8a) } },
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
  const abductLight = new THREE.SpotLight(0xffe4a6, 0, 16, Math.PI / 6, .55, 1.1);
  scene.add(abductLight);
  scene.add(abductLight.target);
  // 补光：贴相机侧的点光，专门提亮星球正对观众那面（垂直聚光灯只亮顶冠，解决不了"太暗"）。
  const abductFill = new THREE.PointLight(0xffe0a0, 0, 6, 1.4);
  scene.add(abductFill);

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
  const upAxis = new THREE.Vector3(0, 1, 0);
  const ufoQuat = new THREE.Quaternion();

  const setHovered = (body) => {
    if (hoveredBody === body) return;
    if (hoveredBody) bodyNodes.get(hoveredBody)?.classList.remove('is-three-hovered');
    hoveredBody = body;
    if (body) bodyNodes.get(body)?.classList.add('is-three-hovered');
    universe.dataset.activeBody = body || '';
    universe.dataset.sceneFocus = body ? 'true' : 'false';
    canvas.style.cursor = body && (bodyNodes.get(body)?.matches('a')) ? 'pointer' : 'default';
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
      const hitSize = Math.max(46, radiusPixels * 2.25);
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

  const pick = () => {
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(pickables, false)[0];
    if (hit) {
      emptyFrames = 0;
      setHovered(hit.object.userData.body || null);
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
    node.addEventListener('pointerenter', () => setHovered(body));
    node.addEventListener('pointerleave', () => setHovered(null));
    node.addEventListener('focusin', () => setHovered(body));
    node.addEventListener('focusout', () => setHovered(null));
  }

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
    const ease = focusObject ? .12 : .05;
    camera.position.lerp(desiredPos, ease);
    camLookAt.lerp(focusPoint, ease);
    camera.lookAt(camLookAt);

    // 飞碟聚光灯：hover 非太阳天体时淡入并停在星球前上方，锥形光束斜射照亮正对观众的暗面。
    const ufoBody = hoveredBody && hoveredBody !== 'sun' ? objectByBody.get(hoveredBody) : null;
    ufoPresent = THREE.MathUtils.lerp(ufoPresent, ufoBody ? 1 : 0, ufoBody ? .1 : .16);
    if (ufoPresent > .002 || ufoBody) {
      if (ufoBody) {
        ufoBody.getWorldPosition(ufoTarget);
        ufoBody.getWorldScale(ufoScale);
      }
      const bodyRadius = ufoScale.x || .4;
      // 飞碟相对相机放置：距离与偏移都按"相机到星球的距离"归一化，无论 fly-to 拉得多近，
      // 飞碟都稳定停在画面里星球的斜上方、不会被顶出视口，光束顺势斜射下来（贴合参考图构图）。
      camToBody.copy(camera.position).sub(ufoTarget);
      const camDist = camToBody.length();
      camToBody.normalize();
      camUp.set(0, 1, 0).applyQuaternion(camera.quaternion).normalize(); // 相机的屏幕上方
      const bob = Math.sin(now / 620) * camDist * .01;
      const upOff = camDist * .17 + bodyRadius * .5 + bob;  // 屏上"上方"偏移（贴近星球，飞碟留在画面内）
      const backOff = camDist * .16 + bodyRadius * .3;       // 朝相机侧后退，露出飞碟与光束体积
      ufoPos.copy(ufoTarget).addScaledVector(camUp, upOff).addScaledVector(camToBody, backOff);
      const craftScale = clamp(camDist * .085, .2, .82);     // 屏上大小恒定
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
      craft.rotation.y += delta * 1.4;                  // 碟身绕自身法线自转
      rimMaterial.opacity = (.55 + Math.sin(now / 180) * .35) * ufoPresent;
      emitterMaterial.opacity = (.7 + Math.sin(now / 150) * .28) * ufoPresent;
      saucer.material.opacity = ufoPresent;
      dome.material.opacity = .55 * ufoPresent;

      // 光束锥：单位锥（+Y 顶细 / -Y 底宽）沿飞碟→星球轴，base 落到星球上缘。
      const beamBotR = bodyRadius * 1.12;
      beam.position.copy(ufoPos).addScaledVector(beamDir, beamLen / 2);
      beam.quaternion.copy(ufoQuat);
      beam.scale.set(beamBotR, beamLen, beamBotR);
      beamMaterial.uniforms.uOpacity.value = ufoPresent * .9;

      // 聚光灯从飞碟处朝星球中心照。
      abductLight.position.copy(ufoPos);
      abductLight.target.position.copy(ufoTarget);
      abductLight.intensity = ufoPresent * (30 + bodyRadius * 24);
      abductLight.distance = beamLen + bodyRadius * 2 + 2;
      abductLight.angle = Math.atan2(beamBotR, beamLen) + .12;
      // 补光贴相机侧，提亮正对观众那面（斜聚光灯仍可能留边缘暗区）。
      abductFill.position.copy(ufoTarget).addScaledVector(camToBody, bodyRadius + .6);
      abductFill.position.y += bodyRadius * .4;
      abductFill.intensity = ufoPresent * (8 + bodyRadius * 9);
      abductFill.distance = bodyRadius * 4 + 3;
    } else {
      ufo.visible = false;
      beam.visible = false;
      abductLight.intensity = 0;
      abductFill.intensity = 0;
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
  requestAnimationFrame(animate);
})();
