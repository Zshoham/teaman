# Vendored Typst packages

`resources/reference-template.typ` uses two third-party Typst packages:

| Package | Version | Used for | License |
|---|---|---|---|
| [showybox](https://github.com/Pablo-Gonzalez-Calderon/showybox-package) | 2.0.4 | `teaman-callout` — the framed Obsidian callouts | MIT (`showybox/LICENSE`) |
| [codly](https://github.com/Dherse/codly) | 1.3.0 | fenced code blocks — line numbers, language chip | MIT (`codly/LICENSE`) |

They are **vendored rather than imported as `@preview/...`** because the reference
PDF build must stay offline and version-pinned: `@preview` imports send the
compiler to `packages.typst.org` on the first build of every machine, which would
make `teaman build` fail in an air-gapped or network-sandboxed environment while
every other build stage (Mermaid, PlantUML, TikZ, Typst fences) renders locally.

`src/lib/typst-packages.mjs` mounts this directory into the compiler workspace as
shadow files under `_teaman/`, so nothing is written into the vault and the
template imports them by workspace-absolute path.

Only the files the packages actually load at compile time are vendored — sources,
`codly/src/args.json`, and `codly/src/typst-small.png` (read by codly's
`typst-icon`). Docs, benchmarks, and `typst.toml` are omitted.

## Updating

1. Let a scratch compile fetch the new version, e.g.
   `#import "@preview/codly:<version>": *`. It lands in
   `~/.cache/typst/packages/preview/<name>/<version>/`.
2. Copy the compile-time files over the ones here, keeping the same layout
   (the packages use relative imports, so paths must not move).
3. Bump the version in this table and re-run
   `npx vitest run src/lib/__tests__/typst-packages.test.mjs` plus
   `node scripts/build-references.mjs`.
