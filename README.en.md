<p align="center">
  <a href="README.md">中文</a>
  &nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="https://ai-loren.github.io/personal-homepage/">Live site</a>
  &nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="https://github.com/ai-loren/personal-homepage/generate">Use this template</a>
</p>

<h1 align="center">Loren's Galaxy</h1>

<p align="center">
A personal site you can fly into.<br>
Planets are the navigation. The tools on the work page are ready to use.
</p>

<p align="center">
  <img src="docs/readme/home.jpg" width="880" alt="Home: a dark solar system. Planets are labeled About, Writing, Projects, Lab, Journey, Library, and Questions">
</p>

<p align="center"><sub>Home. The orbit is the navigation.</sub></p>

## Navigation, and tools you can use

The solar system takes you into a section. Three of the projects are ML infra tools that run in the browser. Personal sites rarely have both.

<p align="center">
Mercury · About &nbsp;&nbsp;·&nbsp;&nbsp; Moon · Writing &nbsp;&nbsp;·&nbsp;&nbsp; Earth · Projects &nbsp;&nbsp;·&nbsp;&nbsp; Mars · Lab<br>
Jupiter · Journey &nbsp;&nbsp;·&nbsp;&nbsp; Saturn · Library &nbsp;&nbsp;·&nbsp;&nbsp; Neptune · Questions
</p>

Venus and Uranus stay in the orbit as part of a complete solar system. They do not open a section.

| Tool | What it does on the page | Code |
| --- | --- | --- |
| VRAM Ledger | Splits one GPU into parameters, gradients, optimizer state, and activations. Change the parallelism and it recomputes. | [source](https://github.com/ai-loren/vram-ledger) |
| Ckpt Goodput | Given cluster size and how often a failure happens, estimates how often to checkpoint. | [source](https://github.com/ai-loren/ckpt-goodput) |
| Trace Replay | Paste one run and play it back in time. | [source](https://github.com/ai-loren/agent-trace-replay) |

<p align="center">
  <img src="docs/readme/vram.jpg" width="720" alt="VRAM Ledger inside a project page: model and parallelism on the left, 60.2 of 80 GiB on the right">
</p>

<p align="center"><sub>VRAM Ledger. Change one control and the total follows.</sub></p>

HTML, CSS, and plain JavaScript. No framework, and nothing to `npm install`. A Node build only decides which jobs are published. What goes live is the static files in `dist/`.

## Use it in one pass

Node.js 20+.

1. Click [Use this template](https://github.com/ai-loren/personal-homepage/generate) and create your own repository.
2. Clone it and open the preview:

```bash
git clone --recurse-submodules https://github.com/<you>/<repo>.git
cd <repo>
cp content.example.js content.js
node scripts/site.mjs serve
```

The terminal prints a preview URL. That page is the example site. Then change three things: replace the copy in `content.js`, set `CAREER_VISIBILITY` in `site.config.mjs` to `'all'` (or to one company `id` from your content), and delete the original personal files you do not want (`assets/loren-portrait.webp`, the school emblem, company logos, `assets/projects/`, `data/lab/`, `audio/`, and `scripts/content.test.mjs`). The files in `audio/` are copyrighted music. Delete them.

If a submodule directory is empty, run `git submodule update --init`.

3. In the new repository, set **Settings → Pages → Source** to **GitHub Actions**. After you push to `main`, the site is at `https://<you>.github.io/<repo>/`.

The footer link, “Built with Loren's Galaxy”, is part of the template. Keeping it is appreciated. The same path, with the details filled in, is below.

## Contents

- [Make it yours](#make-it-yours)
- [Run it locally](#run-it-locally)
- [What to edit](#what-to-edit)
- [Which jobs are published](#which-jobs-are-published)
- [The site](#the-site)
- [Deploy](#deploy)
- [License](#license)

## Make it yours

1. **Create the repository** with [Use this template](https://github.com/ai-loren/personal-homepage/generate), then clone with submodules: `git clone --recurse-submodules <your repo url>`.
2. **Replace the content.** `cp content.example.js content.js`, then edit `content.js` using the table below. Keep `content.example.js`; the generic tests use it as their fixture. You do not edit `index.html`. The build fills the name, intro, and role from `content.js`.
3. **Choose which jobs are public.** Set `CAREER_VISIBILITY` in `site.config.mjs` to `'all'`, or to one company `id`.
4. **Remove the original author’s files and tests.**
   - `scripts/content.test.mjs` checks this repository’s content only
   - `.harness-e2e/` is written against that content; delete it or rewrite it
   - `assets/loren-portrait.webp`, `assets/xidian-university-emblem.png`, the company logos, `assets/projects/`, `data/lab/`
   - `audio/`: copyrighted music, delete it
   - tools you will not ship: remove their script from `PUBLIC_FILES` in `scripts/site.mjs` and from `index.html`; remove a submodule with `git rm tools/<id>`
5. **Replies on the questions page.**
   - To turn them on, enable Discussions, install the [giscus](https://giscus.app/) app, put the `repoId` and `categoryId` into `comments` in `content.js`, and put your site URL in `origins` inside `giscus.json`.
   - To leave them off, keep `categoryId` empty. The page shows a notice that replies are not connected yet. `comments.site` still has to be your own URL and has to match `giscus.json`; the tests check that.
6. **Check it locally.** `node --test 'scripts/*.test.mjs' 'tools/*/test/*.test.mjs'`, then `node scripts/site.mjs serve`.
7. **Deploy.** **Settings → Pages → Source** must be **GitHub Actions**. Every push to `main` runs the tests, builds, and publishes only `dist/`.

## Run it locally

Node.js 20+ and a current browser. No `npm install`.

From the repository root:

```bash
node scripts/site.mjs serve
```

Open the printed `Preview:` URL. The server sends only the companies selected by `CAREER_VISIBILITY`, from a snapshot taken at startup. Restart it after you edit source or `site.config.mjs`. Do not serve the source tree with `python3 -m http.server`: that would expose the full history, the tests, and the Git metadata. Other static hosts may serve `dist/` only.

`node scripts/site.mjs build` writes `dist/`. A rebuild clears the previous output. This repository publishes Tencent only, so the corner control does not open.

## What to edit

Edit the source `content.js`, then restart the preview or rebuild. Do not edit `dist/content.js`; the next build overwrites it.

| Field | Role |
| --- | --- |
| `profile.name` | Name on the home page, the wordmark, and the footer |
| `profile.siteTitle` | Browser title |
| `profile.intro` / `description` | Short line / longer description |
| `profile.motto` | Gold script at the end of the intro; empty ends the sentence with a period |
| `profile.now` / `nowNote` | The “right now” block |
| `profile.email` | Contact address; empty hides it |
| `profile.github` | Full GitHub profile URL; empty hides the link |
| `profile.focus` | The expertise list; empty hides the block |
| `profile.location` / `locationEn` | Location, Chinese and English |
| `profile.portrait` | `{ src: './assets/<file>', alt }`; omit it to hide the photo |
| `profile.demo` | `true` shows a sample-data notice on the lab page |
| `experience` | One entry per company: `id` (lowercase letters, digits, hyphens; this is the value `CAREER_VISIBILITY` accepts), `company`, `modeName`, `privateMarkers` (strings that must not appear in any public file when this company is unpublished), `profileRole`, `logo`, `roles`. `modeName` and `privateMarkers` are build-only and are not published |
| `journey` | Education. An entry may include `emblem: { src, alt }`; the home page shows the first emblem |
| `articles` | Writing, in display order; the first one is featured on the home page |
| `projectFacets` | Filter rows (type, where it runs, code). A project may only use values declared here |
| `projects` | Write-up, facet values, tags, and links |
| `ideas` | Open questions, in display order |

Article and project bodies accept `p`, `h3`, `quote`, `ul`, `links`, and `tool`. Body text is plain text. `links` items are `{ text, url }`; a url like `#lab/goodput` stays inside the site. A `tool` block is `{ type: 'tool', tool: '<id>' }`.

Give every article and project its own `id`, preferably a short English slug. `#writing/my-first-post` opens that piece directly and survives refresh and the back button.

`url` is the demo and `source` is the code, both full `https://` URLs. Leave one empty and that button disappears. `artwork` is one of `browser`, `timer`, `notes`, `terminal`, `ledger`, `checkpoint`, `trace`.

`index.html` is filled at build time. Tokens such as `{{name}}` and optional blocks such as `<!-- if:portrait -->…<!-- end:portrait -->` come from `content.js`, so a visitor without JavaScript sees the same first screen.

## Which jobs are published

`CAREER_VISIBILITY` in `site.config.mjs` is read only when you build or start the preview. It is not sent to the browser, and a URL, storage, or query parameter cannot override it.

| Value | What visitors receive |
| --- | --- |
| a company `id` | That company’s history and images only. The corner shows its `modeName` and does not open |
| `all` | Every company in `experience`, with a menu |

Company names come from `content.js`. An unknown `id` fails the build and lists the values that work. This repository is set to `'tencent'`, so the live site does not include the other history. The full entries stay in source. The build strips them, and the build fails if a public file still contains a hidden company’s name, title, `privateMarkers`, or highlight. The preview serves an allowlist and sends `Cache-Control: no-store`.

Publishing `dist/` does not hide the source repository. Visitors can change the page in their own browser; they cannot reconstruct an unpublished job from the files the server sent. If the full history must be unreadable, the source repository has to be private, and old releases and caches have to be dealt with separately.

`node --test 'scripts/*.test.mjs' 'tools/*/test/*.test.mjs'` needs no extra packages. `scripts/site.test.mjs` is the generic publication check and should still pass after you change the content. `scripts/content.test.mjs` locks this repository’s content; delete it when you use the template. The browser scripts under `.harness-e2e/` are written for this content too.

## The site

Writing is grouped into work, life, craft, and notes. Search covers title, summary, and body. Pages are 6, 10, or 20 items, 10 by default, and a new filter returns to page 1. Projects filter on one row per `projectFacets` dimension. “Where it runs” is multi-select, so one project can be Web, CLI, and SDK at once. A dimension with a single value is hidden. An option that would empty the list is disabled. A value that `projectFacets` does not declare fails the build.

Lab cards show a metric comparison and a small curve. The detail page has the hypothesis, the setup, the metrics, an SVG chart, and the conclusion. Data lives in `experiments` inside `content.js` and is sample data for now. Each experiment ships CSVs under `data/lab/<id>/`. `datasets` records the description, row count, byte size, and what each column means. The build publishes only listed files, and `scripts/site.test.mjs` checks the header, the row count, the byte size, and the first row.

A project, essay, experiment, or question opens as an overlay or as a full page. The choice is stored in localStorage. The default is the overlay. Both modes share one `#reader-shell`. The full page keeps the site header, the URL stays the same, and Back or Escape returns to the list at the same scroll position.

### Wiring a tool

A `{ type: 'tool', tool: '<id>' }` block mounts `window.SITE_TOOLS['<id>']`. The script lives at `tools/<id>.js` or, for a submodule, `tools/<id>/<id>.js`. Shipping a new tool means adding the file, listing it in `PUBLIC_FILES`, and adding a `<script>` before `app.js`. The build rejects a tool id that is not published. The tools run in the browser, do not use the network, and read numbers only.

[VRAM Ledger](https://github.com/ai-loren/vram-ledger) is copied byte for byte into `tools/vram-ledger.js`. [Ckpt Goodput](https://github.com/ai-loren/ckpt-goodput) and [Agent Trace Replay](https://github.com/ai-loren/agent-trace-replay) are git submodules. This repository stores their commits, not their source. Clone with `--recurse-submodules`. The Pages workflow checks the submodules out and runs their tests before building. Pasted traces are written with `textContent` only.

### The sky

The home solar system is a Three.js scene: inclined orbits, depth, spin, orbit, and occlusion, with a little camera parallax as the pointer moves. If Three.js or WebGL is missing, a flat canvas remains. Planet sizes follow real diameters on a compressed scale, and the sun is compressed further so it does not cover the navigation. Hover or keyboard focus enlarges a body, speeds its spin, highlights its orbit, and shows its real diameter.

`cosmos.js` paints the textures in the browser. `globe-renderer.js` lights the Earth and the Moon in WebGL. The continents and the lunar surface are drawn, not photographed. Stars, a meteor, and mouse parallax run on a canvas and pause off the home page, off screen, or in a background tab. Each section has its own canvas ground: a survey grid, a moon chart, Earth and a satellite, Martian terrain, a voyage, Saturn’s archive, an old star map. Light and dark themes each have a palette. Nothing here is an external image, font, tracker, or API. The page stores the theme and the motion preference, and nothing else about a visitor.

## Deploy

`node scripts/site.mjs build`, then publish **only** `dist/`. It already contains the page, the trimmed data, the allowed images, Three.js r160, and the fonts with their licenses.

- **Cloudflare Pages / Netlify / Vercel.** Node.js 20+, build command `node scripts/site.mjs build`, output directory `dist`.
- **GitHub Pages.** **Settings → Pages → Source** must be **GitHub Actions**. `.github/workflows/pages.yml` tests, builds, uploads `dist/`, and deploys. A failed test does not deploy. Do not switch Pages back to deploying the `main` branch root.
- **Manual upload.** Replace the public directory with a fresh `dist/`. The README, Git metadata, tests, and unpublished logos must not be in it.

Routes are hashes, so the site can live in a subpath and needs no rewrite rules.

## License

Code is [MIT](LICENSE). Personal writing, photos, screenshots, and lab data, company and school marks, and the background music are not in that grant. Fonts, Three.js, and the three tools keep their own licenses. See [CONTENT-LICENSE.md](CONTENT-LICENSE.md).

If this is useful, please [star the repo](https://github.com/ai-loren/personal-homepage/stargazers).
