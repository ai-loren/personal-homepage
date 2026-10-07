# Loren's Galaxy

[中文](README.md)

![Home: a solar system you can fly into](docs/readme/home.jpg)

A personal site you explore as a solar system. Each planet opens a section: about, writing, work, lab, career, shelf, or questions. Three of the projects are ML infra tools you can use on the page: a VRAM ledger, a checkpoint-interval calculator, and an agent-trace player. That combination is rare among the tens of thousands of personal homepages.

[Live site](https://ai-loren.github.io/personal-homepage/) · [中文](README.md)

![VRAM Ledger, running inside a project page](docs/readme/vram.jpg)

HTML, CSS, and plain JavaScript. No framework and nothing to `npm install`. A Node build trims which jobs are published; the result is static files, with no server at runtime.

## Use it in one pass

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

The footer link, “Built with Loren's Galaxy”, is part of the template. Keeping it is appreciated.

The steps below are the same path with the details filled in.

## Make it yours

1. **Create the repository** with [Use this template](https://github.com/ai-loren/personal-homepage/generate), then clone with submodules: `git clone --recurse-submodules <your repo url>`.
2. **Replace the content.** `cp content.example.js content.js`, then edit `content.js` using the table below. Keep `content.example.js`; the generic tests use it as their fixture. You do not edit `index.html`. The build fills the name, intro, and role from `content.js`.
3. **Choose which jobs are public.** Set `CAREER_VISIBILITY` in `site.config.mjs` to `'all'`, or to one company `id`.
4. **Remove the original author’s files and tests:**
   - `scripts/content.test.mjs` checks this repository’s content only
   - `.harness-e2e/` is written against that content; delete it or rewrite it
   - `assets/loren-portrait.webp`, `assets/xidian-university-emblem.png`, the company logos, `assets/projects/`, `data/lab/`
   - `audio/`: copyrighted music, delete it
   - tools you will not ship: remove their script from `PUBLIC_FILES` in `scripts/site.mjs` and from `index.html`; remove a submodule with `git rm tools/<id>`
5. **Replies on the questions page:**
   - To turn them on, enable Discussions, install the [giscus](https://giscus.app/) app, put the `repoId` and `categoryId` into `comments` in `content.js`, and put your site URL in `origins` inside `giscus.json`.
   - To leave them off, keep `categoryId` empty. The page shows a “not connected yet” notice. `comments.site` still has to be your own URL and has to match `giscus.json`; the tests check that.
6. **Check it locally:** `node --test 'scripts/*.test.mjs' 'tools/*/test/*.test.mjs'`, then `node scripts/site.mjs serve`.
7. **Deploy.** **Settings → Pages → Source** must be **GitHub Actions**. Every push to `main` runs the tests, builds, and publishes only `dist/`.

## Run it locally

Node.js 20+ and a current browser. No `npm install`.

From the repository root:

```bash
node scripts/site.mjs serve
```

Open the printed `Preview:` URL. The server sends only the companies selected by `CAREER_VISIBILITY`, from a snapshot taken at startup. Restart it after you edit source or `site.config.mjs`. Do not serve the source tree with `python3 -m http.server`: that would expose the full history, the tests, and the Git metadata. Other static hosts may serve `dist/` only.

`node scripts/site.mjs build` writes `dist/`. A rebuild clears the previous output.

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
| `profile.demo` | `true` shows a “sample data” notice on the lab page |
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

Company names come from `content.js`. An unknown `id` fails the build and lists the values that work. This repository is set to `'tencent'`, so the live site does not include the other history. The full entries stay in source; the build strips them, and the build fails if a public file still contains a hidden company’s name, title, `privateMarkers`, or highlight. The preview serves an allowlist and sends `Cache-Control: no-store`. Publishing `dist/` does not hide the source repository. If the full history must be unreadable, the source repository has to be private, and old releases and caches have to be dealt with separately.

`node --test 'scripts/*.test.mjs' 'tools/*/test/*.test.mjs'` needs no extra packages. `scripts/site.test.mjs` is the generic publication check and should still pass after you change the content. `scripts/content.test.mjs` locks this repository’s content; delete it when you use the template. The browser scripts under `.harness-e2e/` are written for this content too.

## Three tools

A `{ type: 'tool', tool: '<id>' }` block mounts `window.SITE_TOOLS['<id>']`. The script lives at `tools/<id>.js` or, for a submodule, `tools/<id>/<id>.js`. Shipping a new tool means adding the file, listing it in `PUBLIC_FILES`, and adding a `<script>` before `app.js`. The build rejects a tool id that is not published. The tools run in the browser, do not use the network, and read numbers only.

- [VRAM Ledger](https://github.com/ai-loren/vram-ledger) estimates parameter, gradient, optimizer, and activation memory. `tools/vram-ledger.js` is a byte-for-byte copy of that repository.
- [Ckpt Goodput](https://github.com/ai-loren/ckpt-goodput) and [Agent Trace Replay](https://github.com/ai-loren/agent-trace-replay) are git submodules. This repository stores their commits, not their source. Clone with `--recurse-submodules`. The Pages workflow checks the submodules out and runs their tests before building.

## Deploy

`node scripts/site.mjs build`, then publish **only** `dist/`. It already contains the page, the trimmed data, the allowed images, Three.js r160, and the fonts with their licenses.

- **Cloudflare Pages / Netlify / Vercel:** Node.js 20+, build command `node scripts/site.mjs build`, output directory `dist`.
- **GitHub Pages:** **Settings → Pages → Source** must be **GitHub Actions**. `.github/workflows/pages.yml` tests, builds, uploads `dist/`, and deploys. A failed test does not deploy. Do not switch Pages back to deploying the `main` branch root.
- **Manual upload:** replace the public directory with a fresh `dist/`. The README, Git metadata, tests, and unpublished logos must not be in it.

Routes are hashes, so the site can live in a subpath and needs no rewrite rules.

## License

Code is [MIT](LICENSE). Personal writing, photos, screenshots, and lab data, company and school marks, and the background music are not in that grant. Fonts, Three.js, and the three tools keep their own licenses. See [CONTENT-LICENSE.md](CONTENT-LICENSE.md).

If this is useful, please [star the repo](https://github.com/ai-loren/personal-homepage/stargazers).
