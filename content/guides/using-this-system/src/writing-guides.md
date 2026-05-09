# Writing Guides

A guide is an mdBook book — a directory under `content/guides/` that contains a `book.toml` and a `src/` folder.

## Creating a new guide

```
content/guides/my-guide/
├── book.toml
└── src/
    ├── SUMMARY.md
    └── chapter-one.md
```

Minimal `book.toml`:

```toml
[book]
title = "My Guide"
src = "src"

[output.html]
site-url = "/guides/my-guide/"
```

`SUMMARY.md` defines the table of contents:

```markdown
# Summary

- [Chapter One](./chapter-one.md)
```

## Published URL

The guide is published at `$SITE_BASE/guides/<directory-name>/`. The directory name is used as-is, so use kebab-case.

## Building locally

Install mdBook, then:

```bash
mdbook serve content/guides/my-guide/
```
