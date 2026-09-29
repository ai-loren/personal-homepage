import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PROJECT_ROOT, createPublicFiles } from '../scripts/site.mjs';

const files = await createPublicFiles({ visibility: 'all' });
const suite = await readFile(new URL('./career-modes.js', import.meta.url), 'utf8');
const assets = Object.fromEntries([...files.keys()]
  .filter((name) => name.startsWith('assets/'))
  .map((name) => [name, join(PROJECT_ROOT, name)]));

// 完整数据与图片只注入本次自动化浏览器，不写入 dist，也不开放额外 HTTP 路径。
process.stdout.write(`async page => {
  const assets = ${JSON.stringify(assets)};
  try {
    for (const [name, path] of Object.entries(assets)) {
      await page.route('**/' + name, route => route.fulfill({ path }));
    }
    return await (${suite.trim()})(page, ${JSON.stringify(files.get('content.js').toString())});
  } finally {
    for (const name of Object.keys(assets)) await page.unroute('**/' + name);
  }
}`);
