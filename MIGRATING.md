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
