// `![[page.html]]` in a slide → the theme's <HtmlEmbed> frame, the same
// Obsidian embed the site renders (src/lib/html-embeds.mjs). build-slides.mjs
// resolves each embed against the vault and stages the file into the deck's
// public dir at the component's `src`, relative to the deck (which is built
// with `--base ./`, so it resolves under any deploy prefix).
//
// The scan itself is the engine's (src/lib/deck-embeds.mjs), reached through
// ../deck-embeds.ts, so the theme rewrites exactly what build-slides stages
// and `doctor` checks.
import { htmlEmbedEdits } from '../deck-embeds'

interface TransformContext {
  s: { original: string, overwrite: (start: number, end: number, content: string) => unknown }
}

export default () => ({
  pre: [
    (ctx: TransformContext) => {
      for (const { start, end, replacement } of htmlEmbedEdits(ctx.s.original))
        ctx.s.overwrite(start, end, replacement)
    },
  ],
})
