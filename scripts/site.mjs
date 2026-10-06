import { createServer } from 'node:http';
import { lstat, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import { CAREER_VISIBILITY } from '../site.config.mjs';

export const PROJECT_ROOT = fileURLToPath(new URL('../', import.meta.url));
const ALL_CAREERS_LABEL = '全部履历';
const OUTPUT_MARKER = 'personal-homepage public output v1\n';
const ASSET_PATH = /^\.\/assets\/[a-zA-Z0-9_-]+\.(png|webp|jpe?g|svg)$/;
const PUBLIC_FILES = [
  'index.html', 'styles.css', 'app.js', 'cosmos.js', 'globe-renderer.js',
  'solar-system-3d.js', 'page-scenes.js', 'tools/vram-ledger.js', 'tools/ckpt-goodput/ckpt-goodput.js', 'tools/agent-trace-replay/agent-trace-replay.js', '.nojekyll',
  'assets/saturn-favicon.png',
  'vendor/three.min.js', 'vendor/THREE-LICENSE.txt',
  'vendor/fonts/cormorant-garamond.ttf', 'vendor/fonts/ibm-plex-mono.ttf',
  'vendor/fonts/ibm-plex-mono-semibold.ttf', 'vendor/fonts/IBM-PLEX-OFL.txt', 'vendor/fonts/OFL.txt',
  'vendor/fonts/manrope.ttf', 'vendor/fonts/noto-serif-sc-subset.woff2',
  'vendor/fonts/pinyon-script.ttf',
];
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ttf': 'font/ttf',
  '.woff2': 'font/woff2', '.csv': 'text/csv; charset=utf-8', '.mp3': 'audio/mpeg',
};
const DATASET_PATH = /^\.\/data\/lab\/[a-z0-9-]+\/[a-z0-9_-]+\.csv$/;
const PROJECT_IMAGE_PATH = /^\.\/assets\/projects\/[a-z0-9-]+\/[a-z0-9_-]+\.(png|webp|jpe?g)$/;
const TRACK_PATH = /^\.\/audio\/[a-z0-9-]+\.mp3$/;

async function readSourceFile(root, name) {
  const sourceRoot = await realpath(root);
  const path = resolve(sourceRoot, name);
  const actual = await realpath(path);
  if (!actual.startsWith(sourceRoot + sep) || (await lstat(path)).isSymbolicLink()) {
    throw new Error(`Public asset ${name} must be a regular file inside the project. Remove the symlink or use a local copy.`);
  }
  return readFile(path);
}

export async function readSourceContent(root = PROJECT_ROOT, name = 'content.js') {
  const source = await readSourceFile(root, name);
  const context = { window: {} };
  runInNewContext(source.toString('utf8'), context, { filename: name, timeout: 1000 });
  return JSON.parse(JSON.stringify(context.window.SITE_CONTENT));
}

// 公司名单、菜单上的名字（modeName）和额外的防泄漏词（privateMarkers）都来自 content.js；后两者只供构建使用，不随公开内容发布。
export function selectPublicContent(source, visibility = CAREER_VISIBILITY) {
  const companies = source.experience || [];
  const ids = companies.map((company) => company.id);
  if (!ids.length || new Set(ids).size !== ids.length || ids.some((id) => typeof id !== 'string' || !/^[a-z0-9-]+$/.test(id) || id === 'all')) {
    throw new Error(`content.js expects experience to list at least one company, each with a unique id of lowercase letters, digits or hyphens ("all" is reserved); got ${JSON.stringify(ids)}. Fix the ids before publishing.`);
  }
  if (visibility !== 'all' && !ids.includes(visibility)) {
    throw new Error(`CAREER_VISIBILITY expects "all" or one of ${ids.map((id) => JSON.stringify(id)).join(', ')} (the company ids in content.js experience); got ${JSON.stringify(visibility)}. Fix site.config.mjs before publishing.`);
  }
  const names = Object.fromEntries(companies.map((company) => [company.id, company.modeName || company.company]));
  const content = structuredClone(source);
  content.experience = content.experience
    .filter((company) => visibility === 'all' || company.id === visibility)
    .map(({ modeName, privateMarkers, ...company }) => company);
  content.careerMode = visibility;
  content.careerModes = visibility === 'all'
    ? { all: ALL_CAREERS_LABEL, ...Object.fromEntries([...ids].sort().map((id) => [id, names[id]])) }
    : { [visibility]: names[visibility] };
  return content;
}

function assertNoPrivateCareer(files, source, publicContent) {
  const published = new Set(publicContent.experience.map((company) => company.id));
  const markers = source.experience.filter((company) => !published.has(company.id)).flatMap((company) => [
    ...(company.privateMarkers || []),
    company.company, company.profileRole, company.logo, company.logoAlt,
    ...company.roles.flatMap((role) => [
      role.title, role.logo, role.logoAlt,
      // 单词亮点不当泄漏标记：公开简介会写同一类技术词。含空格的整句亮点仍拦住未公开公司的原文。
      ...(role.highlights || []).filter((item) => /\s/.test(item)),
    ]),
  ]).filter(Boolean).map((marker) => marker.toLowerCase());
  for (const [name, buffer] of files) {
    if (!['.html', '.js', '.css', '.txt', '.csv'].includes(extname(name))) continue;
    const text = buffer.toString('utf8').toLowerCase();
    if (markers.some((marker) => text.includes(marker))) {
      throw new Error(`${name} contains an excluded company's information. Remove its public reference before building; private content.js data can remain.`);
    }
  }
}

// 筛选按钮由数据生成，拼错一个值（'应用 '、'Cli'）就会多出一个只含一个作品的按钮，所以取值必须来自 projectFacets。
export function assertProjectFacets(content) {
  const facets = content.projectFacets || [];
  const keys = facets.map((facet) => facet.key);
  if (!facets.length || new Set(keys).size !== keys.length) {
    throw new Error(`content.js expects projectFacets to list each filter dimension once; got keys ${JSON.stringify(keys)}. Declare type, uses and code (or your own dimensions) with unique keys.`);
  }
  for (const facet of facets) {
    const values = (facet.values || []).map((entry) => entry.value);
    if (!/^[a-z]+$/.test(facet.key || '') || !facet.label || !values.length || values.some((value) => typeof value !== 'string' || !value.trim()) || new Set(values).size !== values.length) {
      throw new Error(`content.js projectFacets entry expects { key: lowercase letters, label, values: [{ value, en? }, ...] } with unique non-empty values; got ${JSON.stringify(facet)}. Fix that entry.`);
    }
  }
  for (const project of content.projects || []) {
    for (const facet of facets) {
      const allowed = facet.values.map((entry) => entry.value);
      const got = project[facet.key];
      const valid = facet.multiple
        ? Array.isArray(got) && got.length > 0 && new Set(got).size === got.length && got.every((value) => allowed.includes(value))
        : allowed.includes(got);
      if (!valid) {
        const shape = facet.multiple ? `a non-empty list without repeats drawn from ${allowed.join(' / ')}` : `one of ${allowed.join(' / ')}`;
        throw new Error(`Project ${project.id} expects ${facet.key} to be ${shape}; got ${JSON.stringify(got)}. Use a declared value, or add it to projectFacets "${facet.key}" in content.js.`);
      }
    }
  }
}

export async function createPublicFiles({ visibility = CAREER_VISIBILITY, root = PROJECT_ROOT } = {}) {
  const source = await readSourceContent(root);
  const content = selectPublicContent(source, visibility);
  assertProjectFacets(content);
  const paths = new Set(PUBLIC_FILES);
  for (const company of content.experience) {
    for (const entry of [company, ...company.roles]) {
      if (!entry.logo) continue;
      if (!ASSET_PATH.test(entry.logo)) {
        throw new Error(`Logo expects ./assets/<filename>.(png|webp|jpg|jpeg|svg); got ${entry.logo}. Store the image locally without path traversal or query parameters.`);
      }
      paths.add(entry.logo.slice(2));
    }
  }
  const ownImages = [['profile.portrait', content.profile?.portrait], ...(content.journey || []).map((entry, index) => [`journey[${index}].emblem`, entry.emblem])];
  for (const [field, image] of ownImages) {
    if (!image) continue;
    if (!ASSET_PATH.test(image.src || '') || typeof image.alt !== 'string') {
      throw new Error(`content.js ${field} expects { src: './assets/<filename>.(png|webp|jpg|jpeg|svg)', alt: '…' }; got ${JSON.stringify(image)}. Store the image under assets/ and describe it in alt, or remove the field.`);
    }
    paths.add(image.src.slice(2));
  }
  const toolIds = PUBLIC_FILES.filter((name) => name.startsWith('tools/')).map((name) => name.split('/').pop().slice(0, -3));
  for (const project of content.projects || []) {
    const versions = [project, ...Object.values(project.translations || {})];
    for (const block of versions.flatMap((version) => version.body || []).filter((block) => block.type === 'tool')) {
      if (!toolIds.includes(block.tool)) {
        throw new Error(`Project ${project.id} embeds tool ${JSON.stringify(block.tool)}; expected one of ${toolIds.join(', ')}. Fix the id, or add the tool's script (tools/<id>/<id>.js for a submodule) to PUBLIC_FILES and a <script> tag for it in index.html.`);
      }
    }
    const images = [project.image, ...versions.flatMap((version) => (version.body || []).filter((block) => block.type === 'image'))].filter(Boolean);
    for (const image of images) {
      if (!PROJECT_IMAGE_PATH.test(image.src)) {
        throw new Error(`Image of project ${project.id} expects ./assets/projects/<project>/<name>.(png|webp|jpg|jpeg) (lowercase, no traversal); got ${image.src}. Move the file there and update content.js.`);
      }
      paths.add(image.src.slice(2));
    }
  }
  const datasets = new Set();
  for (const experiment of content.experiments || []) {
    for (const dataset of experiment.datasets || []) {
      if (!DATASET_PATH.test(dataset.file)) {
        throw new Error(`Dataset of experiment ${experiment.id} expects ./data/lab/<experiment>/<name>.csv (lowercase, no traversal); got ${dataset.file}. Move the file there and update content.js.`);
      }
      paths.add(dataset.file.slice(2));
      datasets.add(dataset.file.slice(2));
    }
  }
  const tracks = [];
  for (const track of content.music?.tracks || []) {
    if (!TRACK_PATH.test(track.file)) {
      throw new Error(`Music track "${track.title}" expects ./audio/<name>.mp3 (lowercase, no traversal); got ${track.file}. Move the file there and update content.js.`);
    }
    // 曲目文件可能被移除（例如收到版权方要求后）：只发布有文件的曲目，全缺则前端隐藏音乐控件。
    const bytes = await readSourceFile(root, track.file.slice(2)).catch((error) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (bytes) tracks.push([track, bytes]);
    else console.warn(`Music track ${track.file} is not on disk; publishing without it.`);
  }
  if (content.music) content.music.tracks = tracks.map(([track]) => track);
  const files = new Map(await Promise.all([...paths].map(async (name) => {
    try {
      return [name, await readSourceFile(root, name)];
    } catch (error) {
      if (error.code === 'ENOENT' && datasets.has(name)) {
        throw new Error(`Dataset ${name} is listed in content.js experiments but missing on disk. Generate the CSV or remove its datasets entry.`);
      }
      if (error.code === 'ENOENT' && /^tools\/[^/]+\/[^/]+\.js$/.test(name)) {
        throw new Error(`${name} is missing: it comes from the git submodule at ${name.slice(0, name.lastIndexOf('/'))}, which is not checked out. Run \`git submodule update --init\` and build again.`);
      }
      throw error;
    }
  })));
  for (const [track, bytes] of tracks) files.set(track.file.slice(2), bytes);
  files.set('content.js', Buffer.from(`window.SITE_CONTENT = ${JSON.stringify(content, null, 2)};\n`));
  files.set('index.html', Buffer.from(renderIndex(files.get('index.html').toString('utf8'), content)));
  assertNoPrivateCareer(files, source, content);
  return files;
}

const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const RAW_TOKENS = new Set(['intro', 'focus', 'educationMeta']);

// index.html 里的 {{name}} 等占位与 <!-- if:x -->…<!-- end:x --> 区块在构建时由公开内容填好：
// 禁用 JavaScript 的访客和搜索引擎看到的首屏，与 app.js 运行后渲染的是同一份资料。
export function renderIndex(html, content) {
  const { profile = {}, journey = [], experience = [], articles = [] } = content;
  const schooling = journey.filter((entry) => entry.degree && entry.major);
  const emblem = schooling.find((entry) => entry.emblem)?.emblem;
  const values = {
    siteTitle: profile.siteTitle,
    description: profile.description,
    name: profile.name,
    solarName: `${profile.name ?? ''}'s solar system`.toUpperCase(),
    intro: profile.motto ? `${escapeHTML(profile.intro)}，<span class="hero-motto">${escapeHTML(profile.motto)}</span>` : `${escapeHTML(profile.intro)}。`,
    role: experience.map((company) => company.profileRole).join('\n') || '未展示职业经历',
    location: profile.location,
    locationEn: profile.locationEn,
    focus: (profile.focus || []).map((item) => `<li>${escapeHTML(item)}</li>`).join(''),
    portraitSrc: profile.portrait?.src,
    portraitAlt: profile.portrait?.alt,
    school: [...new Set(schooling.map((entry) => entry.title))].join(' ／ '),
    educationMeta: schooling.map((entry) => `${escapeHTML(entry.degree)} · ${escapeHTML(entry.major)}`).join(' <i>／</i> '),
    emblemSrc: emblem?.src,
    emblemAlt: emblem?.alt,
    now: profile.now,
    nowNote: profile.nowNote,
    latestTitle: articles[0]?.title,
  };
  const shown = { portrait: Boolean(profile.portrait), education: schooling.length > 0, emblem: Boolean(emblem), focus: Boolean(profile.focus?.length) };
  const innermost = /<!-- if:([a-z]+) -->((?:(?!<!-- if:)[\s\S])*?)<!-- end:\1 -->/g;
  let blocks = html;
  for (let previous = ''; previous !== blocks;) {
    previous = blocks;
    blocks = blocks.replace(innermost, (block, key, inner) => {
      if (!(key in shown)) throw new Error(`index.html has a block <!-- if:${key} --> that the build does not know; expected one of ${Object.keys(shown).join(', ')}. Rename it or add it to renderIndex in scripts/site.mjs.`);
      return shown[key] ? inner : '';
    });
  }
  const rendered = blocks
    .replace(/\{\{([A-Za-z]+)\}\}/g, (token, key) => {
      if (!(key in values)) throw new Error(`index.html uses ${token}, which the build does not fill; expected one of ${Object.keys(values).map((name) => `{{${name}}}`).join(', ')}. Fix the placeholder or add it to renderIndex in scripts/site.mjs.`);
      return RAW_TOKENS.has(key) ? values[key] : escapeHTML(values[key]);
    });
  const leftover = rendered.match(/\{\{[^}]*\}\}|<!-- (?:if|end):[^>]*-->/);
  if (leftover) throw new Error(`index.html still contains ${leftover[0]} after rendering; placeholders are {{name}} and blocks are <!-- if:key -->…<!-- end:key --> with the same key. Fix the markup in index.html.`);
  return rendered;
}

export async function writePublicFiles(files, output = join(PROJECT_ROOT, 'dist')) {
  const existing = await lstat(output).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  if (existing) {
    const marker = await readFile(join(output, '.site-public'), 'utf8').catch(() => '');
    if (!existing.isDirectory() || existing.isSymbolicLink() || marker !== OUTPUT_MARKER) {
      throw new Error(`Refusing to replace unrecognized output ${output}. Move it aside; only generated public directories may be rebuilt.`);
    }
    // 从 all 收紧到单公司时必须清除旧文件，不能留下旧数据或未再引用的历史 Logo。
    await rm(output, { recursive: true });
  }
  await mkdir(output, { recursive: true });
  // 归属标记先于资产写入，进程中断后半成品仍可识别并安全重建。
  await writeFile(join(output, '.site-public'), OUTPUT_MARKER);
  for (const [name, buffer] of files) {
    const target = join(output, name);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, buffer);
  }
}

export function createPreviewServer(files) {
  // 只服务构建得到的白名单快照，不把请求路径映射到源码目录或任意本地文件。
  return createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD' });
      response.end();
      return;
    }
    let path;
    try {
      path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    } catch {
      response.writeHead(400);
      response.end();
      return;
    }
    const name = path === '/' ? 'index.html' : path.slice(1);
    const buffer = files.get(name);
    if (!buffer) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end(request.method === 'HEAD' ? undefined : 'Not found');
      return;
    }
    const type = CONTENT_TYPES[extname(name)] || 'application/octet-stream';
    // Safari 只在服务器支持 Range 时播放音频；只处理单段 bytes=start-end，其余按整文件返回。
    const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range || '');
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, buffer.length - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), buffer.length - 1) : buffer.length - 1;
      if (start > end || start >= buffer.length) {
        response.writeHead(416, { 'Content-Range': `bytes */${buffer.length}` });
        response.end();
        return;
      }
      response.writeHead(206, { 'Content-Type': type, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${buffer.length}`, 'Accept-Ranges': 'bytes' });
      response.end(request.method === 'HEAD' ? undefined : buffer.subarray(start, end + 1));
      return;
    }
    response.writeHead(200, {
      'Content-Type': type,
      'Content-Length': buffer.length,
      'Accept-Ranges': 'bytes',
    });
    response.end(request.method === 'HEAD' ? undefined : buffer);
  });
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  let port = 4177;
  if (command === 'serve' && args.length === 2 && args[0] === '--port' && /^\d+$/.test(args[1])) port = Number(args[1]);
  else if (!['build', 'serve'].includes(command) || args.length) {
    throw new Error('Use node scripts/site.mjs build or node scripts/site.mjs serve [--port 4177]. Change CAREER_VISIBILITY only in site.config.mjs.');
  }
  if (port < 1 || port > 65535) throw new Error(`Port expects 1–65535; got ${port}. Choose an unused local port.`);
  const files = await createPublicFiles();
  await writePublicFiles(files);
  console.log(`Generated dist/ for ${CAREER_VISIBILITY}. Publish dist/ only; never publish the source directory.`);
  if (command === 'build') return;
  const server = createPreviewServer(files);
  server.on('error', (error) => {
    console.error(`Preview could not start on 127.0.0.1:${port}: ${error.message}. Stop the old preview or choose --port <unused-port>.`);
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`Preview: http://127.0.0.1:${port}/ — ${CAREER_VISIBILITY}. Restart this command after source changes.`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
