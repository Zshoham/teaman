# teaman

A static site generator for Obsidian vaults. `teaman` is an installable Astro
**engine**; your vault stays pure data — content plus a `teaman.config.js` — and
you build it with one command:

```sh
npx teaman build ~/vaults/my-notes      # → ~/vaults/my-notes/dist
npx teaman dev   ~/vaults/my-notes      # live preview
```

The vault never contains engine source, only:

```
my-vault/
  teaman.config.js     # site identity + theme (see below)
  notes/    *.md        # evergreen notes (wiki-links, callouts, mermaid, plantuml)
  guides/   <slug>/SUMMARY.md + chapters
  slides/   *.md        # Slidev decks
  dailies/  YYYY-MM-DD.md
  public/   …           # optional static passthrough (logo, images)
```

Run `npx teaman init my-vault` to scaffold the config and content dirs.

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
except `brand` and `hero.title`; omitted fields fall back to engine defaults.

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
  theme: {                      // CSS-var overrides (the entire styling surface)
    '--primary': 'oklch(0.67 0.14 48)',
    '--radius': '0.5rem',
  },
};
```

### Theming

`theme` is the **only** per-vault styling surface — a map of CSS custom
properties layered onto `:root`. There are no per-vault component or CSS files,
which is what lets engine upgrades land without a merge. Token names mirror
`:root` in `site/src/styles/global.css` (e.g. `--primary`, `--background`,
`--foreground`, `--border`, `--radius`, `--accent`). Unknown tokens are simply
unused; `teaman doctor` flags them.

## Versioning & upgrades

Because the vault is pure data, upgrading the engine is changing **one number**.

- **Pin via `engine`.** Put a semver range (`'^1.0'`, `'~1.0.2'`) in your config.
  Every `teaman` run compares it to the running engine and **warns on mismatch**.
  With the npx model there's no lockfile, so pin tightly for byte-stable rebuilds
  (e.g. CI: `npx teaman@1.0.2 build`). Built pages carry
  `<meta name="generator" content="teaman X.Y.Z">` for after-the-fact debugging.
- **Semver contract** — *patch*: fixes/dep bumps, always safe. *minor*: new
  optional config keys, content types, theme tokens — old configs keep working.
  *major*: a config key removed/renamed, frontmatter schema tightened, or URL
  structure changed — see [MIGRATING.md](./MIGRATING.md).
- **`teaman doctor`** after any bump validates your config against the engine's
  schema and lints content, so you get a warn-then-fix path instead of a broken
  build.

## Developing the engine

This repo is the engine plus a bundled example vault in `content/`. Work from
`site/`:

```sh
cd site
npm install
npm run dev      # serves the bundled content/ vault (no CLI needed)
npm run build    # writes ../public
npm test         # vitest unit suite
```

The engine reads the vault, output, base, config, and static dir from
`TEAMAN_VAULT` / `TEAMAN_OUT` / `TEAMAN_BASE` / `TEAMAN_CONFIG` / `TEAMAN_PUBLIC`;
when unset it falls back to the bundled `content/` → `public/`, which is why the
plain `npm` scripts and tests work in place.

### Building & previewing the current vault

The `npm run dev` above serves `content/` straight through Astro, which is the
fastest inner loop. To exercise the **full CLI path** — config serialization,
Slidev, Pagefind, the `engine` version check — against the bundled vault before
publishing or cutting a release, drive the local `bin` directly:

The bundled vault lives at the repo root (`content/`), so from inside `site/`
you reference it as `../content`. Pass the wrong path and the CLI warns
`no content dirs found` but still builds — you get the home page with **zero
notes**, which is the usual cause of an empty preview.

```sh
cd site
npm install
node bin/teaman.mjs build ../content      # → content/dist (Astro + Slidev + Pagefind)
node bin/teaman.mjs preview ../content     # serve content/dist as it'll ship
```

`node bin/teaman.mjs dev ../content` is the CLI equivalent of `npm run dev`, and
`node bin/teaman.mjs doctor ../content` validates `content/teaman.config.js` and
lints the notes without building. Add `--out <dir>`, `--base /sub-path/`, or
`--port <n>` to mirror a specific deploy target. `content/dist` is throwaway —
delete it between runs if you want a clean build.

To test the CLI exactly as a consumer would get it (from the packaged tarball
rather than the working tree), pack and run it against any vault:

```sh
cd site && npm pack                          # → teaman-<version>.tgz
npx ./teaman-1.0.0.tgz build ../content      # same as a published `npx teaman`
```
