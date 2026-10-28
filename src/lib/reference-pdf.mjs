import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { join, relative } from 'path';
import GithubSlugger from 'github-slugger';
import MarkdownIt from 'markdown-it';
import {
  compileDiagramFences,
  diagramKey,
  fenceLanguage,
  obsidianDialect,
} from './obsidian-markdown.mjs';
import { htmlIds, layoutReferenceBook } from './reference-book.mjs';
import { engineDir } from './build-env.mjs';
import { withoutTitleHeading } from './entry-title.mjs';
import { isInside, toPosix } from './fs-walk.mjs';
import { renderMermaidSvg, renderPlantumlSvg } from './server-diagrams.mjs';
import { assetRoots, resolveVaultAsset } from './vault-assets.mjs';
import { CLIENT_DIAGRAM_LANGUAGES, DIAGRAM_KINDS, diagramKind } from './diagram-kinds.mjs';
import { resolveEmbed } from './embeds.mjs';

const markdown = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
}).use(obsidianDialect);
markdown.enable(['strikethrough', 'table']);

// Every diagram kind renders into the PDF: the build kinds through the site's
// compilers, the browser-rendered ones through a server-side renderer here.
const DIAGRAM_LANGUAGES = new Set(DIAGRAM_KINDS.map(kind => kind.lang));
const SERVER_RENDERERS = { mermaid: renderMermaidSvg, plantuml: renderPlantumlSvg };
for (const lang of CLIENT_DIAGRAM_LANGUAGES) {
  if (!SERVER_RENDERERS[lang]) throw new Error(`no server-side renderer for the ${lang} diagram kind`);
}

const asTypstString = value => JSON.stringify(String(value ?? ''));
const asText = value => value ? `#text(${asTypstString(value)})` : '';

function stripHtml(value) {
  return value.replace(/<[^>]*>/g, '');
}

function humanize(value) {
  return value
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, character => character.toUpperCase());
}

function headingText(tokens) {
  return (tokens ?? [])
    .filter(token => token.type !== 'html_inline' && token.type !== 'image')
    .map(token => (token.type === 'wiki_link' ? token.meta.label : token.content ?? ''))
    .join('');
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

/**
 * Parse one document (or one book chapter) and read what its identifiers are
 * made from: each heading's token index and text, and the ids its raw HTML
 * declares.
 */
function parseReference(source) {
  const tokens = markdown.parse(withoutTitleHeading(source), {});
  const headings = [];
  const ids = [];
  for (const [index, token] of tokens.entries()) {
    if (token.type === 'heading_open') headings.push({ index, text: headingText(tokens[index + 1]?.children) });
    const htmlTokens = token.type === 'inline'
      ? token.children?.filter(child => child.type === 'html_inline') ?? []
      : token.type === 'html_inline' || token.type === 'html_block' ? [token] : [];
    for (const htmlToken of htmlTokens) ids.push(...htmlIds(htmlToken.content));
  }
  return { tokens, headings, htmlIds: ids };
}

/** A standalone reference's headings take GitHub-style ids, as on the site. */
function standaloneTargets({ headings, htmlIds: ids }) {
  const slugger = new GithubSlugger();
  const headingTargets = new Map();
  for (const { index, text } of headings) {
    const target = slugger.slug(text);
    if (target) headingTargets.set(index, target);
  }
  return { headingTargets, targets: new Set([...headingTargets.values(), ...ids]) };
}

/**
 * Compile every PDF-capable diagram fence to a cached SVG. Failures are kept
 * in the returned map (`{ error }`) so the converter can render a visible
 * fallback without aborting the rest of the reference document.
 */
async function compileReferenceDiagrams(source, {
  cacheDir,
  compilers = {},
  warn = message => console.warn(message),
} = {}) {
  if (!cacheDir) throw new Error('compileReferenceDiagrams requires cacheDir');
  return compileDiagramFences(markdown.parse(source, {}), {
    languages: DIAGRAM_LANGUAGES,
    cacheDir,
    compilers: { ...SERVER_RENDERERS, ...compilers },
    onError: (language, reason) => warn(`[teaman] ${language} reference diagram failed to compile: ${reason}`),
  });
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
    const target = context.layout ? context.layout.htmlId(id, context.chapterPath) : id;
    if (context.emittedTargets.has(target)) continue;
    context.emittedTargets.add(target);
    out += `#metadata(none) <${typstInternalLabel(target)}>`;
  }
  return out;
}

function resolvedLink(href, context) {
  const rewritten = context.layout ? context.layout.rewrite(href, context.chapterPath) : href;
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
      case 'image':
        out += renderImage(token.attrGet('src') ?? '', token.content || token.attrGet('alt') || 'Image', context);
        break;
      case 'wiki_link': {
        const { target, label, embed } = token.meta;
        if (embed) {
          const found = resolveEmbed(target, label, { resolveAttachment: context.resolveAttachment, fromFile: context.sourcePath });
          if (found.problem) throw new Error(`${context.sourcePath ?? 'reference'}: ${found.problem}`);
          const name = found.caption ?? found.target;
          // A PDF cannot run the page; leave a labelled box where it sits.
          out += found.kind === 'html'
            ? `#box(stroke: 0.5pt + rgb("#c9c4ba"), inset: 6pt)[${asText(`Interactive embed: ${name} — open the online version to use it`)}]`
            : renderImage(found.file, name, context, context.attachmentPath);
          break;
        }
        // A wiki-link to a section of this PDF jumps there; one to anywhere
        // else (another page of the site, or nothing) keeps its text, styled
        // by the template as a link the PDF cannot follow.
        const anchor = context.resolveWikiLink?.(target);
        out += anchor && context.internalTargets.has(anchor)
          ? `#link(<${typstInternalLabel(anchor)}>)[${asText(label)}]`
          : `#teaman-wiki-unlinked[${asText(label)}]`;
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

function renderImage(source, alt, context, resolve = context.resolveImage) {
  const path = resolve?.(source);
  return path
    ? `#image(${asTypstString(path)}, width: 100%, alt: ${asTypstString(alt)})`
    : `#box(stroke: 0.5pt + rgb("#c9c4ba"), inset: 6pt)[${asText(`Image: ${alt}`)}]`;
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
export function markdownToTypst(source, options = {}) {
  const parsed = parseReference(source);
  return renderTypst(parsed.tokens, { ...standaloneTargets(parsed), ...options });
}

/**
 * Render parsed Markdown as Typst.
 *
 * @param {object} options
 * @param {Map<number, string>} options.headingTargets  heading token index → its id
 * @param {Set<string>} options.targets  every id the document declares
 * @param {import('./reference-book.mjs').ReferenceBookLayout} [options.layout]
 *   with `chapterPath`: the book the tokens are one chapter of
 */
function renderTypst(tokens, {
  sourcePath,
  resolveImage,
  resolveAttachment,
  attachmentPath = file => file,
  resolveWikiLink,
  diagrams = new Map(),
  headingTargets,
  targets,
  layout,
  chapterPath,
  emittedTargets = new Set(),
}) {
  const context = {
    sourcePath,
    resolveImage,
    resolveAttachment,
    attachmentPath,
    resolveWikiLink,
    layout,
    chapterPath,
    internalTargets: targets,
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
        out += token.meta?.callout
          ? renderCalloutOpen(token.meta.callout, context)
          : '#quote(block: true)[\n';
        break;
      case 'blockquote_close': out += ']\n\n'; break;
      case 'fence':
      case 'code_block': {
        const lang = fenceLanguage(token);
        const diagram = DIAGRAM_LANGUAGES.has(lang) ? diagrams.get(diagramKey(token)) : null;
        if (diagram?.svg) {
          out += embeddedSvg(diagram.svg);
        } else if (DIAGRAM_LANGUAGES.has(lang) && diagram?.error) {
          out += `#teaman-callout(type: "warning", title: [${asText(`${diagramKind(lang).label} diagram could not be rendered`)}])[\n`;
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
 *
 * @param {{ typst: string, images: string[] }} rendered  `renderReferenceTypst`'s result
 * @param {string} vaultDir
 */
export function referencePdfCacheKey({ typst, images }, vaultDir) {
  const hash = createHash('sha256').update(typst);
  for (const image of images) {
    try {
      hash.update(readFileSync(join(vaultDir, image)));
    } catch {
      hash.update('<unreadable>');
    }
  }
  return hash.digest('hex');
}

/**
 * Resolve a Markdown image as the site does (`resolveVaultAsset`), to a
 * Typst workspace-relative path. The workspace is the vault, so an image
 * found outside it (the engine's own public assets) is a placeholder too.
 */
export function resolveReferenceImage(source, { sourcePath, vaultDir }) {
  const found = resolveVaultAsset(source, { fromFile: sourcePath, roots: assetRoots(vaultDir, { engineDir }) });
  return found && isInside(vaultDir, found) ? toPosix(relative(vaultDir, found)) : null;
}

function typstTags(tags) {
  if (!tags?.length) return '()';
  return `(${tags.map(asTypstString).join(', ')}${tags.length === 1 ? ',' : ''})`;
}

/**
 * A published reference of the vault catalog as the Typst of its PDF: its
 * diagram fences compiled (through the shared diagram cache), its frontmatter
 * on the title page, a book laid out from its prepared chapters, embeds
 * found and wiki-links resolved through the vault index — a link to a part of
 * this reference jumps there; one to anywhere else keeps its text. Returns the
 * Typst and the vault-relative images it names, for `referencePdfCacheKey`.
 *
 * @param {import('./vault-catalog.mjs').CatalogRecord & { title: string, kind: 'standalone' | 'book', chapters?: object[] }} document
 * @param {object} options
 * @param {string} options.template  the Typst reference template
 * @param {string} [options.brand]
 * @param {string} options.vaultDir
 * @param {Pick<import('./vault-index.mjs').VaultIndex, 'resolve' | 'resolveAttachment'>} options.index
 * @param {string} options.diagramCacheDir
 * @param {object} [options.compilers]  replace the diagram compilers
 * @param {(message: string) => void} [options.warn]  a diagram that failed to compile
 * @returns {Promise<{ typst: string, images: string[] }>}
 */
export async function renderReferenceDocument(document, { template, brand, vaultDir, index, diagramCacheDir, compilers, warn }) {
  const diagrams = await compileReferenceDiagrams(document.body, { cacheDir: diagramCacheDir, compilers, warn });
  const { data } = document;
  return renderReferenceTypst({
    template,
    title: document.title,
    summary: data.summary,
    date: data.date,
    // Normalized by the schema; frontmatter it rejects (which `doctor` and
    // the site build report) is as written. `teaman dev` renders references
    // before Astro validates anything, so this must not crash on that.
    tags: Array.isArray(data.tags) ? data.tags : [],
    brand,
    body: document.body,
    chapters: document.kind === 'book' ? document.chapters : undefined,
    sourcePath: document.sourcePath,
    vaultDir,
    diagrams,
    resolveWikiLink: (target, fromPath) => {
      const entry = index.resolve(target, fromPath)?.entry;
      return entry?.reference === document.id ? entry.anchor ?? null : null;
    },
    resolveAttachment: index.resolveAttachment,
  });
}

/**
 * Fill the bundled Typst reference template with converted document content.
 * Returns the Typst source and the vault-relative images it names, in order.
 *
 * A book is rendered from `chapters` as `assembleReferenceBook` prepared them
 * (each with its `anchor`, `preparedBody`, and `sourcePath`) — the reference
 * document's own, so the PDF lays out exactly the book the site renders;
 * `body` is a standalone reference's.
 */
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
  resolveWikiLink,
  resolveAttachment,
}) {
  // Every image the Typst names, as it is emitted — the PDF cache key folds in
  // their bytes.
  const images = new Set();
  const emitted = path => {
    if (path) images.add(path);
    return path;
  };
  // `![[image.png]]` names an attachment anywhere in the vault, found by
  // `resolveEmbed` the way the site finds it; the workspace is the vault.
  const attachmentPath = file => emitted(isInside(vaultDir, file) ? toPosix(relative(vaultDir, file)) : null);
  // Parse book chapters independently so repeated reference-style link names
  // stay chapter-local and relative images resolve from the chapter that owns
  // them. The resulting Typst fragments still form one continuous document,
  // laid out as the site lays it out.
  let content;
  if (chapters?.length) {
    const parsed = chapters.map(chapter => ({ chapter, ...parseReference(chapter.preparedBody) }));
    const layout = layoutReferenceBook(parsed.map(({ chapter, headings, htmlIds: ids }) => ({
      path: chapter.path,
      anchor: chapter.anchor,
      headings: headings.map(heading => heading.text),
      htmlIds: ids,
    })));
    const emittedTargets = new Set();
    content = parsed.map(({ chapter, tokens, headings }) => {
      const ids = layout.headingIds(chapter.path);
      return renderTypst(tokens, {
        sourcePath: chapter.sourcePath,
        resolveAttachment,
        attachmentPath,
        resolveImage: source => emitted(resolveReferenceImage(source, {
          sourcePath: chapter.sourcePath,
          vaultDir,
        })),
        resolveWikiLink: target => resolveWikiLink?.(target, chapter.sourcePath) ?? null,
        diagrams,
        headingTargets: new Map(headings.map((heading, index) => [heading.index, ids[index]])),
        targets: layout.targets,
        layout,
        chapterPath: chapter.path,
        emittedTargets,
      });
    }).join('\n\n');
  } else {
    content = markdownToTypst(body, {
      sourcePath,
      resolveAttachment,
      attachmentPath,
      resolveImage: source => emitted(resolveReferenceImage(source, { sourcePath, vaultDir })),
      resolveWikiLink: target => resolveWikiLink?.(target, sourcePath) ?? null,
      diagrams,
    });
  }
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
  return {
    typst: `${template.trim()}\n\n#show: teaman-reference.with(${args})\n\n${content}\n`,
    images: [...images],
  };
}
