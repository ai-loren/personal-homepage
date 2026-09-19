(() => {
  'use strict';

  const vertexSource = `
    attribute vec2 aPosition;
    varying vec2 vUV;
    void main() {
      vUV = aPosition * .5 + .5;
      gl_Position = vec4(aPosition, 0., 1.);
    }
  `;
  const fragmentSource = `
    precision highp float;
    varying vec2 vUV;
    uniform sampler2D uSurface;
    uniform sampler2D uDetails;
    uniform float uRotation;
    uniform float uCloudRotation;
    uniform float uEarth;
    uniform float uResolution;
    const float PI = 3.14159265359;

    vec2 sphereUV(vec3 normal, float rotation) {
      return vec2(atan(normal.x, normal.z) / (2. * PI) + .5 + rotation,
        .5 - asin(clamp(normal.y, -1., 1.)) / PI);
    }

    void main() {
      vec2 point = vUV * 2. - 1.;
      float radius = length(point);
      if (radius >= 1.) discard;
      vec3 normal = vec3(point, sqrt(max(0., 1. - dot(point, point))));
      float tilt = uEarth * -.24;
      vec3 surfaceNormal = vec3(normal.x * cos(tilt) - normal.y * sin(tilt),
        normal.x * sin(tilt) + normal.y * cos(tilt), normal.z);
      vec2 uv = sphereUV(surfaceNormal, uRotation);
      vec3 light = normalize(vec3(-.65, .48, .76));
      vec3 base = texture2D(uSurface, uv).rgb;
      vec4 detail = texture2D(uDetails, uv);
      float daylight = dot(normal, light);
      float diffuse = max(daylight, 0.);
      vec3 color = base * (.09 + .98 * pow(diffuse, .82));

      if (uEarth > .5) {
        vec2 cloudUV = sphereUV(surfaceNormal, uCloudRotation);
        float clouds = texture2D(uDetails, cloudUV).r;
        float shadow = texture2D(uDetails, cloudUV + vec2(.004, .003)).r;
        color *= 1. - shadow * .2;
        vec3 cloudColor = vec3(.93, .97, 1.) * (.12 + .92 * diffuse);
        color = mix(color, cloudColor, clouds * .94);
        float ocean = 1. - detail.g;
        vec3 halfDirection = normalize(light + vec3(0., 0., 1.));
        float reflection = pow(max(dot(normal, halfDirection), 0.), 42.);
        color += vec3(.63, .75, .83) * reflection * ocean * (1. - clouds) * .32;
        float night = 1. - smoothstep(-.15, .14, daylight);
        color += vec3(1., .67, .29) * detail.b * night * (1. - clouds) * .8;
        float rim = pow(1. - normal.z, 4.);
        color += vec3(.15, .44, .85) * rim * (.13 + diffuse * .95);
        float twilight = 1. - smoothstep(.02, .23, abs(daylight));
        color += vec3(.04, .11, .21) * twilight * rim * .3;
      } else {
        vec2 stepUV = vec2(1. / 1024., 1. / 512.);
        float heightX = texture2D(uSurface, uv + vec2(stepUV.x, 0.)).r - base.r;
        float heightY = texture2D(uSurface, uv + vec2(0., stepUV.y)).r - base.r;
        float relief = clamp(1. + (heightX - heightY) * 1.8, .72, 1.22);
        color *= relief;
      }
      float alpha = smoothstep(0., 2. / uResolution, 1. - radius);
      gl_FragColor = vec4(color * alpha, alpha);
    }
  `;

  window.createGlobeRenderer = (surface, textures, kind, onLost) => {
    const canvas = document.createElement('canvas');
    let gl;
    try {
      gl = canvas.getContext('webgl', {
        alpha: true, antialias: false, depth: false, stencil: false,
        premultipliedAlpha: true, preserveDrawingBuffer: false,
      });
    } catch { return null; }
    if (!gl) return null;
    const resources = [];
    let program;
    let disposed = false;
    const cleanup = () => {
      if (disposed) return;
      disposed = true;
      for (const [type, item] of resources) {
        if (type === 'shader') gl.deleteShader(item);
        else if (type === 'texture') gl.deleteTexture(item);
        else if (type === 'buffer') gl.deleteBuffer(item);
      }
      if (program) gl.deleteProgram(program);
      canvas.remove();
    };
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error('Shader allocation failed');
      resources.push(['shader', shader]);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('Shader compilation failed');
      return shader;
    };
    try {
      program = gl.createProgram();
      if (!program) throw new Error('Program allocation failed');
      gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Shader link failed');
      gl.useProgram(program);
      const buffer = gl.createBuffer();
      if (!buffer) throw new Error('Buffer allocation failed');
      resources.push(['buffer', buffer]);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, 'aPosition');
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      [textures.surface, textures.details].forEach((image, index) => {
        const texture = gl.createTexture();
        if (!texture) throw new Error('Texture allocation failed');
        resources.push(['texture', texture]);
        gl.activeTexture(gl.TEXTURE0 + index);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, image.width, image.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, image.data);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      });
      gl.uniform1i(gl.getUniformLocation(program, 'uSurface'), 0);
      gl.uniform1i(gl.getUniformLocation(program, 'uDetails'), 1);
      gl.uniform1f(gl.getUniformLocation(program, 'uEarth'), kind === 'earth' ? 1 : 0);
      const rotation = gl.getUniformLocation(program, 'uRotation');
      const cloudRotation = gl.getUniformLocation(program, 'uCloudRotation');
      const resolution = gl.getUniformLocation(program, 'uResolution');
      let lastTime = 0;
      const draw = (elapsed) => {
        if (disposed) return;
        lastTime = elapsed;
        const angle = elapsed / (kind === 'earth' ? 180000 : 260000) + (kind === 'earth' ? .0234 : .3);
        gl.uniform1f(rotation, angle % 1);
        gl.uniform1f(cloudRotation, (angle + elapsed / 1400000) % 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      };
      const resize = () => {
        if (disposed) return;
        const width = surface.getBoundingClientRect().width;
        if (!width) return;
        const size = Math.min(640, Math.max(96, Math.round(width * Math.min(devicePixelRatio || 1, 2))));
        if (canvas.width !== size || canvas.height !== size) {
          canvas.width = size;
          canvas.height = size;
          gl.viewport(0, 0, size, size);
          gl.uniform1f(resolution, size);
        }
        draw(lastTime);
      };
      canvas.className = 'planet-gpu';
      canvas.setAttribute('aria-hidden', 'true');
      surface.parentElement.append(canvas);
      const observer = new ResizeObserver(resize);
      observer.observe(surface);
      const destroy = () => {
        observer.disconnect();
        surface.parentElement.classList.remove('gpu-ready');
        surface.dataset.renderer = 'canvas';
        cleanup();
      };
      canvas.addEventListener('webglcontextlost', (event) => {
        event.preventDefault();
        destroy();
        onLost();
      }, { once: true });
      resize();
      if (gl.getError() !== gl.NO_ERROR) {
        destroy();
        return null;
      }
      surface.parentElement.classList.add('gpu-ready');
      surface.dataset.renderer = 'webgl';
      return { draw, destroy };
    } catch {
      cleanup();
      return null;
    }
  };
})();
