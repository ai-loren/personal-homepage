import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { PROJECT_ROOT, createPublicFiles } from './site.mjs';

export const decodeContent = (files) => {
  const context = { window: {} };
  runInNewContext(files.get('content.js').toString(), context);
  return JSON.parse(JSON.stringify(context.window.SITE_CONTENT));
};

export async function temporaryDirectory(t) {
  const parent = join(PROJECT_ROOT, '.harness-e2e/generated');
  await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(join(parent, 'publication-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

// 在临时目录里摆一份能构建的源文件，再写入要测的 content。
// index.html 必须拷源文件：构建产物里的占位符已经按当前 content 填好了，拿它来测会测成当前站点自己的首页。
export async function stage(t, content, { skip = () => false } = {}) {
  const root = await temporaryDirectory(t);
  for (const [name, bytes] of await createPublicFiles()) {
    if (name === 'content.js' || skip(name)) continue;
    const target = join(root, name);
    await mkdir(join(target, '..'), { recursive: true });
    await writeFile(target, name === 'index.html' ? await readFile(join(PROJECT_ROOT, 'index.html')) : bytes);
  }
  await writeContent(root, content);
  return root;
}

export const writeContent = (root, content) => writeFile(join(root, 'content.js'), `window.SITE_CONTENT = ${JSON.stringify(content)};`);
