import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { CAREER_VISIBILITY } from '../site.config.mjs';
import { PROJECT_ROOT, assertProjectFacets, createPreviewServer, createPublicFiles, readSourceContent, selectPublicContent, writePublicFiles } from './site.mjs';

const source = await readSourceContent();
const decodeContent = (files) => {
  const context = { window: {} };
  runInNewContext(files.get('content.js').toString(), context);
  return JSON.parse(JSON.stringify(context.window.SITE_CONTENT));
};
const privateText = /ByteDance|字节跳动|Seed AI Infra Engineer|Ads Infra Engineer|ipgen\.ohayoo\.cn|bytedance-logo\.png|bytedance-seed-logo\.png|ocean-engine-logo\.png/i;

async function temporaryDirectory(t) {
  const parent = join(PROJECT_ROOT, '.harness-e2e/generated');
  await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(join(parent, 'publication-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('default publication is locked to Tencent', () => {
  assert.equal(CAREER_VISIBILITY, 'tencent');
  const content = selectPublicContent(source);
  assert.equal(content.careerMode, 'tencent');
  assert.deepEqual(content.careerModes, { tencent: 'Tencent' });
  assert.deepEqual(content.experience.map((company) => company.id), ['tencent']);
  assert.equal(content.experience[0].roles[0].title, 'Hunyuan AI Infra Engineer');
});

test('all and ByteDance data and mode definitions are retained without mutating source', () => {
  const before = structuredClone(source);
  const all = selectPublicContent(source, 'all');
  assert.deepEqual(Object.keys(all.careerModes), ['all', 'bytedance', 'tencent']);
  assert.deepEqual(all.experience, source.experience);
  const bytedance = selectPublicContent(source, 'bytedance');
  assert.deepEqual(bytedance.careerModes, { bytedance: 'ByteDance' });
  assert.deepEqual(bytedance.experience.map((company) => company.id), ['bytedance']);
  assert.deepEqual(bytedance.experience[0].roles.map((role) => role.title), ['Seed AI Infra Engineer', 'Ads Infra Engineer']);
  assert.deepEqual(source, before);
});

test('invalid or missing publication settings fail instead of publishing everything', () => {
  for (const mode of ['', null, 'ALL', 'invalid', '__proto__']) {
    assert.throws(() => selectPublicContent(source, mode), /CAREER_VISIBILITY expects/);
  }
  const incomplete = structuredClone(source);
  incomplete.experience = incomplete.experience.filter((company) => company.id !== 'tencent');
  assert.throws(() => selectPublicContent(incomplete), /No experience matches/);
});

test('Tencent public files contain no private career or source files', async () => {
  const files = await createPublicFiles();
  assert.deepEqual(decodeContent(files).experience.map((company) => company.id), ['tencent']);
  for (const [name, bytes] of files) {
    assert(!/(^|\/)(\.git|\.harness-e2e|scripts|README\.md|site\.config\.mjs)/.test(name), name);
    assert(!privateText.test(name), name);
    if (/\.(js|html|css|txt)$/.test(name)) assert(!privateText.test(bytes.toString()), `Private content leaked in ${name}`);
  }
  for (const name of ['assets/tencent-logo.png', 'assets/tencent-hunyuan-logo.png', 'vendor/three.min.js', 'vendor/fonts/noto-serif-sc-subset.woff2']) assert(files.has(name), name);
  assert(!files.has('assets/bytedance-logo.png'));
});

test('private employer references outside experience stop publication', async (t) => {
  const root = await temporaryDirectory(t);
  const files = await createPublicFiles({ visibility: 'all' });
  for (const [name, bytes] of files) {
    if (name === 'content.js') continue;
    const target = join(root, name);
    await mkdir(join(target, '..'), { recursive: true });
    await writeFile(target, bytes);
  }
  for (const marker of ['Seed AI Infra Engineer', 'seed ai infra engineer', 'bytedance', 'BYTEDANCE', 'ipgen.ohayoo.cn', 'IPGEN.OHAYOO.CN', 'Ocean Engine', '巨量引擎']) {
    await t.test(marker, async () => {
      const poisoned = structuredClone(source);
      poisoned.profile.description = marker;
      await writeFile(join(root, 'content.js'), `window.SITE_CONTENT = ${JSON.stringify(poisoned)};`);
      await assert.rejects(createPublicFiles({ root }), /excluded company's information/);
    });
  }
});

test('every lab dataset is published and matches its declared columns, rows, size and sample', async () => {
  const files = await createPublicFiles();
  const experiments = decodeContent(files).experiments;
  const declared = experiments.flatMap((experiment) => experiment.datasets.map((dataset) => ({ experiment: experiment.id, ...dataset })));
  assert(experiments.every((experiment) => experiment.datasets.length >= 2), 'each experiment ships at least two datasets');
  assert.equal(new Set(declared.map((dataset) => dataset.file)).size, declared.length);
  for (const dataset of declared) {
    const name = dataset.file.slice(2);
    assert(name.startsWith(`data/lab/${dataset.experiment}/`), name);
    const bytes = files.get(name);
    assert(bytes, `${name} missing from public files`);
    assert.equal(bytes.length, dataset.bytes, `${name} size`);
    const [header, ...rows] = bytes.toString('utf8').trimEnd().split('\n').map((line) => line.split(','));
    assert.deepEqual(header, dataset.columns.map((column) => column.key), `${name} header`);
    assert.equal(rows.length, dataset.rows, `${name} rows`);
    assert(rows.every((row) => row.length === header.length), `${name} ragged rows`);
    assert.deepEqual(rows[0], dataset.columns.map((column) => column.sample), `${name} sample row`);
  }
});

test('dataset paths outside data/lab and missing dataset files stop publication', async (t) => {
  const root = await temporaryDirectory(t);
  const files = await createPublicFiles();
  for (const [name, bytes] of files) {
    if (name === 'content.js') continue;
    const target = join(root, name);
    await mkdir(join(target, '..'), { recursive: true });
    await writeFile(target, bytes);
  }
  const poison = async (file) => {
    const poisoned = structuredClone(source);
    poisoned.experiments[0].datasets[0].file = file;
    await writeFile(join(root, 'content.js'), `window.SITE_CONTENT = ${JSON.stringify(poisoned)};`);
    return createPublicFiles({ root });
  };
  for (const file of ['./site.config.mjs', './data/lab/goodput/../../../site.config.mjs', './data/lab/goodput/interruptions.xlsx', 'data/lab/goodput/interruptions.csv', './data/lab/Goodput/interruptions.csv']) {
    await assert.rejects(poison(file), /expects \.\/data\/lab\/<experiment>\/<name>\.csv/, file);
  }
  await assert.rejects(poison('./data/lab/goodput/not_generated.csv'), /missing on disk/);
});

test('every project image is published, and unsafe project image paths stop publication', async (t) => {
  const files = await createPublicFiles();
  const images = source.projects.flatMap((project) => [project.image, ...[project, ...Object.values(project.translations || {})].flatMap((version) => (version.body || []).filter((block) => block.type === 'image'))]).filter(Boolean);
  assert(source.projects.some((project) => project.image), 'a card image must be among the checked images');
  assert(source.projects.some((project) => (project.body || []).some((block) => block.type === 'image')), 'a body image must be among the checked images');
  for (const image of images) assert(files.has(image.src.slice(2)), `${image.src} must be published`);
  const root = await temporaryDirectory(t);
  for (const [name, bytes] of files) {
    if (name === 'content.js') continue;
    const target = join(root, name);
    await mkdir(join(target, '..'), { recursive: true });
    await writeFile(target, bytes);
  }
  const poison = async (place, src) => {
    const poisoned = structuredClone(source);
    const project = poisoned.projects.find((entry) => entry.image);
    if (place === 'card') project.image = { src, alt: '' };
    else if (place === 'body') project.body = [{ type: 'image', src, alt: '' }];
    else project.translations = { en: { body: [{ type: 'image', src, alt: '' }] } };
    await writeFile(join(root, 'content.js'), `window.SITE_CONTENT = ${JSON.stringify(poisoned)};`);
    return createPublicFiles({ root });
  };
  for (const place of ['card', 'body', 'translation']) {
    for (const src of ['./assets/projects/../../site.config.mjs', './assets/projects/demo/Shot.png', './assets/projects/demo/shot.gif', 'assets/projects/demo/shot.png', './assets/shot.png']) {
      await assert.rejects(poison(place, src), /expects \.\/assets\/projects\/<project>\/<name>/, `${place} ${src}`);
    }
  }
});

test('a bilingual project keeps both languages in step: same blocks, same images, translated meta', () => {
  const bilingual = source.projects.filter((project) => project.translations);
  assert(bilingual.length > 0, 'at least one project must carry a translation for this check to mean anything');
  for (const project of bilingual) {
    assert.deepEqual(Object.keys(project.translations), ['en'], `${project.id}: the reader only switches between Chinese and English`);
    const english = project.translations.en;
    for (const key of ['subtitle', ...(project.status ? ['status'] : []), ...(project.tagline ? ['tagline'] : [])]) {
      assert(english[key] && english[key] !== project[key], `${project.id}: translations.en.${key} must be its own English text`);
    }
    const shape = (body) => body.map((block) => (block.type === 'image' ? `image:${block.src}` : block.type === 'ul' ? `ul:${block.items.length}` : block.type));
    assert.deepEqual(shape(english.body), shape(project.body), `${project.id}: the English body must follow the Chinese one block for block`);
    const texts = (body) => body.flatMap((block) => [block.text, block.alt, block.caption, ...(block.items || [])]).filter(Boolean);
    const chinese = texts(english.body).filter((text) => /[\u4e00-\u9fff]/.test(text));
    assert.deepEqual(chinese, [], `${project.id}: the English body must not contain Chinese text`);
  }
});

test('project filter values come only from projectFacets, and a stray value stops publication', async (t) => {
  assert.deepEqual(source.projectFacets.map((facet) => [facet.key, Boolean(facet.multiple)]), [['type', false], ['uses', true], ['code', false]]);
  assert.doesNotThrow(() => assertProjectFacets(source));
  const withProject = (patch) => {
    const content = structuredClone(source);
    Object.assign(content.projects[0], patch);
    return content;
  };
  assert.doesNotThrow(() => assertProjectFacets(withProject({ uses: ['SDK', 'Web'] })), 'the order a project lists its uses in is not significant');
  const id = source.projects[0].id;
  for (const [patch, field] of [
    [{ type: '应用 ' }, 'type'], [{ type: undefined }, 'type'], [{ code: '未公开' }, 'code'],
    [{ uses: ['Cli'] }, 'uses'], [{ uses: 'Web' }, 'uses'], [{ uses: [] }, 'uses'], [{ uses: ['Web', 'Web'] }, 'uses'],
  ]) {
    assert.throws(() => assertProjectFacets(withProject(patch)), new RegExp(`Project ${id} expects ${field} .*add it to projectFacets "${field}"`), JSON.stringify(patch));
  }
  const withFacets = (edit) => {
    const content = structuredClone(source);
    edit(content.projectFacets);
    return content;
  };
  assert.throws(() => assertProjectFacets(withFacets((facets) => facets.push(structuredClone(facets[0])))), /list each filter dimension once/);
  assert.throws(() => assertProjectFacets(withFacets((facets) => facets[0].values.push({ value: facets[0].values[0].value }))), /unique non-empty values/);
  assert.throws(() => assertProjectFacets(withFacets((facets) => { facets[2].key = 'Code'; })), /key: lowercase letters/);

  const root = await temporaryDirectory(t);
  for (const [name, bytes] of await createPublicFiles()) {
    if (name === 'content.js') continue;
    const target = join(root, name);
    await mkdir(join(target, '..'), { recursive: true });
    await writeFile(target, bytes);
  }
  await writeFile(join(root, 'content.js'), `window.SITE_CONTENT = ${JSON.stringify(withProject({ type: '网站' }))};`);
  await assert.rejects(createPublicFiles({ root }), new RegExp(`Project ${id} expects type to be one of 平台 / 框架 / 应用 / 工具; got "网站"`));
});

test('every embedded tool is published and loads before app.js, and an unknown tool id stops publication', async (t) => {
  const files = await createPublicFiles();
  const html = files.get('index.html').toString();
  const tools = [...files.keys()].filter((name) => name.startsWith('tools/'));
  assert.deepEqual(tools, ['tools/vram-ledger.js', 'tools/ckpt-goodput/ckpt-goodput.js']);
  for (const name of tools) {
    const at = html.indexOf(`src="./${name}?`);
    assert(at > 0 && at < html.indexOf('src="./app.js'), `${name} must be loaded by index.html before app.js mounts it`);
  }
  assert.deepEqual(source.projects.flatMap((project) => (project.body || []).filter((block) => block.type === 'tool').map((block) => block.tool)), ['vram-ledger', 'ckpt-goodput']);

  const root = await temporaryDirectory(t);
  for (const [name, bytes] of files) {
    if (name === 'content.js') continue;
    const target = join(root, name);
    await mkdir(join(target, '..'), { recursive: true });
    await writeFile(target, bytes);
  }
  const poisoned = structuredClone(source);
  poisoned.projects.find((project) => project.id === 'vram-ledger').body.push({ type: 'tool', tool: 'vram-legder' });
  await writeFile(join(root, 'content.js'), `window.SITE_CONTENT = ${JSON.stringify(poisoned)};`);
  await assert.rejects(createPublicFiles({ root }), /Project vram-ledger embeds tool "vram-legder"; expected one of vram-ledger, ckpt-goodput\./);

  await writeFile(join(root, 'content.js'), `window.SITE_CONTENT = ${JSON.stringify(source)};`);
  await rm(join(root, 'tools/ckpt-goodput'), { recursive: true });
  await assert.rejects(createPublicFiles({ root }), /tools\/ckpt-goodput\/ckpt-goodput\.js is missing: it comes from the git submodule at tools\/ckpt-goodput.*git submodule update --init/);
});

test('published page keeps a strict CSP and no inline script entry points', async () => {
  const files = await createPublicFiles();
  const html = files.get('index.html').toString();
  const meta = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
  assert(meta, 'index.html must declare a Content-Security-Policy meta tag');
  assert(html.indexOf(meta[0]) < html.indexOf('<script'), 'CSP must appear before the first script');
  const policy = Object.fromEntries(meta[1].split(';').map((part) => part.trim().split(/\s+/)).map(([name, ...values]) => [name, values]));
  assert.deepEqual(policy['script-src'], ["'self'"]);
  assert.deepEqual(policy['style-src'], ["'self'"]);
  assert.deepEqual(policy['frame-src'], ['https://giscus.app']);
  assert.deepEqual(policy['object-src'], ["'none'"]);
  assert.deepEqual(policy['base-uri'], ["'none'"]);
  assert.deepEqual(policy['form-action'], ["'none'"]);
  assert(!/unsafe-inline|unsafe-eval|\*/.test(meta[1]), `CSP must not relax with wildcards or unsafe-*; got ${meta[1]}`);
  assert(!/<script(?![^>]*\ssrc=)[^>]*>/.test(html), 'index.html must not contain inline <script> blocks');
  assert(!/\son[a-z]+\s*=/i.test(html), 'index.html must not contain inline event handlers');
  assert(!/\sstyle\s*=/.test(html), 'index.html must not contain style attributes (blocked by style-src)');
});

test('questions have stable unique ids and the reply config is well formed', () => {
  const ids = source.ideas.map((idea) => idea.id);
  assert(ids.every((id) => /^[a-z0-9-]+$/.test(id)), `question ids must be lowercase slugs; got ${ids.join(', ')}`);
  assert.equal(new Set(ids).size, ids.length, 'question ids must be unique: each maps to one discussion thread');
  const { comments } = source;
  assert.equal(comments.provider, 'giscus');
  assert.match(comments.repo, /^[\w.-]+\/[\w.-]+$/);
  for (const key of ['repoId', 'categoryId']) assert.match(comments[key], /^[\w-]*$/, `${key} must be an opaque GitHub id or empty`);
});

test('the reply site is allowed by giscus.json, which only lists https origins', async () => {
  const site = new URL(source.comments.site);
  assert.equal(site.protocol, 'https:', `comments.site must be the https production URL; got ${source.comments.site}`);
  const { origins } = JSON.parse(await readFile(join(PROJECT_ROOT, 'giscus.json'), 'utf8'));
  assert(Array.isArray(origins) && origins.length > 0, 'giscus.json must restrict origins; without it any site can post into the discussions');
  assert(origins.every((origin) => new URL(origin).protocol === 'https:' && new URL(origin).origin === origin), `giscus.json origins must be bare https origins; got ${origins.join(', ')}`);
  assert(origins.includes(site.origin), `giscus.json must allow ${site.origin}, or replies on the production site are refused`);
});

test('music tracks publish when present, are dropped when missing, and reject unsafe paths', async (t) => {
  const root = await temporaryDirectory(t);
  const files = await createPublicFiles();
  for (const [name, bytes] of files) {
    if (name === 'content.js' || name.startsWith('audio/')) continue;
    const target = join(root, name);
    await mkdir(join(target, '..'), { recursive: true });
    await writeFile(target, bytes);
  }
  const write = (music) => {
    const content = structuredClone(source);
    content.music = music;
    return writeFile(join(root, 'content.js'), `window.SITE_CONTENT = ${JSON.stringify(content)};`);
  };
  await mkdir(join(root, 'audio'), { recursive: true });
  await writeFile(join(root, 'audio', 'present.mp3'), Buffer.from('ID3fake'));
  await write({ tracks: [{ title: 'Present', artist: 'A', file: './audio/present.mp3' }, { title: 'Missing', artist: 'B', file: './audio/missing.mp3' }] });
  const built = await createPublicFiles({ root });
  assert(built.has('audio/present.mp3'), 'existing track must be published');
  assert(!built.has('audio/missing.mp3'));
  assert.deepEqual(decodeContent(built).music.tracks.map((track) => track.title), ['Present'], 'missing tracks must be removed from the published playlist');
  for (const file of ['./audio/../site.config.mjs', './audio/Track.mp3', './audio/track.wav', 'audio/track.mp3', './data/track.mp3']) {
    await write({ tracks: [{ title: 'Bad', artist: 'C', file }] });
    await assert.rejects(createPublicFiles({ root }), /expects \.\/audio\/<name>\.mp3/, file);
  }
});

test('preview server answers byte ranges so Safari can stream audio', async (t) => {
  const files = new Map([['audio/a.mp3', Buffer.from('0123456789')]]);
  const server = createPreviewServer(files);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const full = await fetch(`${origin}/audio/a.mp3`);
  assert.equal(full.headers.get('content-type'), 'audio/mpeg');
  assert.equal(full.headers.get('accept-ranges'), 'bytes');
  const partial = await fetch(`${origin}/audio/a.mp3`, { headers: { Range: 'bytes=2-5' } });
  assert.equal(partial.status, 206);
  assert.equal(partial.headers.get('content-range'), 'bytes 2-5/10');
  assert.equal(await partial.text(), '2345');
  const suffix = await fetch(`${origin}/audio/a.mp3`, { headers: { Range: 'bytes=-3' } });
  assert.equal(await suffix.text(), '789');
  assert.equal((await fetch(`${origin}/audio/a.mp3`, { headers: { Range: 'bytes=20-' } })).status, 416);
});

test('all and ByteDance publications still build with their allowed assets', async () => {
  for (const mode of ['all', 'bytedance']) {
    const files = await createPublicFiles({ visibility: mode });
    const content = decodeContent(files);
    assert.equal(content.careerMode, mode);
    assert(files.has('assets/bytedance-logo.png'));
    assert.equal(files.has('assets/tencent-logo.png'), mode === 'all');
    assert.equal(content.experience.length, mode === 'all' ? 2 : 1);
  }
});

test('rebuilding a former all directory removes old private logos and files', async (t) => {
  const parent = await temporaryDirectory(t);
  const output = join(parent, 'dist');
  await writePublicFiles(await createPublicFiles({ visibility: 'all' }), output);
  assert((await stat(join(output, 'assets/bytedance-logo.png'))).isFile());
  await writeFile(join(output, 'content.backup.js'), 'private old content');
  await writePublicFiles(await createPublicFiles(), output);
  await assert.rejects(stat(join(output, 'assets/bytedance-logo.png')), { code: 'ENOENT' });
  await assert.rejects(stat(join(output, 'content.backup.js')), { code: 'ENOENT' });
  assert(!privateText.test(await readFile(join(output, 'content.js'), 'utf8')));
});

test('a failed output write can be rebuilt without manual directory removal', async (t) => {
  const parent = await temporaryDirectory(t);
  const output = join(parent, 'dist');
  const broken = new Map([
    ['assets', Buffer.from('conflicting file')],
    ['assets/logo.png', Buffer.from('unreachable asset')],
  ]);
  await assert.rejects(writePublicFiles(broken, output), (error) => ['EEXIST', 'ENOTDIR'].includes(error.code));
  await writePublicFiles(await createPublicFiles(), output);
  assert((await stat(join(output, 'assets/tencent-logo.png'))).isFile());
  assert(!privateText.test(await readFile(join(output, 'content.js'), 'utf8')));
});

test('unrecognized output and symlinked source are not accepted', async (t) => {
  const root = await temporaryDirectory(t);
  const output = join(root, 'existing');
  await mkdir(output);
  await writeFile(join(output, 'keep.txt'), 'keep');
  await assert.rejects(writePublicFiles(new Map(), output), /Refusing to replace/);
  assert.equal(await readFile(join(output, 'keep.txt'), 'utf8'), 'keep');
  await symlink(join(PROJECT_ROOT, 'content.js'), join(root, 'content.js'));
  await assert.rejects(readSourceContent(root), /regular file inside/);
});

test('HTTP only serves public snapshot, regardless of path/query/method changes', async (t) => {
  const files = await createPublicFiles();
  const server = createPreviewServer(files);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const path of ['/content.js', '/content.js?careerMode=all', '/content.js?v=20260928-3', '/content.js?careerMode=bytedance']) {
    const response = await fetch(origin + path);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.text();
    assert(!privateText.test(body), path);
    assert.match(body, /Hunyuan AI Infra Engineer/);
  }
  for (const path of ['/README.md', '/site.config.mjs', '/scripts/site.mjs', '/.git/config', '/.git/HEAD', '/.harness-e2e/career-modes.js', '/assets/bytedance-logo.png', '/assets/bytedance-seed-logo.png', '/assets/ocean-engine-logo.png', '/assets/', '/content.js.bak', '/%2e%2e%2fcontent.js', '/assets/%2e%2e/%2e%2e/.git/config', '/dist/content.js']) {
    assert.equal((await fetch(origin + path)).status, 404, path);
  }
  const csv = await fetch(origin + '/data/lab/goodput/interruptions.csv');
  assert.equal(csv.status, 200);
  assert.equal(csv.headers.get('content-type'), 'text/csv; charset=utf-8');
  assert.match(await csv.text(), /^interruption_id,day,time,root_cause,/);
  for (const path of ['/data/lab/', '/data/lab/goodput/', '/data/lab/goodput/missing.csv', '/data/lab/goodput/%2e%2e/%2e%2e/%2e%2e/README.md']) {
    assert.equal((await fetch(origin + path)).status, 404, path);
  }
  assert.equal((await fetch(origin + '/content.js', { method: 'POST', body: 'mode=all' })).status, 405);
  const head = await fetch(origin + '/content.js', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal((await fetch(origin + '/%invalid')).status, 400);
});
