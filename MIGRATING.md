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

### 1.0.0

Initial release. No migration.
