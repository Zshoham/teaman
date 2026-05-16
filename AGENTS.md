# Repository Guidelines

## Project Structure & Module Organization

This repository contains an Astro documentation site. Application code lives in `site/src/`, with pages in `site/src/pages/`, reusable Astro components in `site/src/components/`, layouts in `site/src/layouts/`, shared TypeScript helpers in `site/src/lib/`, and global styles in `site/src/styles/`.

Author-facing Markdown content is stored outside the app in `content/`: guides in `content/guides/`, notes in `content/notes/`, and Slidev decks in `content/slides/`. Generated static output is written to `public/`; treat it as build output. Project notes and reviews live in `docs/`.

## Build, Test, and Development Commands

Run commands from `site/` unless noted otherwise.

- `npm install`: install Astro, Slidev, Pagefind, and Markdown processing dependencies.
- `npm run dev`: start the local Astro development server.
- `npm run build`: run the full production build: Astro, slides, and search index.
- `npm run build:astro`: build only the Astro site into `../public`.
- `npm run build:slides`: build Slidev decks from `content/slides/`.
- `npm run build:search`: generate the Pagefind search index for built output.
- `npm run preview`: preview the production build locally.
- `npm test`: run the Vitest unit test suite (~500 ms).
- `npm run test:watch`: run Vitest in watch mode during development.
- `npm run test:e2e`: run Playwright end-to-end tests against the dev server (~10 s).
- `npm run test:e2e:ui`: open Playwright UI for interactive debugging.

## Coding Style & Naming Conventions

Use TypeScript for browser scripts and shared helpers. Follow the existing style: two-space indentation in Astro/CSS/JSON, semicolons, single quotes in JavaScript/TypeScript, and kebab-case filenames for routed content slugs. Astro components use PascalCase filenames, for example `SiteHeader.astro`.

Keep content paths URL-friendly and lowercase where possible. Prefer shared helpers in `site/src/lib/` over duplicating path, formatting, or entry-loading logic in page components.

## Testing Guidelines

Run `npm test` from `site/` to execute the Vitest unit test suite (93 tests). Tests are colocated in `__tests__/` subdirectories next to the code they cover:

- `src/lib/__tests__/format.test.ts` — `fmtDate` and `relTime`
- `src/lib/__tests__/entries.test.ts` — entry utility functions and `loadNoteEntries` (mocks `astro:content`)
- `src/lib/__tests__/guides.test.ts` — guide parsing and slug utilities
- `src/lib/__tests__/remark-strip-h1.test.ts` — the remark plugin that strips leading H1 headings
- `src/scripts/__tests__/list-controller.test.ts` — filter/sort/tag DOM controller (uses `happy-dom`)
- `scripts/__tests__/parse-deck.test.mjs` — Slidev deck frontmatter parser

When adding new utilities to `src/lib/`, add a matching `__tests__/` file. Files that import `astro:content` must be tested with `vi.mock('astro:content', ...)` at the top. DOM tests need `// @vitest-environment happy-dom`. The `requestAnimationFrame` stub in DOM tests uses a queue (not synchronous fire) — see the list-controller tests for the pattern.

E2E tests live in `site/e2e/` and run with `npm run test:e2e`. The Playwright config (`playwright.config.ts`) auto-starts the Astro dev server. Tests cover: home page rendering, type filters, tag filters, sort toggle, theme persistence, note/guide navigation, breadcrumb links, and chapter navigation. Selectors follow the real component classes (`.crumbs` for breadcrumbs, `.guide-nav-link.next` for guide next-chapter). On Arch Linux, `nspr`, `nss`, `atk`, `at-spi2-core`, `libx11`, `libxrandr`, `mesa`, `libxcb`, `libxkbcommon`, and `alsa-lib` must be installed for Playwright's headless Chromium to run.

Use `npm run build` as the final validation step before submitting changes. For UI changes, also verify with `npm run dev` or `npm run preview`.

## Commit & Pull Request Guidelines

Recent history uses Conventional Commit prefixes such as `fix:`, `feat:`, `build:`, and `refactor:`. Keep commit subjects imperative and scoped to one change, for example `fix: correct guide navigation links`.

Pull requests should include a short summary, validation command, and screenshots for visible UI changes. Link related issues when available and call out generated `public/` changes separately.

## Security & Configuration Tips

The Astro base path is controlled by `SITE_BASE`; set it when building for a non-root deployment. Do not commit secrets or local environment files. Avoid editing generated files in `public/` unless the change is intentionally updating committed build artifacts.
