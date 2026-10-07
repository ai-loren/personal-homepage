// 只核对 loren 这份 content.js 的测试：锁定 Tencent、字节跳动的信息不外泄、三个小工具、双语作品等。
// 用这个仓库做模板的人换成自己的内容后，删掉这个文件即可；通用的发布与安全检查在 site.test.mjs。
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { CAREER_VISIBILITY } from '../site.config.mjs';
import { createPreviewServer, createPublicFiles, readSourceContent, selectPublicContent, writePublicFiles } from './site.mjs';
import { decodeContent, stage, temporaryDirectory, writeContent } from './test-helpers.mjs';

const source = await readSourceContent();
const privateText = /ByteDance|字节跳动|Seed AI Infra Engineer|Ads Infra Engineer|ipgen\.ohayoo\.cn|bytedance-logo\.png|bytedance-seed-logo\.png|ocean-engine-logo\.png/i;
const withoutBuildFields = (companies) => companies.map(({ modeName, privateMarkers, ...company }) => company);

test('the published site is locked to Tencent', () => {
  assert.equal(CAREER_VISIBILITY, 'tencent');
  const content = selectPublicContent(source);
  assert.equal(content.careerMode, 'tencent');
  assert.deepEqual(content.careerModes, { tencent: 'Tencent' });
  assert.deepEqual(content.experience.map((company) => company.id), ['tencent']);
  assert.equal(content.experience[0].roles[0].title, 'Hunyuan AI Infra Engineer');
});

test('all and ByteDance modes keep the full career data, with menu names from content.js', () => {
  const before = structuredClone(source);
  const all = selectPublicContent(source, 'all');
  assert.deepEqual(Object.entries(all.careerModes), [['all', '全部履历'], ['bytedance', 'ByteDance'], ['tencent', 'Tencent']]);
  assert.deepEqual(all.experience, withoutBuildFields(source.experience));
  const bytedance = selectPublicContent(source, 'bytedance');
  assert.deepEqual(bytedance.careerModes, { bytedance: 'ByteDance' });
  assert.deepEqual(bytedance.experience[0].roles.map((role) => role.title), ['Seed AI Infra Engineer', 'Ads Infra Engineer']);
  assert.deepEqual(source, before);
});

test('Tencent public files contain no ByteDance information', async () => {
  const files = await createPublicFiles();
  assert.deepEqual(decodeContent(files).experience.map((company) => company.id), ['tencent']);
  for (const [name, bytes] of files) {
    assert(!privateText.test(name), name);
    if (/\.(js|html|css|txt)$/.test(name)) assert(!privateText.test(bytes.toString()), `Private content leaked in ${name}`);
  }
  for (const name of ['assets/tencent-logo.png', 'assets/tencent-hunyuan-logo.png', 'vendor/three.min.js', 'vendor/fonts/noto-serif-sc-subset.woff2']) assert(files.has(name), name);
  assert(!files.has('assets/bytedance-logo.png'));
});

test('ByteDance references outside experience stop publication', async (t) => {
  const root = await stage(t, source);
  for (const marker of ['Seed AI Infra Engineer', 'seed ai infra engineer', 'bytedance', 'BYTEDANCE', 'ipgen.ohayoo.cn', 'IPGEN.OHAYOO.CN', 'Ocean Engine', '巨量引擎']) {
    await t.test(marker, async () => {
      const poisoned = structuredClone(source);
      poisoned.profile.description = marker;
      await writeContent(root, poisoned);
      await assert.rejects(createPublicFiles({ root }), /excluded company's information/);
    });
  }
});

test('the home page is filled with loren’s profile', async () => {
  const html = (await createPublicFiles()).get('index.html').toString();
  assert.match(html, /<title>Loren&#39;s Galaxy<\/title>/);
  assert.match(html, /<img src="\.\/assets\/loren-portrait\.webp" width="720" height="960" alt="loren 的个人照片">/);
  assert.match(html, /<strong class="hero-education-school">西安电子科技大学<\/strong>/);
  assert.match(html, /<span class="hero-education-meta">硕士 · 计算机技术 <i>／<\/i> 本科 · 软件工程<\/span>/);
  assert.match(html, /<dd data-profile="role">Tencent Hunyuan AI Infra Engineer<\/dd>/);
  assert.equal((html.match(/<ul class="hero-focus"[^>]*>(.*?)<\/ul>/s)[1].match(/<li>/g) || []).length, 4);
  assert.match(html, /<span class="coordinate-name">LOREN&#39;S SOLAR SYSTEM<\/span>/);
});

test('every lab experiment ships at least two datasets', () => {
  assert(source.experiments.every((experiment) => experiment.datasets.length >= 2), 'each experiment ships at least two datasets');
});

test('works with screenshots and a bilingual write-up are present', () => {
  assert(source.projects.some((project) => project.image), 'a card image must be among the checked images');
  assert(source.projects.some((project) => (project.body || []).some((block) => block.type === 'image')), 'a body image must be among the checked images');
  assert.deepEqual(source.projects.filter((project) => project.translations).map((project) => project.id), ['managed-agent', 'syndica', 'nova']);
});

test('works are filtered by type, uses and code, and a stray type names the declared values', async (t) => {
  assert.deepEqual(source.projectFacets.map((facet) => [facet.key, Boolean(facet.multiple)]), [['type', false], ['uses', true], ['code', false]]);
  const poisoned = structuredClone(source);
  poisoned.projects[0].type = '网站';
  const root = await stage(t, poisoned);
  await assert.rejects(createPublicFiles({ root }), new RegExp(`Project ${source.projects[0].id} expects type to be one of 平台 / 框架 / 应用 / 工具; got "网站"`));
});

test('the three in-site tools are published, embedded once each, and a typo or missing submodule stops publication', async (t) => {
  const files = await createPublicFiles();
  assert.deepEqual([...files.keys()].filter((name) => name.startsWith('tools/')), ['tools/vram-ledger.js', 'tools/ckpt-goodput/ckpt-goodput.js', 'tools/agent-trace-replay/agent-trace-replay.js']);
  assert.deepEqual(source.projects.flatMap((project) => (project.body || []).filter((block) => block.type === 'tool').map((block) => block.tool)), ['vram-ledger', 'ckpt-goodput', 'agent-trace-replay']);
  const poisoned = structuredClone(source);
  poisoned.projects.find((project) => project.id === 'vram-ledger').body.push({ type: 'tool', tool: 'vram-legder' });
  const root = await stage(t, poisoned);
  await assert.rejects(createPublicFiles({ root }), /Project vram-ledger embeds tool "vram-legder"; expected one of vram-ledger, ckpt-goodput, agent-trace-replay\./);
  await writeContent(root, source);
  await rm(join(root, 'tools/ckpt-goodput'), { recursive: true });
  await assert.rejects(createPublicFiles({ root }), /tools\/ckpt-goodput\/ckpt-goodput\.js is missing: it comes from the git submodule at tools\/ckpt-goodput.*git submodule update --init/);
});

test('all and ByteDance publications still build with their logos', async () => {
  for (const mode of ['all', 'bytedance']) {
    const files = await createPublicFiles({ visibility: mode });
    const content = decodeContent(files);
    assert.equal(content.careerMode, mode);
    assert(files.has('assets/bytedance-logo.png'));
    assert.equal(files.has('assets/tencent-logo.png'), mode === 'all');
    assert.equal(content.experience.length, mode === 'all' ? 2 : 1);
  }
});

test('rebuilding a former all directory removes the ByteDance logos', async (t) => {
  const output = join(await temporaryDirectory(t), 'dist');
  await writePublicFiles(await createPublicFiles({ visibility: 'all' }), output);
  assert((await stat(join(output, 'assets/bytedance-logo.png'))).isFile());
  await writePublicFiles(await createPublicFiles(), output);
  await assert.rejects(stat(join(output, 'assets/bytedance-logo.png')), { code: 'ENOENT' });
  assert(!privateText.test(await readFile(join(output, 'content.js'), 'utf8')));
});

test('the preview serves the Tencent snapshot, the lab CSVs, and never the ByteDance logos', async (t) => {
  const server = createPreviewServer(await createPublicFiles());
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const path of ['/content.js', '/content.js?careerMode=all', '/content.js?careerMode=bytedance']) {
    const body = await (await fetch(origin + path)).text();
    assert(!privateText.test(body), path);
    assert.match(body, /Hunyuan AI Infra Engineer/);
  }
  for (const path of ['/assets/bytedance-logo.png', '/assets/bytedance-seed-logo.png', '/assets/ocean-engine-logo.png']) {
    assert.equal((await fetch(origin + path)).status, 404, path);
  }
  const csv = await fetch(origin + '/data/lab/goodput/interruptions.csv');
  assert.equal(csv.status, 200);
  assert.match(await csv.text(), /^interruption_id,day,time,root_cause,/);
});