import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { CAREER_VISIBILITY } from '../site.config.mjs';
import { PROJECT_ROOT, createPreviewServer, createPublicFiles, readSourceContent, selectPublicContent, writePublicFiles } from './site.mjs';

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
  assert.equal((await fetch(origin + '/content.js', { method: 'POST', body: 'mode=all' })).status, 405);
  const head = await fetch(origin + '/content.js', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal((await fetch(origin + '/%invalid')).status, 400);
});
