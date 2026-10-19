// `![[page.html]]` in a slide → the theme's <HtmlEmbed> frame, the same
// Obsidian embed the site renders (src/lib/html-embeds.mjs). build-slides.mjs
// resolves each embed against the vault and stages the file into the deck's
// public dir at `embeds/<target as written>`, so this rewrite needs no vault
// lookup: the URL is the target itself, relative to the deck (which is built
// with `--base ./`, so it resolves under any deploy prefix).
//
// Self-contained on purpose: the staged theme lives in a temp dir, outside
// any node_modules, so this file imports nothing.

export interface HtmlEmbedEdit {
  start: number
  end: number
  replacement: string
}

const EMBED_RE = /!\[\[([^\]\n|]+)(?:\|([^\]\n]*))?\]\]/g
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/
const CODE_SPAN_RE = /(`+)[^`]*?\1/g
const SIZE_RE = /^(?:(\d+)x)?(\d+)$/

/** The staged path of an embed — keep in step with `deckEmbedPath` in src/lib/html-embeds.mjs. */
function embedPath(target: string): string {
  return target.split(/[?#]/, 1)[0].trim().replace(/^(\.\/|\/)+/, '')
}

const escapeAttr = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

function titleFromFile(path: string): string {
  const words = (path.split('/').pop() ?? path).replace(/\.html?$/i, '').replace(/[-_]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function componentFor(target: string, label: string | undefined): string {
  const path = embedPath(target)
  // A `#fragment` or `?query` rides along: the embed may read it.
  const cut = target.trim().search(/[?#]/)
  const suffix = cut === -1 ? '' : target.trim().slice(cut)
  const src = `embeds/${path.split('/').map(encodeURIComponent).join('/')}${suffix}`
  const size = label ? SIZE_RE.exec(label.trim()) : null
  const title = label && !size ? label.trim() : titleFromFile(path)
  const attrs = [`src="${escapeAttr(src)}"`, `title="${escapeAttr(title)}"`]
  if (size?.[1]) attrs.push(`:width="${size[1]}"`)
  if (size) attrs.push(`:height="${size[2]}"`)
  return `<HtmlEmbed ${attrs.join(' ')} />`
}

/**
 * Where `![[*.html]]` embeds sit in a slide's Markdown, and what replaces
 * each. Fenced code and inline code spans are left alone, so a slide can
 * still show the syntax.
 */
export function htmlEmbedEdits(markdown: string): HtmlEmbedEdit[] {
  const edits: HtmlEmbedEdit[] = []
  let fence: string | null = null
  let offset = 0
  for (const line of markdown.split('\n')) {
    const start = offset
    offset += line.length + 1
    const marker = FENCE_RE.exec(line)?.[1]
    if (fence) {
      if (marker && marker[0] === fence[0] && marker.length >= fence.length && !line.slice(line.indexOf(marker) + marker.length).trim()) fence = null
      continue
    }
    if (marker) {
      fence = marker
      continue
    }
    const code = [...line.matchAll(CODE_SPAN_RE)].map(m => [m.index, m.index + m[0].length])
    for (const match of line.matchAll(EMBED_RE)) {
      const [whole, target, label] = match
      if (!/\.html?$/i.test(embedPath(target))) continue
      if (code.some(([from, to]) => match.index >= from && match.index < to)) continue
      edits.push({ start: start + match.index, end: start + match.index + whole.length, replacement: componentFor(target, label) })
    }
  }
  return edits
}

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
