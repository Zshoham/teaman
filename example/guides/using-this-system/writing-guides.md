# Writing Guides

A guide is a folder under `content/guides/` containing a `SUMMARY.md` and one Markdown file per chapter.

## Creating a new guide

```
content/guides/my-guide/
├── SUMMARY.md
├── introduction.md
└── chapter-two.md
```

`SUMMARY.md` defines the guide title (the `# H1`) and the chapter order:

```markdown
# My Guide

- [Introduction](./introduction.md)
- [Chapter Two](./chapter-two.md)
```

Each chapter is plain Markdown with the same Obsidian features as notes (callouts, code fences). The first chapter listed in `SUMMARY.md` becomes the guide's landing page.

## Published URL

- Guide root: `$SITE_BASE/guides/<directory-name>/` — renders the first chapter
- Other chapters: `$SITE_BASE/guides/<directory-name>/<chapter-name>/`

The directory name and chapter filenames are used as URL slugs, so use kebab-case.

## Building locally

```bash
cd site
npm run dev
```

Guides build with the rest of the site — there is no separate guide tool.
