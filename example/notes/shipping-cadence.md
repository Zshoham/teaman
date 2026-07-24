---
title: Shipping Cadence
tags: [writing, process, teams, craft]
date: 2026-05-06
---

# Shipping Cadence

The cadence is the product. A team that ships every week is a different organism
from one that ships every quarter, even building the same thing.

## The loop

A cadence is just a loop you refuse to break. Drawn out, the one I keep coming
back to:

```mermaid
flowchart LR
  draft([draft]) --> review{review}
  review -->|cut| draft
  review -->|ship| release([release])
  release --> watch[watch it land]
  watch --> draft
```

The arrow that matters is `review --|cut|--> draft`. Most teams only have the
ship arrow, so review becomes a rubber stamp and the loop loses its teeth.

> [!tip] Protect the cut arrow
> A review that can only approve is not a review. If nothing has been cut in a
> month, the loop has quietly straightened out into a conveyor belt.

## Why weekly

- A week is short enough that nobody can hide a stuck thing for long.
- It is long enough to contain a real edit pass — see [[soft-deadlines]] for
  what happens when the edit pass keeps slipping.
- It maps to how people actually plan their attention. Months are fiction.

> [!example]- One concrete week
> Mon: draft lands. Tue–Wed: it sits, someone reads it cold. Thu: review, two
> things cut. Fri: ship, then watch it land over the weekend. Repeat. The dates
> are boring on purpose — that is the whole trick.

The bar for "done enough" is not *finished* — it is *the system is doing the
lifting, not the discipline*. Once you are relying on willpower to hit the
cadence, the cadence is already broken.

## Where the week is written down

Links to the tools the week actually runs on render as chips carrying the ref
parsed straight out of the URL — no plugin, no API call, just markdown links:

The cadence experiment was tracked in
[Trial a one-week loop](https://acme.atlassian.net/browse/PLAT-412) for a
quarter, written up in
<https://acme.atlassian.net/wiki/spaces/ENG/pages/884736/Shipping+Cadence+Retro>,
and the tooling that made the cut arrow visible shipped as
[Surface cut items on the board](https://gitlab.com/platform/api/-/merge_requests/284).
Leftovers live in
<https://gitlab.com/platform/api/-/issues/77>, the commit that started it is
<https://gitlab.com/platform/api/-/commit/a1b2c3d4e5f6>, and the schedule itself
is a single file:
[the cadence config](https://gitlab.com/platform/api/-/blob/main/src/cadence.ts).
