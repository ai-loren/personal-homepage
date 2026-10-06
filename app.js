(() => {
  'use strict';

  const {
    careerMode,
    careerModes: careerModeNames = {},
    profile: baseProfile,
    about,
    experiments,
    experience: allExperience = [],
    journey,
    library,
    articles,
    projects,
    ideas,
    comments = {},
    music = {},
  } = structuredClone(window.SITE_CONTENT);
  const allowedCareerModes = Object.freeze(Object.keys(careerModeNames));
  const careerLocked = allowedCareerModes.length <= 1;
  const validCareerMode = allowedCareerModes.includes(careerMode);
  if (!validCareerMode) {
    console.error(`Public careerMode expects one of ${JSON.stringify(allowedCareerModes)}; got ${JSON.stringify(careerMode)}. Rebuild the public site using scripts/site.mjs before serving it.`);
  }
  let activeCareerMode = validCareerMode ? careerMode : null;
  let experience = validCareerMode
    ? allExperience.filter((company) => careerMode === 'all' || company.id === careerMode)
    : [];
  const profile = {
    ...baseProfile,
    role: experience.map((company) => company.profileRole).join('\n') || '未展示职业经历',
  };
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
    ideas: '问题',
  };
  const reader = $('#reader-dialog');
  const contact = $('#contact-dialog');
  let activeView = 'home';
  let activeDetail = null;
  let readerLanguage = 'zh';
  let articleCategory = '全部';
  const articlePageSizes = [6, 10, 20];
  let articlePageSize = 10;
  let articlePage = 1;
  let projectCategory = '全部';
  let toastTimer;
  const mobileViewport = matchMedia('(max-width: 760px)');

  // 回复区只以跨域 iframe 嵌入 giscus，不在本站执行任何第三方脚本或样式；CSP 的 frame-src 只放行这个源。
  const GISCUS_ORIGIN = 'https://giscus.app';
  const GISCUS_SESSION_KEY = 'giscus-session';
  const giscusReady = comments.provider === 'giscus'
    && /^[\w.-]+\/[\w.-]+$/.test(comments.repo || '')
    && /^[\w-]+$/.test(comments.repoId || '')
    && /^[\w-]+$/.test(comments.categoryId || '');
  // giscus.json 只放行正式域名，其他源嵌入会被 giscus 以 frame-ancestors 'none' 拒绝，只能换成提示。
  const replySite = safeURL(comments.site || '');
  const onReplySite = Boolean(replySite) && new URL(replySite).origin === location.origin;
  let replyFrame = null;
  const giscusTheme = () => (document.documentElement.dataset.theme === 'light' ? 'noborder_light' : 'transparent_dark');

  function readGiscusSession() {
    const url = new URL(location.href);
    const incoming = url.searchParams.get('giscus');
    if (incoming !== null) {
      url.searchParams.delete('giscus');
      history.replaceState(null, '', url.href);
      if (/^[\w.~+/=:-]{1,4096}$/.test(incoming)) {
        try { localStorage.setItem(GISCUS_SESSION_KEY, JSON.stringify(incoming)); } catch {}
        return incoming;
      }
    }
    try {
      const stored = JSON.parse(localStorage.getItem(GISCUS_SESSION_KEY) || '""');
      return typeof stored === 'string' && /^[\w.~+/=:-]{0,4096}$/.test(stored) ? stored : '';
    } catch {
      try { localStorage.removeItem(GISCUS_SESSION_KEY); } catch {}
      return '';
    }
  }
  let giscusSession = readGiscusSession();

  function giscusSrc(question) {
    const backLink = `${location.origin}${location.pathname}${detailHref('ideas', question.id)}`;
    const params = new URLSearchParams({
      origin: backLink,
      session: giscusSession,
      theme: giscusTheme(),
      reactionsEnabled: '1',
      emitMetadata: '0',
      inputPosition: 'top',
      repo: comments.repo,
      repoId: comments.repoId,
      category: comments.category || '',
      categoryId: comments.categoryId,
      strict: '1',
      description: question.title,
      backLink,
      term: `question:${question.id}`,
    });
    if (!giscusSession) params.delete('session');
    return `${GISCUS_ORIGIN}/zh-CN/widget?${params}`;
  }

  function mountReplies(question) {
    const container = $('#question-replies');
    if (!container) return;
    if (!giscusReady || !replySite) {
      container.innerHTML = '<p class="replies-pending">回复功能正在接入中，开放后这里可以留下你的答案。</p>';
      return;
    }
    if (!onReplySite) {
      container.innerHTML = `<p class="replies-pending">回复区只在正式网站加载，本地预览不显示。<a class="replies-site-link" href="${escapeHTML(replySite + detailHref('ideas', question.id))}" target="_blank" rel="noopener noreferrer">去正式网站查看回复 ↗</a></p>`;
      return;
    }
    replyFrame = document.createElement('iframe');
    Object.entries({
      class: 'replies-frame',
      title: `「${question.title}」的回复`,
      src: giscusSrc(question),
      loading: 'lazy',
      scrolling: 'no',
      allow: 'clipboard-write',
      referrerpolicy: 'strict-origin',
      sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation',
    }).forEach(([name, value]) => replyFrame.setAttribute(name, value));
    container.replaceChildren(replyFrame);
  }

  function unmountReplies() {
    replyFrame?.remove();
    replyFrame = null;
  }

  function syncReplyTheme() {
    replyFrame?.contentWindow?.postMessage({ giscus: { setConfig: { theme: giscusTheme() } } }, GISCUS_ORIGIN);
  }

  window.addEventListener('message', (event) => {
    if (event.origin !== GISCUS_ORIGIN || !replyFrame || event.source !== replyFrame.contentWindow) return;
    const message = event.data?.giscus;
    if (!message || typeof message !== 'object') return;
    const height = Number(message.resizeHeight);
    if (Number.isFinite(height)) replyFrame.style.height = `${Math.min(Math.max(height, 120), 20000)}px`;
    const credentialsLost = typeof message.error === 'string' && /Bad credentials|Invalid state value|State has expired/.test(message.error);
    if (message.signOut || credentialsLost) {
      giscusSession = '';
      try { localStorage.removeItem(GISCUS_SESSION_KEY); } catch {}
      const question = ideas.find((entry) => activeDetail?.hash === detailHref('ideas', entry.id));
      if (question) replyFrame.src = giscusSrc(question);
    }
  });

  function syncResponsiveState() {
    const isMobile = mobileViewport.matches;
    document.documentElement.dataset.viewport = isMobile ? 'mobile' : 'desktop';
    requestAnimationFrame(() => {
      document.documentElement.dataset.mobileOverflow = isMobile
        ? String(document.documentElement.scrollWidth > window.innerWidth + 1)
        : 'false';
    });
  }

  document.title = profile.siteTitle;
  $('meta[name="description"]').content = profile.description;
  const heroFocus = $('#hero-focus');
  if (heroFocus && Array.isArray(profile.focus) && profile.focus.length) {
    heroFocus.innerHTML = profile.focus.map((item) => `<li>${escapeHTML(item)}</li>`).join('');
  }
  $$('[data-profile]').forEach((node) => {
    node.textContent = profile[node.dataset.profile] ?? '';
  });
  $('[data-site-name]').innerHTML = `${escapeHTML(profile.name)}<span>.</span>`;
  const heroIntro = $('.hero-intro');
  if (heroIntro) {
    heroIntro.innerHTML = profile.motto
      ? `${escapeHTML(profile.intro)}，<span class="hero-motto">${escapeHTML(profile.motto)}</span>`
      : `${escapeHTML(profile.intro)}。`;
  }
  const nowNode = $('[data-profile="now"]');
  if (nowNode && profile.now) {
    nowNode.innerHTML = profile.now.split(/(?<=,)\s+/).map((clause) => `<span class="now-clause">${escapeHTML(clause)}</span>`).join(' ');
  }
  const educationEntries = journey.filter((entry) => entry.degree && entry.major);
  const heroEducation = $('.hero-education');
  if (heroEducation && educationEntries.length) {
    const schools = [...new Set(educationEntries.map((entry) => entry.title))];
    const summary = educationEntries.map((entry) => `${entry.degree} · ${entry.major}`).join(' ／ ');
    $('.hero-education-school').textContent = schools.join(' ／ ');
    $('.hero-education-meta').textContent = summary;
    heroEducation.setAttribute('aria-label', `查看教育经历：${schools.join('、')}，${summary}`);
  } else if (heroEducation) {
    heroEducation.hidden = true;
  }
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
    syncReplyTheme();
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
    document.body.classList.remove('mobile-menu-open');
    $('.menu-toggle').setAttribute('aria-expanded', 'false');
    $('.menu-toggle').setAttribute('aria-label', '打开导航');
    document.documentElement.dataset.mobileMenu = 'closed';
    syncResponsiveState();
  }
  $('.menu-toggle').addEventListener('click', () => {
    closeCareerMenu();
    const willOpen = $('#mobile-nav').hidden;
    $('#mobile-nav').hidden = !willOpen;
    document.body.classList.toggle('mobile-menu-open', willOpen);
    $('.menu-toggle').setAttribute('aria-expanded', String(willOpen));
    $('.menu-toggle').setAttribute('aria-label', willOpen ? '关闭导航' : '打开导航');
    document.documentElement.dataset.mobileMenu = willOpen ? 'open' : 'closed';
    syncResponsiveState();
  });
  $('#mobile-nav').addEventListener('click', (event) => {
    if (event.target.closest('a')) closeMenu();
  });
  document.addEventListener('click', (event) => {
    if ($('#mobile-nav').hidden) return;
    if (event.target.closest('#mobile-nav') || event.target.closest('.menu-toggle')) return;
    closeMenu();
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
  mobileViewport.addEventListener('change', syncResponsiveState);
  window.addEventListener('resize', syncResponsiveState);
  window.addEventListener('load', syncResponsiveState);

  const careerSwitch = $('#career-switch');
  const careerToggle = $('#career-toggle');
  const careerMenu = $('#career-menu');
  careerMenu.innerHTML = allowedCareerModes.map((mode) =>
    `<button class="career-option" type="button" role="menuitemradio" aria-checked="false" tabindex="-1" data-career-mode="${escapeHTML(mode)}">${escapeHTML(careerModeNames[mode])}</button>`
  ).join('');
  const careerOptions = [...careerMenu.querySelectorAll('[data-career-mode]')];

  function syncCareerControl() {
    const label = careerModeNames[activeCareerMode] || '职业展示';
    $('#career-current').textContent = label;
    careerToggle.disabled = careerLocked;
    careerToggle.setAttribute('aria-label', `职业经历展示：${label}${careerLocked ? '（固定）' : ''}`);
    careerToggle.setAttribute('aria-haspopup', careerLocked ? 'false' : 'menu');
    careerToggle.title = careerLocked ? `职业经历展示固定为 ${label}` : `切换职业经历展示：${label}`;
    careerOptions.forEach((option) => {
      option.setAttribute('aria-checked', String(option.dataset.careerMode === activeCareerMode));
    });
    document.documentElement.dataset.careerMode = activeCareerMode || '';
  }

  function setCareerMode(mode) {
    if (careerLocked || !allowedCareerModes.includes(mode) || mode === activeCareerMode) return;
    activeCareerMode = mode;
    experience = allExperience.filter((company) => mode === 'all' || company.id === mode);
    profile.role = experience.map((company) => company.profileRole).join('\n') || '未展示职业经历';
    $$('[data-profile="role"], [data-profile-field="role"]').forEach((node) => {
      node.textContent = profile.role;
    });
    renderExperience();
    syncCareerControl();
    syncResponsiveState();
  }

  function closeCareerMenu(restoreFocus = false) {
    const wasOpen = !careerMenu.hidden;
    careerMenu.hidden = true;
    careerToggle.setAttribute('aria-expanded', 'false');
    if (restoreFocus && wasOpen) careerToggle.focus({ preventScroll: true });
  }

  function focusCareerOption(index) {
    careerOptions.forEach((option, position) => { option.tabIndex = position === index ? 0 : -1; });
    careerOptions[index].focus({ preventScroll: true });
  }

  function openCareerMenu(index = Math.max(0, careerOptions.findIndex((option) => option.dataset.careerMode === activeCareerMode))) {
    if (careerLocked) return;
    closeMenu();
    careerMenu.hidden = false;
    careerToggle.setAttribute('aria-expanded', 'true');
    focusCareerOption(index);
  }

  careerToggle.addEventListener('click', () => {
    if (careerMenu.hidden) openCareerMenu();
    else closeCareerMenu();
  });
  careerToggle.addEventListener('keydown', (event) => {
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    event.preventDefault();
    openCareerMenu(event.key === 'ArrowUp' ? careerOptions.length - 1 : 0);
  });
  careerMenu.addEventListener('click', (event) => {
    const option = event.target.closest('[data-career-mode]');
    if (!careerOptions.includes(option)) return;
    setCareerMode(option.dataset.careerMode);
    closeCareerMenu(true);
  });
  careerMenu.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeCareerMenu(true);
      return;
    }
    if (event.key === 'Tab') {
      closeCareerMenu(true);
      return;
    }
    const index = careerOptions.indexOf(document.activeElement);
    const next = {
      ArrowDown: (index + 1) % careerOptions.length,
      ArrowUp: (index - 1 + careerOptions.length) % careerOptions.length,
      Home: 0,
      End: careerOptions.length - 1,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    focusCareerOption(next);
  });
  careerSwitch.addEventListener('focusout', (event) => {
    if (!careerSwitch.contains(event.relatedTarget)) closeCareerMenu();
  });
  document.addEventListener('pointerdown', (event) => {
    if (!careerSwitch.contains(event.target)) closeCareerMenu();
  });
  window.addEventListener('hashchange', () => closeCareerMenu());
  syncCareerControl();
  careerSwitch.hidden = false;

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
    const text = article.body.map((block) => block.text || block.items?.join(' ') || '').join(' ');
    const hanCharacters = (text.match(/[\u3400-\u9fff]/g) || []).length;
    const latinWords = (text.replace(/[\u3400-\u9fff]/g, ' ').match(/[A-Za-z0-9][A-Za-z0-9’'-]*/g) || []).length;
    return Math.max(1, Math.ceil(hanCharacters / 350 + latinWords / 220));
  }

  function renderArticles() {
    const query = $('#writing-search').value.trim().toLocaleLowerCase();
    const matching = articles.filter((article) => {
      const matchesCategory = articleCategory === '全部' || article.category === articleCategory;
      const searchable = [article.title, article.summary, article.category, ...article.body.map((block) => block.text || block.items?.join(' ') || '')].join(' ');
      return matchesCategory && searchable.toLocaleLowerCase().includes(query);
    });
    const pageCount = Math.max(1, Math.ceil(matching.length / articlePageSize));
    articlePage = Math.min(Math.max(1, articlePage), pageCount);
    const start = (articlePage - 1) * articlePageSize;
    const visible = matching.slice(start, start + articlePageSize);
    $('#writing-list').innerHTML = visible.map((article) => `
      <a class="writing-item" href="${detailHref('writing', article.id)}">
        <time class="writing-date" datetime="${escapeHTML(article.date)}">${escapeHTML(article.date)}</time>
        <div><h2>${escapeHTML(article.title)}</h2><p>${escapeHTML(article.summary)}</p>
        <div class="item-meta"><span class="item-tag">${escapeHTML(article.category)}</span><span>${readingTime(article)} 分钟阅读</span></div></div>
        <span class="item-arrow" aria-hidden="true">↗</span>
      </a>`).join('');
    $('#writing-empty').hidden = matching.length > 0;
    renderArticlePagination(matching.length, pageCount, start, visible.length);
  }

  function pageNumbers(current, total) {
    const pages = [...new Set([1, current - 1, current, current + 1, total])]
      .filter((page) => page >= 1 && page <= total)
      .sort((a, b) => a - b);
    return pages.flatMap((page, index) => (index && page - pages[index - 1] > 1 ? ['gap', page] : [page]));
  }

  function renderArticlePagination(total, pageCount, start, shown) {
    const nav = $('#writing-pagination');
    nav.hidden = total === 0;
    if (!total) {
      nav.innerHTML = '';
      return;
    }
    const pages = pageNumbers(articlePage, pageCount).map((page) => (page === 'gap'
      ? '<span class="pagination-gap" aria-hidden="true">…</span>'
      : `<button type="button" class="pagination-page" data-page="${page}" aria-label="第 ${page} 页"${page === articlePage ? ' aria-current="page"' : ''}>${page}</button>`
    )).join('');
    nav.innerHTML = `
      <p class="pagination-summary">共 ${total} 条 · 第 ${articlePage} / ${pageCount} 页 · 本页第 ${start + 1}–${start + shown} 条</p>
      <div class="pagination-pages">
        <button type="button" class="pagination-step" data-page="${articlePage - 1}"${articlePage === 1 ? ' disabled' : ''}>← 上一页</button>
        <span class="pagination-numbers">${pages}</span>
        <button type="button" class="pagination-step" data-page="${articlePage + 1}"${articlePage === pageCount ? ' disabled' : ''}>下一页 →</button>
      </div>
      <label class="pagination-size">每页
        <select id="writing-page-size">${articlePageSizes.map((size) => `<option value="${size}"${size === articlePageSize ? ' selected' : ''}>${size}</option>`).join('')}</select>
        条</label>`;
  }

  $('#writing-pagination').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-page]');
    if (!button || button.disabled) return;
    articlePage = Number(button.dataset.page);
    renderArticles();
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    $('#writing-list').scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
    $('#writing-pagination [aria-current="page"]')?.focus({ preventScroll: true });
  });
  $('#writing-pagination').addEventListener('change', (event) => {
    if (event.target.id !== 'writing-page-size') return;
    articlePageSize = Number(event.target.value);
    articlePage = 1;
    renderArticles();
    $('#writing-page-size')?.focus({ preventScroll: true });
  });

  function renderAbout() {
    $('#about-content').innerHTML = `
      <p class="about-lead">${about.lead.split(/(?<=，)/).map((clause) => `<span class="about-lead-clause">${escapeHTML(clause)}</span>`).join('')}</p>
      <div class="about-copy">${about.paragraphs.map((paragraph) => (paragraph.type === 'layers' ? `
        <div class="about-layers">
          <p>${escapeHTML(paragraph.intro)}</p>
          <ol>${paragraph.items.map((item) => `<li><strong>${escapeHTML(item.title)}</strong><span>${escapeHTML(item.text)}</span></li>`).join('')}</ol>
          <p class="about-layers-outro">${escapeHTML(paragraph.outro)}</p>
        </div>` : `<p>${escapeHTML(paragraph)}</p>`)).join('')}</div>
      <dl class="about-facts">${about.facts.map((fact, index) => `
        <div data-column="${index < Math.ceil(about.facts.length / 2) ? 'left' : 'right'}"><dt>${escapeHTML(fact.label)}</dt><dd${fact.profile ? ` data-profile-field="${escapeHTML(fact.profile)}"` : ''}>${escapeHTML(fact.profile ? profile[fact.profile] : fact.value)}</dd></div>
      `).join('')}</dl>`;
    // HTML 里的 style 属性会被 CSP（style-src 'self'）拦掉，CSS 变量只能经 CSSOM 设置。
    $('.about-facts').style.setProperty('--fact-rows', String(Math.ceil(about.facts.length / 2)));
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
        <div class="project-visual" aria-hidden="true"><span class="project-label">${escapeHTML(project.category)} / ${escapeHTML(project.status)}</span>${project.image ? `<img class="project-shot" src="${escapeHTML(project.image.src)}" alt="" loading="lazy">` : artworks[project.artwork] || artworks.browser}</div>
        <div class="project-content"><div class="project-heading"><div><h2>${escapeHTML(project.name)}</h2></div><span class="item-arrow" aria-hidden="true">↗</span></div>
        <p>${escapeHTML(project.description)}</p><div class="item-meta">${project.tags.map((tag) => `<span class="item-tag">${escapeHTML(tag)}</span>`).join('')}<span>${escapeHTML(project.status)}</span></div></div>
      </a>`).join('');
    if (!matching.length) $('#project-list').innerHTML = '<p class="empty-state">新的作品正在路上。</p>';
  }

  // 图表按 viewBox 等比缩放，窄屏上沿用宽画布会把刻度字缩到 6px 以下，所以窄屏换一块更窄的画布。
  const chartBox = () => (window.matchMedia('(max-width: 600px)').matches
    ? { width: 360, height: 230, top: 26, right: 12, bottom: 44, left: 44, label: 112, xTicks: 4 }
    : { width: 560, height: 250, top: 26, right: 16, bottom: 44, left: 52, label: 132, xTicks: 5 });
  const fixed = (value) => Number(value.toFixed(2));

  function niceStep(span, count) {
    const raw = span / count || 1;
    const power = 10 ** Math.floor(Math.log10(raw));
    return Number(([1, 2, 2.5, 5, 10].map((factor) => factor * power).find((step) => step >= raw * 0.999)).toPrecision(6));
  }

  function ticksFor(min, max, step) {
    const ticks = [];
    for (let value = Math.ceil(min / step - 1e-9) * step; value <= max + step * 1e-6; value += step) ticks.push(Number(value.toPrecision(10)));
    return ticks;
  }

  function formatTick(value, step) {
    const decimals = (String(step).split('.')[1] || '').length;
    return value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }

  function scaleFor(domainMin, domainMax, rangeMin, rangeMax, log = false) {
    const map = log ? Math.log10 : (value) => value;
    const from = map(domainMin);
    const span = map(domainMax) - from || 1;
    return (value) => rangeMin + (map(value) - from) / span * (rangeMax - rangeMin);
  }

  const axisTitle = (axis) => `${axis.label}${axis.unit ? `（${axis.unit}）` : ''}`;

  function chartSummary(chart) {
    if (chart.type === 'bar') return `${chart.title}：${chart.bars.map(([label, value]) => `${label} ${value}${chart.y.unit || ''}`).join('，')}`;
    const unit = chart.y.unit || '';
    return `${chart.title}：${chart.series.map((series) => `${series.name}从 ${series.points[0][1]}${unit} 到 ${series.points.at(-1)[1]}${unit}`).join('；')}`;
  }

  function renderLineChart(chart, index) {
    const { width, height, top, right, bottom, left, xTicks: xTickCount } = chartBox();
    const references = chart.references || [];
    const xs = chart.series.flatMap((series) => series.points.map(([x]) => x));
    const ys = [...chart.series.flatMap((series) => series.points.map(([, y]) => y)), ...references.map((reference) => reference.value)];
    const log = chart.x.scale === 'log';
    const xMin = chart.x.min ?? Math.min(...xs);
    const xMax = chart.x.max ?? Math.max(...xs);
    let yMin = chart.y.min ?? Math.min(...ys);
    let yMax = chart.y.max ?? Math.max(...ys);
    const yStep = niceStep(yMax - yMin, 4);
    if (chart.y.min === undefined) yMin = Math.floor(yMin / yStep) * yStep;
    if (chart.y.max === undefined) yMax = Math.ceil(yMax / yStep) * yStep;
    const x = scaleFor(xMin, xMax, left, width - right, log);
    const y = scaleFor(yMin, yMax, height - bottom, top);
    const xStep = niceStep(xMax - xMin, xTickCount);
    const xTicks = log ? [...new Set(xs)].sort((a, b) => a - b) : ticksFor(xMin, xMax, xStep);
    const clipId = `chart-clip-${index}`;
    const grid = ticksFor(yMin, yMax, yStep).map((value) => `
      <line class="chart-grid" x1="${left}" x2="${width - right}" y1="${fixed(y(value))}" y2="${fixed(y(value))}"></line>
      <text class="chart-tick" x="${left - 8}" y="${fixed(y(value) + 4)}" text-anchor="end">${formatTick(value, yStep)}</text>`).join('');
    const xAxis = xTicks.map((value) => `
      <text class="chart-tick" x="${fixed(x(value))}" y="${height - bottom + 18}" text-anchor="middle">${log ? value : formatTick(value, xStep)}</text>`).join('');
    const lines = chart.series.map((series) => `
      <path class="chart-line is-${escapeHTML(series.role)}" d="${series.points.map(([px, py], point) => `${point ? 'L' : 'M'}${fixed(x(px))} ${fixed(y(py))}`).join(' ')}"></path>
      ${series.points.length <= 12 ? series.points.map(([px, py]) => `<circle class="chart-dot is-${escapeHTML(series.role)}" cx="${fixed(x(px))}" cy="${fixed(y(py))}" r="3.5"></circle>`).join('') : ''}`).join('');
    const guides = references.map((reference) => `
      <line class="chart-reference" x1="${left}" x2="${width - right}" y1="${fixed(y(reference.value))}" y2="${fixed(y(reference.value))}"></line>
      <text class="chart-reference-label" x="${width - right - 4}" y="${fixed(y(reference.value) - 6)}" text-anchor="end">${escapeHTML(reference.name)} ${reference.value}${escapeHTML(chart.y.unit || '')}</text>`).join('');
    return `
      <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHTML(chartSummary(chart))}">
        <defs><clipPath id="${clipId}"><rect x="${left}" y="${top - 4}" width="${width - left - right}" height="${height - top - bottom + 8}"></rect></clipPath></defs>
        ${grid}
        <line class="chart-axis" x1="${left}" x2="${width - right}" y1="${height - bottom}" y2="${height - bottom}"></line>
        ${xAxis}
        <text class="chart-axis-title" x="${left}" y="${top - 12}">${escapeHTML(axisTitle(chart.y))}</text>
        <text class="chart-axis-title" x="${width - right}" y="${height - 6}" text-anchor="end">${escapeHTML(axisTitle(chart.x))}${log ? ' · 对数刻度' : ''}</text>
        <g clip-path="url(#${clipId})">${guides}${lines}</g>
      </svg>`;
  }

  function renderBarChart(chart) {
    const row = 34;
    const { width, label } = chartBox();
    const height = chart.bars.length * row + 30;
    const max = chart.y.max ?? Math.max(...chart.bars.map(([, value]) => value));
    const x = scaleFor(chart.y.min ?? 0, max, label, width - 64);
    const unit = escapeHTML(chart.y.unit || '');
    const bars = chart.bars.map(([name, value], index) => {
      const role = index === 0 ? 'baseline' : index === chart.bars.length - 1 ? 'result' : 'step';
      const top = 8 + index * row;
      return `
        <text class="chart-bar-label" x="${label - 12}" y="${top + 17}" text-anchor="end">${escapeHTML(name)}</text>
        <rect class="chart-bar is-${role}" x="${label}" y="${top + 5}" width="${fixed(x(value) - label)}" height="16" rx="2"></rect>
        <text class="chart-bar-value is-${role}" x="${fixed(x(value) + 8)}" y="${top + 17}">${value}${unit}</text>`;
    }).join('');
    return `
      <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHTML(chartSummary(chart))}">
        <line class="chart-axis" x1="${label}" x2="${label}" y1="4" y2="${height - 18}"></line>
        ${bars}
        <text class="chart-axis-title" x="${width - 16}" y="${height - 4}" text-anchor="end">${escapeHTML(axisTitle(chart.y))}</text>
      </svg>`;
  }

  function renderChart(chart, index) {
    const legend = chart.type === 'bar'
      ? ''
      : `<ul class="chart-legend">${chart.series.map((series) => `<li class="is-${escapeHTML(series.role)}">${escapeHTML(series.name)}</li>`).join('')}${(chart.references || []).map((reference) => `<li class="is-reference">${escapeHTML(reference.name)}</li>`).join('')}</ul>`;
    return `
      <figure class="experiment-chart">
        <figcaption>${escapeHTML(chart.title)}</figcaption>
        ${chart.type === 'bar' ? renderBarChart(chart) : renderLineChart(chart, index)}
        ${legend}
      </figure>`;
  }

  function renderSparkline(chart) {
    const width = 120;
    const height = 36;
    if (chart.type === 'bar') {
      const max = Math.max(...chart.bars.map(([, value]) => value));
      const band = width / chart.bars.length;
      return chart.bars.map(([, value], index) => {
        const barHeight = value / max * (height - 2);
        const role = index === chart.bars.length - 1 ? 'result' : 'baseline';
        return `<rect class="spark-bar is-${role}" x="${fixed(index * band + band * 0.2)}" y="${fixed(height - barHeight)}" width="${fixed(band * 0.6)}" height="${fixed(barHeight)}"></rect>`;
      }).join('');
    }
    const points = chart.series.flatMap((series) => series.points);
    const log = chart.x.scale === 'log';
    const ys = points.map(([, y]) => y);
    const x = scaleFor(Math.min(...points.map(([px]) => px)), Math.max(...points.map(([px]) => px)), 1, width - 1, log);
    const y = scaleFor(chart.y.min ?? Math.min(...ys), chart.y.max ?? Math.max(...ys), height - 2, 2);
    return chart.series.map((series) => `<path class="spark-line is-${escapeHTML(series.role)}" vector-effect="non-scaling-stroke" d="${series.points.map(([px, py], index) => `${index ? 'L' : 'M'}${fixed(x(px))} ${fixed(Math.max(1, y(py)))}`).join(' ')}"></path>`).join('');
  }

  function renderExperiments() {
    $('#experiment-list').innerHTML = experiments.map((experiment, index) => `
      <a class="experiment-card" href="${detailHref('lab', experiment.id)}">
        <div class="experiment-card-top"><span class="experiment-index" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>
        <span class="experiment-status${experiment.status === '进行中' ? ' is-running' : ''}"><i></i>${escapeHTML(experiment.status)} · ${escapeHTML(experiment.date)}</span></div>
        <div><h2>${escapeHTML(experiment.name)}</h2><p>${escapeHTML(experiment.description)}</p></div>
        <div class="experiment-metric">
          <div><span class="experiment-metric-label">${escapeHTML(experiment.metric.label)}${experiment.metric.note ? ` <small>${escapeHTML(experiment.metric.note)}</small>` : ''}</span>
          <span class="experiment-metric-values"><span>${escapeHTML(experiment.metric.before)}</span><span aria-label="变为">→</span><strong>${escapeHTML(experiment.metric.after)}</strong></span></div>
          <svg class="experiment-spark" viewBox="0 0 120 36" preserveAspectRatio="none" aria-hidden="true">${renderSparkline(experiment.charts[0])}</svg>
        </div>
        <div class="item-meta">${experiment.tags.map((tag) => `<span class="item-tag">${escapeHTML(tag)}</span>`).join('')}<span class="experiment-open">查看数据 ↗</span></div>
      </a>`).join('');
    if (!experiments.length) $('#experiment-list').innerHTML = '<p class="empty-state">新的实验正在形成。</p>';
  }

  const datasetPath = /^\.\/data\/lab\/[a-z0-9-]+\/[a-z0-9_-]+\.csv$/;
  const formatBytes = (bytes) => (bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`);

  function renderDatasets(datasets) {
    return datasets.filter((dataset) => datasetPath.test(dataset.file)).map((dataset) => {
      const fileName = dataset.file.split('/').pop();
      return `
        <article class="dataset">
          <div class="dataset-head">
            <span class="dataset-format">${escapeHTML(dataset.format)}</span>
            <div class="dataset-title"><h4>${escapeHTML(dataset.name)}</h4><code>${escapeHTML(fileName)}</code></div>
            <a class="dataset-download" href="${escapeHTML(dataset.file)}" download="${escapeHTML(fileName)}" aria-label="下载 ${escapeHTML(dataset.name)}（${escapeHTML(fileName)}）">下载 <span aria-hidden="true">↓</span></a>
          </div>
          <p class="dataset-description">${escapeHTML(dataset.description)}</p>
          <p class="dataset-meta">${dataset.rows} 行 × ${dataset.columns.length} 列 · ${formatBytes(dataset.bytes)} · UTF-8，首行为表头</p>
          <details class="dataset-columns">
            <summary>字段说明（${dataset.columns.length} 列）</summary>
            <table>
              <thead><tr><th scope="col">字段</th><th scope="col">含义</th><th scope="col">首行值</th></tr></thead>
              <tbody>${dataset.columns.map((column) => `<tr><td><code>${escapeHTML(column.key)}</code></td><td>${escapeHTML(column.meaning)}</td><td><code>${escapeHTML(column.sample)}</code></td></tr>`).join('')}</tbody>
            </table>
          </details>
        </article>`;
    }).join('');
  }

  function renderExperimentBody(experiment) {
    const [before, after] = experiment.compare;
    const datasets = experiment.datasets || [];
    const references = experiment.references.length ? `量级参照：${experiment.references.join('；')}。` : '';
    return `
      <p class="experiment-lead">${escapeHTML(experiment.description)}</p>
      <div class="experiment-metrics">
        <p class="experiment-compare"><span>${escapeHTML(before)}</span><span aria-hidden="true">→</span><strong>${escapeHTML(after)}</strong></p>
        <dl>${experiment.metrics.map((metric) => `
          <div><dt>${escapeHTML(metric.label)}</dt><dd><span>${escapeHTML(metric.before)}</span><span aria-label="变为">→</span><strong>${escapeHTML(metric.after)}</strong></dd></div>`).join('')}
        </dl>
        ${datasets.length ? `<button class="experiment-jump" type="button" data-jump="experiment-datasets">原始数据集 · ${datasets.length} 份 CSV <span aria-hidden="true">↓</span></button>` : ''}
      </div>
      <h3>假设</h3><p>${escapeHTML(experiment.hypothesis)}</p>
      <h3>设置</h3>
      <dl class="experiment-setup">${experiment.setup.map(([label, value]) => `<div><dt>${escapeHTML(label)}</dt><dd>${escapeHTML(value)}</dd></div>`).join('')}</dl>
      <h3>数据</h3>${experiment.charts.map(renderChart).join('')}
      ${datasets.length ? `<h3 id="experiment-datasets">数据集</h3><p class="dataset-intro">图表与上面的指标都由下面这些表算出，可以下载后用 Excel、pandas 或任何表格工具复核。</p><div class="dataset-list">${renderDatasets(datasets)}</div>` : ''}
      <h3>发现</h3><ul>${experiment.findings.map((finding) => `<li>${escapeHTML(finding)}</li>`).join('')}</ul>
      <h3>结论</h3><blockquote>${escapeHTML(experiment.conclusion)}</blockquote>
      <p class="experiment-note">以上为模拟数据，用来展示实验记录的形态。${escapeHTML(references)}</p>`;
  }

  function parseYearMonth(value) {
    const [year, month] = value.split('-').map(Number);
    return { year, month };
  }

  function formatYearMonth(value) {
    return value.replace('-', '.');
  }

  function formatPeriod(start, end, current) {
    if (!start) return current ? '在职' : '已离职';
    return `${formatYearMonth(start)} — ${current ? '至今' : end ? formatYearMonth(end) : '已离职'}`;
  }

  function formatDuration(start, end, current = false) {
    // 未知起止时间不估算时长；缺少结束时间的历史岗位不能自动延长到今天。
    if (!start || (!current && !end)) return '';
    const startDate = parseYearMonth(start);
    const now = new Date();
    const endDate = current
      ? { year: now.getFullYear(), month: now.getMonth() + 1 }
      : parseYearMonth(end);
    const totalMonths = (endDate.year - startDate.year) * 12 + endDate.month - startDate.month + 1;
    if (!Number.isFinite(totalMonths) || totalMonths < 1) return '';
    const years = Math.floor(totalMonths / 12);
    const months = totalMonths % 12;
    return [
      years ? `${years} 年` : '',
      months ? `${months} 个月` : '',
    ].filter(Boolean).join(' ');
  }

  function renderExperienceMark(entry) {
    return entry.logo
      ? `<img src="${escapeHTML(entry.logo)}" alt="${escapeHTML(entry.logoAlt || entry.company || entry.title)}">`
      : `<span class="experience-brand-text">${escapeHTML(entry.logoText || entry.company || entry.title)}</span>`;
  }

  function renderExperience() {
    $('#work-experience-list').innerHTML = experience.map((company) => {
      const current = company.roles.some((role) => role.current);
      const latestEnd = !current && company.roles.every((role) => role.end)
        ? company.roles.map((role) => role.end).sort().at(-1)
        : '';
      const companyPeriod = formatPeriod(company.start, latestEnd, current);
      const metadata = [company.employmentType, companyPeriod, formatDuration(company.start, latestEnd, current)].filter(Boolean);
      const location = [company.location, company.workMode].filter(Boolean);
      return `
        <article class="experience-company" data-company="${escapeHTML(company.company)}" data-company-id="${escapeHTML(company.id)}">
          <header class="experience-company-header">
            <div class="experience-company-identity">
              <span class="experience-company-logo">${renderExperienceMark(company)}</span>
              <div>
                <span class="experience-company-label">COMPANY / 工作单位</span>
                <h2>${escapeHTML(company.company)}</h2>
                <p>${escapeHTML(metadata.join(' · '))}</p>
              </div>
            </div>
            ${location.length ? `<p class="experience-location">${location.map(escapeHTML).join('<span aria-hidden="true">·</span>')}</p>` : ''}
          </header>
          <div class="experience-roles">${company.roles.map((role) => {
            const period = formatPeriod(role.start, role.end, role.current);
            const duration = formatDuration(role.start, role.end, role.current);
            return `
              <section class="journey-item journey-item-work experience-role" data-role="${escapeHTML(role.title)}">
                <div class="journey-aside">
                  <div class="journey-period">${escapeHTML(period)}${duration ? `<small>${escapeHTML(duration)}</small>` : ''}</div>
                  <span class="experience-role-logo experience-role-logo-${escapeHTML(role.logoKind)}">${renderExperienceMark(role)}</span>
                </div>
                <div>
                  <div class="journey-kicker">
                    <span>PROFESSIONAL ORBIT</span>
                    ${role.current ? '<span class="journey-degree">当前</span>' : ''}
                  </div>
                  <h3>${escapeHTML(role.title)}</h3>
                  ${role.highlights?.length ? `<ul class="experience-highlights">${role.highlights.map((item) => `<li>${escapeHTML(item)}</li>`).join('')}</ul>` : ''}
                  ${role.skills?.length ? `<div class="experience-skills" aria-label="相关技能">${role.skills.map((skill) => `<span>${escapeHTML(skill)}</span>`).join('')}</div>` : ''}
                </div>
              </section>`;
          }).join('')}</div>
        </article>`;
    }).join('');
  }

  function renderJourney() {
    $('#journey-list').innerHTML = journey.map((entry) => `
      <article class="journey-item journey-item-education" data-degree="${escapeHTML(entry.degree)}"
        aria-label="${escapeHTML(`${entry.title}，${entry.degree}，${entry.major}，${entry.period}`)}">
        <div class="journey-aside">
          <div class="journey-period">${escapeHTML(entry.period)}</div>
          <span class="journey-emblem">
            <img src="./assets/xidian-university-emblem.png" width="267" height="267"
              alt="西安电子科技大学校徽">
          </span>
        </div>
        <div>
          <div class="journey-kicker"><span>ACADEMIC ORBIT</span><span class="journey-degree">${escapeHTML(entry.degree)}</span></div>
          <h2>${escapeHTML(entry.title)}</h2>
          <p class="journey-major"><span>专业</span>${escapeHTML(entry.major)}</p>
        </div>
      </article>`).join('');
  }

  function renderLibrary() {
    $('#library-list').innerHTML = library.map((item) => {
      const url = safeURL(item.url || '');
      const tags = item.tags?.length ? `<ul class="library-tags" aria-label="标签">${item.tags.map((tag) => `<li>${escapeHTML(tag)}</li>`).join('')}</ul>` : '';
      const body = `<div class="library-side"><span class="library-type">${escapeHTML(item.type)}</span>${tags}</div>
        <div><h2>${escapeHTML(item.title)}</h2><p>${escapeHTML(item.note)}</p>${url || item.venue ? `<span class="library-host">${[item.venue, url && new URL(url).hostname.replace(/^www\./, '')].filter(Boolean).map(escapeHTML).join(' · ')}</span>` : ''}</div>
        ${url ? '<span class="item-arrow" aria-hidden="true">↗</span>' : ''}`;
      return url
        ? `<a class="library-item" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${body}</a>`
        : `<article class="library-item">${body}</article>`;
    }).join('');
  }

  function renderIdeas() {
    $('#ideas-list').innerHTML = ideas.map((idea) => `
      <a class="idea-item" href="${detailHref('ideas', idea.id)}"><time class="writing-date" datetime="${escapeHTML(idea.date)}">${escapeHTML(idea.date)}</time>
      <div class="idea-content"><h2>${escapeHTML(idea.title)}</h2><p>${escapeHTML(idea.text)}</p>
      <div class="item-meta">${idea.tags.map((tag) => `<span># ${escapeHTML(tag)}</span>`).join('')}<span class="idea-reply"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"></path><path d="M8.5 12h7M8.5 8.8h4.5"></path></svg>写下你的答案</span></div></div></a>`
    ).join('');
    if (!ideas.length) $('#ideas-list').innerHTML = '<p class="empty-state">给下一个问题留个位置。</p>';
  }

  function renderBody(blocks) {
    return blocks.map((block) => {
      if (block.type === 'ul') return `<ul>${block.items.map((item) => `<li>${escapeHTML(item)}</li>`).join('')}</ul>`;
      if (block.type === 'image') return `<figure class="reader-figure"><img src="${escapeHTML(block.src)}" alt="${escapeHTML(block.alt)}" loading="lazy">${block.caption ? `<figcaption>${escapeHTML(block.caption)}</figcaption>` : ''}</figure>`;
      const tag = { p: 'p', h3: 'h3', quote: 'blockquote' }[block.type] || 'p';
      return `<${tag}>${escapeHTML(block.text)}</${tag}>`;
    }).join('');
  }

  function syncModalLock() {
    document.body.classList.toggle('modal-open', reader.open || contact.open);
  }

  function renderDetail(source, page) {
    unmountReplies();
    const bilingual = page === 'projects' && Boolean(source.translations?.en);
    const english = bilingual && readerLanguage === 'en';
    const item = english ? { ...source, ...source.translations.en } : source;
    const languageToggle = $('#reader-language');
    languageToggle.hidden = !bilingual;
    languageToggle.dataset.active = english ? 'en' : 'zh';
    languageToggle.setAttribute('aria-label', english ? '切换为中文' : 'Switch to English');
    $('.reader-content').lang = english ? 'en' : 'zh-CN';
    $('#reader-kind').textContent = { writing: 'READING ROOM', projects: 'PROJECT NOTES', lab: 'EXPERIMENT LOG', ideas: 'OPEN QUESTION' }[page];
    $('#reader-title').textContent = item.title || item.name;
    $('#reader-meta').textContent = {
      writing: () => `${item.date} / ${item.category} / ${readingTime(item)} 分钟阅读`,
      projects: () => `${item.subtitle} / ${item.status}`,
      lab: () => `${item.date} / ${item.status} / 模拟数据`,
      ideas: () => `${item.date} / ${item.tags.join(' · ')}`,
    }[page]();
    $('#reader-body').innerHTML = {
      lab: () => renderExperimentBody(item),
      ideas: () => `${renderBody(item.text.split('\n').map((text) => ({ type: 'p', text })))}
        <h3>回复</h3>
        <p class="replies-note">登录 GitHub 后即可写下你的答案。回复保存在本站仓库的 GitHub Discussions 里，可以编辑或删除。</p>
        <div class="question-replies" id="question-replies"></div>`,
    }[page]?.() ?? renderBody(item.body);
    const links = page === 'projects' ? [{ text: english ? 'Visit project ↗' : '访问项目 ↗', url: safeURL(item.url) }, { text: english ? 'View source ↗' : '查看源码 ↗', url: safeURL(item.source) }] : [];
    $('#reader-links').innerHTML = links.filter((link) => link.url).map((link) =>
      `<a class="button" href="${escapeHTML(link.url)}" target="_blank" rel="noopener noreferrer">${link.text}</a>`
    ).join('');
    activeDetail = { page, hash: location.hash, item: source };
    if (page === 'ideas') mountReplies(item);
    document.title = profile.siteTitle;
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
    document.title = profile.siteTitle;
    const collection = { writing: articles, projects, lab: experiments, ideas }[page];
    const item = collection && parts[1] && collection.find((entry) => entry.id === parts.slice(1).join('/'));
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
    syncResponsiveState();
  }

  $('#reader-close').addEventListener('click', () => reader.close());
  $('#reader-language').addEventListener('click', () => {
    if (!activeDetail?.item) return;
    readerLanguage = readerLanguage === 'en' ? 'zh' : 'en';
    renderDetail(activeDetail.item, activeDetail.page);
  });
  $('#reader-body').addEventListener('click', (event) => {
    const jump = event.target.closest('[data-jump]');
    if (!jump) return;
    const target = document.getElementById(jump.dataset.jump);
    target?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  });
  reader.addEventListener('close', () => {
    unmountReplies();
    if (activeDetail && location.hash === activeDetail.hash) {
      history.replaceState(null, '', `#${activeDetail.page}`);
      document.title = profile.siteTitle;
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
  const githubLink = githubURL
    ? `<a class="contact-button github-link" href="${escapeHTML(githubURL)}" target="_blank" rel="noopener noreferrer" aria-label="访问 Loren 的 GitHub 主页">${icons.github} GitHub ↗</a>`
    : '';
  $('#contact-actions').innerHTML = `${githubLink}
    <button class="contact-button contact-primary" id="contact-open" type="button">${icons.mail} 联系我 <span aria-hidden="true">↗</span></button>`;
  $('#contact-open').addEventListener('click', () => {
    const email = profile.email.trim();
    $('#contact-message').textContent = email
      ? githubURL
        ? '欢迎写信给我，也可以通过 GitHub 了解我的项目与动态。'
        : '欢迎写信给我，分享你的想法。'
      : githubURL
        ? '暂未公开邮箱，你可以通过 GitHub 了解我的项目与动态。'
        : '这是个人主页演示，暂未提供联系方式。';
    $('#contact-details').innerHTML = email
      ? `<a class="email-address" href="mailto:${escapeHTML(email)}">${escapeHTML(email)}</a><button class="contact-button contact-primary" id="copy-email" type="button">${icons.mail} 复制邮箱</button>${githubLink}<span class="muted-note" id="copy-status" role="status"></span>`
      : githubLink;
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

  function setupMusic() {
    const tracks = (music.tracks || []).filter((track) => /^\.\/audio\/[a-z0-9-]+\.mp3$/.test(track.file));
    const control = $('#music-control');
    if (!tracks.length) return;
    control.hidden = false;
    const audio = $('#background-music');
    const toggle = $('#music-toggle');
    const panel = $('#music-panel');
    const play = $('#music-play');
    const volume = $('#music-volume');
    const MUSIC_KEY = 'personal-space-music';
    const VOLUME_KEY = 'personal-space-music-volume';
    let trackIndex = 0;
    let failures = 0;
    let wantsMusic = true;
    let awaitingGesture = false;
    let savedVolume = 50;
    try {
      wantsMusic = localStorage.getItem(MUSIC_KEY) !== 'off';
      const stored = Number(localStorage.getItem(VOLUME_KEY));
      if (localStorage.getItem(VOLUME_KEY) !== null && Number.isFinite(stored) && stored >= 0 && stored <= 100) savedVolume = stored;
    } catch {}

    const remember = (key, value) => { try { localStorage.setItem(key, value); } catch {} };
    const describe = (track) => `${track.title} · ${track.artist}`;
    function setVolume(value) {
      audio.volume = value / 100;
      volume.value = String(value);
      $('#music-volume-value').textContent = `${value}%`;
    }
    function load(index) {
      trackIndex = index;
      audio.src = tracks[index].file;
      $('#music-now').textContent = describe(tracks[index]);
    }
    function sync() {
      const playing = !audio.paused;
      control.dataset.playing = String(playing);
      control.dataset.awaiting = String(!playing && awaitingGesture);
      $('#music-hint').hidden = playing || !awaitingGesture || !panel.hidden;
      play.setAttribute('aria-pressed', String(playing));
      play.setAttribute('aria-label', playing ? '关闭背景音乐' : '播放背景音乐');
      toggle.setAttribute('aria-label', `背景音乐设置（${playing ? '播放中' : awaitingGesture ? '点一下页面开始播放' : '已关闭'}）`);
      $('#music-state').textContent = playing ? '正在播放' : awaitingGesture ? '点一下页面就开始播放' : '已关闭';
    }
    async function start() {
      if (!audio.getAttribute('src')) load(trackIndex);
      try { await audio.play(); } catch {}
      sync();
    }
    function stop() {
      audio.pause();
      sync();
    }
    function closePanel(restoreFocus = false) {
      if (panel.hidden) return;
      panel.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      sync();
      if (restoreFocus) toggle.focus({ preventScroll: true });
    }

    setVolume(savedVolume);
    const contactEmail = (profile.email || '').trim();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) $('#music-contact').href = `mailto:${contactEmail}?subject=${encodeURIComponent('背景音乐版权')}`;
    $('#music-now').textContent = describe(tracks[0]);
    toggle.addEventListener('click', () => {
      const opening = panel.hidden;
      panel.hidden = !opening;
      toggle.setAttribute('aria-expanded', String(opening));
      if (opening) closeCareerMenu();
      sync();
    });
    play.addEventListener('click', () => {
      wantsMusic = audio.paused;
      remember(MUSIC_KEY, wantsMusic ? 'on' : 'off');
      if (wantsMusic) start();
      else stop();
    });
    volume.addEventListener('input', () => {
      const value = Math.round(Number(volume.value));
      setVolume(value);
      remember(VOLUME_KEY, String(value));
    });
    audio.addEventListener('play', sync);
    audio.addEventListener('pause', sync);
    audio.addEventListener('playing', () => { failures = 0; });
    audio.addEventListener('ended', () => {
      load((trackIndex + 1) % tracks.length);
      start();
    });
    audio.addEventListener('error', () => {
      failures += 1;
      sync();
      if (wantsMusic && failures < tracks.length) {
        load((trackIndex + 1) % tracks.length);
        start();
      }
    });
    document.addEventListener('click', (event) => {
      if (!event.target.closest('#music-control')) closePanel();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !panel.hidden) closePanel(true);
    });
    // 浏览器禁止无手势自动出声：先试一次自动播放，被拦下就等访客第一次点击、触摸或按键再开始；访客主动关过则不再自动播放。
    const gestures = ['pointerdown', 'keydown', 'touchstart'];
    function disarm() {
      awaitingGesture = false;
      sync();
      gestures.forEach((type) => document.removeEventListener(type, resume, true));
    }
    function resume(event) {
      if (event.target.closest?.('#music-control')) return;
      disarm();
      if (wantsMusic && audio.paused) start();
    }
    audio.addEventListener('playing', disarm);
    if (wantsMusic) {
      start().then(() => {
        if (!wantsMusic || !audio.paused) return;
        awaitingGesture = true;
        gestures.forEach((type) => document.addEventListener(type, resume, { capture: true, passive: true }));
        sync();
      });
    }
    sync();
  }
  setupMusic();

  renderFilters('#writing-filters', articles.map((article) => article.category), articleCategory, (category) => {
    articleCategory = category;
    articlePage = 1;
    renderArticles();
  });
  renderFilters('#project-filters', projects.map((project) => project.category), projectCategory, (category) => {
    projectCategory = category;
    renderProjects();
  });
  $('#writing-search').addEventListener('input', () => {
    articlePage = 1;
    renderArticles();
  });
  renderAbout();
  renderArticles();
  renderProjects();
  renderExperiments();
  renderExperience();
  renderJourney();
  renderLibrary();
  renderIdeas();
  window.addEventListener('hashchange', route);
  syncResponsiveState();
  route();
})();
