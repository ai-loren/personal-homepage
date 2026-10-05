import { createServer } from 'node:http';
import { lstat, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import { CAREER_VISIBILITY } from '../site.config.mjs';

export const PROJECT_ROOT = fileURLToPath(new URL('../', import.meta.url));
const MODE_NAMES = Object.freeze({ all: '全部履历', bytedance: 'ByteDance', tencent: 'Tencent' });
const PRIVATE_MARKERS = {
  bytedance: ['ByteDance', '字节跳动', '巨量引擎', 'Ocean Engine', 'ipgen.ohayoo.cn'],
  tencent: ['Tencent', '腾讯', 'Tencent Hunyuan'],
};
const OUTPUT_MARKER = 'personal-homepage public output v1\n';
const PUBLIC_FILES = [
  'index.html', 'styles.css', 'app.js', 'cosmos.js', 'globe-renderer.js',
  'solar-system-3d.js', 'page-scenes.js', '.nojekyll',
  'assets/lorens-saturn-favicon.png', 'assets/loren-portrait.webp',
  'assets/xidian-university-emblem.png',
  'vendor/three.min.js', 'vendor/THREE-LICENSE.txt',
  'vendor/fonts/cormorant-garamond.ttf', 'vendor/fonts/ibm-plex-mono.ttf',
  'vendor/fonts/ibm-plex-mono-semibold.ttf', 'vendor/fonts/IBM-PLEX-OFL.txt',
  'vendor/fonts/manrope.ttf', 'vendor/fonts/noto-serif-sc-subset.woff2',
  'vendor/fonts/pinyon-script.ttf',
];
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ttf': 'font/ttf',
  '.woff2': 'font/woff2', '.csv': 'text/csv; charset=utf-8',
};
const DATASET_PATH = /^\.\/data\/lab\/[a-z0-9-]+\/[a-z0-9_-]+\.csv$/;

async function readSourceFile(root, name) {
  const sourceRoot = await realpath(root);
  const path = resolve(sourceRoot, name);
  const actual = await realpath(path);
  if (!actual.startsWith(sourceRoot + sep) || (await lstat(path)).isSymbolicLink()) {
    throw new Error(`Public asset ${name} must be a regular file inside the project. Remove the symlink or use a local copy.`);
  }
  return readFile(path);
}

export async function readSourceContent(root = PROJECT_ROOT) {
  const source = await readSourceFile(root, 'content.js');
  const context = { window: {} };
  runInNewContext(source.toString('utf8'), context, { filename: 'content.js', timeout: 1000 });
  return JSON.parse(JSON.stringify(context.window.SITE_CONTENT));
}

export function selectPublicContent(source, visibility = CAREER_VISIBILITY) {
  if (!Object.hasOwn(MODE_NAMES, visibility)) {
    throw new Error(`CAREER_VISIBILITY expects tencent, bytedance or all; got ${JSON.stringify(visibility)}. Fix site.config.mjs before publishing.`);
  }
  const content = structuredClone(source);
  const ids = content.experience?.map((company) => company.id);
  if (!ids?.length || new Set(ids).size !== ids.length || ids.some((id) => !['tencent', 'bytedance'].includes(id))) {
    throw new Error('content.js expects unique tencent/bytedance company IDs in experience. Correct the source data before publishing.');
  }
  content.experience = content.experience.filter((company) => visibility === 'all' || company.id === visibility);
  if (!content.experience.length) {
    throw new Error(`No experience matches ${visibility}. Add that company to content.js or change CAREER_VISIBILITY.`);
  }
  content.careerMode = visibility;
  content.careerModes = visibility === 'all' ? { ...MODE_NAMES } : { [visibility]: MODE_NAMES[visibility] };
  return content;
}

function assertNoPrivateCareer(files, source, publicContent) {
  const published = new Set(publicContent.experience.map((company) => company.id));
  const markers = source.experience.filter((company) => !published.has(company.id)).flatMap((company) => [
    ...(PRIVATE_MARKERS[company.id] || []),
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

export async function createPublicFiles({ visibility = CAREER_VISIBILITY, root = PROJECT_ROOT } = {}) {
  const source = await readSourceContent(root);
  const content = selectPublicContent(source, visibility);
  const paths = new Set(PUBLIC_FILES);
  for (const company of content.experience) {
    for (const entry of [company, ...company.roles]) {
      if (!entry.logo) continue;
      if (!/^\.\/assets\/[a-zA-Z0-9_-]+\.(png|webp|jpe?g|svg)$/.test(entry.logo)) {
        throw new Error(`Logo expects ./assets/<filename>.(png|webp|jpg|jpeg|svg); got ${entry.logo}. Store the image locally without path traversal or query parameters.`);
      }
      paths.add(entry.logo.slice(2));
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
  const files = new Map(await Promise.all([...paths].map(async (name) => {
    try {
      return [name, await readSourceFile(root, name)];
    } catch (error) {
      if (error.code === 'ENOENT' && datasets.has(name)) {
        throw new Error(`Dataset ${name} is listed in content.js experiments but missing on disk. Generate the CSV or remove its datasets entry.`);
      }
      throw error;
    }
  })));
  files.set('content.js', Buffer.from(`window.SITE_CONTENT = ${JSON.stringify(content, null, 2)};\n`));
  assertNoPrivateCareer(files, source, content);
  return files;
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
    response.writeHead(200, {
      'Content-Type': CONTENT_TYPES[extname(name)] || 'application/octet-stream',
      'Content-Length': buffer.length,
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
