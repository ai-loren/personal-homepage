// 每篇文章、每个作品一张静态页，加 sitemap.xml 与 404.html。
// 站内是 #writing/<id> 这样的 hash 路由，搜索引擎和分享卡片只认得首页；这些静态页让每篇内容有自己的网址、标题、简介和分享图。
// 正文与 app.js 的 renderBody 用同一套块规则，且只取公开内容；页面不带脚本，CSP 里 script-src 是 'none'。

const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const CSP = "default-src 'self'; script-src 'none'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
const SECTIONS = {
  writing: { kind: 'READING ROOM / 文字', open: '在星系里阅读', back: '全部文字' },
  projects: { kind: 'PROJECT NOTES / 作品', open: '在星系里打开', back: '全部作品' },
};

export function staticPageNames(content) {
  return [
    ...(content.articles || []).map((article) => `writing/${article.id}.html`),
    ...(content.projects || []).map((project) => `projects/${project.id}.html`),
  ];
}

export function renderStaticPages(content, { stylesheet, shareImage = null }) {
  const { profile = {}, articles = [], projects = [] } = content;
  const site = profile.siteUrl || '';
  const known = { writing: new Set(articles.map((article) => article.id)), projects: new Set(projects.map((project) => project.id)) };
  for (const [section, items] of [['writing', articles], ['projects', projects]]) {
    for (const item of items) {
      if (typeof item.id !== 'string' || !SLUG.test(item.id)) {
        throw new Error(`${section === 'writing' ? 'Article' : 'Project'} id ${JSON.stringify(item.id)} becomes the file ${section}/<id>.html; expected lowercase letters, digits and hyphens. Rename it in content.js (old #${section}/ links stop working).`);
      }
    }
  }

  const inSite = (url) => {
    const match = /^#(writing|projects)\/([a-z0-9-]+)$/.exec(url);
    if (match && known[match[1]].has(match[2])) return `../${match[1]}/${match[2]}.html`;
    return /^#[a-z]+\/[a-z0-9-]+$/.test(url) ? `../${url}` : null;
  };
  const external = (url) => {
    try {
      const parsed = new URL(url);
      return ['https:', 'http:'].includes(parsed.protocol) ? parsed.href : '';
    } catch {
      return '';
    }
  };
  const asset = (src) => `../${String(src).replace(/^\.\//, '')}`;
  const renderBody = (blocks, openHref) => (blocks || []).map((block) => {
    if (block.type === 'ul') return `<ul>${block.items.map((item) => `<li>${escapeHTML(item)}</li>`).join('')}</ul>`;
    if (block.type === 'image') return `<figure class="reader-figure"><img src="${escapeHTML(asset(block.src))}" alt="${escapeHTML(block.alt)}" loading="lazy">${block.caption ? `<figcaption>${escapeHTML(block.caption)}</figcaption>` : ''}</figure>`;
    if (block.type === 'tool') return `<p class="static-tool"><a href="${escapeHTML(openHref)}">这里是一个能直接用的小工具，要在网站里打开 ↗</a></p>`;
    if (block.type === 'links') {
      return `<ul class="reader-refs">${block.items.map((link) => {
        const local = inSite(link.url);
        if (local) return `<li><a href="${escapeHTML(local)}">${escapeHTML(link.text)} →</a></li>`;
        const url = external(link.url);
        return `<li>${url ? `<a href="${escapeHTML(url)}" rel="noopener noreferrer">${escapeHTML(link.text)} ↗</a>` : escapeHTML(link.text)}</li>`;
      }).join('')}</ul>`;
    }
    const tag = { p: 'p', h3: 'h3', quote: 'blockquote' }[block.type] || 'p';
    return `<${tag}>${escapeHTML(block.text)}</${tag}>`;
  }).join('');

  const head = ({ title, description, path, type, depth }) => {
    const up = '../'.repeat(depth);
    const url = site ? `${site}${path}` : '';
    const share = site && shareImage ? [
      `<meta property="og:image" content="${escapeHTML(site + shareImage.path)}">`,
      `<meta property="og:image:width" content="${shareImage.width}">`,
      `<meta property="og:image:height" content="${shareImage.height}">`,
      `<meta property="og:image:alt" content="${escapeHTML(shareImage.alt)}">`,
      '<meta name="twitter:card" content="summary_large_image">',
      `<meta name="twitter:image" content="${escapeHTML(site + shareImage.path)}">`,
    ] : ['<meta name="twitter:card" content="summary">'];
    return [
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      `<meta http-equiv="Content-Security-Policy" content="${CSP}">`,
      `<title>${escapeHTML(title)}</title>`,
      `<meta name="description" content="${escapeHTML(description)}">`,
      ...(url ? [`<link rel="canonical" href="${escapeHTML(url)}">`, `<meta property="og:url" content="${escapeHTML(url)}">`] : []),
      `<meta property="og:type" content="${type}">`,
      `<meta property="og:site_name" content="${escapeHTML(profile.siteTitle)}">`,
      `<meta property="og:title" content="${escapeHTML(title)}">`,
      `<meta property="og:description" content="${escapeHTML(description)}">`,
      '<meta property="og:locale" content="zh_CN">',
      ...share,
      `<meta name="twitter:title" content="${escapeHTML(title)}">`,
      `<meta name="twitter:description" content="${escapeHTML(description)}">`,
      `<link rel="icon" type="image/png" href="${up}assets/saturn-favicon.png">`,
      `<link rel="stylesheet" href="${up}${stylesheet}">`,
    ].map((line) => `    ${line}`).join('\n');
  };
  const page = ({ section, title, description, path, type, inner }) => `<!doctype html>
<html lang="zh-CN" data-theme="dark" data-page="${section}">
  <head>
${head({ title, description, path, type, depth: path.split('/').length - 1 })}
  </head>
  <body class="static-page">
    <main class="static-article reader-content">
${inner}
    </main>
  </body>
</html>
`;

  const pages = new Map();
  const siteTitle = profile.siteTitle || profile.name || '';
  for (const article of articles) {
    const section = SECTIONS.writing;
    const open = `../#writing/${article.id}`;
    pages.set(`writing/${article.id}.html`, page({
      section: 'writing',
      title: `${article.title} · ${siteTitle}`,
      description: article.summary || '',
      path: `writing/${article.id}.html`,
      type: 'article',
      inner: `      <nav class="static-nav"><a href="../#writing">← ${escapeHTML(siteTitle)} / ${section.back}</a></nav>
      <p class="static-kind">${section.kind}</p>
      <h2>${escapeHTML(article.title)}</h2>
      <p class="static-meta"><time datetime="${escapeHTML(article.date)}">${escapeHTML(article.date)}</time> / ${escapeHTML(article.category)}</p>
      <div class="reader-body">${renderBody(article.body, open)}</div>
      <p class="static-open"><a class="button" href="${escapeHTML(open)}">${section.open} ↗</a></p>`,
    }));
  }
  for (const project of projects) {
    const section = SECTIONS.projects;
    const open = `../#projects/${project.id}`;
    const links = [['访问项目', external(project.url)], ['查看源码', external(project.source)]].filter(([, url]) => url)
      .map(([text, url]) => `<a class="button" href="${escapeHTML(url)}" rel="noopener noreferrer">${text} ↗</a>`).join('');
    const cover = project.image ? `<figure class="reader-figure"><img src="${escapeHTML(asset(project.image.src))}" alt="${escapeHTML(project.image.alt)}"></figure>` : '';
    pages.set(`projects/${project.id}.html`, page({
      section: 'projects',
      title: `${project.name}${project.tagline ? `: ${project.tagline}` : ''} · ${siteTitle}`,
      description: project.description || '',
      path: `projects/${project.id}.html`,
      type: 'article',
      inner: `      <nav class="static-nav"><a href="../#projects">← ${escapeHTML(siteTitle)} / ${section.back}</a></nav>
      <p class="static-kind">${section.kind}</p>
      <h2>${escapeHTML(project.name)}${project.tagline ? `: <span class="project-tagline">${escapeHTML(project.tagline)}</span>` : ''}</h2>
      <p class="static-meta">${escapeHTML(project.subtitle || project.description || '')}</p>
      ${cover}
      <div class="reader-body">${renderBody(project.body, open)}</div>
      <p class="static-open"><a class="button" href="${escapeHTML(open)}">${section.open} ↗</a>${links}</p>`,
    }));
  }

  if (site) {
    const entry = (path, lastmod) => `  <url><loc>${escapeHTML(site + path)}</loc>${lastmod ? `<lastmod>${escapeHTML(lastmod)}</lastmod>` : ''}</url>`;
    pages.set('sitemap.xml', [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      entry(''),
      ...articles.map((article) => entry(`writing/${article.id}.html`, /^\d{4}-\d{2}-\d{2}$/.test(article.date || '') ? article.date : '')),
      ...projects.map((project) => entry(`projects/${project.id}.html`)),
      '</urlset>',
      '',
    ].join('\n'));
  }

  // GitHub Pages 用 404.html 回应任何不存在的路径，相对地址会跟着出错的路径走，所以链接与样式表从站点根路径写起；
  // 只取 siteUrl 的路径部分，换域名或在本地预览时样式表仍同源，不会被 CSP 拦下。没有 siteUrl 时只能假设站点在根目录。
  const root = site ? new URL(site).pathname : '/';
  pages.set('404.html', `<!doctype html>
<html lang="zh-CN" data-theme="dark" data-page="home">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="${CSP}">
    <meta name="robots" content="noindex">
    <title>迷路了 · ${escapeHTML(siteTitle)}</title>
    <link rel="icon" type="image/png" href="${escapeHTML(root)}assets/saturn-favicon.png">
    <link rel="stylesheet" href="${escapeHTML(root)}${stylesheet}">
  </head>
  <body class="static-page">
    <main class="static-article reader-content">
      <p class="static-kind">404 / LOST IN SPACE</p>
      <h2>这颗星不在星图上</h2>
      <div class="reader-body"><p>你要找的页面不存在，或者已经搬走了。</p></div>
      <p class="static-open"><a class="button" href="${escapeHTML(root)}">回到首页 ↗</a><a class="button" href="${escapeHTML(root)}#writing">看看文字 ↗</a></p>
    </main>
  </body>
</html>
`);
  return pages;
}
