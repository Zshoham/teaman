---
title: Teaman — Knowledge as a Website
theme: default
---

# Teaman

Your Obsidian vault, published automatically as a static site.

---

# The Problem

Writing things down is only useful if you can find them later —
and share them when it matters.

A vault sitting on your laptop is a black box.

---

# Three Types of Content

| Type | Tool | Best For |
|---|---|---|
| **Notes** | Astro | Ideas, research, references |
| **Slides** | Slidev | Talks, demos, explanations |
| **Guides** | mdBook | Step-by-step documentation |

One repo. One commit. One site.

---

# How It Works

```
content/
├── notes/    ← Obsidian markdown
├── slides/   ← Slidev decks
└── guides/   ← mdBook books
```

Push to `main` → GitLab CI builds everything in parallel → site is live.

---

# The Build Pipeline

```
build:notes  ─┐
build:slides ─┼─► build:search ─► pages
build:guides ─┘
```

- Notes rendered by **Astro** — wikilinks and callouts supported
- Slides built as standalone SPAs by **Slidev**
- Guides compiled by **mdBook**
- **Pagefind** indexes everything for unified search

---

# Authoring

Write in Obsidian as you normally would.

- `[[wikilinks]]` just work
- `> [!NOTE]` callouts just work
- Prefix a slide deck with `_` to keep it as a draft
- Set `draft: true` in a note's frontmatter to hide it

No extra tooling. No friction.

---

# What's Next

- Custom Slidev theme matching the site design
- Incremental CI builds (only rebuild what changed)
- Hybrid mdBook rendering inside Astro
- Quartz as a notes preprocessor for richer graph features

---

# Get Started

```bash
# Open content/ as your Obsidian vault root

# Install site dependencies
cd site && npm install

# Build notes locally
npm run build

# Build slides
npm run build:slides
```

Commit. Push. Done.
