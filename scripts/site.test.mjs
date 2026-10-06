// 通用的发布与安全检查：不依赖某一个人的内容，用这个仓库做模板的人保留它。
// 每条要么拿 content.example.js 当固定样本、断言写死的结果，要么对当前 content.js 逐项套用同一条规则。
// 只核对 loren 那份内容的断言在 content.test.mjs。
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { copyFile, mkdir, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import test from 'node:test';
import { PROJECT_ROOT, assertProjectFacets, createPreviewServer, createPublicFiles, readSourceContent, renderIndex, selectPublicContent, writePublicFiles } from './site.mjs';
import { decodeContent, stage, temporaryDirectory, writeContent } from './test-helpers.mjs';

const source = await readSourceContent();
const example = await readSourceContent(PROJECT_ROOT, 'content.example.js');
const SOURCE_ONLY = /(^|\/)(\.git|\.github|\.harness-e2e|scripts|README\.md|LICENSE|CONTENT-LICENSE\.md|site\.config\.mjs|content\.example\.js|giscus\.json)(\/|$)/;
const markersOf = (company) => [...(company.privateMarkers || []), company.company, company.profileRole, ...company.roles.map((role) => role.title)].filter(Boolean);
const logosOf = (company) => [company.logo, ...company.roles.map((role) => role.logo)].filter(Boolean).map((logo) => logo.slice(2));
const textOf = (files) => [...files].filter(([name]) => /\.(html|js|css|txt|csv)$/.test(name)).map(([, bytes]) => bytes.toString().toLowerCase()).join('\n');
const facetValues = (content) => Object.fromEntries(content.projectFacets.map((facet) => [facet.key, facet.multiple ? [facet.values[0].value] : facet.values[0].value]));
const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const probeProject = (content, extra) => ({ id: 'probe', name: 'Probe', subtitle: 'probe', description: 'probe', tags: [], status: '', url: '', source: '', body: [], ...facetValues(content), ...extra });

async function listFiles(directory) {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => relative(directory, join(entry.parentPath, entry.name)));
}

test('CAREER_VISIBILITY must be "all" or one of the company ids in content.js', () => {
  for (const content of [source, example]) {
    for (const mode of ['', null, 'ALL', 'invalid', '__proto__', 'constructor']) {
      assert.throws(() => selectPublicContent(content, mode), /CAREER_VISIBILITY expects "all" or one of/, String(mode));
    }
    for (const id of ['all', ...content.experience.map((company) => company.id)]) assert.doesNotThrow(() => selectPublicContent(content, id), id);
  }
  const withIds = (...ids) => ({ ...structuredClone(example), experience: ids.map((id) => ({ ...structuredClone(example.experience[0]), id })) });
  for (const ids of [[], ['acme', 'acme'], ['Acme'], ['all'], ['acme corp']]) {
    assert.throws(() => selectPublicContent(withIds(...ids), 'all'), /expects experience to list at least one company/, JSON.stringify(ids));
  }
});

test('publishing one company keeps only it, takes menu names from content.js, and leaves the source untouched', () => {
  assert.deepEqual(Object.entries(selectPublicContent(example, 'all').careerModes), [['all', '全部履历'], ['acme', 'Acme'], ['globex', 'Globex']]);
  for (const content of [source, example]) {
    const before = structuredClone(content);
    const ids = content.experience.map((company) => company.id);
    for (const company of content.experience) {
      const published = selectPublicContent(content, company.id);
      assert.deepEqual(published.experience.map((entry) => entry.id), [company.id]);
      assert.deepEqual(published.careerModes, { [company.id]: company.modeName || company.company });
    }
    const all = selectPublicContent(content, 'all');
    assert.deepEqual(all.experience.map((entry) => entry.id), ids);
    assert(all.experience.every((entry) => !('modeName' in entry) && !('privateMarkers' in entry)), 'build-only fields stay out of the published content');
    assert.deepEqual(content, before);
  }
});

test('a site published for one company carries no trace of the others', async (t) => {
  const cases = [['content.js', source, PROJECT_ROOT], ['content.example.js', example, await stage(t, example)]];
  for (const [label, content, root] of cases) {
    for (const company of content.experience) {
      const files = await createPublicFiles({ root, visibility: company.id });
      const text = textOf(files);
      for (const other of content.experience.filter((entry) => entry.id !== company.id)) {
        for (const marker of markersOf(other)) assert(!text.includes(marker.toLowerCase()), `${label}: publishing ${company.id} leaks "${marker}" of ${other.id}`);
        for (const logo of logosOf(other).filter((name) => !logosOf(company).includes(name))) assert(!files.has(logo), `${label}: publishing ${company.id} ships ${other.id}'s logo ${logo}`);
      }
      for (const name of files.keys()) assert(!SOURCE_ONLY.test(name), `${label}: ${name} is source, not site`);
    }
  }
  assert(!/globex|northwind/.test(textOf(await createPublicFiles({ root: cases[1][2], visibility: 'acme' }))));
});

test('a mention of an excluded company anywhere in the page stops publication', async (t) => {
  const root = await stage(t, example);
  for (const marker of ['Globex', 'GLOBEX', 'Globex Corporation', 'Project Northwind', 'project northwind', 'Data Engineering Intern']) {
    const poisoned = structuredClone(example);
    poisoned.profile.description = `before ${marker} after`;
    await writeContent(root, poisoned);
    await assert.rejects(createPublicFiles({ root, visibility: 'acme' }), /excluded company's information/, marker);
  }
  const poisoned = structuredClone(example);
  poisoned.articles[0].body.push({ type: 'p', text: 'Project Roadrunner shipped.' });
  await writeContent(root, poisoned);
  await assert.rejects(createPublicFiles({ root, visibility: 'globex' }), /excluded company's information/, 'an article mentioning the other company');
  await writeContent(root, example);
  await assert.doesNotReject(createPublicFiles({ root, visibility: 'acme' }));
});

test('index.html placeholders are filled from content, escaped, with optional blocks dropped', async () => {
  const template = '<title>{{siteTitle}}</title><h1>{{name}}</h1><p>{{intro}}</p><!-- if:portrait --><img src="{{portraitSrc}}" alt="{{portraitAlt}}"><!-- end:portrait --><!-- if:education --><a>{{school}}<!-- if:emblem --><img src="{{emblemSrc}}"><!-- end:emblem --><span>{{educationMeta}}</span></a><!-- end:education --><!-- if:focus --><ul>{{focus}}</ul><!-- end:focus -->';
  const content = { profile: { siteTitle: 'A & B', name: '<b>ada</b>', intro: 'x "y"', motto: 'm<', focus: ['<i>f</i>'] }, journey: [{ title: 'U', degree: 'D', major: 'M<' }], experience: [], articles: [] };
  assert.equal(renderIndex(template, content), '<title>A &amp; B</title><h1>&lt;b&gt;ada&lt;/b&gt;</h1><p>x &quot;y&quot;，<span class="hero-motto">m&lt;</span></p><a>U<span>D · M&lt;</span></a><ul><li>&lt;i&gt;f&lt;/i&gt;</li></ul>');
  const full = renderIndex(template, { ...content, profile: { ...content.profile, motto: '', focus: [], portrait: { src: './assets/p.webp', alt: 'p"' } }, journey: [{ ...content.journey[0], emblem: { src: './assets/e.png', alt: 'e' } }] });
  assert.equal(full, '<title>A &amp; B</title><h1>&lt;b&gt;ada&lt;/b&gt;</h1><p>x &quot;y&quot;。</p><img src="./assets/p.webp" alt="p&quot;"><a>U<img src="./assets/e.png"><span>D · M&lt;</span></a>');
  assert.equal(renderIndex('<!-- if:education --><a>{{school}}</a><!-- end:education -->', { ...content, journey: [] }), '');
  assert.throws(() => renderIndex('{{nickname}}', content), /uses \{\{nickname\}\}, which the build does not fill/);
  assert.throws(() => renderIndex('<!-- if:avatar -->x<!-- end:avatar -->', content), /block <!-- if:avatar --> that the build does not know/);
  assert.throws(() => renderIndex('<!-- if:portrait -->x<!-- end:focus -->', content), /still contains <!-- if:portrait -->/);
  const html = (await createPublicFiles()).get('index.html').toString();
  assert(!/\{\{|<!-- (if|end):/.test(html), 'the published index.html has no placeholder left');
  assert(html.includes(`<h1 id="home-title">你好，我是<br><span class="hero-name" data-profile="name">${escapeHTML(source.profile.name)}</span>`), 'the published home page names the person in content.js');
});

test('the portrait and school emblems are published from content, and unsafe paths stop publication', async (t) => {
  const withImages = structuredClone(example);
  withImages.profile.portrait = { src: './assets/portrait-probe.png', alt: 'portrait' };
  withImages.journey[0].emblem = { src: './assets/emblem-probe.png', alt: 'emblem' };
  const root = await stage(t, withImages);
  for (const name of ['portrait-probe.png', 'emblem-probe.png']) await copyFile(join(PROJECT_ROOT, 'assets/saturn-favicon.png'), join(root, 'assets', name));
  const files = await createPublicFiles({ root, visibility: 'all' });
  assert(files.has('assets/portrait-probe.png') && files.has('assets/emblem-probe.png'));
  const html = files.get('index.html').toString();
  assert.match(html, /<img src="\.\/assets\/portrait-probe\.png" width="720" height="960" alt="portrait">/);
  assert.match(html, /<img src="\.\/assets\/emblem-probe\.png" width="267" height="267" alt="emblem">/);
  for (const src of ['../assets/x.png', './assets/../site.config.mjs', './assets/a/b.png', 'assets/x.png', './assets/x.gif']) {
    for (const [field, set] of [['profile\\.portrait', (content) => { content.profile.portrait.src = src; }], ['journey\\[0\\]\\.emblem', (content) => { content.journey[0].emblem.src = src; }]]) {
      const bad = structuredClone(withImages);
      set(bad);
      await writeContent(root, bad);
      await assert.rejects(createPublicFiles({ root, visibility: 'all' }), new RegExp(`content\\.js ${field} expects`), `${field} ${src}`);
    }
  }
  await writeContent(root, example);
  const plain = await createPublicFiles({ root, visibility: 'all' });
  assert(!plain.has('assets/portrait-probe.png') && !plain.has('assets/emblem-probe.png'), 'images nobody references are not published');
  assert(!/hero-portrait|hero-education-emblem/.test(plain.get('index.html').toString()), 'no portrait or emblem markup without the images');
});

test('every lab dataset is published and matches its declared columns, rows, size and sample', async () => {
  const files = await createPublicFiles();
  const experiments = decodeContent(files).experiments;
  const declared = experiments.flatMap((experiment) => (experiment.datasets || []).map((dataset) => ({ experiment: experiment.id, ...dataset })));
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
  const root = await stage(t, source);
  const poison = async (file) => {
    const poisoned = structuredClone(source);
    poisoned.experiments = [...(poisoned.experiments || []), { id: 'probe', datasets: [{ file }] }];
    await writeContent(root, poisoned);
    return createPublicFiles({ root });
  };
  for (const file of ['./site.config.mjs', './data/lab/probe/../../../site.config.mjs', './data/lab/probe/rows.xlsx', 'data/lab/probe/rows.csv', './data/lab/Probe/rows.csv']) {
    await assert.rejects(poison(file), /expects \.\/data\/lab\/<experiment>\/<name>\.csv/, file);
  }
  await assert.rejects(poison('./data/lab/probe/not_generated.csv'), /missing on disk/);
});

test('every project image is published, and unsafe project image paths stop publication', async (t) => {
  const files = await createPublicFiles();
  const images = source.projects.flatMap((project) => [project.image, ...[project, ...Object.values(project.translations || {})].flatMap((version) => (version.body || []).filter((block) => block.type === 'image'))]).filter(Boolean);
  for (const image of images) assert(files.has(image.src.slice(2)), `${image.src} must be published`);
  const root = await stage(t, source);
  const poison = async (place, src) => {
    const poisoned = structuredClone(source);
    const image = { src, alt: '' };
    const extra = place === 'card' ? { image } : place === 'body' ? { body: [{ type: 'image', ...image }] } : { translations: { en: { body: [{ type: 'image', ...image }] } } };
    poisoned.projects = [...poisoned.projects, probeProject(source, extra)];
    await writeContent(root, poisoned);
    return createPublicFiles({ root });
  };
  for (const place of ['card', 'body', 'translation']) {
    for (const src of ['./assets/projects/../../site.config.mjs', './assets/projects/demo/Shot.png', './assets/projects/demo/shot.gif', 'assets/projects/demo/shot.png', './assets/shot.png']) {
      await assert.rejects(poison(place, src), /expects \.\/assets\/projects\/<project>\/<name>/, `${place} ${src}`);
    }
  }
});

test('a bilingual project keeps both languages in step: same blocks, same images, translated meta', () => {
  for (const project of source.projects.filter((entry) => entry.translations)) {
    assert.deepEqual(Object.keys(project.translations), ['en'], `${project.id}: the reader only switches between Chinese and English`);
    const english = project.translations.en;
    for (const key of ['subtitle', ...(project.status ? ['status'] : []), ...(project.tagline ? ['tagline'] : [])]) {
      assert(english[key] && english[key] !== project[key], `${project.id}: translations.en.${key} must be its own English text`);
    }
    const shape = (body) => body.map((block) => (block.type === 'image' ? `image:${block.src}` : block.type === 'ul' ? `ul:${block.items.length}` : block.type));
    assert.deepEqual(shape(english.body), shape(project.body), `${project.id}: the English body must follow the Chinese one block for block`);
    const texts = (body) => body.flatMap((block) => [block.text, block.alt, block.caption, ...(block.items || [])]).filter(Boolean);
    assert.deepEqual(texts(english.body).filter((text) => /[\u4e00-\u9fff]/.test(text)), [], `${project.id}: the English body must not contain Chinese text`);
  }
});

test('project filter values come only from projectFacets, and a stray value stops publication', async (t) => {
  assert.doesNotThrow(() => assertProjectFacets(source));
  assert.doesNotThrow(() => assertProjectFacets(example));
  const withProject = (patch) => {
    const content = structuredClone(example);
    Object.assign(content.projects[0], patch);
    return content;
  };
  assert.doesNotThrow(() => assertProjectFacets(withProject({ uses: ['SDK', 'Web'] })), 'the order a project lists its uses in is not significant');
  const id = example.projects[0].id;
  for (const [patch, field] of [
    [{ type: '应用 ' }, 'type'], [{ type: undefined }, 'type'], [{ code: '未公开' }, 'code'],
    [{ uses: ['Cli'] }, 'uses'], [{ uses: 'Web' }, 'uses'], [{ uses: [] }, 'uses'], [{ uses: ['Web', 'Web'] }, 'uses'],
  ]) {
    assert.throws(() => assertProjectFacets(withProject(patch)), new RegExp(`Project ${id} expects ${field} .*add it to projectFacets "${field}"`), JSON.stringify(patch));
  }
  const withFacets = (edit) => {
    const content = structuredClone(example);
    edit(content.projectFacets);
    return content;
  };
  assert.throws(() => assertProjectFacets(withFacets((facets) => facets.push(structuredClone(facets[0])))), /list each filter dimension once/);
  assert.throws(() => assertProjectFacets(withFacets((facets) => facets[0].values.push({ value: facets[0].values[0].value }))), /unique non-empty values/);
  assert.throws(() => assertProjectFacets(withFacets((facets) => { facets[2].key = 'Code'; })), /key: lowercase letters/);
  const root = await stage(t, withProject({ type: '网站' }));
  await assert.rejects(createPublicFiles({ root, visibility: 'all' }), new RegExp(`Project ${id} expects type to be one of 平台 / 框架 / 应用 / 工具; got "网站"`));
});

test('every tool script is published and loads before app.js, and an unknown tool id or a missing submodule stops publication', async (t) => {
  const files = await createPublicFiles();
  const html = files.get('index.html').toString();
  const tools = [...files.keys()].filter((name) => name.startsWith('tools/'));
  for (const name of tools) {
    const at = html.indexOf(`src="./${name}?`);
    assert(at > 0 && at < html.indexOf('src="./app.js'), `${name} must be loaded by index.html before app.js mounts it`);
  }
  const ids = tools.map((name) => name.split('/').pop().slice(0, -3));
  for (const project of source.projects) {
    for (const block of (project.body || []).filter((entry) => entry.type === 'tool')) assert(ids.includes(block.tool), `${project.id} embeds ${block.tool}, which is not published`);
  }
  const poisoned = structuredClone(source);
  poisoned.projects = [...poisoned.projects, probeProject(source, { body: [{ type: 'tool', tool: 'no-such-tool' }] })];
  const root = await stage(t, poisoned);
  await assert.rejects(createPublicFiles({ root }), new RegExp(`Project probe embeds tool "no-such-tool"; expected one of ${ids.join(', ')}\\.`));
  for (const name of tools.filter((entry) => entry.split('/').length === 3)) {
    await writeContent(root, source);
    const folder = name.slice(0, name.lastIndexOf('/'));
    await rm(join(root, folder), { recursive: true });
    await assert.rejects(createPublicFiles({ root }), new RegExp(`${name.replace(/[./]/g, '\\$&')} is missing: it comes from the git submodule at ${folder.replace(/[./]/g, '\\$&')}.*git submodule update --init`));
    await mkdir(join(root, folder), { recursive: true });
    await writeFile(join(root, name), files.get(name));
  }
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

test('the footer credits the template with a link to its repository', async () => {
  const html = (await createPublicFiles()).get('index.html').toString();
  assert.match(html, /<a class="footer-credit" href="https:\/\/github\.com\/ai-loren\/personal-homepage" target="_blank" rel="noopener noreferrer">Built with Loren's Galaxy ↗<\/a>/);
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
  const root = await stage(t, source, { skip: (name) => name.startsWith('audio/') });
  const write = (music) => writeContent(root, { ...structuredClone(source), music });
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
  const server = createPreviewServer(new Map([['audio/a.mp3', Buffer.from('0123456789')]]));
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
  assert.equal(await (await fetch(`${origin}/audio/a.mp3`, { headers: { Range: 'bytes=-3' } })).text(), '789');
  assert.equal((await fetch(`${origin}/audio/a.mp3`, { headers: { Range: 'bytes=20-' } })).status, 416);
});

test('rebuilding replaces the whole output with exactly the new build', async (t) => {
  const output = join(await temporaryDirectory(t), 'dist');
  await writePublicFiles(await createPublicFiles({ visibility: 'all' }), output);
  await writeFile(join(output, 'content.backup.js'), 'private old content');
  const files = await createPublicFiles();
  await writePublicFiles(files, output);
  assert.deepEqual((await listFiles(output)).sort(), ['.site-public', ...files.keys()].sort());
  for (const [name, bytes] of files) assert((await readFile(join(output, name))).equals(bytes), name);
});

test('a failed output write can be rebuilt without manual directory removal', async (t) => {
  const output = join(await temporaryDirectory(t), 'dist');
  const broken = new Map([['assets', Buffer.from('conflicting file')], ['assets/logo.png', Buffer.from('unreachable asset')]]);
  await assert.rejects(writePublicFiles(broken, output), (error) => ['EEXIST', 'ENOTDIR'].includes(error.code));
  const files = await createPublicFiles();
  await writePublicFiles(files, output);
  for (const name of files.keys()) assert((await stat(join(output, name))).isFile(), name);
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

test('HTTP only serves the public snapshot, regardless of path, query or method', async (t) => {
  const files = await createPublicFiles();
  const server = createPreviewServer(files);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const path of ['/content.js', '/content.js?careerMode=all', '/content.js?v=1']) {
    const response = await fetch(origin + path);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(await response.text(), files.get('content.js').toString(), path);
  }
  for (const path of ['/README.md', '/LICENSE', '/site.config.mjs', '/scripts/site.mjs', '/content.example.js', '/giscus.json', '/.git/config', '/.git/HEAD', '/.harness-e2e/career-modes.js', '/assets/', '/content.js.bak', '/%2e%2e%2fcontent.js', '/assets/%2e%2e/%2e%2e/.git/config', '/dist/content.js']) {
    assert.equal((await fetch(origin + path)).status, 404, path);
  }
  const csv = [...files.keys()].find((name) => name.endsWith('.csv'));
  if (csv) {
    const response = await fetch(`${origin}/${csv}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'text/csv; charset=utf-8');
  }
  for (const path of ['/data/lab/', '/data/lab/missing/missing.csv', '/data/lab/x/%2e%2e/%2e%2e/%2e%2e/README.md']) {
    assert.equal((await fetch(origin + path)).status, 404, path);
  }
  assert.equal((await fetch(origin + '/content.js', { method: 'POST', body: 'mode=all' })).status, 405);
  const head = await fetch(origin + '/content.js', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal((await fetch(origin + '/%invalid')).status, 400);
});
