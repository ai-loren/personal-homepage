<p align="center">
  <a href="README.en.md">English</a>
  &nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="https://ai-loren.github.io/personal-homepage/">在线站点</a>
  &nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="https://github.com/ai-loren/personal-homepage/generate">用这个模板</a>
</p>

<h1 align="center">Loren's Galaxy</h1>

<p align="center">
一套可以飞进去的个人主页。<br>
行星是导航。作品里的工具，打开就能算。
</p>

<p align="center">
  <img src="docs/readme/home.jpg" width="880" alt="首页：深色星空中的太阳系，行星旁标着关于、文字、作品、实验、经历、收藏和问题">
</p>

<p align="center"><sub>首页。轨道上的行星即栏目。</sub></p>

## 导航与工具

太阳系负责把人带进栏目。三件机器学习基础设施工具放在作品里，打开就能算。这种组合，在个人主页里很少见。

<p align="center">
水星 · 关于 &nbsp;&nbsp;·&nbsp;&nbsp; 月球 · 文字 &nbsp;&nbsp;·&nbsp;&nbsp; 地球 · 作品 &nbsp;&nbsp;·&nbsp;&nbsp; 火星 · 实验<br>
木星 · 经历 &nbsp;&nbsp;·&nbsp;&nbsp; 土星 · 收藏 &nbsp;&nbsp;·&nbsp;&nbsp; 海王星 · 问题
</p>

金星和天王星留在轨道上，作为完整太阳系的背景，不进入栏目。

| 工具 | 在页面上做什么 | 代码 |
| --- | --- | --- |
| 显存账本 | 把每张卡拆成参数、梯度、优化器状态和激活。改并行或序列长度，四笔账立刻重算。 | [源码](https://github.com/ai-loren/vram-ledger) |
| Ckpt Goodput | 按集群规模和故障间隔，估算多久存一次，有效训练时间最高。 | [源码](https://github.com/ai-loren/ckpt-goodput) |
| 轨迹回放 | 把一次 Agent 运行贴进来，按时间看每一步。 | [源码](https://github.com/ai-loren/agent-trace-replay) |

<p align="center">
  <img src="docs/readme/vram.jpg" width="720" alt="作品页中的显存账本：左侧是模型和并行配置，右侧是 60.2 / 80 GiB 的四笔账">
</p>

<p align="center"><sub>显存账本。改一个开关，总数跟着变。</sub></p>

页面是 HTML、CSS 和原生 JavaScript，没有框架，也不需要 `npm install`。Node.js 只在构建时裁剪哪些履历可以公开，上线的是 `dist/` 里的静态文件。

## 一键使用

需要 Node.js 20+。

1. 点 [Use this template](https://github.com/ai-loren/personal-homepage/generate)，建一个自己的仓库。
2. 克隆并打开预览：

```bash
git clone --recurse-submodules https://github.com/<你的用户名>/<仓库名>.git
cd <仓库名>
cp content.example.js content.js
node scripts/site.mjs serve
```

终端会打印预览地址，打开就是示例站。然后改三处：`content.js` 换成你的介绍和作品，`site.config.mjs` 里的 `CAREER_VISIBILITY` 改成 `'all'`（或你某家公司的 `id`），删掉用不到的个人素材（头像、校徽、公司 logo、`assets/projects/`、`data/lab/`、`audio/`，以及 `scripts/content.test.mjs`）。`audio/` 里是有版权的音乐，一定要删。

子模块目录如果是空的，再执行一次 `git submodule update --init`。

3. 仓库 **Settings → Pages → Source** 选 **GitHub Actions**。推到 `main` 之后，网址是 `https://<用户名>.github.io/<仓库名>/`。

页脚的「Built with Loren's Galaxy」欢迎留着。下面是同一条路的细项。

## 目录

- [用这个模板](#用这个模板)
- [本地启动](#本地启动)
- [内容](#内容)
- [履历公开范围](#履历公开范围)
- [站点](#站点)
- [部署](#部署)
- [许可](#许可)

## 用这个模板

上面的命令能先看到示例站。要发布成你自己的网站，把下面七步做完。

1. **新建仓库**。在 GitHub 上点「Use this template」，再带着子模块克隆：`git clone --recurse-submodules <你的仓库地址>`。
2. **换成你的内容**。`cp content.example.js content.js`，再按 [内容](#内容) 一节的字段表改。`content.example.js` 留着，通用测试拿它当固定样本。`index.html` 不用改，名字、介绍、职位等会在构建时按 `content.js` 填好。
3. **改履历展示开关**。把 `site.config.mjs` 里的 `CAREER_VISIBILITY` 改成 `'all'`，或者改成你某一家公司在 `content.js` 里的 `id`。
4. **删掉原作者的个人素材和专属测试**。
   - `scripts/content.test.mjs`：只核对原作者那份内容
   - `.harness-e2e/` 下的浏览器测试：按原作者的内容写的，可以删掉或照着改
   - `assets/loren-portrait.webp`、`assets/xidian-university-emblem.png`、各公司 logo、`assets/projects/`、`data/lab/`
   - `audio/`：有版权的音乐，一定要删
   - 用不到的小工具：从 `scripts/site.mjs` 的 `PUBLIC_FILES` 和 `index.html` 里去掉对应脚本；子模块用 `git rm tools/<id>` 移除
5. **问题页的回复区**。
   - 想开回复：给仓库打开 Discussions、安装 [giscus](https://giscus.app/) 应用，把 giscus 页面给出的 `repoId`、`categoryId` 填进 `content.js` 的 `comments`，再把你网站的地址写进 `giscus.json` 的 `origins`。
   - 暂时不开：`categoryId` 留空即可，问题页会显示「正在接入中」。但 `comments.site` 要改成你自己的网址，并和 `giscus.json` 保持一致，测试会检查。
6. **本地验证**。`node --test 'scripts/*.test.mjs' 'tools/*/test/*.test.mjs'`，再 `node scripts/site.mjs serve` 打开预览看一遍。
7. **部署**。仓库 **Settings → Pages → Source** 选 **GitHub Actions**。之后每次推到 `main`，工作流会先测试、再构建，只发布 `dist/`。网址是 `https://<用户名>.github.io/<仓库名>/`。

页脚的「Built with Loren's Galaxy」链接欢迎保留。代码是 MIT 许可，原作者的个人内容、商标和音乐不在其内，见 [CONTENT-LICENSE.md](CONTENT-LICENSE.md)。

## 本地启动

需要 Node.js 20+ 和现代浏览器，不需要 `npm install`。预览入口会先裁剪公开数据，再仅服务允许发布的文件。不要从源码根目录运行 `python3 -m http.server`，否则完整履历、测试文件和 Git 元数据可能被直接读取。

在项目根目录执行：

```bash
node scripts/site.mjs serve
```

看到 `Preview: http://127.0.0.1:4177/` 后打开该地址。页面上显示哪些公司的履历，由 `site.config.mjs` 的 `CAREER_VISIBILITY` 决定，浏览器收到的数据也只有这些公司的。本仓库当前只发布 Tencent，控件不可展开。

- **停止服务**。在运行服务的终端按 `Ctrl+C`。
- **更新页面**。修改源码或 `site.config.mjs` 后，停止并重新执行启动命令，再刷新浏览器。服务只使用启动时生成的公开快照，没有自动热更新。
- **连接被拒绝**。确认启动成功、终端保持运行，浏览器端口与启动端口一致。
- **端口占用**。先停止旧服务；也可执行 `node scripts/site.mjs serve --port 4178` 并访问 <http://127.0.0.1:4178/>。不要让旧的源码目录服务继续运行。
- **只生成发布文件**。执行 `node scripts/site.mjs build`，结果在 `dist/`。重新构建会清理此前生成的目录，避免留下旧模式数据或 Logo；不识别的目录会拒绝覆盖。

如果使用其他静态服务器，只能把 `dist/` 设为网站根目录。不要直接打开源码 `index.html`，也不要发布整个仓库。

## 内容

编辑源码 `content.js` 后重新启动预览，或重新构建并部署 `dist/`。不要直接编辑 `dist/content.js`，它会在下次构建时被覆盖。

| 配置 | 用途 |
| --- | --- |
| `profile.name` | 首页、站点标识和页脚上的名字 |
| `profile.siteTitle` | 首页浏览器标题 |
| `profile.intro` / `description` | 简短介绍 / 详细介绍 |
| `profile.motto` | 首页介绍句末尾的金色书法短语；留空时介绍句以句号结尾 |
| `profile.now` / `nowNote` | 首页「此刻」内容 |
| `profile.email` | 联系邮箱；留空时显示未提供联系方式 |
| `profile.github` | 完整 GitHub 主页地址；留空时隐藏入口 |
| `profile.focus` | 首页「能力与经验」列表；留空时整块不显示 |
| `profile.location` / `locationEn` | 首页所在地区（中文 / 英文） |
| `profile.portrait` | 首页头像 `{ src: './assets/<文件名>', alt }`；不填就不显示头像 |
| `profile.demo` | 为 `true` 时实验页底部显示「当前实验数据为模拟示意」；实验换成真实数据后改为 `false` |
| `experience` | 工作经历，每家公司一项：`id`（小写字母、数字或连字符，用作展示开关的取值）、`company`、`modeName`（切换菜单上的名字）、`privateMarkers`（不发布这家公司时，任何公开文件里都不许出现的词，比如英文名、内部项目代号）、`profileRole`、`logo`、`roles`。`modeName` 和 `privateMarkers` 只给构建用，不会发布 |
| `journey` | 教育经历；每项可带 `emblem: { src, alt }` 校徽，首页显示第一项的校徽 |
| `articles` | 文章，按展示顺序排列；第一篇显示在首页 |
| `projectFacets` | 作品筛选的维度与可选值（类型、使用、代码），作品只能用这里声明的值 |
| `projects` | 项目介绍、筛选维度取值、技术标签及外部链接 |
| `ideas` | 「问题」栏：还在想的开放问题，按展示顺序排列（栏目 id 仍为 `ideas`） |

文章与项目的 `body` 支持 `p`（段落）、`h3`（小标题）、`quote`（引用）、`ul`（列表）、`links`（参考链接，`items: [{ text, url }]`；`url` 写成 `#lab/goodput` 这种形式就是站内链接）和 `tool`（站内小工具，`tool: "<工具 id>"`）。正文按纯文本渲染，不解析 HTML 或 Markdown。

每篇文章、每个项目的 `id` 应当唯一，推荐使用英文短横线，例如 `my-first-post`。文章链接形如 `#writing/my-first-post`，可以直接打开、刷新、使用浏览器前进后退。

项目的 `url` 是演示地址，`source` 是源码地址，均使用完整的 `https://...` URL；留空就不会出现相应按钮。`artwork` 支持 `browser`、`timer`、`notes`、`terminal`、`ledger`、`checkpoint`、`trace` 七种 CSS 示意图。

`index.html` 不需要手改：标题、描述、名字、介绍、职位、地区、能力列表、头像、学历和「此刻」都写成 `{{name}}` 这样的占位符，头像、学历、校徽这类可选内容包在 `<!-- if:portrait -->…<!-- end:portrait -->` 里，构建时按 `content.js` 填好或整块去掉。这样禁用 JavaScript 的访客和搜索引擎看到的首屏，与页面加载后渲染的是同一份资料。

## 履历公开范围

唯一开关是 `site.config.mjs` 中的 `CAREER_VISIBILITY`。它只在构建或启动预览时读取，不会发给浏览器，也不接受 URL、存储或 HTTP 参数覆盖。

| 开关值 | 访客收到的内容 |
| --- | --- |
| 某家公司的 `id` | 只包含这家公司的履历及图片，右上角固定显示它的 `modeName`，不可展开 |
| `all` | 包含 `experience` 里的全部公司，显示「全部履历」加各公司名的切换菜单 |

公司名单和菜单上的名字都来自 `content.js`，代码里不写死任何公司。填了 `content.js` 里没有的 `id` 会直接报错，并列出可用的值。

**本仓库的情况。** 当前开关是 `'tencent'`，暂不开放 `all` 和 `bytedance`。相关源数据、图片、筛选逻辑和交互测试完整保留，后续确认开放时只需修改开关，再重新构建并部署。`all` 模式下的菜单选择仅在本次页面生命周期内有效，不写入存储，刷新回到构建默认值。

完整数据仍在源码 `content.js` 的 `experience` 中维护。首页与关于的职位由公司 `profileRole` 派生；教育和其他栏目不受影响。构建会生成裁剪后的 `dist/content.js`，未开放公司的数据和 Logo 不进入 `dist/`。其他公开文件若残留该公司的名字、职位、`privateMarkers` 里的词或整句工作亮点，构建会报错而不是继续发布。非法开关同样直接报错，不回退为全部公开。

展示范围不改变实际任职状态：Tencent 及 Hunyuan 岗位时间为 2026.09 — 至今，ByteDance 及 Seed 岗位均于 2026.09 结束。尚未提供的 Tencent 职责和技能留空，不推算或编造；缺少日期时不显示时长。补充日期使用 `YYYY-MM` 格式，当前岗位由 `current: true` 标识。公司结束月份仅在所有历史岗位结束月份已知时计算，避免把 Ads 结束日期误当成 ByteDance 离职日期。Tencent/Hunyuan 使用 `assets/tencent-logo.png` 和 `assets/tencent-hunyuan-logo.png`，通过 `logo` 和 `logoAlt` 配置；两张透明 PNG 分别来自[腾讯官方媒体库](https://www.tencent.com/en-us/media/library.html)和[混元官方仓库](https://github.com/Tencent/Tencent-Hunyuan-Large)，与选定的参考图版本一致，页面不依赖外链图片。

**安全边界是「不发送未公开数据」，不是让浏览器代码无法修改。** 访客可以修改自己的页面文字或 JavaScript，但不能从 Tencent 公开文件中还原未发布的履历。预览仅服务文件白名单；README、测试、构建配置、Git 元数据、未公开 Logo 和源码备份均不可通过预览 URL 访问。服务返回 `Cache-Control: no-store`，修改查询参数也只会得到同一份裁剪数据。

**网站只部署 `dist/`，源码仓库目前按维护者决定保持公开。** 完整履历仍可通过 GitHub 源码与历史查看。网站的数据裁剪只控制 Pages 站点展示和下载内容，不代表源码保密。如果以后需要真正限制完整履历的获取，需另行将源仓库私有化，并处理旧发布、历史和缓存。

### 测试

运行 `node --test 'scripts/*.test.mjs' 'tools/*/test/*.test.mjs'`，不需要安装额外依赖。

- `scripts/site.test.mjs`：通用的发布与安全检查，比如只发布选中的公司、其他公司的信息漏进公开文件就报错、首页占位符转义、路径遍历、私有文件拒绝访问、严格的 CSP。它不依赖某一个人的内容，用 `content.example.js` 当固定样本，换了内容也应该通过。
- `scripts/content.test.mjs`：只核对本仓库这份内容，比如锁定 Tencent、字节跳动的信息不外泄、三个小工具。用这个仓库做模板时删掉。
- `scripts/vram-ledger.test.mjs` 和 `tools/*/test/`：三个小工具各自的公式测试。

浏览器回归按本仓库的内容编写，使用固定版本的 Playwright CLI。先保持安全预览服务运行。

<details>
<summary>浏览器回归命令</summary>

```bash
npx --yes --package=@playwright/cli@0.1.21 playwright-cli install-browser chromium
npx --yes --package=@playwright/cli@0.1.21 playwright-cli -s=career-tests open http://127.0.0.1:4177/ --config=.harness-e2e/cli.config.json
npx --yes --package=@playwright/cli@0.1.21 playwright-cli -s=career-tests run-code "$(cat .harness-e2e/career-locked.js)"
npx --yes --package=@playwright/cli@0.1.21 playwright-cli -s=career-tests run-code "$(node .harness-e2e/unlocked-fixture.mjs)"
npx --yes --package=@playwright/cli@0.1.21 playwright-cli -s=career-tests run-code "$(cat .harness-e2e/ufo-controls-reach.js)"
npx --yes --package=@playwright/cli@0.1.21 playwright-cli -s=career-tests run-code "$(cat .harness-e2e/writing-pagination.js)"
npx --yes --package=@playwright/cli@0.1.21 playwright-cli -s=career-tests run-code "$(cat .harness-e2e/question-replies.js)"
npx --yes --package=@playwright/cli@0.1.21 playwright-cli -s=career-tests run-code "$(cat .harness-e2e/background-music.js)"
npx --yes --package=@playwright/cli@0.1.21 playwright-cli -s=career-tests run-code "$(cat .harness-e2e/detail-mode.js)"
npx --yes --package=@playwright/cli@0.1.21 playwright-cli -s=career-tests run-code "$(cat .harness-e2e/project-facets.js)"
npx --yes --package=@playwright/cli@0.1.21 playwright-cli -s=career-tests run-code "$(cat .harness-e2e/vram-ledger.js)"
npx --yes --package=@playwright/cli@0.1.21 playwright-cli -s=career-tests run-code "$(cat .harness-e2e/ckpt-goodput.js)"
npx --yes --package=@playwright/cli@0.1.21 playwright-cli -s=career-tests run-code "$(cat .harness-e2e/agent-trace-replay.js)"
npx --yes --package=@playwright/cli@0.1.21 playwright-cli -s=career-tests close
```

</details>

`career-locked.js` 检查真实公开响应，尝试修改 DOM、全局配置、URL、存储及客户端策略，验证不能恢复未下发的履历；同时检查 Tencent 图片、时间、响应式和阅读功能。验证线上时，将浏览器打开地址替换为 `https://ai-loren.github.io/personal-homepage/`，运行同一个脚本即可。它支持项目子路径，仅对本地预览断言 `Cache-Control: no-store`，GitHub Pages 的 CDN 缓存策略由平台管理。

`unlocked-fixture.mjs` 仅将完整数据与图片注入隔离测试浏览器，不写入 `dist/`，不开放额外 HTTP 路径，不修改真实开关。它复用 `career-modes.js` 验证保留的三模式、鼠标与键盘、路由与搜索状态、日期边界、320–1440px 菜单布局和深浅主题。原有 ByteDance 桌面与移动端 YAML 契约作为历史模式基线保留，不用于验收当前 Tencent 锁定发布。

## 站点

字体在本地：书法品牌字、高对比英文衬线、中文宋体、现代无衬线正文、等宽标签。深浅色会记住。手机可以导航，键盘可以操作，Escape 关闭弹窗。系统打开「减少动态效果」时，画面保持静止。联系邮箱可以复制；GitHub 地址留空就不显示入口。

文字按工作、人生、技术、随想分类，可搜索标题、摘要和正文。每页 6 / 10 / 20 条，默认 10 条；切换分类或搜索时回到第 1 页。作品按 `projectFacets` 每个维度一排筛选（类型 / 使用 / 代码），各排同时生效，「使用」可以多选，一个作品可以同时是 Web、CLI、SDK。按钮只列出至少有一个作品用到的值，只剩一个值的维度整排不显示，会让结果变空的选项被禁用。构建会拒绝 `projectFacets` 里没有声明的值，加新取值要先在那里声明。

实验卡片显示关键指标对比和缩略曲线，详情页含假设、设置、指标、SVG 折线图或条形图、发现与结论，图表随页面主题配色。数据写在 `content.js` 的 `experiments` 中，当前为模拟示意。每个实验带若干份可下载的 CSV（`data/lab/<实验 id>/`），`datasets` 记录说明、行数、字节数与逐列含义。构建只发布 `datasets` 列出的文件，`scripts/site.test.mjs` 校验表头、行数、字节数和首行与描述一致，改了 CSV 要同步改描述。

作品、文字、实验、问题的详情顶部有「浮层 | 整页」切换，选择存在 localStorage，默认浮层。整页模式仍显示页头，网址与浮层相同，「← 返回」或 Esc 回到列表并恢复原滚动位置。两种模式共用同一份 `#reader-shell`，切换时整体移动，所以页面里 `#reader-*` 与 `#question-replies` 始终只有一份。

### 工具怎么接上

作品正文里的 `{ type: 'tool', tool: '<id>' }` 会挂载注册在 `window.SITE_TOOLS['<id>']` 上的工具。脚本放在 `tools/<id>.js`，或子模块里的 `tools/<id>/<id>.js`。新增工具要做三件事：放好脚本、把它加进 `scripts/site.mjs` 的 `PUBLIC_FILES`、在 `index.html` 里于 `app.js` 之前加 `<script>`。构建会拒绝正文里引用了未发布的工具 id。工具在浏览器里运行，不联网，输入只按数值处理。

- **显存账本**。[vram-ledger](https://github.com/ai-loren/vram-ledger) 的 `tools/vram-ledger.js` 是正本的逐字节复制件。改它要先在那个仓库里改、跑通测试，再用 `cp ../vram-ledger/vram-ledger.js tools/` 复制过来，提交时写明对应的上游 commit。`scripts/vram-ledger.test.mjs` 核对它的公式。
- **Checkpoint 间隔**与**轨迹回放**。[ckpt-goodput](https://github.com/ai-loren/ckpt-goodput) 和 [agent-trace-replay](https://github.com/ai-loren/agent-trace-replay) 以 git 子模块挂在 `tools/ckpt-goodput`、`tools/agent-trace-replay`。本仓库只记录它们的 commit，不存它们的代码，构建时只发布各自的那一个 JS 文件。克隆时用 `git clone --recurse-submodules`，已经克隆的跑一次 `git submodule update --init`，否则构建会报缺文件并给出这条命令。升级到新版本：`git -C tools/<id> pull`，跑过测试后提交子模块指针。Pages 工作流会连子模块一起检出，并在构建前跑它们自带的 `test/<id>.test.mjs`。

计算公式与假设写在各自的作品详情里。显存账本和 checkpoint 计算器共用表单、结果面板、图例和改法按钮的样式（`styles.css` 里 `.vram-*` 与 `.ckpt-*` 并列的规则）；轨迹回放的样式是 `.trace-*`。轨迹回放把粘贴进来的内容只用 `textContent` 写进页面，`.harness-e2e/agent-trace-replay.js` 会贴一段带 `<img onerror>` 和 `<script>` 的轨迹，确认它们只显示成文字。

### 画面

首页太阳系优先使用 Three.js 透视场景：轨道有倾角和景深，行星会公转、自转，并发生前后遮挡，鼠标移动产生相机视差。Three.js 或 WebGL 不可用时，自动保留二维 Canvas。行星默认尺寸按真实直径做压缩映射：木星、土星、天王星与海王星、地球与金星、火星、水星、月球。太阳单独压缩，避免挡住导航。悬停或键盘聚焦时，天体放大并加快自转，对应轨道高亮，同时显示实际直径。

`cosmos.js` 在浏览器里生成各天体的程序纹理。`globe-renderer.js` 用 WebGL 为地球和月球做球面投影与片元光照，不支持 WebGL 时退回 Canvas。大陆轮廓和月面是艺术化纹理，不是卫星照片。其余行星用轻量 Canvas，导航小图标复用对应天体的静态球面。地球有地形、独立云层、大气辉光和固定光照，月球有月面凹凸。太阳由独立 Canvas 绘制日面颗粒、日斑和等离子亮弧，并叠加旋转日冕和两组耀斑。

星点会闪烁，鼠标带视差，偶尔有流星。右上角可以暂停。离开首页、滚出屏幕或切到后台标签页时，动画停止。七个栏目各有一幅 Canvas 背景：水星观测网格、月相星图、地球与卫星、火星地貌、航行轨迹、土星档案网格、古星图黑洞。深浅模式各有一套配色。

这些都在本地用 Canvas 和 CSS 画出来，没有外部图片、字体、追踪器或 API 请求。除了主题和动效偏好，不存储访客数据。

### 音乐与回复

页头右上角的音符按钮打开面板，可开关背景音乐并调音量。曲目在 `content.js` 的 `music.tracks` 中按顺序循环。进入页面时默认以 50% 音量尝试自动播放。浏览器禁止无手势自动出声时，改为在访客第一次点击、触摸或按键时开始。访客主动关闭后不再自动播放，开关和音量存在 localStorage。当前曲目是受版权保护的电影原声，未取得授权，面板底部有版权声明和联系方式。收到版权方要求时，删除 `audio/` 下的文件并改写 git 历史、强制推送，才能彻底移除。构建时缺文件的曲目会被移出播放列表，全部缺失则隐藏音乐控件。

每个问题点开后有独立回复区，由 giscus（GitHub Discussions）承载。访客登录 GitHub 后回复，按 `question:<问题 id>` 对应讨论帖。回复只以 giscus.app 的跨域 iframe 嵌入，带 sandbox，本站不执行第三方脚本或样式。`index.html` 的 CSP 只放行本站资源与 `frame-src https://giscus.app`，因此页面里不能写内联脚本、事件属性或 style 属性，CSS 变量要用 `element.style.setProperty` 设置。`comments.categoryId` 为空时，回复区只显示「正在接入中」，不加载任何外部内容。`giscus.json` 只放行 `comments.site` 的域名，测试会校验两者一致。在其他域名（含本地预览）打开时，回复区不嵌入 giscus，只给出跳到正式网站同一问题的链接。要在本地测试回复，需临时把本地地址加进 `giscus.json` 的 `origins` 并推送。问题 id 一旦发布不要改，否则旧回复会和问题脱钩。

## 部署

先运行 `node scripts/site.mjs build`。构建成功后只发布 `dist/` 的内容，不要把它追加到仍包含旧源码文件的目录。`dist/` 已包含页面、裁剪后的数据、获准使用的图片、Three.js r160、字体及许可证。原始 `assets/` 是长期源资源，不可删除；未获准公开的公司图片不会被复制到产物。

- **Cloudflare Pages / Netlify / Vercel**。使用 Node.js 20+，构建命令设为 `node scripts/site.mjs build`，输出目录设为 `dist`。关联源仓库时保持源仓库私有。
- **GitHub Pages**。仓库 **Settings → Pages → Source** 必须设为 **GitHub Actions**。`.github/workflows/pages.yml` 在推送到 `main` 或手动触发后，用 Node.js 24 运行发布隔离测试，执行与本地相同的构建命令，再只上传 `dist/` 并部署。测试或构建失败不会发布。可在 **Actions → Deploy GitHub Pages** 查看状态。不要改回从 `main` 根目录部署。
- **手工上传**。用新的 `dist/` 完整替换公开目录，确认 README、Git 元数据、脚本、测试、备份及未公开的公司 Logo 均不存在。构建失败时停止发布，不用遗留产物继续上线。

本站使用 hash 路由，不需要服务端重写，也可以放在子目录中。上述托管设置要在平台上实际应用；改本地代码不会自动调整已有的线上部署。

当前实现适合个人展示，内容在本地文件里维护。留言、订阅、跨设备在线编辑需要另接服务。每篇文章单独的搜索引擎收录与分享预览，可以以后用静态站点生成器补上。

## 许可

代码采用 [MIT](LICENSE) 许可。`content.js` 里的个人内容、照片、作品截图、实验数据，各公司与学校的商标，以及背景音乐，都不在 MIT 范围内。字体、three.js 和三个小工具保留各自的许可。详见 [CONTENT-LICENSE.md](CONTENT-LICENSE.md)。

觉得有用，请给这个仓库点个 [star](https://github.com/ai-loren/personal-homepage/stargazers)。
