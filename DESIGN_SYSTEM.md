# teaman — Design System

A brief you can hand to Claude (or any designer) to produce **on-brand pages and
components**. It is the distilled, authoritative description of the look already
shipping in the engine. When generating, follow this document; when it conflicts with
a one-off request, prefer this document's *tokens and idioms* and adapt the request
to them.

> Source of truth in code: `src/styles/global.css` (tokens), `src/config.ts`
> (`config.theme` is the only per-vault override surface), and the components under
> `src/components/`. This file mirrors them — keep it in sync if those change.

---

## 1. Voice & principles

teaman is **a digital garden rendered as an editorial print object** — a quiet,
warm-paper publication, not an app dashboard. Five rules govern every decision:

1. **Warm paper, crisp text.** The page is a hair off pure white (`--background`),
   so a long serif read is easy on the eyes. Body text is near-black. Surfaces
   (cards, popovers) are *pure* white and lift off the page rather than being boxed
   by heavy borders.
2. **One accent, used sparingly.** A single warm terracotta/amber `--primary` is the
   *only* color with a job: links on hover, the active state, list markers, one rule
   under a title. Never introduce a second accent. `--secondary` (teal) exists in the
   palette but is deliberately unused — don't reach for it.
3. **Three type voices, never more.** Serif for reading, sans for structure/UI, mono
   for metadata. Each has one job (see §3). The mix *is* the brand.
4. **Hierarchy by size and space, not weight or boxes.** Source Serif 4 only loads to
   weight 600, so heavy weights render as faux-bold — forbidden. Let size, generous
   whitespace, and hairline rules (`--border`) carry structure. Prefer a top border on
   a row over a full card.
5. **Editorial restraint.** Hairline 0.5px borders, near-invisible shadows, tabular
   mono metadata in `UPPERCASE` with wide tracking. When unsure, do *less*: remove a
   border, drop a shadow, mute a color. Mobile is supported but desktop-first.

Everything themes via CSS custom properties and a `[data-theme='dark']` block. **Never
hardcode a color, font, or radius** — always reference a token so light/dark and
per-vault theming keep working.

---

## 2. Color tokens (OKLCH)

Reference by `var(--name)` or the Tailwind alias (`bg-background`, `text-faint`, …).
Every token has a dark-mode value; they swap automatically under `[data-theme='dark']`.

| Token | Light | Role |
|---|---|---|
| `--background` | warm off-white `oklch(.992 .004 95)` | page tone |
| `--foreground` | near-black `oklch(.21 .032 265)` | body text, titles |
| `--card` / `--popover` | pure white | lifted surfaces (dark: a low-elevation tier above bg) |
| `--primary` | terracotta `oklch(.56 .145 48)` | **the** accent: hover, active, markers, title rule |
| `--primary-foreground` | white | text on primary |
| `--muted` | `oklch(.967 .003 265)` | quiet fill: code bg, chips, footers |
| `--muted-foreground` | mid-grey | secondary copy, descriptions, excerpts |
| `--faint` | `oklch(.56 .015 265)` | quietest meta: timestamps, counts, tags, search glyph (AA-safe small text) |
| `--accent` | near-white grey | hover wash on neutral controls |
| `--border` / `--input` | `oklch(.928 .006 265)` | hairline rules, dividers, control edges |
| `--ring` | = primary | focus outline |
| `--destructive` | red | errors only |
| `--secondary` | teal | **reserved/unused** — do not consume |

**Meta-color ladder (most → least prominent):** `--foreground` → `--muted-foreground`
→ `--faint`. Pick the quietest rung the information can tolerate.

Dark mode: near-black violet base `oklch(.18 .004 308)`, `--foreground` lightens to
`oklch(.88 0 0)`, `--primary` brightens to amber `oklch(.72 .134 50)`. Cards/popovers
sit at `.215` lightness so they read as a real elevation tier; `--muted` at `.252` is
the tier above that.

Selection: `background: color-mix(in oklab, var(--primary) 22%, var(--background))`.

---

## 3. Typography

Three families, each with **one job**. Token aliases: `font-serif`, `font-sans`,
`font-mono`. `font-heading` = sans.

| Family | Stack | Job |
|---|---|---|
| **Serif** — Source Serif 4 | `'Source Serif 4', Georgia, serif` | All *reading* and *titles*: hero, page titles, entry titles, prose body, prose headings. Max weight **600** — never heavier. |
| **Sans** — Inter | `'Inter', system-ui, sans-serif` | UI & structure: buttons, badges, card titles, callout titles, nav, labels. |
| **Mono** — JetBrains Mono | `'JetBrains Mono', ui-monospace, monospace` | Metadata only: eyebrows, breadcrumbs, timestamps, counts, tags, brand mark, kbd hints. Usually `UPPERCASE` + `tracking-label`. |

### Type scale (named tokens, retunable per vault)

| Token / class | Size | Use |
|---|---|---|
| `text-display-lg` | 3.5rem / 56px | home hero title (serif) |
| `text-display` | 2.5rem / 40px | note / guide / daily page titles (serif) |
| entry title | ~28px (`md:text-[28px]`) | list-card titles (serif) |
| prose body | 1.125rem / 18px, line-height **1.7** | article reading column |
| `text-meta` | 0.6875rem / 11px | mono meta strips, eyebrows, breadcrumbs, tags |
| `text-meta-sm` | 0.625rem / 10px | secondary counts / quiet labels |
| `tracking-label` | 0.1em | uppercase mono eyebrow/label tracking |

**Title treatment:** serif, `font-normal` (400), `tracking-tight`, `leading-[1.05]`,
`text-balance`. Inside hero/title HTML, `<em>` renders *muted-italic*
(`italic text-muted-foreground`) for soft emphasis.

**Prose headings:** serif, weight 600, slight negative tracking (`-0.012em`),
`line-height 1.25`, `text-wrap: balance`. h2 1.5em, h3 1.2em, h4 1.05em — size, not
weight, carries hierarchy. Generous top margins bond a heading to the text it
introduces.

**The eyebrow idiom** (used above every major title):
```html
<p class="font-mono text-meta uppercase tracking-label text-faint">an open notebook · est. 2026</p>
```

**The meta strip idiom** (timestamps/counts/tags under a title or atop a card):
```html
<div class="flex items-baseline gap-3 font-mono text-meta text-faint">
  <span class="tabular-nums">Jun 20</span>
  <span class="text-primary">NOTE</span>          <!-- the type label gets the accent -->
  <span class="ml-auto tabular-nums">4 min</span> <!-- right-aligned trailing meta -->
</div>
```
Numerals in meta are always `tabular-nums`. Separators between meta items are a
`·` at `opacity-50`.

---

## 4. Spacing, radius, borders, elevation

- **Spacing base** `--spacing: 0.25rem` (Tailwind's 4px step). Sections breathe:
  hero `py-9`, list entries `py-7`, article header `mb-8 pb-6`.
- **Reading column** `--measure: 680px` — every article wrapper is
  `mx-auto max-w-[var(--measure)]`. Hero/list content can run wider (descriptions
  cap ~620–700px).
- **Radius** scales off `--radius: 0.75rem`: `radius-sm` ×0.6, `radius-md` ×0.8,
  `radius-lg` = base, up through `radius-4xl`. Cards use `rounded-xl`; pills/badges
  `rounded-full`; small controls `rounded-md`; chips `rounded-sm`.
- **Borders are hairlines.** `border-border` for dividers; prose code/pre use literal
  `0.5px`. Structure is built from **top borders on stacked rows**
  (`[&:not([hidden])~&]:border-t`) far more than from full enclosing cards.
- **Elevation is barely-there** in light (3–13% black: `shadow-xs`…`shadow-xl`). Cards
  prefer `ring-1 ring-foreground/10` over a shadow. Dark mode restores real shadows
  (55–62% black) for floating UI (popovers, menus) so they lift off the near-black base.
- **Focus** is always visible: `outline: 2px solid var(--ring); outline-offset: 2px`
  on bare `a/button/[role=button]/summary`; shadcn primitives use a `ring-3 ring-ring/50`.

---

## 5. Components & idioms

Built on shadcn-style primitives over **Base UI** (`@base-ui/react`), styled with
Tailwind v4 + `cva` variants. Existing primitives in `src/components/ui/`:
`button, badge, card, breadcrumb, popover, scroll-area, separator, toggle,
toggle-group, tooltip`. **Reuse these before inventing.**

### Button (`button.tsx`)
Variants: `default` (solid primary, hover `bg-primary/80`), `outline` (bordered,
hover `bg-muted`), `secondary`, `ghost` (hover `bg-muted`), `destructive`
(tinted `bg-destructive/10`, not solid), `link`. Sizes `xs/sm/default/lg` + icon
variants. `rounded-lg`, sans `font-medium`, `text-sm`, presses down 1px on `:active`.

### Badge (`badge.tsx`)
`rounded-full`, `h-5`, `text-xs`, sans. Same variant names as Button. `outline`
variant is the quiet default for tags-as-labels.

### Card (`card.tsx`)
`rounded-xl bg-card ring-1 ring-foreground/10` (ring, not border/shadow). Slots:
`CardHeader / CardTitle` (sans, `font-medium`, `text-base`) `/ CardDescription`
(`text-muted-foreground`) `/ CardContent / CardFooter` (footer = `bg-muted/50` with a
top border). `size="sm"` tightens padding.

### Entry row (list item) — the signature pattern (`home/EntryCard.tsx`)
Not a boxed card: a stacked `<article>` separated from siblings by a **top border**,
`py-7`. Order: mono meta strip (date · `TYPE` in primary · trailing meta) → serif
title (link, `no-underline hover:text-primary`) → muted serif excerpt (max ~700px) →
mono `#tag` buttons (`text-faint hover:text-primary`).

### Filter / sort bar (`home/FilterBar.tsx`)
Sticky under the header (`top-[var(--header-h)]`), bottom-bordered, `bg-background`.
Filter **pills** = `toggle` outline variant, `rounded-full`, with a mono count;
active/pressed pill **inverts**: `aria-pressed:bg-foreground aria-pressed:text-background`.
Sort control = a mono text button with a `border-b border-primary` underline and a
`↓/↑` arrow.

### Site header (`SiteHeader.astro`)
Sticky, `z-30`, bottom-bordered, `bg-background`. Left: logo (rendered as a CSS
**mask** of `bg-current` so a single-color SVG inherits text color & themes; falls
back to a `2.5×2.5` primary square) + mono brand name + faint `/ tagline`. Center:
mono section nav, active link carries `border-primary`. Right: a full-width search
trigger (mono `⌕` glyph + faint placeholder + a `kbd`-style `/` chip) and the theme
toggle. Header publishes its height to `--header-h` for sticky offsets below it.

### Article page (`pages/notes/[...slug].astro`)
`<article class="mx-auto max-w-[var(--measure)]">` → `Breadcrumbs` (mono) →
`<header class="border-b">` with serif `text-display` title + a mono meta strip
(word count · reading time · date · `#tags`) → `<div class="prose">` content.

### Prose (`.prose`)
The reading treatment: 18px serif, line-height 1.7, em-relative internals so one
font-size scales the block. Inline links = quiet low underline (35%-opacity rule)
that **warms to `--primary` on hover**. Inline `code` = mono on `--muted` with a
0.5px border, 4px radius, weight 400. Heading anchors fade in on hover in `--faint`.

### Callouts (Obsidian-style, `.callout`)
Left rule (3px) + 7% accent-tint background (14% in dark) + hairline border, 6px
radius. A per-type `--callout-accent` drives icon, title (sans 600), rule, and tint.
Type→hue map (OKLCH): note/info blue 250 · tip/summary teal 190 · success green 150 ·
question yellow 90 · warning orange 65 · example purple 300 · quote muted ·
danger/error/bug red 25.

### Theme toggle (`ThemeToggle.tsx`)
Sets `data-theme` on `<html>`. Dark variant is bound to `[data-theme='dark']`, not
the OS media query — author both modes for anything new.

---

## 6. Checklist for any new page/component

- [ ] Colors, fonts, radii reference **tokens** (`var(--…)` / Tailwind aliases) — nothing hardcoded.
- [ ] Right font for the job: serif = reading/titles, sans = UI, mono = metadata.
- [ ] No serif weight above 600; hierarchy comes from size + space, not weight.
- [ ] Exactly one accent (`--primary`); the rest is the neutral + meta ladder.
- [ ] Structure via hairline `border-border` rows/dividers before full cards/shadows.
- [ ] Meta is mono, often `UPPERCASE` + `tracking-label`, numerals `tabular-nums`.
- [ ] Reading content constrained to `max-w-[var(--measure)]` (680px).
- [ ] Visible focus state; works in **both** light and `[data-theme='dark']`.
- [ ] Built from existing `ui/` primitives where one fits.
- [ ] Could it be quieter? Remove a border, drop a shadow, mute a color.
