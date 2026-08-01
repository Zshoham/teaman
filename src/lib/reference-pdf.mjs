import { existsSync, readFileSync, statSync } from 'fs';
import { createHash } from 'crypto';
import { dirname, isAbsolute, join, relative, resolve } from 'path';
import GithubSlugger from 'github-slugger';
import MarkdownIt from 'markdown-it';
import { renderFenceSvg } from './remark-fence-svg.mjs';
import {
  prepareReferenceChapter,
  referenceChapterAnchor,
  withReferenceChapterAnchors,
} from './reference-documents.mjs';
import {
  referenceBookHeadingSlug,
  referenceBookHtmlAnchor,
  rewriteReferenceBookUrl,
} from './remark-reference-books.mjs';
import { renderMermaidSvg, renderPlantumlSvg } from './server-diagrams.mjs';

const markdown = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
});
markdown.enable(['strikethrough', 'table']);

const CALLOUT_MARKER_RE = /^\[!([a-zA-Z][\w-]*)\]([+-])?\s*(.*)$/;
const DIAGRAM_LANGUAGES = new Set(['mermaid', 'plantuml', 'tikz', 'typst']);
const DIAGRAM_LABELS = { mermaid: 'Mermaid', plantuml: 'PlantUML', tikz: 'TikZ', typst: 'Typst' };
const WIKI_IMAGE_RE = /\.(png|jpe?g|gif|svg|webp|bmp|avif)$/i;
const HTML_ID_RE = /\sid\s*=\s*(["'])([^"']+)\1/gi;

// Mark Obsidian callout blockquotes after markdown-it has tokenized their
// inline content. The renderer can then style the block while the remaining
// body continues through the normal Markdown conversion path.
markdown.core.ruler.push('obsidian_callouts', state => {
  const tokens = state.tokens;
  for (let index = 0; index < tokens.length; index++) {
    if (tokens[index].type !== 'blockquote_open') continue;

    const paragraph = tokens[index + 1];
    const inline = tokens[index + 2];
    if (paragraph?.type !== 'paragraph_open' || inline?.type !== 'inline') continue;

    const newline = inline.content.indexOf('\n');
    const firstLine = newline === -1 ? inline.content : inline.content.slice(0, newline);
    const match = CALLOUT_MARKER_RE.exec(firstLine);
    if (!match) continue;

    const level = tokens[index].level;
    let close = -1;
    for (let candidate = index + 1; candidate < tokens.length; candidate++) {
      if (tokens[candidate].type === 'blockquote_close' && tokens[candidate].level === level) {
        close = candidate;
        break;
      }
    }
    if (close === -1) continue;

    const meta = {
      type: match[1].toLowerCase(),
      title: match[3].trim(),
    };
    tokens[index].meta = meta;
    tokens[close].meta = meta;
    inline.content = newline === -1 ? '' : inline.content.slice(newline + 1);
    inline.children = [];
    if (inline.content) state.md.inline.parse(inline.content, state.md, state.env, inline.children);
  }
});

const asTypstString = value => JSON.stringify(String(value ?? ''));
const asText = value => value ? `#text(${asTypstString(value)})` : '';

function stripHtml(value) {
  return value.replace(/<[^>]*>/g, '');
}

function preprocessObsidian(markdownSource) {
  return markdownSource
    .replace(/!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (match, target, alias) => {
      if (!WIKI_IMAGE_RE.test(target.split(/[?#]/, 1)[0])) return match.slice(1);
      const alt = String(alias ?? target).replace(/\\/g, '\\\\').replace(/\]/g, '\\]');
      const url = encodeURI(target).replace(/\(/g, '%28').replace(/\)/g, '%29');
      return `![${alt}](${url})`;
    })
    .replace(
      /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
      (_match, page, alias) => alias ?? page,
    );
}

function humanize(value) {
  return value
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, character => character.toUpperCase());
}

function fenceLanguage(token) {
  return token.info?.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z0-9_+.-]/g, '') ?? '';
}

function sourceWithoutLeadingTitle(source) {
  return source.replace(/^\s*#\s+[^\n]+\n+/, '');
}

function headingText(tokens) {
  return (tokens ?? [])
    .filter(token => token.type !== 'html_inline' && token.type !== 'image')
    .map(token => token.content ?? '')
    .join('');
}

function htmlIds(value) {
  return Array.from(value.matchAll(new RegExp(HTML_ID_RE.source, 'gi')), match => match[2]);
}

function decodeFragment(value) {
  try { return decodeURIComponent(value); } catch { return value; }
}

// Typst label literals accept a deliberately narrow identifier syntax. Encode
// the web anchor losslessly so Unicode, punctuation, and imported rule ids can
// all be used as PDF destinations without leaking into that syntax.
function typstInternalLabel(anchor) {
  return `teaman-${Buffer.from(anchor, 'utf8').toString('hex') || 'anchor'}`;
}

function htmlAnchor(id, chapterPath, chapterAnchor) {
  return chapterPath ? referenceBookHtmlAnchor(id, chapterPath, chapterAnchor) : id;
}

function analyzeReferenceTokens(tokens, chapterPath, assignedChapterAnchor) {
  const headingTargets = new Map();
  const targets = new Set();
  const slugger = chapterPath ? null : new GithubSlugger();
  const headingCounts = new Map();
  const chapterAnchor = chapterPath
    ? assignedChapterAnchor ?? referenceChapterAnchor(chapterPath)
    : null;
  let firstHeading = true;

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.type === 'heading_open') {
      const text = headingText(tokens[index + 1]?.children);
      let target;
      if (chapterPath) {
        const base = referenceBookHeadingSlug(text) || 'section';
        const count = headingCounts.get(base) ?? 0;
        headingCounts.set(base, count + 1);
        target = firstHeading
          ? chapterAnchor
          : `${chapterAnchor}--${base}${count ? `-${count}` : ''}`;
        firstHeading = false;
      } else {
        target = slugger.slug(text);
      }
      if (target) {
        headingTargets.set(index, target);
        targets.add(target);
      }
    }
    const htmlTokens = token.type === 'inline'
      ? token.children?.filter(child => child.type === 'html_inline') ?? []
      : token.type === 'html_inline' || token.type === 'html_block' ? [token] : [];
    for (const htmlToken of htmlTokens) {
      for (const id of htmlIds(htmlToken.content)) {
        targets.add(htmlAnchor(id, chapterPath, chapterAnchor));
      }
    }
  }

  return { headingTargets, targets };
}

function parseReference(source, chapterPath, chapterAnchor) {
  const value = sourceWithoutLeadingTitle(source);
  const tokens = markdown.parse(preprocessObsidian(value), {});
  return { tokens, ...analyzeReferenceTokens(tokens, chapterPath, chapterAnchor) };
}

function firstReferenceHeadingSlug(source) {
  const { tokens } = parseReference(source);
  const index = tokens.findIndex(token => token.type === 'heading_open');
  return index === -1
    ? 'section'
    : referenceBookHeadingSlug(headingText(tokens[index + 1]?.children)) || 'section';
}

export const referenceDiagramKey = (language, source) => `${language}\0${source}`;

/**
 * Compile every PDF-capable diagram fence to a cached SVG. Failures are kept
 * in the returned map so the converter can render a visible fallback without
 * aborting the rest of the reference document.
 */
export async function compileReferenceDiagrams(source, {
  cacheDir,
  compilers = {},
  warn = message => console.warn(message),
} = {}) {
  if (!cacheDir) throw new Error('compileReferenceDiagrams requires cacheDir');

  const tokens = markdown.parse(preprocessObsidian(source), {});
  const diagrams = new Map();
  const allCompilers = {
    mermaid: renderMermaidSvg,
    plantuml: renderPlantumlSvg,
    ...compilers,
  };

  for (const token of tokens) {
    if (token.type !== 'fence') continue;
    const language = fenceLanguage(token);
    if (!DIAGRAM_LANGUAGES.has(language)) continue;
    const key = referenceDiagramKey(language, token.content);
    if (diagrams.has(key)) continue;

    try {
      diagrams.set(key, await renderFenceSvg(language, token.content, {
        cacheDir,
        compilers: allCompilers,
      }));
    } catch (error) {
      const reason = String(error?.message ?? error).split('\n')[0].slice(0, 300);
      warn(`[teaman] ${language} reference diagram failed to compile: ${reason}`);
      diagrams.set(key, { error: reason });
    }
  }
  return diagrams;
}

function embeddedSvg(svg) {
  return `#align(center)[#image.decode(bytes(${asTypstString(svg)}), format: "svg", width: 100%)]\n\n`;
}

function renderCalloutOpen(meta, context) {
  const title = meta.title
    ? renderInline(markdown.parseInline(meta.title, {}).flatMap(token => token.children ?? []), context)
    : asText(humanize(meta.type));
  return `#teaman-callout(type: ${asTypstString(meta.type)}, title: [${title}])[\n`;
}

function renderHtmlAnchors(value, context) {
  let out = '';
  for (const id of htmlIds(value)) {
    const target = htmlAnchor(id, context.chapterPath, context.chapterAnchor);
    if (context.emittedTargets.has(target)) continue;
    context.emittedTargets.add(target);
    out += `#metadata(none) <${typstInternalLabel(target)}>`;
  }
  return out;
}

function resolvedLink(href, context) {
  const rewritten = context.chapterPath
    ? rewriteReferenceBookUrl(
        href,
        context.chapterPath,
        context.titleSlugs,
        false,
        context.chapterAnchors,
        context.internalTargets,
      )
    : href;
  if (rewritten?.startsWith('#') && rewritten.length > 1) {
    const target = decodeFragment(rewritten.slice(1));
    if (context.internalTargets.has(target)) return { target };
  }
  return { href: rewritten };
}

function renderInline(tokens, context) {
  let out = '';
  for (const token of tokens ?? []) {
    switch (token.type) {
      case 'text': out += asText(token.content); break;
      case 'softbreak': out += asText(' '); break;
      case 'hardbreak': out += '#linebreak()'; break;
      case 'strong_open': out += '#strong['; break;
      case 'strong_close': out += ']'; break;
      case 'em_open': out += '#emph['; break;
      case 'em_close': out += ']'; break;
      case 's_open': out += '#strike['; break;
      case 's_close': out += ']'; break;
      case 'code_inline': out += `#raw(${asTypstString(token.content)})`; break;
      case 'link_open': {
        const href = token.attrGet('href');
        const destination = href ? resolvedLink(href, context) : {};
        out += destination.target
          ? `#link(<${typstInternalLabel(destination.target)}>)[`
          : destination.href ? `#link(${asTypstString(destination.href)})[` : '[';
        break;
      }
      case 'link_close': out += ']'; break;
      case 'image': {
        const source = token.attrGet('src') ?? '';
        const alt = token.content || token.attrGet('alt') || 'Image';
        const path = context.resolveImage?.(source);
        out += path
          ? `#image(${asTypstString(path)}, width: 100%, alt: ${asTypstString(alt)})`
          : `#box(stroke: 0.5pt + rgb("#c9c4ba"), inset: 6pt)[${asText(`Image: ${alt}`)}]`;
        break;
      }
      case 'html_inline':
        out += renderHtmlAnchors(token.content, context) + asText(stripHtml(token.content));
        break;
      default:
        if (token.content) out += asText(token.content);
    }
  }
  return out;
}

function renderTable(tokens, start, context) {
  const rows = [];
  let row = null;
  let cell = null;
  let header = false;
  let index = start + 1;

  for (; index < tokens.length && tokens[index].type !== 'table_close'; index++) {
    const token = tokens[index];
    if (token.type === 'thead_open') header = true;
    if (token.type === 'thead_close') header = false;
    if (token.type === 'tr_open') row = { header, cells: [] };
    if (token.type === 'th_open' || token.type === 'td_open') cell = '';
    if (token.type === 'inline' && cell !== null) {
      cell += renderInline(token.children, context);
    }
    if (token.type === 'th_close' || token.type === 'td_close') {
      row?.cells.push(cell ?? '');
      cell = null;
    }
    if (token.type === 'tr_close' && row) {
      rows.push(row);
      row = null;
    }
  }

  const columns = Math.max(1, ...rows.map(item => item.cells.length));
  const cells = rows.flatMap(item => item.cells.map(value => `[${value}]`));
  const headerCells = rows[0]?.header
    ? `table.header(${rows[0].cells.map(value => `[${value}]`).join(', ')}),`
    : '';
  const bodyCells = rows[0]?.header ? cells.slice(rows[0].cells.length) : cells;
  return {
    index,
    // Structure only — inset, strokes and the header treatment come from the
    // template's `set table` / `show table` rules, so the printed design stays
    // in one file.
    value: `#table(columns: ${columns}, ${headerCells}${bodyCells.join(', ')})\n\n`,
  };
}

/** Convert the Markdown subset used by reference documents into Typst markup. */
export function markdownToTypst(source, {
  resolveImage,
  diagrams = new Map(),
  chapterPath,
  chapterAnchor,
  chapterAnchors = new Map(),
  titleSlugs = new Map(),
  internalTargets,
  emittedTargets = new Set(),
} = {}) {
  const parsed = parseReference(source, chapterPath, chapterAnchor);
  const { tokens, headingTargets } = parsed;
  const context = {
    resolveImage,
    chapterPath,
    chapterAnchor,
    chapterAnchors,
    titleSlugs,
    internalTargets: internalTargets ?? parsed.targets,
    emittedTargets,
  };
  const lists = [];
  let out = '';

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    switch (token.type) {
      case 'heading_open': {
        const sourceDepth = Number(token.tag.slice(1));
        const depth = Math.min(5, Math.max(1, sourceDepth - 1));
        const inline = tokens[index + 1];
        const target = headingTargets.get(index);
        const emitTarget = target && !context.emittedTargets.has(target);
        if (emitTarget) context.emittedTargets.add(target);
        out += `${'='.repeat(depth)} ${renderInline(inline?.children, context)}`;
        if (emitTarget) out += ` <${typstInternalLabel(target)}>`;
        out += '\n\n';
        index += 2;
        break;
      }
      case 'paragraph_open': break;
      case 'paragraph_close': out += lists.length > 0 ? '\n' : '\n\n'; break;
      case 'inline': out += renderInline(token.children, context); break;
      case 'bullet_list_open': lists.push('-'); break;
      case 'ordered_list_open': lists.push('+'); break;
      case 'bullet_list_close':
      case 'ordered_list_close':
        lists.pop();
        if (lists.length === 0) out += '\n';
        break;
      case 'list_item_open':
        out += `${'  '.repeat(Math.max(0, lists.length - 1))}${lists.at(-1) ?? '-'} `;
        break;
      case 'list_item_close':
        if (!out.endsWith('\n')) out += '\n';
        break;
      case 'blockquote_open':
        out += token.meta
          ? renderCalloutOpen(token.meta, context)
          : '#quote(block: true)[\n';
        break;
      case 'blockquote_close': out += ']\n\n'; break;
      case 'fence':
      case 'code_block': {
        const lang = fenceLanguage(token);
        const diagram = DIAGRAM_LANGUAGES.has(lang)
          ? diagrams.get(referenceDiagramKey(lang, token.content))
          : null;
        if (diagram?.svg) {
          out += embeddedSvg(diagram.svg);
        } else if (DIAGRAM_LANGUAGES.has(lang) && diagram?.error) {
          out += `#teaman-callout(type: "warning", title: [${asText(`${DIAGRAM_LABELS[lang]} diagram could not be rendered`)}])[\n`;
          out += `#raw(${asTypstString(token.content)}, block: true, lang: ${asTypstString(lang)})\n]\n\n`;
        } else {
          out += `#raw(${asTypstString(token.content)}, block: true${lang ? `, lang: ${asTypstString(lang)}` : ''})\n\n`;
        }
        break;
      }
      case 'hr': out += '#line(length: 100%, stroke: 0.5pt + rgb("#c9c4ba"))\n\n'; break;
      case 'table_open': {
        const table = renderTable(tokens, index, context);
        out += table.value;
        index = table.index;
        break;
      }
      case 'html_block': {
        const start = token.content.search(/<svg[\s>]/i);
        out += start === -1
          ? `${renderHtmlAnchors(token.content, context)}${asText(stripHtml(token.content))}\n\n`
          : embeddedSvg(token.content.slice(start).trim());
        break;
      }
    }
  }

  return out.trim();
}

/**
 * Content digest identifying one rendered reference PDF.
 *
 * Compiling a book-sized reference costs tens of seconds and its inputs rarely
 * change between runs — and `teaman dev` stages a fresh output dir on every
 * start, so a previously built PDF is never sitting there to reuse. Keying the
 * compiled bytes by this digest lets both loops skip the compile.
 *
 * The Typst source covers the template, brand, metadata and body. Images are
 * referenced by workspace path rather than inlined, so their bytes have to be
 * folded in separately or an edited image would keep serving a stale PDF.
 */
export function referencePdfCacheKey(typst, vaultDir) {
  const hash = createHash('sha256').update(typst);
  for (const [, escaped] of typst.matchAll(/#image\("((?:[^"\\]|\\.)*)"/g)) {
    const file = join(vaultDir, escaped.replace(/\\(.)/g, '$1'));
    try {
      hash.update(readFileSync(file));
    } catch {
      hash.update('<unreadable>');
    }
  }
  return hash.digest('hex');
}

/** Resolve a Markdown image to a Typst workspace-relative vault path. */
export function resolveReferenceImage(source, { sourcePath, vaultDir }) {
  if (!source || /^(?:[a-z]+:|\/\/|#)/i.test(source)) return null;
  let clean;
  try {
    clean = decodeURIComponent(source.split(/[?#]/, 1)[0]);
  } catch {
    clean = source.split(/[?#]/, 1)[0];
  }

  const candidates = clean.startsWith('/')
    ? [join(vaultDir, 'public', clean.slice(1)), join(vaultDir, clean.slice(1))]
    : [
        resolve(dirname(sourcePath), clean),
        resolve(vaultDir, clean),
        resolve(vaultDir, 'public', clean),
      ];

  for (const candidate of candidates) {
    const rel = relative(vaultDir, candidate);
    if (rel.startsWith('..') || isAbsolute(rel)) continue;
    if (existsSync(candidate) && statSync(candidate).isFile()) return rel.replace(/\\/g, '/');
  }
  return null;
}

function typstTags(tags) {
  if (!tags?.length) return '()';
  return `(${tags.map(asTypstString).join(', ')}${tags.length === 1 ? ',' : ''})`;
}

/** Fill the bundled Typst reference template with converted document content. */
export function renderReferenceTypst({
  template,
  title,
  summary,
  date,
  tags = [],
  brand = 'teaman',
  body,
  chapters,
  sourcePath,
  vaultDir,
  diagrams,
}) {
  // Parse book chapters independently so repeated reference-style link names
  // stay chapter-local and relative images resolve from the chapter that owns
  // them. The resulting Typst fragments still form one continuous document.
  const preparedChapters = chapters && withReferenceChapterAnchors(chapters).map(chapter => ({
    ...chapter,
    preparedBody: prepareReferenceChapter(chapter.body, chapter),
  }));
  const titleSlugs = new Map(preparedChapters?.map(chapter => [
    chapter.path,
    firstReferenceHeadingSlug(chapter.preparedBody),
  ]) ?? []);
  const chapterAnchors = new Map(preparedChapters?.map(chapter => [
    chapter.path,
    chapter.anchor ?? referenceChapterAnchor(chapter.path),
  ]) ?? []);
  const internalTargets = new Set(preparedChapters?.flatMap(chapter => [
    ...parseReference(
      chapter.preparedBody,
      chapter.path,
      chapterAnchors.get(chapter.path),
    ).targets,
  ]) ?? []);
  const emittedTargets = new Set();
  const content = preparedChapters?.length
    ? preparedChapters.map(chapter => markdownToTypst(chapter.preparedBody, {
        resolveImage: source => resolveReferenceImage(source, {
          sourcePath: chapter.sourcePath,
          vaultDir,
        }),
        diagrams,
        chapterPath: chapter.path,
        chapterAnchor: chapterAnchors.get(chapter.path),
        chapterAnchors,
        titleSlugs,
        internalTargets,
        emittedTargets,
      })).join('\n\n')
    : markdownToTypst(body, {
        resolveImage: source => resolveReferenceImage(source, { sourcePath, vaultDir }),
        diagrams,
      });
  const updated = date instanceof Date && !Number.isNaN(date.valueOf())
    ? date.toISOString().slice(0, 10)
    : date ? String(date) : null;
  const args = [
    `title: ${asTypstString(title)}`,
    `summary: ${summary ? asTypstString(summary) : 'none'}`,
    `updated: ${updated ? asTypstString(updated) : 'none'}`,
    `tags: ${typstTags(tags)}`,
    `brand: ${asTypstString(brand)}`,
  ].join(', ');
  return `${template.trim()}\n\n#show: teaman-reference.with(${args})\n\n${content}\n`;
}
