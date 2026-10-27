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

- **One title rule everywhere** (patch). A page's title is its frontmatter
  `title`, else the `#` heading that opens it, else its file name with `-`/`_`
  as spaces — on the site, in the feed, in the reference PDF, and in
  Confluence — and that opening heading is dropped from the body everywhere.
  Before, a note without `title` was titled by its slug on the site (while
  Confluence used its heading); a guide took the *last* `#` heading of its
  `SUMMARY.md`, and now takes its frontmatter `title` or the opening one; a
  reference without `title` took the first `#` heading anywhere; and
  Confluence kept an opening heading that differed from the title. To keep a
  title that differs from the heading, set `title` in frontmatter.

- **Wiki-links in a reference book resolve from their chapter** (patch). On
  the site, `[[name]]` and `![[image.png]]` in a book chapter were resolved as
  if written in the book's `SUMMARY.md`, so Obsidian's same-folder preference
  and `[[#Heading]]` could pick a different target than the PDF and `doctor`
  did. They now resolve from the chapter's own file everywhere.

- **A guide's `SUMMARY.md` frontmatter is checked by `doctor` as a build
  problem** (patch, no vault changes). The build still fails on frontmatter
  its schema rejects; the message now names the file under `guides:` the way
  `doctor` reports it. A deck embed with no file now fails `build-slides` with
  the same wording `doctor` uses.

- **Reference book chapters can be drafted** (patch). A chapter of a
  `references/<slug>/SUMMARY.md` book with `draft: true`, or under a `_` path
  in the book, is now left out of the page, the PDF, wiki-link targets, and
  Confluence sync, as a guide chapter already was. Before, it was published.

- **A guide chapter named `index.md` builds** (patch, no vault changes). A
  top-level `index.md` listed in a guide's `SUMMARY.md` used to fail the
  build with "Chapter not found".

- **Broken reference frontmatter is reported by file** (patch). Invalid YAML
  in a reference, a reference book's `SUMMARY.md`, or one of its chapters is
  now a `doctor` problem naming the file; `doctor` used to crash on it, and
  a dev reload could then miss it.

- **One image lookup for the site, the PDF, and Confluence** (patch). A
  Markdown image path resolves against the note's directory, then the vault
  root, then the public assets, everywhere. The PDF used to try
  `public/` before the vault root for `/x` paths, and Confluence sync
  resolved non-`.svg` images against the note's directory only, so an image
  the site found could be missing from the PDF or the Confluence page.
  Comma-separated `tags: a, b` now reach the PDF too.

- **Confluence dry-run output is reworded** (patch). The plan now prints
  one `[dry-run] <operation>` line per change, in the same words `--apply`
  logs, and lists the attachments of an existing page with the page id.

- **Dot-prefixed files and folders are ignored everywhere** (patch). Notes,
  guides, dailies, and ADRs under a `.`-prefixed path (`notes/.archive/`)
  were never on the site; references and decks there were still built, and
  Confluence sync uploaded such notes. Now nothing reads them: move a
  reference or deck out of a dot folder to keep publishing it.

- **`/daily/` redirects instantly** (patch, no vault changes). The built
  `/daily/` page used to wait 2 seconds before moving on to the latest week;
  it now redirects immediately.

- **Engine files no longer ship in built sites** (patch, no vault changes).
  Builds used to include `slidev-theme-teaman/`, `typst-packages/`, and
  `reference-template.typ` at the site root; only the default `teacup.svg`
  logo is published now. Nothing linked to those files.

- **Confluence sync publishes what the site publishes** (patch, no vault
  changes). `teaman sync-confluence` no longer uploads drafts, `_`-prefixed
  files, guide/reference `SUMMARY.md` indexes, or guide chapters no SUMMARY
  lists, and ignores `--roots` entries for folders that are not content
  types. Pages it created for such files before are left in place in
  Confluence; delete them by hand.

- **`doctor` checks guide chapters** (patch). A guide whose `SUMMARY.md`
  lists a missing chapter, or one outside its directory, is now a `doctor`
  problem; the build already failed on it, and now says which `SUMMARY.md`
  and chapter instead of `Chapter not found`. Drafted guides are not
  checked, as the build does not build them.

- **Mermaid rendering uses Pele** (no vault changes). Existing Mermaid fences
  in site pages and reference PDFs use Pele's layout and appearance. Site
  diagrams follow the theme through CSS without re-rendering. Slidev decks
  retain Slidev's built-in Mermaid renderer. Cached PDF diagrams regenerate
  automatically.

- **Interactive HTML embeds** (minor, no vault changes). `![[viz.html]]`
  embeds a self-contained HTML page from anywhere in the vault as a sandboxed
  frame, in notes, guides, references, and slides. Built sites gain an
  `embeds/` folder holding the embedded files; `teaman doctor` and the build
  now fail on a missing HTML embed (previously any `.html` embed was reported
  as an unsupported note embed).

- **Compiled diagrams follow the theme** (patch, no vault changes). TikZ and
  Typst SVGs now embed dark-mode colors for explicit fills and strokes as well
  as inherited default ink. D2 embeds both native palettes. The site toggle
  takes precedence over system preference; standalone SVGs follow the system,
  and print/PDF output keeps light colors. Existing diagram caches regenerate
  automatically.

- **D2 diagram fences** (no vault changes). `d2` fences compile to SVG with
  the bundled WASM engine and open-source TALA layout by default. Set
  `vars: { d2-config: { layout-engine: elk } }` or `dagre` inside a fence to
  choose another layout. Renders are cached and reused by the site, reference
  PDFs, and Confluence sync; D2 uses its native light and dark palettes.

- **teaman runs on Bun, not Node** (no vault changes; a new runtime for anyone
  running the npm package). Install [Bun](https://bun.sh) ≥ 1.4 and swap `npx`
  for `bunx`: `bunx @zshoham/teaman build`. Under node the CLI now stops with a
  message saying so. If you'd rather install nothing, use the single-file
  binary below.
- **The Docker image is retired; use the single-file binary** (no vault
  changes). `ghcr.io/zshoham/teaman` gets no new tags (this change does not delete
  the existing ones). Each GitHub release now ships one executable per platform with the
  runtime and the whole toolchain inside, which covers what the image was for
  (building on a machine with no Node or npm) without Docker:

  ```sh
  docker run --rm -v "$PWD:/vault" -u "$(id -u):$(id -g)" teaman teaman build   # before
  ./teaman-linux-x64 build                                                       # now
  ```

  In CI, download the release binary for the runner instead of pulling the image.
  Still need a container? Any glibc base image plus the Linux binary works.

- **One URL rule, and Obsidian wiki-links** (minor). Every entry's URL now
  comes from one rule: its path, slugged per segment. References and decks
  whose file or folder name is not already a slug move (`references/My Ref.md`:
  `/references/My Ref/` → `/references/my-ref/`); a deck like that used to 404
  from its card. `[[links]]` now resolve Obsidian-style to any rendered page,
  not just top-level notes, and a missing link renders as text instead of a
  dead href. Links that worked before still resolve; run `teaman doctor` to see
  any that only match by the old slug rule or are ambiguous.
- **One publish rule** (minor, with one behaviour change). `draft: true` now
  works on guides (on `SUMMARY.md` or a chapter) and decisions too, and an
  `_`-prefixed file or folder is unpublished for **every** type — before, only
  references and decks honoured it, so a note under `notes/_templates/` was
  published. Rename such a folder if you meant to publish it. `tags: a, b`
  now works everywhere, and `doctor` checks frontmatter with the build's own
  schemas, so its wording changed; ADR lineage may name a file
  (`supersedes: adr-0002`).
- **Obsidian embeds** (minor). `![[image.png]]` now renders as an image on the
  site (it used to show as literal text), found by name anywhere in the vault.
  `![[Some Note]]` is now an error in `doctor` and the build — notes cannot be
  embedded; replace it with `[[Some Note]]`.

- **The Docker image is a plain teaman machine** (minor for vaults; a changed
  invocation for anyone scripting the image). The image no longer has a custom
  entrypoint that only accepted `build`. `teaman` is on `PATH` with `/vault` as
  the working directory, and the command is whatever follows the image name, so
  prepend `teaman` to what you ran before:

  ```sh
  docker run --rm -v "$PWD:/vault" teaman build          # before
  docker run --rm -v "$PWD:/vault" teaman teaman build   # now
  ```

  In exchange every command works in the container — `doctor`, `init`,
  `sync-confluence`, `dev`/`preview` (with `--host`) — and a bare
  `docker run -it` gives you a shell. Vault content, config, and output are
  unchanged.

- **`--host [addr]` for `dev` and `preview`** (minor, additive). Serves on
  every interface (bare `--host`) or one address, which is what makes the
  server reachable from outside a container or VM. Omitted, both keep binding
  loopback exactly as before. `--port` now applies to `preview` as well as
  `dev`.

  Its value being optional makes `teaman dev --host <token>` ambiguous, so the
  token is read as an address only when it looks like one (an IP, a dotted
  name, `localhost`) and isn't a directory that exists; otherwise it stays the
  vault path. A single-label hostname is therefore written `--host=vault` —
  flags now also accept that attached `--key=value` form generally.

- **Long-form references** (minor, additive). Markdown files under the new
  `references/` content root render at `/references/<slug>/` with a dedicated
  reading surface: sticky heading navigation, active-section + reading-progress
  tracking, document-local phrase search that reports matching sections, and a
  downloadable `reference.pdf`. The PDF is produced offline during `build` by
  the engine's bundled Typst template and compiler; vaults need no Typst install
  or engine source. Obsidian callouts, local SVG images, and Mermaid, PlantUML,
  TikZ, and Typst diagram fences are preserved in the PDF. Reference frontmatter
  accepts the regular optional note fields (`title`, `date`, `tags`, `draft`)
  plus optional `summary`. Existing vaults are unaffected; `teaman init` now
  scaffolds an empty `references/`
  directory and the header only exposes it when a publishable reference exists.
  A reference may also be an mdBook-style directory:
  `references/<slug>/SUMMARY.md` plus linked chapter files. `SUMMARY.md` owns
  the reference frontmatter and its links define chapter order/nesting; the
  engine assembles those chapters into the same single reader URL and one large
  `reference.pdf`. Existing standalone `.md` references and their URLs are
  unchanged.

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
  (`logo`, `primary`, `secondary`, `footer`). The `logo` sits in the bottom-right
  corner without a footer band; `footer: false` hides it. Existing decks need no
  change — any per-deck `theme:` is superseded by the engine theme. No migration.

### 1.0.0

Initial release. No migration.
