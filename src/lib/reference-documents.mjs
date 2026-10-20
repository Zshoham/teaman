import { readFileSync } from 'fs';
import { basename, dirname, relative } from 'path';
import matter from 'gray-matter';
import { isSummaryFile, readBook } from './books.mjs';
import { entryId } from './entry-identity.mjs';
import { isInside, toPosix, walkMarkdown } from './fs-walk.mjs';

const MARKER_PREFIX = 'teaman-reference-chapter:';

function markdownTitle(source, fallback) {
  const match = source.match(/^\s{0,3}#\s+(.+?)\s*#*\s*$/m);
  return match?.[1]?.replace(/\s+\{#[^}]+\}\s*$/, '').trim() || fallback;
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
  const relDir = toPosix(relative(referencesRoot, dir));
  // A book is named by its directory; `.md` stands in for the extension
  // `entryId` strips, so a dotted directory name keeps its last segment.
  const id = relDir && entryId('reference', `${relDir}.md`);
  if (!id) return {
    error: 'references/SUMMARY.md is ambiguous; put each multi-file reference in references/<slug>/SUMMARY.md',
    summaryPath,
  };

  const book = readBook(summaryPath);
  const chapters = book.chapters.map(chapter => ({
    ...chapter,
    body: matter(readFileSync(chapter.sourcePath, 'utf8')).content,
  }));

  // Human-readable slugs are intentionally lossy (`foo_bar.md` and
  // `foo-bar.md` both become `foo-bar`), so assign document-unique variants
  // before either renderer sees the chapter list.
  const anchoredChapters = withReferenceChapterAnchors(chapters);

  const body = anchoredChapters
    .map(chapter => prepareReferenceChapter(chapter.body, chapter))
    .join('\n\n');
  const fallback = id.split('/').at(-1).replace(/-/g, ' ');
  const title = book.data.title ?? markdownTitle(book.content, fallback);
  return {
    id,
    kind: 'book',
    title,
    data: documentData(book.data, title),
    body,
    sourcePath: summaryPath,
    dir,
    chapters: anchoredChapters,
    missing: book.missing,
    invalid: book.invalid,
  };
}

function standaloneDocument(referencesRoot, sourcePath) {
  const parsed = matter(readFileSync(sourcePath, 'utf8'));
  const id = entryId('reference', toPosix(relative(referencesRoot, sourcePath)), parsed.data);
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
  const summaries = files.filter(isSummaryFile);
  const books = summaries.map(path => bookDocument(referencesRoot, path));
  const bookRoots = summaries.map(dirname);
  const standalone = files
    .filter(path => !isSummaryFile(path))
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
