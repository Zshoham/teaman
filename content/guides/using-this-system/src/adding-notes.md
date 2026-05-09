# Adding Notes

Create any `.md` file under `content/notes/`. Subdirectories are supported.

## Frontmatter

Notes support the following optional frontmatter fields:

```yaml
---
title: My Note Title
tags: [tag1, tag2]
date: 2026-01-01
draft: true
---
```

- `draft: true` — note is excluded from the published site
- `title` — used as the page heading; defaults to the file name if omitted

## Obsidian features

The following Obsidian syntax is rendered correctly:

- `[[wikilinks]]` and `[[wikilinks|aliases]]`
- Callouts: `> [!NOTE]`, `> [!WARNING]`, `> [!TIP]`, etc.
- Standard tags: `#tag`

Dataview queries are **not** rendered — avoid them or use plain markdown equivalents.
