# Embedding Interactive HTML

Charts you can filter, simulations you can run, explainers you can click
through: anything you can build as a web page can sit inside a note, a guide
chapter, a reference, or a slide.

![[solar-system.html#view=sizes|The planets, true to scale]]

Interactivity is optional. An embed can just as well play by itself — this
one walks through how BGP routes the internet, step by step, on a loop:

![[bgp.html#step=2]]

## 1. Build one self-contained file

Write the visualization as a single `.html` file with its CSS and JavaScript
inline. It is served on its own, so anything it fetches by relative path will
not come along — inline images as SVG or data URIs, and bundle libraries into
the file rather than loading them from a CDN.

## 2. Put it anywhere in the vault

Keep it next to the note that uses it or in a shared `attachments/` folder.
It is found the way Obsidian finds images: by file name, same folder first.

## 3. Embed it

```markdown
![[solar-system.html]]
```

After the pipe, a number fixes the height (`|560`); anything else is the
title, shown as a caption when the embed stands on its own line. A `#fragment`
or `?query` after the file name is passed to the page — the embeds above open
on the solar system's size view (`#view=sizes`) and on the second step of the
BGP walkthrough (`#step=2`).

`teaman doctor` reports an embed whose file is missing, and the build fails on
one.

## 4. Optional: follow the site

The embed runs in a sandboxed frame. To match the light/dark toggle and to
size its frame to its content, it can speak two messages:

```js
// Tell the page you are listening; it answers with the current theme.
window.parent.postMessage({ type: 'teaman:ready' }, '*');

window.addEventListener('message', (event) => {
  if (event.data?.type === 'teaman:theme') {
    document.documentElement.dataset.theme = event.data.theme; // 'light' | 'dark'
  }
});

// Fit the frame to the content (ignored if the author fixed a height).
new ResizeObserver(() => {
  window.parent.postMessage({ type: 'teaman:resize', height: document.body.scrollHeight }, '*');
}).observe(document.body);
```

Report a height only if your layout does not fill the frame itself — a page
sized to `100vh` would chase its own tail.

## 5. In slides

Write the same embed on a slide. The frame keeps a fixed height there
(360 pixels unless you give one), since a slide is a fixed canvas:

```markdown
---

# Our Solar System

![[solar-system.html|400]]
```

Clicking into the embed gives it the keyboard; click the slide outside it to
use the arrow keys for slides again.
