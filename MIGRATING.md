# Migrating between `teaman` engine versions

The vault is pure data, so most upgrades need no action. Run
`teaman doctor <vault>` after bumping the engine to validate your config and
content against the new schema before you build.

## Semver contract

- **patch** (`1.0.0` → `1.0.1`) — bug fixes, styling tweaks, dependency bumps.
  Always safe; no config or content changes.
- **minor** (`1.0` → `1.1`) — additive only: new optional config keys, new
  content types, new theme tokens, new components. Existing configs keep working
  (missing fields fall back to engine defaults).
- **major** (`1.x` → `2.0`) — a breaking change for vaults. Possible causes: a
  config key removed or renamed, the content frontmatter schema tightened, the
  URL/slug structure changed, or a content type dropped. Each major gets a
  section below with the exact steps.

After upgrading, bump the `engine` range in your `teaman.config.js` so the
mismatch warning stays quiet and records what the vault now targets.

## Versions

### Unreleased

- **Smart links for Jira / Confluence / GitLab** (minor, additive). Links to
  those three services in note prose now render as a chip: a tinted stub
  carrying the ref parsed out of the URL (`PLAT-412`, `ENG`, `!284`, `#77`,
  `@a1b2c3d`, a file path), a divider, then the link's own text. Everything is
  derived from the href — no API calls, nothing fetched at build time. Nothing
  to do on upgrade: existing markdown links are unchanged, and any URL that
  isn't a recognised service still renders as ordinary prose.

  Two additive surfaces come with it. `config.smartLinks` (optional) adds
  self-hosted hosts — `{ gitlab: ['gitlab.acme.io'] }` — and **extends** the
  built-in `*.atlassian.net` / `gitlab.com` defaults rather than replacing
  them. Three new theme tokens, `--sv-jira`, `--sv-confluence` and
  `--sv-gitlab`, are overridable via `config.theme` like any other token; a
  vault that wants the chips monochrome can point all three at `--faint`.

- **Per-collection index pages + section nav** (minor, additive). Notes,
  guides, and slides now have their own index pages at `/notes/`, `/guides/`,
  and `/slides/`, listed in the header alongside `daily` and `decisions`. Each
  index is the home list scoped to one collection (same cards, tag filter,
  sort, and pagination); `/` is unchanged and still shows every entry. No
  existing URL moved. The header only links sections the vault has content
  for, so an empty collection never leaves a dead link; below the `md`
  breakpoint the three content sections collapse into one `browse` menu.
  On an index page the tag filter opens ready to pick from instead of sitting
  behind an add-filter menu. Breadcrumbs on notes and guide chapters now point
  at their section index rather than the home feed (the header brand still
  links home).

- **Guides can carry tags** (minor, additive). `SUMMARY.md` frontmatter accepts
  `tags` (a list, or a comma-separated string), which tag the guide as a whole
  wherever it appears — home feed, `/guides/`, and the tag filters. Guides
  without the key keep working and stay untagged.

- **TikZ + Typst fences render to SVG at build time** (minor, additive).
  ` ```tikz ` and ` ```typst ` code fences now compile to inline, theme-aware
  SVG during the build (WASM TeX via `node-tikzjax`, native Typst via
  `typst.ts` — no system LaTeX/Typst needed). Black ink is rewritten to
  `currentColor` so diagrams follow the light/dark toggle; renders are cached
  by content hash in the engine's `.diagram-cache/`. A fence that fails to
  compile renders a visible notice, not a build failure. Existing vaults are
  unaffected unless they already had fences with these languages (previously
  rendered as plain highlighted code).

- **Local SVG images are inlined and theme-aware** (minor). A markdown image
  whose URL is a local `.svg` is now inlined into the page at build time
  instead of rendering as `<img>`, so `currentColor` and `var(--…)` theme
  tokens inside the file follow the site's light/dark toggle. A standalone
  image renders as a figure with the alt text as a visible caption (and hover
  tooltip). Files resolve
  from the note's directory, the vault root, or `public/`; remote URLs and
  other formats are untouched. No migration needed — existing svg references
  keep rendering, just theme-reactive; if an svg must stay an `<img>` (e.g. it
  relies on its own internal styling being isolated), embed it with an HTML
  `<img>` tag instead of markdown image syntax.

- **Quick-links bento grid** (minor, additive). A new optional `links` config
  array renders a bento grid of quick-link tiles above the home feed — each
  tile is `{ label, url, description?, icon? }`. `icon` maps to a curated
  lucide-style set (`github`, `book`, `globe`, `link`, `file`, `code`,
  `rocket`, `lightbulb`, `rss`, `mail`, `coffee`, `arrow-up-right`) or renders
  verbatim (emoji work). Tile sizes are **not** configurable — the engine
  computes the layout from each tile's content and the total link count
  (`src/lib/bento.ts`): richer tiles (longer description/label) get more
  columns, and the grid always fills exactly — every row sums to the grid
  width, so there are no empty cells. Absent or empty → no grid.
  `doctor` validates the shape. No migration — existing vaults are unaffected.

- **Home page hero removed** (minor). The landing page no longer renders a hero
  block — the feed starts directly at the filter bar, whose pills already carry
  per-type counts (and the footer already shows the last-edit date, the topics
  sidebar the tag counts). The `hero` config block (`eyebrow` / `title` /
  `description`) is now unused but stays validated by `doctor` for backwards
  compatibility; it is slated for removal in a future major. No migration —
  vaults with a `hero` block keep working, new vaults may omit it.

- **Decisions collection** (minor, additive). A new `decisions/` content type
  (`adr-NNNN.md`, frontmatter `title` / `date` / `status` / optional `tags` /
  `summary` / `supersedes` / `supersededBy`) renders a filterable Architecture
  Decision Record timeline at `/decisions/`, linked from the header nav and the
  home feed. Vaults without a `decisions/` dir are unaffected. No migration.

- **Slides theme** (minor, additive). Decks are now built with the bundled
  `slidev-theme-teaman` and gain an optional `slides` config block
  (`logo`, `primary`, `secondary`, `footer`). The `logo` rides a footer strip
  painted in `secondary` (one fixed backdrop across light/dark); `footer: false`
  hides it. Existing decks need no change — any per-deck `theme:` is superseded
  by the engine theme. No migration.

### 1.0.0

Initial release. No migration.
