(() => {
  'use strict';

  const { profile, about, experiments, journey, library, articles, projects, ideas } = window.SITE_CONTENT;
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
  const detailHref = (page, id) => `#${page}/${encodeURIComponent(id)}`;
  const safeURL = (value) => {
    try {
      const url = new URL(value);
      return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
    } catch {
      return '';
    }
  };
  const icons = {
    mail: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="m3 6 9 7 9-7"></path></svg>',
    github: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M9 19c-4 1-4-2-6-2m12 5v-3.5c0-1 .1-1.4-.5-2 3.1-.4 6.5-1.5 6.5-6.5A5 5 0 0 0 19.5 6a5 5 0 0 0-.1-4S18.2 1.6 15 3a13 13 0 0 0-6 0C5.8 1.6 4.6 2 4.6 2a5 5 0 0 0-.1 4A5 5 0 0 0 3 10c0 5 3.4 6.1 6.5 6.5-.6.6-.6 1.2-.5 2V22"></path></svg>',
  };
  const pageNames = {
    home: '首页',
    about: '关于',
    writing: '文字',
    projects: '作品',
    lab: '实验',
    journey: '经历',
    library: '收藏',
    ideas: '随想',
  };
  const reader = $('#reader-dialog');
  const contact = $('#contact-dialog');
  let activeView = 'home';
  let activeDetail = null;
  let articleCategory = '全部';
  let projectCategory = '全部';
  let toastTimer;

  document.title = profile.siteTitle;
  $('meta[name="description"]').content = profile.description;
  $$('[data-profile]').forEach((node) => {
    node.textContent = profile[node.dataset.profile] ?? '';
  });
  $('[data-site-name]').innerHTML = `${escapeHTML(profile.name)}<span>.</span>`;
  $('#year').textContent = new Date().getFullYear();
  $$('[data-demo-label]').forEach((node) => { node.hidden = !profile.demo; });
  if (articles.length) {
    $('#latest-note').href = detailHref('writing', articles[0].id);
    $('.latest-note-title').textContent = articles[0].title;
    $('#latest-note-meta').textContent = `${articles[0].date} · ${articles[0].category}`;
  } else {
    $('.latest-block').hidden = true;
  }

  function setTheme(theme) {
    const isDark = theme === 'dark';
    document.documentElement.dataset.theme = theme;
    $('.theme-toggle').setAttribute('aria-label', `切换为${isDark ? '浅' : '深'}色模式`);
    $('.theme-toggle').title = `切换为${isDark ? '浅' : '深'}色模式`;
    $('meta[name="theme-color"]').content = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    try { localStorage.setItem('personal-space-theme', theme); } catch {}
  }
  let savedTheme = 'dark';
  try {
    if (localStorage.getItem('personal-space-theme') === 'light') savedTheme = 'light';
  } catch {}
  setTheme(savedTheme);
  $('.theme-toggle').addEventListener('click', () => {
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  });

  function closeMenu() {
    $('#mobile-nav').hidden = true;
    $('.menu-toggle').setAttribute('aria-expanded', 'false');
    $('.menu-toggle').setAttribute('aria-label', '打开导航');
  }
  $('.menu-toggle').addEventListener('click', () => {
    const willOpen = $('#mobile-nav').hidden;
    $('#mobile-nav').hidden = !willOpen;
    $('.menu-toggle').setAttribute('aria-expanded', String(willOpen));
    $('.menu-toggle').setAttribute('aria-label', willOpen ? '关闭导航' : '打开导航');
  });
  $('#mobile-nav').addEventListener('click', (event) => {
    if (event.target.closest('a')) closeMenu();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !$('#mobile-nav').hidden) {
      closeMenu();
      $('.menu-toggle').focus();
    }
  });
  matchMedia('(min-width: 761px)').addEventListener('change', (event) => {
    if (event.matches) closeMenu();
  });

  function renderFilters(selector, categories, selected, onSelect) {
    const container = $(selector);
    container.innerHTML = ['全部', ...new Set(categories)].map((category) =>
      `<button type="button" class="filter-button" aria-pressed="${category === selected}" data-category="${escapeHTML(category)}">${escapeHTML(category)}</button>`
    ).join('');
    container.addEventListener('click', (event) => {
      const button = event.target.closest('[data-category]');
      if (!button) return;
      container.querySelectorAll('button').forEach((node) => node.setAttribute('aria-pressed', String(node === button)));
      onSelect(button.dataset.category);
    });
  }

  function readingTime(article) {
    const length = article.body.reduce((total, block) => total + (block.text || block.items?.join('') || '').length, 0);
    return Math.max(1, Math.ceil(length / 350));
  }

  function renderArticles() {
    const query = $('#writing-search').value.trim().toLocaleLowerCase();
    const matching = articles.filter((article) => {
      const matchesCategory = articleCategory === '全部' || article.category === articleCategory;
      const searchable = [article.title, article.summary, article.category, ...article.body.map((block) => block.text || block.items?.join(' ') || '')].join(' ');
      return matchesCategory && searchable.toLocaleLowerCase().includes(query);
    });
    $('#writing-list').innerHTML = matching.map((article) => `
      <a class="writing-item" href="${detailHref('writing', article.id)}">
        <time class="writing-date" datetime="${escapeHTML(article.date)}">${escapeHTML(article.date)}</time>
        <div><h2>${escapeHTML(article.title)}</h2><p>${escapeHTML(article.summary)}</p>
        <div class="item-meta"><span class="item-tag">${escapeHTML(article.category)}</span><span>${readingTime(article)} 分钟阅读</span></div></div>
        <span class="item-arrow" aria-hidden="true">↗</span>
      </a>`).join('');
    $('#writing-empty').hidden = matching.length > 0;
  }

  function renderAbout() {
    $('#about-content').innerHTML = `
      <p class="about-lead">${escapeHTML(about.lead)}</p>
      <div class="about-copy">${about.paragraphs.map((paragraph) => `<p>${escapeHTML(paragraph)}</p>`).join('')}</div>
      <dl class="about-facts">${about.facts.map((fact) => `
        <div><dt>${escapeHTML(fact.label)}</dt><dd>${escapeHTML(fact.value)}</dd></div>
      `).join('')}</dl>`;
  }

  const artworks = {
    browser: '<div class="mini-browser"><div class="browser-dots"><i></i><i></i><i></i></div><strong>Hello, world.</strong><div class="mini-line"></div><div class="mini-line short"></div><div class="mini-pill"></div></div>',
    timer: '<div class="focus-dial"><strong>25:00</strong><span>ONE THING</span></div>',
    notes: '<div class="note-stack"><div class="mini-note"><span>A little thought.</span><div class="mini-line"></div><div class="mini-line short"></div></div></div>',
    terminal: '<div class="tiny-terminal"><span>~ / tiny-scripts</span><br>$ make life easier<br>one small step at a time<span> _</span></div>',
  };

  function renderProjects() {
    const matching = projects.filter((project) => projectCategory === '全部' || project.category === projectCategory);
    $('#project-count').textContent = `${matching.length} 个作品`;
    $('#project-list').innerHTML = matching.map((project) => `
      <a class="project-card" href="${detailHref('projects', project.id)}">
        <div class="project-visual" aria-hidden="true"><span class="project-label">${escapeHTML(project.category)} / ${escapeHTML(project.status)}</span>${artworks[project.artwork] || artworks.browser}</div>
        <div class="project-content"><div class="project-heading"><div><h2>${escapeHTML(project.name)}</h2></div><span class="item-arrow" aria-hidden="true">↗</span></div>
        <p>${escapeHTML(project.description)}</p><div class="item-meta">${project.tags.map((tag) => `<span class="item-tag">${escapeHTML(tag)}</span>`).join('')}<span>${escapeHTML(project.status)}</span></div></div>
      </a>`).join('');
    if (!matching.length) $('#project-list').innerHTML = '<p class="empty-state">新的作品正在路上。</p>';
  }

  function renderExperiments() {
    $('#experiment-list').innerHTML = experiments.map((experiment, index) => `
      <article class="experiment-card">
        <div class="experiment-index" aria-hidden="true">${String(index + 1).padStart(2, '0')}</div>
        <div><span class="experiment-status"><i></i>${escapeHTML(experiment.status)}</span>
        <h2>${escapeHTML(experiment.name)}</h2><p>${escapeHTML(experiment.description)}</p></div>
        <div class="item-meta">${experiment.tags.map((tag) => `<span class="item-tag">${escapeHTML(tag)}</span>`).join('')}</div>
      </article>`).join('');
    if (!experiments.length) $('#experiment-list').innerHTML = '<p class="empty-state">新的实验正在形成。</p>';
  }

  function renderJourney() {
    $('#journey-list').innerHTML = journey.map((entry) => `
      <article class="journey-item"><div class="journey-period">${escapeHTML(entry.period)}</div>
      <div><h2>${escapeHTML(entry.title)}</h2><p>${escapeHTML(entry.description)}</p></div></article>`).join('');
  }

  function renderLibrary() {
    $('#library-list').innerHTML = library.map((item) => `
      <article class="library-item"><span class="library-type">${escapeHTML(item.type)}</span>
      <div><h2>${escapeHTML(item.title)}</h2><p>${escapeHTML(item.note)}</p></div></article>`).join('');
  }

  function renderIdeas() {
    $('#ideas-list').innerHTML = ideas.map((idea) => `
      <article class="idea-item"><time class="writing-date" datetime="${escapeHTML(idea.date)}">${escapeHTML(idea.date)}</time>
      <div class="idea-content"><h2>${escapeHTML(idea.title)}</h2><p>${escapeHTML(idea.text)}</p>
      <div class="item-meta">${idea.tags.map((tag) => `<span># ${escapeHTML(tag)}</span>`).join('')}</div></div></article>`
    ).join('');
    if (!ideas.length) $('#ideas-list').innerHTML = '<p class="empty-state">给下一个想法留个位置。</p>';
  }

  function renderBody(blocks) {
    return blocks.map((block) => {
      if (block.type === 'ul') return `<ul>${block.items.map((item) => `<li>${escapeHTML(item)}</li>`).join('')}</ul>`;
      const tag = { p: 'p', h3: 'h3', quote: 'blockquote' }[block.type] || 'p';
      return `<${tag}>${escapeHTML(block.text)}</${tag}>`;
    }).join('');
  }

  function syncModalLock() {
    document.body.classList.toggle('modal-open', reader.open || contact.open);
  }

  function renderDetail(item, page) {
    $('#reader-kind').textContent = page === 'writing' ? 'READING ROOM' : 'PROJECT NOTES';
    $('#reader-title').textContent = item.title || item.name;
    $('#reader-meta').textContent = page === 'writing'
      ? `${item.date} / ${item.category} / ${readingTime(item)} 分钟阅读`
      : `${item.subtitle} / ${item.status}`;
    $('#reader-body').innerHTML = renderBody(item.body);
    const links = page === 'projects' ? [{ text: '访问项目 ↗', url: safeURL(item.url) }, { text: '查看源码 ↗', url: safeURL(item.source) }] : [];
    $('#reader-links').innerHTML = links.filter((link) => link.url).map((link) =>
      `<a class="button" href="${escapeHTML(link.url)}" target="_blank" rel="noopener noreferrer">${link.text}</a>`
    ).join('');
    activeDetail = { page, hash: location.hash };
    document.title = `${item.title || item.name} — ${profile.name}`;
    if (contact.open) contact.close();
    if (!reader.open) reader.showModal();
    reader.scrollTop = 0;
    syncModalLock();
  }

  function route() {
    let parts;
    try { parts = decodeURIComponent(location.hash.slice(1)).split('/'); } catch { parts = ['home']; }
    if (parts[0] === 'contact') {
      if (reader.open) { activeDetail = null; reader.close(); }
      closeMenu();
      syncModalLock();
      return;
    }
    if (parts[0] === 'main') return;
    const page = Object.hasOwn(pageNames, parts[0]) ? parts[0] : 'home';
    const changed = activeView !== page;
    activeView = page;
    document.documentElement.dataset.page = page;
    $('meta[name="theme-color"]').content = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    $$('[data-view]').forEach((node) => { node.hidden = node.dataset.view !== page; });
    $$('[data-nav]').forEach((node) => {
      if (node.dataset.nav === page) node.setAttribute('aria-current', 'page');
      else node.removeAttribute('aria-current');
    });
    closeMenu();
    document.title = page === 'home' ? profile.siteTitle : `${pageNames[page]} — ${profile.name}`;
    const collection = page === 'writing' ? articles : projects;
    const item = ['writing', 'projects'].includes(page) && parts[1] && collection.find((entry) => entry.id === parts.slice(1).join('/'));
    if (item) {
      renderDetail(item, page);
    } else {
      activeDetail = null;
      if (reader.open) reader.close();
      if (parts[1]) notify('这篇内容暂时找不到，先看看其他内容吧。');
    }
    if (changed) {
      window.scrollTo({ top: 0, behavior: 'instant' });
      if (!item) $('#main').focus({ preventScroll: true });
    }
    syncModalLock();
  }

  $('#reader-close').addEventListener('click', () => reader.close());
  reader.addEventListener('close', () => {
    if (activeDetail && location.hash === activeDetail.hash) {
      history.replaceState(null, '', `#${activeDetail.page}`);
      document.title = `${pageNames[activeDetail.page]} — ${profile.name}`;
    }
    activeDetail = null;
    syncModalLock();
  });

  function notify(message) {
    clearTimeout(toastTimer);
    $('#toast').textContent = message;
    $('#toast').classList.add('visible');
    toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3600);
  }

  const githubURL = safeURL(profile.github);
  $('#contact-actions').innerHTML = `${githubURL ? `<a class="contact-button" href="${escapeHTML(githubURL)}" target="_blank" rel="noopener noreferrer">${icons.github} GitHub ↗</a>` : ''}
    <button class="contact-button" id="contact-open" type="button">${icons.mail} 联系我 <span aria-hidden="true">↗</span></button>`;
  $('#contact-open').addEventListener('click', () => {
    const email = profile.email.trim();
    $('#contact-message').textContent = email
      ? '欢迎写信给我，分享你的想法。'
      : '这是个人主页演示，暂未提供联系方式。';
    $('#contact-details').innerHTML = email
      ? `<a class="email-address" href="mailto:${encodeURIComponent(email)}">${escapeHTML(email)}</a><button class="contact-button" id="copy-email" type="button">复制邮箱</button><span class="muted-note" id="copy-status" role="status"></span>`
      : '';
    contact.showModal();
    syncModalLock();
    $('#copy-email')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(email);
        $('#copy-status').textContent = '邮箱已复制。';
      } catch {
        $('#copy-status').textContent = '复制未完成，请选中邮箱地址手动复制。';
      }
    });
  });
  $('#contact-close').addEventListener('click', () => contact.close());
  contact.addEventListener('close', syncModalLock);
  [reader, contact].forEach((dialog) => {
    dialog.addEventListener('click', (event) => {
      const rect = dialog.getBoundingClientRect();
      if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
    });
  });

  renderFilters('#writing-filters', articles.map((article) => article.category), articleCategory, (category) => {
    articleCategory = category;
    renderArticles();
  });
  renderFilters('#project-filters', projects.map((project) => project.category), projectCategory, (category) => {
    projectCategory = category;
    renderProjects();
  });
  $('#writing-search').addEventListener('input', renderArticles);
  renderAbout();
  renderArticles();
  renderProjects();
  renderExperiments();
  renderJourney();
  renderLibrary();
  renderIdeas();
  window.addEventListener('hashchange', route);
  route();
})();
