# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`teaman` is a static site generator for Obsidian vaults, shipped as an installable
**Astro engine** (`npm`/`npx teaman`). The core idea: **the vault is pure data, the
engine is code**, and the two never mix.

- A *vault* contains only content (`notes/ guides/ slides/ dailies/`), a
  `teaman.config.js`, and optional `public/` passthrough assets. It carries **no
  engine source**, so upgrading the engine is bumping one version number — there
  is never a merge.
- The *engine* lives in `site/`. It is the Astro app, the CLI (`site/bin/teaman.mjs`),
  and the build scripts. The published npm package is the `site/` directory (see
  `files` in `site/package.json`; `bin.teaman` → `bin/teaman.mjs`).
- This repo bundles an example vault at the repo root in `content/`, which the
  engine builds in place when no external vault is given. Generated output lands
  in `public/` (committed build artifact for GitLab Pages) or `<vault>/dist`.

Read `README.md` for the user-facing CLI/config surface and `MIGRATING.md` for the
semver contract before changing config keys, frontmatter schemas, or URL structure.

## Commands (run from `site/`)

```sh
npm install
npm run dev            # Astro dev server on the bundled content/ vault (fastest loop)
npm run build          # full prod build: astro → slides → search  (build:all)
npm run preview        # preview the production build
npm test               # vitest unit suite (node env)
npm run test:watch     # vitest watch
npm run test:e2e       # Playwright e2e (auto-starts the dev server)
npm run test:e2e:ui    # Playwright interactive UI
```

Run a single unit test file / pattern:
```sh
npx vitest run src/lib/__tests__/format.test.ts
npx vitest run -t "fmtDate"
```

Exercising the **full CLI path** (config serialization, Slidev, Pagefind, engine
version check) against the bundled vault — from inside `site/`, the bundled vault
is `../content`:
```sh
node bin/teaman.mjs build ../content      # → content/dist
node bin/teaman.mjs dev ../content        # CLI equivalent of `npm run dev`
node bin/teaman.mjs doctor ../content     # validate config + lint content, no build
```
Options mirror the deploy target: `--out <dir>`, `--base /sub-path/`, `--port <n>`.
To test exactly as a consumer receives it: `cd site && npm pack` then
`npx ./teaman-<version>.tgz build ../content`.

## Architecture

### The env seam (most important thing to understand)

The CLI never edits engine files to point at a vault. Instead `bin/teaman.mjs`
resolves the vault, merges its config, stages static assets, and spawns Astro/scripts
with environment variables. **Every engine entry point reads the same env vars and
falls back to the bundled `content/` → `public/` when they are unset** — which is
exactly why the plain `npm` scripts and the test suite work in place:

| Env var | Meaning | Read by |
|---|---|---|
| `TEAMAN_VAULT` | vault root | `src/lib/content-paths.ts`, `scripts/*.mjs` |
| `TEAMAN_OUT` | output dir | `astro.config.mjs` (`outDir`), `scripts/*.mjs` |
| `TEAMAN_BASE` | base URL path | `astro.config.mjs`, `scripts/*.mjs` (also legacy `SITE_BASE`) |
| `TEAMAN_CONFIG` | the vault config, serialized to JSON | `src/config.ts` |
| `TEAMAN_PUBLIC` | staged static dir | `astro.config.mjs` (`publicDir`) |

Consequences when changing things:
- Anything that needs the vault root or output dir must read these env vars with the
  bundled-`content/`/`public/` fallback — don't hardcode paths. Mirror the existing
  pattern in `content-paths.ts` and the two `scripts/*.mjs`.
- Base-path handling goes through `src/lib/site-base.mjs` `normalizeBase` (single
  leading + trailing slash). Use it everywhere a URL is composed so `--base /foo/`
  never concatenates into `/fooguides/...`.

### Config flow

`teaman.config.js` is **pure data, default-exported** (no functions — it's JSON-
serialized through `TEAMAN_CONFIG`). The CLI may pass a partial config;
`src/config.ts` merges it over `DEFAULT_CONFIG` (with `hero` merged one level deep)
and exports `SITE_CONFIG`. The authoritative `SiteConfig` shape and its doc comments
live in `src/config.ts` — keep it in sync with the README and with `KNOWN_KEYS`/
`KNOWN_HERO_KEYS` in `bin/teaman.mjs` (the `doctor` validator).

**Theming is the only per-vault styling surface**: `config.theme` is a map of CSS
custom properties layered onto `:root`. Token names mirror `:root` in
`src/styles/global.css`; `doctor` reads that file to flag unknown tokens. There are
deliberately no per-vault component or CSS files — that is what makes engine upgrades
mergeless.

### Content collections

`src/content.config.ts` defines five Astro collections — `notes`, `guides`,
`guideSummaries`, `slides`, `dailies` — each a `glob` loader rooted at the matching
`*Root` from `content-paths.ts`. Notes about the model:
- `guides/<slug>/` is a book: `SUMMARY.md` is the chapter index (its own
  `guideSummaries` collection, excluded from `guides`), and the other `.md` files are
  chapters.
- `dailies` are `YYYY-MM-DD.md`; the schema **requires** a `date` field (the filename
  only supplies the URL slug). `doctor` enforces this before the build does.
- Wiki-links (`[[name]]`) are resolved by `remark-wiki-link` in `astro.config.mjs` to
  `${base}notes/<slug>/`; slugs are `name.replace(/ /g,'-').toLowerCase()`. `doctor`
  warns on links to missing notes using the same slug rule.

The Markdown pipeline (`astro.config.mjs`) also runs `remarkStripLeadingH1` (pages
render the title themselves), `remarkMermaid` (rewrites ` ```mermaid ` fences to
`<pre class="mermaid">` so Shiki skips them and `src/scripts/mermaid.ts` renders
them client-side, theme-reactive), `rehype-callouts` (Obsidian callouts), and slug +
autolinked headings. Note `astro build` is run from the engine dir with `.astro/`
cache dropped each build, because the content-layer store is keyed by collection
name not vault — otherwise a second vault reuses the first vault's cached entries.

### Build pipeline (`build:all`)

Three sequential stages, all reading the env seam:
1. `astro build` → HTML into `outDir`.
2. `scripts/build-slides.mjs` → runs `slidev build` per deck in `<vault>/slides/`
   (skipping `_`-prefixed files). Decks are copied into `site/.slides-build/` first
   because Slidev resolves themes relative to the deck file and needs to walk up to
   `site/node_modules`.
3. `scripts/build-search.mjs` → Pagefind index over built HTML (excluding the Slidev
   SPAs, whose bodies are JS-rendered) plus custom records for each deck via
   `parse-deck.mjs`.

### Frontend

Astro pages in `src/pages/` (`index`, `notes/[...slug]`, `guides/[...slug]`,
`daily/index`, `daily/[week]`) compose React islands (`@astrojs/react`) from
`src/components/` (shadcn-style UI under `components/ui/`). Tailwind v4 via
`@tailwindcss/vite`; tokens in `src/styles/global.css`. Client-side list
filter/sort/tag logic is the framework-agnostic `src/scripts/list-controller.ts`.
Shared logic (path/format/entry-loading/dailies/guides parsing) lives in `src/lib/` —
prefer extending those helpers over duplicating logic in pages.

## Testing

- Unit tests (vitest, `node` env) are colocated in `__tests__/` next to the code,
  including for the CLI (`bin/__tests__/`) and build scripts (`scripts/__tests__/`).
  When adding a `src/lib/` utility, add a matching `__tests__/` file.
- Files importing `astro:content` must `vi.mock('astro:content', ...)` at the top.
- DOM tests need `// @vitest-environment happy-dom` (the default env is `node`); the
  `requestAnimationFrame` stub uses a queue, not synchronous fire — copy the
  list-controller test pattern.
- E2E (`site/e2e/`, Playwright) auto-starts the dev server via `playwright.config.ts`
  and selects on real component classes (`.crumbs`, `.guide-nav-link.next`). On Arch,
  headless Chromium needs `nspr nss atk at-spi2-core libx11 libxrandr mesa libxcb
  libxkbcommon alsa-lib`.
- `npm run build` (or `node bin/teaman.mjs doctor ../content`) is the final
  validation step; `doctor` gates CI by exiting non-zero on config/content problems.

## Conventions

- Two-space indent (Astro/CSS/JSON); single quotes + semicolons in JS/TS. PascalCase
  for component filenames, kebab-case lowercase for routed content slugs.
- Conventional Commit prefixes (`feat:`, `fix:`, `refactor:`, `build:`); imperative,
  one change per subject.
- CI (`.gitlab-ci.yml`) builds with `SITE_BASE=/$CI_PROJECT_NAME/` and deploys
  `public/` to GitLab Pages from the default branch. `public/` is a committed build
  artifact — don't hand-edit it; call out regenerated `public/` changes separately.
