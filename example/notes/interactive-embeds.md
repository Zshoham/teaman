---
title: Interactive HTML, Embedded
tags: [tools, craft, meta]
date: 2026-05-10
---

# Interactive HTML, Embedded

Some ideas only land when you can poke them. A diagram shows that Neptune is
far away; a model you can speed up shows that Neptune is *slow* — one lap of
the Sun takes 165 of ours. That second thing needs code, and the code needs a
place to live that isn't the note itself.

So a visualization is just another attachment: one self-contained `.html`
file, kept anywhere in the vault and embedded the way Obsidian embeds an
image.

```markdown
![[solar-system.html]]
```

![[solar-system.html]]

Tap a planet to meet it, switch to **Sizes** for the true-to-scale line-up, or
change the speed. The same file is embedded in the
[[embedding-html|guide chapter on embeds]] and near the end of the
[[intro|teaman deck]].

## Explain, don't play

Not every embed needs to be poked. This one plays itself: a seven-step,
looping walkthrough of how BGP moves routes between networks, with the
moving parts carrying the story and a caption beside them saying what just
happened. Same mechanism, same one file — `![[bgp.html|680]]`.

![[bgp.html|680]]

The two sit at opposite ends of a trade-off. The solar system rewards
curiosity but explains only what a reader thinks to try; the BGP walkthrough
says everything it means to say, in order, to someone who just watches.

## Why a frame

The embed runs in a sandboxed `<iframe>`, not in the page. Its CSS cannot
restyle the site, the site's CSS cannot reach into it, and its script — allowed
to run, but with no same-origin access — cannot read the page, its storage, or
its cookies. That isolation is what makes "drop any HTML in" safe, and it is
why the identical file works in a Slidev deck, where the slide's Markdown is
compiled to Vue and inline `<script>` would not survive.

The cost is that the frame does not know the page around it. Two small
messages close that gap, and an embed may ignore both: the page tells it the
light/dark theme (watch the sky change when you flip the toggle), and it may
report its content height so the frame fits it.

## Knobs

- `![[solar-system.html|560]]` fixes the frame's height in pixels.
- `![[solar-system.html|Our solar system]]` titles it; standing alone, the
  title is also the caption.
- `![[solar-system.html#view=sizes]]` hands the embed a fragment to read —
  this one opens on the size line-up, and `#planet=mars` opens Mars's card.
