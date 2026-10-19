/**
 * `![[page.html]]` in a Slidev deck: where each embed sits in a slide's
 * Markdown and the `<HtmlEmbed>` component that replaces it (see
 * `html-embeds.mjs` for the site side).
 *
 * One scan serves every consumer, so they cannot disagree: the slide
 * theme's transformer (`resources/slidev-theme-teaman/setup/transformers.ts`,
 * through the staged `deck-embeds.ts`) rewrites what it finds, build-slides
 * stages a file for each, and `doctor` checks each resolves.
 *
 * Code is left alone, so a slide can still show the syntax: fenced and
 * indented code blocks come from markdown-it — the parser Slidev renders
 * slides with, `html` on — which also nests them correctly in lists and
 * quotes. Inline code spans are matched CommonMark-style over each run of
 * consecutive text lines (a span may cross lines, but not a blank line or a
 * block of code). Raw HTML stays live: the transformer runs before Slidev
 * parses, so an embed inside `<div>…</div>` still becomes a frame.
 */
import MarkdownIt from 'markdown-it';
import { deckEmbedPath } from './html-embeds.mjs';

const parser = new MarkdownIt({ html: true });

const EMBED_RE = /!\[\[([^\]\n|]+)(?:\|([^\]\n]*))?\]\]/g;
const SIZE_RE = /^(?:(\d+)x)?(\d+)$/;

/**
 * Code spans in `text`: a run of N backticks opens a span that only a run of
 * exactly N closes, so shorter runs sit inside it (``a`b``). An opener with
 * no closer is literal text.
 *
 * @param {string} text
 * @returns {Array<[number, number]>}
 */
function codeSpans(text) {
  const spans = [];
  const runAt = at => {
    let n = 0;
    while (text[at + n] === '`') n++;
    return n;
  };
  let i = 0;
  while (i < text.length) {
    if (text[i] !== '`') {
      i++;
      continue;
    }
    const open = runAt(i);
    let j = i + open;
    let close = -1;
    while (j < text.length) {
      if (text[j] !== '`') {
        j++;
        continue;
      }
      const run = runAt(j);
      if (run === open) {
        close = j;
        break;
      }
      j += run;
    }
    if (close === -1) {
      i += open;
      continue;
    }
    spans.push([i, close + open]);
    i = close + open;
  }
  return spans;
}

/** Lines (0-based) inside fenced or indented code blocks. */
function codeBlockLines(markdown) {
  const lines = new Set();
  for (const token of parser.parse(markdown, {})) {
    if ((token.type === 'fence' || token.type === 'code_block') && token.map) {
      for (let line = token.map[0]; line < token.map[1]; line++) lines.add(line);
    }
  }
  return lines;
}

const escapeAttr = value =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function titleFromFile(path) {
  const words = (path.split('/').pop() ?? path).replace(/\.html?$/i, '').replace(/[-_]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The `<HtmlEmbed>` for one embed; its `src` is where build-slides stages the file. */
function componentFor(target, label) {
  const path = deckEmbedPath(target);
  // A `#fragment` or `?query` rides along: the embed may read it.
  const cut = target.trim().search(/[?#]/);
  const suffix = cut === -1 ? '' : target.trim().slice(cut);
  const src = `embeds/${path.split('/').map(encodeURIComponent).join('/')}${suffix}`;
  const size = label ? SIZE_RE.exec(label.trim()) : null;
  const title = label && !size ? label.trim() : titleFromFile(path);
  const attrs = [`src="${escapeAttr(src)}"`, `title="${escapeAttr(title)}"`];
  if (size?.[1]) attrs.push(`:width="${size[1]}"`);
  if (size) attrs.push(`:height="${size[2]}"`);
  return `<HtmlEmbed ${attrs.join(' ')} />`;
}

/**
 * Every `![[*.html]]` embed in `markdown` outside code, with its offsets, the
 * target as written, and the component that replaces it.
 *
 * @param {string} markdown
 * @returns {Array<{ start: number, end: number, target: string, replacement: string }>}
 */
export function htmlEmbedEdits(markdown) {
  const edits = [];
  const code = codeBlockLines(markdown);
  let block = null;

  const flush = () => {
    if (!block) return;
    const { start, text } = block;
    block = null;
    const spans = codeSpans(text);
    for (const match of text.matchAll(EMBED_RE)) {
      const [whole, target, label] = match;
      if (!/\.html?$/i.test(deckEmbedPath(target))) continue;
      if (spans.some(([from, to]) => match.index >= from && match.index < to)) continue;
      edits.push({
        start: start + match.index,
        end: start + match.index + whole.length,
        target,
        replacement: componentFor(target, label),
      });
    }
  };

  let offset = 0;
  markdown.split('\n').forEach((line, index) => {
    const start = offset;
    offset += line.length + 1;
    if (code.has(index) || !line.trim()) {
      flush();
      return;
    }
    if (block) block.text += `\n${line}`;
    else block = { start, text: line };
  });
  flush();
  return edits;
}
