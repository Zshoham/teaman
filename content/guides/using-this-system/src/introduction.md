# Introduction

This system turns an Obsidian vault into a static website, published automatically on every commit to GitLab.

The vault has three content types, each with its own folder and build tool:

| Type | Folder | Tool |
|---|---|---|
| Notes | `content/notes/` | Astro + remark/rehype |
| Slides | `content/slides/` | Slidev |
| Guides | `content/guides/` | mdBook |

Everything is assembled into a single site at `$CI_PROJECT_NAME.gitlab.io/$CI_PROJECT_NAME/`.

## Local authoring

Open `content/` as your Obsidian vault root. Standard Obsidian features (wikilinks, callouts, tags) are supported.

For slides, use any Slidev-compatible editor. For guides, any Markdown editor works since mdBook uses standard CommonMark.
