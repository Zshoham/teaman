import { existsSync, readFileSync, statSync } from 'fs';
import { basename, dirname, relative, resolve, sep } from 'path';
import matter from 'gray-matter';
import MarkdownIt from 'markdown-it';
import { isInside, walkMarkdown } from './fs-walk.mjs';

const SUMMARY_NAME = 'summary.md';
const MARKER_PREFIX = 'teaman-reference-chapter:';
const summaryMarkdown = new MarkdownIt();

const posix = value => value.replaceAll(sep, '/');

function markdownTitle(source, fallback) {
  const match = source.match(/^\s{0,3}#\s+(.+?)\s*#*\s*$/m);
  return match?.[1]?.replace(/\s+\{#[^}]+\}\s*$/, '').trim() || fallback;
}

function cleanSummaryTarget(value) {
  const target = value.trim().replace(/^<|>$/g, '').split('#', 1)[0];
  try { return decodeURIComponent(target); } catch { return target; }
}

function inlineText(tokens) {
  return tokens.map(token => {
    if (token.type === 'softbreak' || token.type === 'hardbreak') return ' ';
    if (token.type === 'image') return token.content ?? token.attrGet?.('alt') ?? '';
    return ['text', 'code_inline'].includes(token.type) ? token.content ?? '' : '';
  }).join('').trim();
}

function summaryLink(token) {
  const children = token.children ?? [];
  const open = children.findIndex(child => child.type === 'link_open');
  if (open === -1) return null;
  const close = children.findIndex((child, index) => index > open && child.type === 'link_close');
  if (close === -1) return null;

  // A SUMMARY chapter is a link by itself, optionally wrapped in inline
  // formatting. Do not accidentally turn a link mentioned in prose into a
  // chapter entry.
  if (inlineText([...children.slice(0, open), ...children.slice(close + 1)])) return null;
  const href = children[open].attrGet('href');
  if (!href) return null;
  return { href, title: inlineText(children.slice(open + 1, close)) };
}

/**
 * Is `target` a link to a Markdown file inside this book/guide? Schemes and
 * protocol-relative URLs are external; a root-relative `/chapter.md` is only
 * meaningful where the caller says so.
 */
function isLocalMarkdownTarget(target, rootRelative) {
  if (/^[a-z][a-z\d+.-]*:/i.test(target)) return false;
  if (target.startsWith('//')) return false;
  if (target.startsWith('/') && !rootRelative) return false;
  return /\.md$/i.test(target);
}

/**
 * Parse the mdBook-style chapter list in SUMMARY.md, preserving its nesting.
 *
 * @param {string} source
 * @param {{ rootRelative?: boolean }} [options]
 *   `rootRelative` accepts `/chapter.md` and strips the slash. Guides have
 *   always allowed that spelling; a reference book resolves chapters against
 *   its own directory and must not treat a leading `/` as meaningful.
 */
export function parseReferenceSummary(source, { rootRelative = false } = {}) {
  const parsedByLine = new Map();
  let listDepth = 0;
  const tokens = summaryMarkdown.parse(source, {});
  for (const [index, token] of tokens.entries()) {
    if (token.type === 'bullet_list_open' || token.type === 'ordered_list_open') {
      listDepth++;
    } else if (token.type === 'bullet_list_close' || token.type === 'ordered_list_close') {
      listDepth--;
    } else if (token.type === 'inline' && token.map && tokens[index - 1]?.type === 'paragraph_open') {
      const link = summaryLink(token);
      if (link) parsedByLine.set(token.map[0], { ...link, depth: Math.max(0, listDepth - 1) });
    }
  }

  const chapters = [];
  const fallbackLevels = [];
  for (const [lineNumber, line] of source.split(/\r?\n/).entries()) {
    const match = line.match(/^(\s*)(?:(?:[-+*]|\d+[.)])\s+)?(.+?)\s*$/);
    if (!match) continue;
    // CommonMark's document parser handles titles, escaped parentheses,
    // reference links, and angle-bracket destinations. The inline fallback is
    // only for deliberately over-indented mdBook entries parsed as code.
    const link = parsedByLine.get(lineNumber)
      ?? summaryLink(summaryMarkdown.parseInline(match[2], {})[0]);
    if (!link) continue;
    const target = cleanSummaryTarget(link.href);
    if (!isLocalMarkdownTarget(target, rootRelative)) continue;
    const indent = match[1].replaceAll('\t', '    ').length;
    while (fallbackLevels.length > 0 && indent < fallbackLevels.at(-1)) fallbackLevels.pop();
    if (fallbackLevels.length === 0 || indent > fallbackLevels.at(-1)) fallbackLevels.push(indent);
    chapters.push({
      title: link.title,
      path: target.replace(/^\.\//, '').replace(/^\//, ''),
      // Keep the existing extension where an indented entry can follow a
      // markerless prefix chapter; CommonMark sees that entry as code.
      depth: link.depth ?? fallbackLevels.length - 1,
    });
  }
  return chapters;
}

/** A stable, URL-safe anchor for one source file inside an assembled book. */
export function referenceChapterAnchor(path) {
  return path
    .replace(/\\/g, '/')
    .replace(/\.md$/i, '')
    .split('/')
    .map(segment => segment
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '') || 'chapter')
    .join('--');
}

/** Return chapters with deterministic, document-unique anchor assignments. */
export function withReferenceChapterAnchors(chapters) {
  const used = new Set();
  return chapters.map(chapter => {
    const base = chapter.anchor || referenceChapterAnchor(chapter.path);
    let anchor = base;
    let suffix = 2;
    while (used.has(anchor)) anchor = `${base}--${suffix++}`;
    used.add(anchor);
    return { ...chapter, anchor };
  });
}

function chapterMarker(path, anchor) {
  return `<!--${MARKER_PREFIX}${encodeURIComponent(path)}|${encodeURIComponent(anchor)}-->`;
}

export function parseReferenceChapterMetadata(value) {
  const match = value.trim().match(/^<!--teaman-reference-chapter:([^>]+)-->$/);
  if (!match) return null;
  const separator = match[1].indexOf('|');
  const encodedPath = separator === -1 ? match[1] : match[1].slice(0, separator);
  const encodedAnchor = separator === -1 ? null : match[1].slice(separator + 1);
  let path;
  try { path = decodeURIComponent(encodedPath); } catch { path = encodedPath; }
  let anchor;
  try { anchor = encodedAnchor ? decodeURIComponent(encodedAnchor) : null; }
  catch { anchor = encodedAnchor; }
  return { path, anchor: anchor || referenceChapterAnchor(path) };
}

export function parseReferenceChapterMarker(value) {
  return parseReferenceChapterMetadata(value)?.path ?? null;
}

function fenceLanguage(info) {
  return info.trim().split(/[\s,]+/, 1)[0]?.toLowerCase() ?? '';
}

function normalizeFenceLanguage(info) {
  const language = fenceLanguage(info);
  if (/^(?:compile_fail|ignore|no_run|should_panic|edition\d+|e\d+)$/i.test(language)) return 'rust';
  return language === 'grammar' ? 'text' : language;
}

/**
 * Make a chapter safe to concatenate: keep fences intact, normalize mdBook
 * fence annotations, promote its title into the combined outline, and turn
 * Rust Reference rule labels into real anchors.
 */
export function prepareReferenceChapter(source, {
  path,
  title,
  depth = 0,
  anchor = referenceChapterAnchor(path),
} = {}) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const headingDepth = Math.min(6, 2 + depth);
  const out = [chapterMarker(path, anchor)];
  let fence = null;
  let foundTitle = false;
  const grammarProductionNames = new Set();

  const emitGrammarAnchors = current => {
    if (!current.grammar || current.productionNames.size === 0) return;
    const anchors = [...current.productionNames].map(name =>
      `<a id="grammar-${name}" class="reference-grammar-anchor" aria-label="Grammar production ${name}"></a>`,
    ).join('');
    const quoteBreak = current.prefix.includes('>') ? current.prefix.trimEnd() : '';
    out.splice(
      current.outIndex,
      0,
      `${current.prefix}<div class="reference-grammar-anchors">${anchors}</div>`,
      quoteBreak,
    );
  };

  for (const line of lines) {
    // Lists can indent a blockquoted fence beyond CommonMark's usual three
    // leading spaces (`     > ```rust,ignore` in the Rust Reference).
    const fenceMatch = line.match(/^(\s*(?:>\s*)*)(`{3,}|~{3,})(.*)$/);
    if (fenceMatch) {
      const prefix = fenceMatch[1];
      const marker = fenceMatch[2];
      if (!fence) {
        fence = {
          marker,
          grammar: fenceLanguage(fenceMatch[3]) === 'grammar',
          outIndex: out.length,
          prefix,
          productionNames: new Set(),
        };
        const language = normalizeFenceLanguage(fenceMatch[3]);
        out.push(`${prefix}${marker}${language}`);
        continue;
      }
      if (marker[0] === fence.marker[0] && marker.length >= fence.marker.length) {
        emitGrammarAnchors(fence);
        fence = null;
      }
      out.push(line);
      continue;
    }
    if (fence) {
      if (fence.grammar) {
        const production = line.match(/^\s*(?:>\s*)*(?:@root\s+)?([A-Za-z_][A-Za-z0-9_-]*)\s*->/);
        if (production && !grammarProductionNames.has(production[1])) {
          grammarProductionNames.add(production[1]);
          fence.productionNames.add(production[1]);
        }
      }
      out.push(line);
      continue;
    }

    // A setext title (`Title` over `=====`) is a level-1 heading like any other
    // and has to be demoted with them, or the chapter keeps its own <h1> *and*
    // gets a synthetic title bolted on below.
    const previous = out.at(-1) ?? '';
    const setext = line.match(/^ {0,3}(=+|-+)\s*$/);
    if (
      setext
      && out.length > 1
      && previous.trim()
      && !/^\s{0,3}(?:#|>|<|[-*+]\s|\d+[.)]\s)/.test(previous)
    ) {
      const originalDepth = setext[1][0] === '=' ? 1 : 2;
      const nextDepth = Math.min(6, originalDepth + headingDepth - 1);
      out[out.length - 1] = `${'#'.repeat(nextDepth)} ${previous.trim()}`;
      if (originalDepth === 1) foundTitle = true;
      continue;
    }

    const heading = line.match(/^(\s{0,3})(#{1,6})(\s+.+)$/);
    if (heading) {
      const originalDepth = heading[2].length;
      const nextDepth = Math.min(6, originalDepth + headingDepth - 1);
      if (originalDepth === 1) foundTitle = true;
      out.push(`${heading[1]}${'#'.repeat(nextDepth)}${heading[3]}`);
      continue;
    }

    const rule = line.match(/^\s*r\[([a-zA-Z0-9_.-]+)\]\s*$/);
    if (rule) {
      out.push(`<a id="r-${rule[1]}" class="reference-rule-anchor" aria-label="Rule ${rule[1]}"></a>`);
      continue;
    }
    out.push(line);
  }

  if (fence) emitGrammarAnchors(fence);

  if (!foundTitle) out.splice(1, 0, `${'#'.repeat(headingDepth)} ${title}`);
  return out.join('\n').trimEnd();
}

function documentData(data, title) {
  // `title:` with no value parses to null, which the collection schema rejects —
  // treat it the same as an absent title rather than failing the build.
  return {
    ...data,
    ...(data.title == null ? { title } : {}),
  };
}

function bookDocument(referencesRoot, summaryPath) {
  const dir = dirname(summaryPath);
  const id = posix(relative(referencesRoot, dir));
  if (!id) return {
    error: 'references/SUMMARY.md is ambiguous; put each multi-file reference in references/<slug>/SUMMARY.md',
    summaryPath,
  };

  const parsedSummary = matter(readFileSync(summaryPath, 'utf8'));
  const listed = parseReferenceSummary(parsedSummary.content);
  const chapters = [];
  const missing = [];
  const invalid = [];
  const seen = new Set();

  for (const item of listed) {
    const sourcePath = resolve(dir, item.path);
    const key = posix(relative(dir, sourcePath));
    if (!isInside(dir, sourcePath)) {
      invalid.push(item.path);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    if (!existsSync(sourcePath) || !statSync(sourcePath).isFile()) {
      missing.push(item.path);
      continue;
    }
    const parsed = matter(readFileSync(sourcePath, 'utf8'));
    chapters.push({
      ...item,
      path: key,
      sourcePath,
      body: parsed.content,
    });
  }

  // Human-readable slugs are intentionally lossy (`foo_bar.md` and
  // `foo-bar.md` both become `foo-bar`), so assign document-unique variants
  // before either renderer sees the chapter list.
  const anchoredChapters = withReferenceChapterAnchors(chapters);

  const body = anchoredChapters
    .map(chapter => prepareReferenceChapter(chapter.body, chapter))
    .join('\n\n');
  const fallback = id.split('/').at(-1).replace(/-/g, ' ');
  const title = parsedSummary.data.title ?? markdownTitle(parsedSummary.content, fallback);
  return {
    id,
    kind: 'book',
    title,
    data: documentData(parsedSummary.data, title),
    body,
    sourcePath: summaryPath,
    dir,
    chapters: anchoredChapters,
    missing,
    invalid,
  };
}

function standaloneDocument(referencesRoot, sourcePath) {
  const parsed = matter(readFileSync(sourcePath, 'utf8'));
  const id = posix(relative(referencesRoot, sourcePath)).replace(/\.md$/i, '');
  const fallback = basename(sourcePath, '.md').replace(/-/g, ' ');
  const title = parsed.data.title ?? markdownTitle(parsed.content, fallback);
  return {
    id,
    kind: 'standalone',
    title,
    data: documentData(parsed.data, title),
    body: parsed.content,
    sourcePath,
    dir: dirname(sourcePath),
    chapters: [],
    missing: [],
    invalid: [],
  };
}

/** Discover standalone .md references and SUMMARY.md-backed reference books. */
export function discoverReferenceDocuments(referencesRoot) {
  const files = walkMarkdown(referencesRoot, { skipUnderscore: true });
  const summaries = files.filter(path => basename(path).toLowerCase() === SUMMARY_NAME);
  const books = summaries.map(path => bookDocument(referencesRoot, path));
  const bookRoots = summaries.map(dirname);
  const standalone = files
    .filter(path => basename(path).toLowerCase() !== SUMMARY_NAME)
    .filter(path => !bookRoots.some(root => isInside(root, path)))
    .map(path => standaloneDocument(referencesRoot, path));
  const documents = [...books, ...standalone].sort((a, b) => (a.id ?? '').localeCompare(b.id ?? ''));
  const seen = new Map();
  return documents.map(document => {
    if (!document.id || document.error) return document;
    const previous = seen.get(document.id);
    if (!previous) {
      seen.set(document.id, document.sourcePath);
      return document;
    }
    return {
      ...document,
      error: `duplicate reference id "${document.id}" from ${previous} and ${document.sourcePath}`,
    };
  });
}
