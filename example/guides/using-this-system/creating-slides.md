# Creating Slides

Create a `.md` file under `content/slides/`. Each file is one Slidev presentation.

## Minimal deck

```markdown
---
title: My Presentation
theme: default
---

# Slide One

Content here.

---

# Slide Two

More content.
```

## Drafts

Prefix the filename with `_` to exclude a deck from the build:

```
content/slides/_wip-talk.md   ← not published
content/slides/my-talk.md     ← published at /slides/my-talk/
```

## Theme

All decks share a single Slidev theme defined in `site/`. Do not set a conflicting `theme:` in individual deck frontmatter.

## Viewing locally

```bash
cd site
npx slidev content/slides/my-talk.md
```
