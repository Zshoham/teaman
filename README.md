# teaman

A static site generator for Obsidian vaults. `teaman` is an installable Astro
**engine**; your vault stays pure data — content plus a `teaman.config.js` — and
you build it with one command:

```sh
npx @zshoham/teaman build ~/vaults/my-notes      # → ~/vaults/my-notes/dist
npx @zshoham/teaman dev   ~/vaults/my-notes      # live preview
```

Published to the public npm registry as **`@zshoham/teaman`** — no auth needed to
install. Tagged releases ship as `latest`; every `main` commit also publishes a
prerelease under the `dev` tag (`npx @zshoham/teaman@dev`).

The vault never contains engine source, only:

```
my-vault/
  teaman.config.js     # site identity + theme (see below)
  notes/    *.md        # evergreen notes (wiki-links, callouts, mermaid, plantuml)
  guides/   <slug>/SUMMARY.md + chapters
  slides/   *.md        # Slidev decks
  dailies/  YYYY-MM-DD.md
  decisions/ adr-NNNN.md # architecture decision records (timeline at /decisions/)
  public/   …           # optional static passthrough (logo, images)
```

Run `npx @zshoham/teaman init my-vault` to scaffold the config and content dirs.

Each `decisions/adr-NNNN.md` is one Architecture Decision Record: frontmatter
carries `title`, `date`, `status` (`accepted` | `proposed` | `superseded`), optional
`tags`, a one-line `summary`, and optional `supersedes` / `supersededBy` (the `NNNN`
of a related ADR); the body holds the prose (Context / Decision / Consequences). They
render as a filterable timeline at `/decisions/` and also appear in the home feed.

## Commands

| Command | What it does |
|---|---|
| `teaman build [vault]` | Build to `<vault>/dist` (or `--out DIR`). Runs Astro + Slidev + Pagefind. |
| `teaman dev [vault]` | Live Astro dev server. |
| `teaman preview [vault]` | Serve a previously built site. |
| `teaman init [vault]` | Scaffold `teaman.config.js` + content dirs. |
| `teaman doctor [vault]` | Validate config and lint content **without** building. Exits non-zero on problems — gate CI with it. |

Options: `--out <dir>`, `--base <path>` (e.g. `/my-site/` for sub-path hosting),
`--port <n>` (dev). `[vault]` defaults to the current directory.

## Config — `teaman.config.js`

Pure data, default-exported (the CLI serializes it). All fields are optional
except `brand`; omitted fields fall back to engine defaults. The `hero` block
is no longer rendered (the home page starts directly at the feed) but is kept
for backwards compatibility — new vaults can omit it.

```js
export default {
  engine: '^1.0',               // engine semver range this vault targets
  brand: 'my.vault',
  tagline: 'a working garden',
  logo: 'assets/logo.svg',      // relative to vault, then vault/public, then engine default
  hero: {
    eyebrow: 'an open notebook',
    title: 'Notes & slides<br/><em>from a working vault.</em>',  // inline HTML ok
    description: 'A thin public window onto an Obsidian vault.',
  },
  footerNote: 'made slowly',
  links: [                       // quick-link tiles, bento grid above the home feed
    { label: 'Obsidian', url: 'https://obsidian.md', description: 'The app this vault lives in.', icon: 'book' },
    { label: 'repo', url: 'https://github.com/me/vault', icon: 'github' },
  ],                             // `icon`: curated lucide set or any string (emoji ok).
                                 // tile sizes are auto-computed from content + count.
  theme: {                      // CSS-var overrides (the entire styling surface)
    '--primary': 'oklch(0.67 0.14 48)',
    '--radius': '0.5rem',
  },
  slides: {                     // project-wide Slidev styling (all optional)
    logo: 'assets/logo.svg',    // shown on the footer strip of every slide
    primary: 'oklch(0.62 0.15 48)',
    secondary: 'oklch(0.58 0.05 196)',
    footer: true,               // show the footer strip (default true)
  },
};
```

### Theming

`theme` is the **only** per-vault styling surface — a map of CSS custom
properties layered onto `:root`. There are no per-vault component or CSS files,
which is what lets engine upgrades land without a merge. Token names mirror
`:root` in `src/styles/global.css` (e.g. `--primary`, `--background`,
`--foreground`, `--border`, `--radius`, `--accent`). Unknown tokens are simply
unused; `teaman doctor` flags them.

### Slides

Every Slidev deck in `slides/` is built with the engine's bundled theme
(`slidev-theme-teaman`) — Source Serif 4 display, Inter body, JetBrains Mono
code, one warm accent, matching the site. You don't set a `theme:` in any deck;
the build applies it to all of them. The only knobs are project-wide, under
`slides`:

- `logo` — a mark shown on the footer strip of every slide (resolved like
  `logo`: vault `public/`, then the vault root). Omit for none.
- `primary` / `secondary` — accent colors (any CSS color). Defaults match the
  site's warm accent. `secondary` also paints the footer strip, giving the logo
  one fixed backdrop regardless of the light/dark slide theme.
- `footer` — show the footer strip carrying the logo (default `true`); set
  `false` to hide it (and its logo).

These flow into the theme at build time, so decks stay pure content.

## Versioning & upgrades

Because the vault is pure data, upgrading the engine is changing **one number**.

- **Pin via `engine`.** Put a semver range (`'^1.0'`, `'~1.0.2'`) in your config.
  Every `teaman` run compares it to the running engine and **warns on mismatch**.
  With the npx model there's no lockfile, so pin tightly for byte-stable rebuilds
  (e.g. CI: `npx @zshoham/teaman@1.0.2 build`). Built pages carry
  `<meta name="generator" content="teaman X.Y.Z">` for after-the-fact debugging.
- **Semver contract** — *patch*: fixes/dep bumps, always safe. *minor*: new
  optional config keys, content types, theme tokens — old configs keep working.
  *major*: a config key removed/renamed, frontmatter schema tightened, or URL
  structure changed — see [MIGRATING.md](./MIGRATING.md).
- **`teaman doctor`** after any bump validates your config against the engine's
  schema and lints content, so you get a warn-then-fix path instead of a broken
  build.

## Developing the engine

This repo *is* the engine: the Astro app, CLI, and build scripts live at the repo
root, plus a bundled example vault in `example/`. Work from the repo root:

```sh
npm install
npm run dev      # serves the bundled example/ vault (no CLI needed)
npm run build    # writes ./public
npm test         # vitest unit suite
```

The engine reads the vault, output, base, config, and static dir from
`TEAMAN_VAULT` / `TEAMAN_OUT` / `TEAMAN_BASE` / `TEAMAN_CONFIG` / `TEAMAN_PUBLIC`;
when unset it falls back to the bundled `example/` → `public/`, which is why the
plain `npm` scripts and tests work in place.

### Building & previewing the current vault

The `npm run dev` above serves `example/` straight through Astro, which is the
fastest inner loop. To exercise the **full CLI path** — config serialization,
Slidev, Pagefind, the `engine` version check — against the bundled vault before
publishing or cutting a release, drive the local `bin` directly:

The bundled vault lives at the repo root (`example/`). Pass the wrong path and the
CLI warns `no content dirs found` but still builds — you get the home page with
**zero notes**, which is the usual cause of an empty preview.

```sh
npm install
node bin/teaman.mjs build ./example      # → example/dist (Astro + Slidev + Pagefind)
node bin/teaman.mjs preview ./example     # serve example/dist as it'll ship
```

`node bin/teaman.mjs dev ./example` is the CLI equivalent of `npm run dev`, and
`node bin/teaman.mjs doctor ./example` validates `example/teaman.config.js` and
lints the notes without building. Add `--out <dir>`, `--base /sub-path/`, or
`--port <n>` to mirror a specific deploy target. `example/dist` is throwaway —
delete it between runs if you want a clean build.

To test the CLI exactly as a consumer would get it (from the packaged tarball
rather than the working tree), pack and run it against any vault:

```sh
npm pack                                     # → zshoham-teaman-<version>.tgz
npx ./zshoham-teaman-1.0.0.tgz build ./example   # same as a published `npx @zshoham/teaman`
```

`npm run test:integration` automates exactly this — pack, install the tarball into
a throwaway project outside the repo, build the `example/` vault, and assert the
output. It's the only check that catches packaging bugs (an incomplete `files`
list, a runtime dep stranded in `devDependencies`), so it runs as its own CI job.
