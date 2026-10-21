/**
 * SUMMARY-indexed books: a directory whose `SUMMARY.md` lists its chapters,
 * mdBook-style. A guide is one (`guides/<slug>/`), and so is a multi-file
 * reference (`references/<slug>/`). What a book's chapters are — listed, in
 * order, once each, existing, and inside its directory — is decided here, so
 * the site, the reference PDF, the wiki-link index, and `doctor` agree on it.
 * Publication (drafted chapters) is the vault catalog's.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { basename, dirname, join, relative, resolve } from 'path';
import matter from 'gray-matter';
import MarkdownIt from 'markdown-it';
import { isInside, toPosix } from './fs-walk.mjs';

const summaryMarkdown = new MarkdownIt();

/**
 * Is this file a book's chapter index? A reference book's may be spelled in
 * any case; a guide's must be `SUMMARY.md` (`caseSensitive`), which is what
 * the `guideSummaries` collection globs for.
 *
 * @param {string} path
 * @param {{ caseSensitive?: boolean }} [options]
 */
export function isSummaryFile(path, { caseSensitive = false } = {}) {
  const name = basename(path);
  return caseSensitive ? name === 'SUMMARY.md' : name.toLowerCase() === 'summary.md';
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
export function parseSummary(source, { rootRelative = false } = {}) {
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

/**
 * `relPath` under `dir` as the directory listings spell it. On a
 * case-insensitive filesystem SUMMARY.md can name `Intro.md` for `intro.md`
 * and still open it; every other reader (the collections, the walks,
 * Confluence) knows the file by its on-disk name, so a chapter is recorded
 * under that. A segment no entry matches exactly takes the one entry that
 * matches ignoring case; an exact match or an ambiguous one keeps the
 * spelling as written, so on a case-sensitive filesystem nothing changes.
 *
 * @param {string} dir
 * @param {string} relPath  `/`-separated, inside `dir`
 * @param {(dir: string) => string[]} [readdir]
 */
export function onDiskPath(dir, relPath, readdir = readdirSync) {
  let current = dir;
  for (const segment of relPath.split('/')) {
    let names;
    try { names = readdir(current); } catch { names = []; }
    const folded = names.filter(name => name.toLowerCase() === segment.toLowerCase());
    current = join(current, names.includes(segment) || folded.length !== 1 ? segment : folded[0]);
  }
  return current;
}

/**
 * Read the book a SUMMARY.md indexes.
 *
 * - `chapters`: what it lists that is a file inside its directory, in order,
 *   first listing wins — each `{ path, title, depth, sourcePath }`, with
 *   `path` relative to the book's directory, `/`-separated, both spelled as
 *   on disk (`onDiskPath`);
 * - `missing` / `invalid`: listed paths that are not a file, or that leave the
 *   directory — the book cannot be built (see `bookProblems`).
 *
 * @param {string} summaryPath
 * @param {{ rootRelative?: boolean }} [options]  see `parseSummary`
 */
export function readBook(summaryPath, { rootRelative = false } = {}) {
  const dir = dirname(summaryPath);
  const { data, content } = matter(readFileSync(summaryPath, 'utf8'));
  const chapters = [];
  const missing = [];
  const invalid = [];
  const seen = new Set();
  for (const item of parseSummary(content, { rootRelative })) {
    const listed = resolve(dir, item.path);
    if (!isInside(dir, listed)) {
      invalid.push(item.path);
      continue;
    }
    const exists = existsSync(listed) && statSync(listed).isFile();
    const sourcePath = exists ? onDiskPath(dir, toPosix(relative(dir, listed))) : listed;
    const path = toPosix(relative(dir, sourcePath));
    if (seen.has(path)) continue;
    seen.add(path);
    if (!exists) missing.push(item.path);
    else chapters.push({ ...item, path, sourcePath });
  }
  return { dir, data, content, chapters, missing, invalid };
}

/**
 * What keeps a book — a reference book, or a guide from the vault catalog —
 * from building: an unusable SUMMARY.md, no chapters (a reference book), or
 * a listed chapter that is missing or outside the book's directory. The
 * reference loader, the guide pages, the PDF build, and `doctor` all report
 * through this.
 *
 * @param {{ id?: string, kind?: string, error?: string, chapters?: unknown[], missing?: string[], invalid?: string[] }} book
 * @returns {string[]}
 */
export function bookProblems(book) {
  if (book.error) return [book.error];
  const problems = [];
  if (book.kind === 'book' && book.chapters.length === 0) {
    problems.push(`${book.id}/SUMMARY.md lists no Markdown chapters`);
  }
  for (const chapter of book.missing ?? []) {
    problems.push(`${book.id}/SUMMARY.md points at missing chapter ${chapter}`);
  }
  for (const chapter of book.invalid ?? []) {
    problems.push(`${book.id}/SUMMARY.md points outside its directory (${chapter})`);
  }
  return problems;
}
