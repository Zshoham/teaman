/**
 * The Obsidian Markdown dialect, parsed once for every markdown-it renderer:
 * the reference PDF (`reference-pdf.mjs`), Confluence sync, and `doctor`'s
 * link lint. The site renders through remark instead; the shared dialect case
 * table (`__tests__/obsidian-dialect.test.mjs`) holds both parsers to the same
 * reading of a vault.
 *
 * What the dialect adds to CommonMark:
 * - `[[target]]`, `[[target|label]]`, `![[embed]]` — `wiki_link` inline tokens.
 *   Being tokens, they never form inside code spans or fences.
 * - `> [!type]± Title` callouts — `meta.callout` on the blockquote tokens.
 * - diagram fences (mermaid, plantuml, tikz, typst), compiled ahead of the
 *   synchronous render by `compileDiagramFences`.
 */
import MarkdownIt from 'markdown-it';
import matter from 'gray-matter';
import { renderFenceSvg } from './remark-fence-svg.mjs';

/** `[!type]` then an optional fold marker and title, on a callout's first line. */
export const CALLOUT_MARKER_RE = /^\[!([\w-]+)\]([+-])?[ \t]*(.*)$/;

const IMAGE_EMBED_RE = /\.(png|jpe?g|gif|svg|webp|bmp|avif)$/i;

/** Whether an `![[embed]]` target is an image (vs. a note transclusion). */
export function isImageEmbed(target) {
  return IMAGE_EMBED_RE.test(target.split(/[?#]/, 1)[0]);
}

function wikiLinkRule(state, silent) {
  let pos = state.pos;
  const embed = state.src.charCodeAt(pos) === 0x21; /* ! */
  if (embed) pos += 1;
  if (state.src.charCodeAt(pos) !== 0x5b || state.src.charCodeAt(pos + 1) !== 0x5b) return false;

  const end = state.src.indexOf(']]', pos + 2);
  if (end === -1) return false;
  const inner = state.src.slice(pos + 2, end);
  if (!inner || inner.includes('\n')) return false;

  const pipe = inner.indexOf('|');
  const target = (pipe === -1 ? inner : inner.slice(0, pipe)).trim();
  const label = (pipe === -1 ? '' : inner.slice(pipe + 1)).trim();
  if (!target) return false;

  if (!silent) {
    const token = state.push('wiki_link', '', 0);
    token.meta = { target, label: label || target, embed };
  }
  state.pos = end + 2;
  return true;
}

// Runs after inline tokenization, so the blockquote's first paragraph already
// has inline children; the marker line is removed and the rest re-parsed.
function calloutRule(state) {
  const tokens = state.tokens;
  for (let index = 0; index < tokens.length; index++) {
    if (tokens[index].type !== 'blockquote_open') continue;
    const paragraph = tokens[index + 1];
    const inline = tokens[index + 2];
    if (paragraph?.type !== 'paragraph_open' || inline?.type !== 'inline') continue;

    // Match the raw first line: a title with inline markup tokenizes into
    // several children, so the first text child alone would truncate it.
    const newline = inline.content.indexOf('\n');
    const firstLine = newline === -1 ? inline.content : inline.content.slice(0, newline);
    const match = CALLOUT_MARKER_RE.exec(firstLine);
    if (!match) continue;

    const level = tokens[index].level;
    const close = tokens.findIndex((token, at) =>
      at > index && token.type === 'blockquote_close' && token.level === level);
    if (close === -1) continue;

    const callout = { type: match[1].toLowerCase(), fold: match[2] ?? null, title: match[3].trim() };
    tokens[index].meta = { ...tokens[index].meta, callout };
    tokens[close].meta = { ...tokens[close].meta, callout };
    inline.content = newline === -1 ? '' : inline.content.slice(newline + 1);
    inline.children = [];
    if (inline.content) state.md.inline.parse(inline.content, state.md, state.env, inline.children);
  }
}

/**
 * markdown-it plugin: adds `wiki_link` tokens (`meta: { target, label, embed }`)
 * and marks callout blockquotes (`meta.callout: { type, fold, title }`, title
 * as raw Markdown). Renderers supply `renderer.rules.wiki_link` and read
 * `meta.callout` in their blockquote rules.
 *
 * @param {import('markdown-it').default} md
 */
export function obsidianDialect(md) {
  md.inline.ruler.before('link', 'wiki_link', wikiLinkRule);
  md.core.ruler.push('obsidian_callouts', calloutRule);
}

/** A fence token's language: the first info word, normalized. */
export function fenceLanguage(token) {
  return token.info?.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z0-9_+.-]/g, '') ?? '';
}

/** A fence token's source, without the newline markdown-it keeps after it. */
export function fenceSource(token) {
  return token.content.replace(/\n$/, '');
}

/** How a compiled diagram is looked up during the render. */
export function diagramKey(token) {
  return `${fenceLanguage(token)}\0${fenceSource(token)}`;
}

/**
 * Compile the diagram fences in `tokens` to SVG. markdown-it renders
 * synchronously and the compilers are async, so this runs first and the
 * renderer looks each fence up by `diagramKey`. A fence that fails maps to
 * `{ error }` (first line of the message) so the renderer can show a fallback
 * instead of failing the document.
 *
 * @param {Array<{ type: string, info?: string, content: string }>} tokens
 * @param {{ languages: Iterable<string>, cacheDir: string, compilers?: object,
 *   onError?: (language: string, reason: string) => void }} options
 * @returns {Promise<Map<string, { svg: string, path: string } | { error: string }>>}
 */
export async function compileDiagramFences(tokens, { languages, cacheDir, compilers, onError }) {
  const wanted = new Set(languages);
  const diagrams = new Map();
  for (const token of tokens) {
    if (token.type !== 'fence') continue;
    const language = fenceLanguage(token);
    const key = diagramKey(token);
    if (!wanted.has(language) || diagrams.has(key)) continue;
    try {
      diagrams.set(key, await renderFenceSvg(language, fenceSource(token), { cacheDir, compilers }));
    } catch (error) {
      const reason = String(error?.message ?? error).split('\n')[0].slice(0, 300);
      onError?.(language, reason);
      diagrams.set(key, { error: reason });
    }
  }
  return diagrams;
}

const linkParser = new MarkdownIt({ html: true }).use(obsidianDialect);

/**
 * Every wiki-link and embed in a Markdown document, frontmatter excluded, as
 * the renderers see them — none from code spans, fences, or raw HTML.
 *
 * @param {string} source
 * @returns {Array<{ target: string, label: string, embed: boolean }>}
 */
export function wikiLinks(source) {
  const links = [];
  for (const token of linkParser.parse(matter(source).content, {})) {
    for (const child of token.children ?? []) {
      if (child.type === 'wiki_link') links.push(child.meta);
    }
  }
  return links;
}
