import { dirname, posix as path } from 'path';
import { fenceInfoLanguage } from './diagram-kinds.mjs';

/**
 * A reference book's layout: how its chapters are joined into one document,
 * and every identifier in that document — each chapter's anchor, each
 * heading's id, the ids raw HTML declares, and where a link written between
 * the chapter files lands once they are one page. The site (the
 * `remarkReferenceBooks` plugin) and the PDF (`renderReferenceTypst`) are two
 * renderers of one layout: each reads its own syntax tree for the facts —
 * heading texts and declared HTML ids, per chapter — and asks
 * `layoutReferenceBook` for the identifiers, so a link that works on the page
 * works in the PDF.
 */

const MARKER_PREFIX = 'teaman-reference-chapter:';
const HTML_ID_RE = /(\sid\s*=\s*)(["'])([^"']+)\2/gi;

// ── Chapters ─────────────────────────────────────────────────────────────────

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

/**
 * The chapter a marker comment (from `prepareReferenceChapter`) opens, or null
 * for any other HTML.
 *
 * @param {string} value
 * @returns {{ path: string, anchor: string } | null}
 */
export function parseChapterMarker(value) {
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

function normalizeFenceLanguage(info) {
  const language = fenceInfoLanguage(info);
  if (/^(?:compile_fail|ignore|no_run|should_panic|edition\d+|e\d+)$/i.test(language)) return 'rust';
  return language === 'grammar' ? 'text' : language;
}

/**
 * Make a chapter safe to concatenate: open it with its marker, keep fences
 * intact, normalize mdBook fence annotations, promote its title into the
 * combined outline, and turn Rust Reference rule labels into real anchors.
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
          grammar: fenceInfoLanguage(fenceMatch[3]) === 'grammar',
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

/**
 * Join a book's chapters, in order, into one Markdown document. Each chapter
 * gets a document-unique `anchor` (human-readable slugs are lossy:
 * `foo_bar.md` and `foo-bar.md` both become `foo-bar`) and its `preparedBody`,
 * which opens with the marker the renderers find it by.
 *
 * @template {{ path: string, title: string, depth?: number, body: string, anchor?: string }} C
 * @param {C[]} chapters
 * @returns {{ chapters: Array<C & { anchor: string, preparedBody: string }>, body: string }}
 */
export function assembleReferenceBook(chapters) {
  const prepared = withReferenceChapterAnchors(chapters).map(chapter => ({
    ...chapter,
    preparedBody: prepareReferenceChapter(chapter.body, chapter),
  }));
  return { chapters: prepared, body: prepared.map(chapter => chapter.preparedBody).join('\n\n') };
}

// ── Identifiers ──────────────────────────────────────────────────────────────

/**
 * mdBook's `normalize_id`, which is what an imported book's own `#fragment`
 * links were written against: Unicode lowercase, each whitespace character
 * becomes a dash, everything else is dropped. Deliberately no trimming and no
 * collapsing of runs — ``## Shared references (`&`)`` really does end up as
 * `shared-references-`, and matching that exactly is the whole point.
 */
export function referenceBookHeadingSlug(value) {
  return value
    .toLowerCase()
    .replace(/\s/g, '-')
    .replace(/[^\p{L}\p{N}_-]/gu, '');
}

/** Every id a piece of raw HTML declares. */
export function htmlIds(value) {
  return Array.from(value.matchAll(new RegExp(HTML_ID_RE.source, 'gi')), match => match[3]);
}

/**
 * Where an id declared by raw HTML in a chapter (the Rust Reference uses
 * `<span id="field-less-enum">` as a link target) ends up: namespaced by the
 * chapter, as heading ids are, so it survives the join. Rule anchors (`r-…`)
 * are already document-global.
 */
export function referenceBookHtmlAnchor(id, chapterAnchor) {
  return id.startsWith('r-') ? id : `${chapterAnchor}--${id}`;
}

/** Raw HTML with each id it declares namespaced (`referenceBookHtmlAnchor`). */
export function namespaceHtmlIds(value, chapterAnchor) {
  return value.replace(
    new RegExp(HTML_ID_RE.source, 'gi'),
    (_match, prefix, quote, id) => `${prefix}${quote}${referenceBookHtmlAnchor(id, chapterAnchor)}${quote}`,
  );
}

/**
 * The ids of one chapter's headings, in order. The first heading — the
 * chapter's title — takes the chapter anchor, which is what a fragment-less
 * `chapter.md` link lands on; every other is `<anchor>--<mdBook id>`, numbered
 * as mdBook numbers repeats (the title still takes a slot: a later heading
 * with the same text is `<slug>-1`, and links were written against that).
 *
 * @param {string} chapterAnchor
 * @param {string[]} headings  heading texts, as mdBook reads them
 */
function chapterHeadingIds(chapterAnchor, headings) {
  const counts = new Map();
  return headings.map((text, index) => {
    const base = referenceBookHeadingSlug(text) || 'section';
    const count = counts.get(base) ?? 0;
    counts.set(base, count + 1);
    return index === 0 ? chapterAnchor : `${chapterAnchor}--${base}${count ? `-${count}` : ''}`;
  });
}

// ── Layout ───────────────────────────────────────────────────────────────────

function splitUrl(url) {
  const hash = url.indexOf('#');
  return hash === -1 ? [url, ''] : [url.slice(0, hash), url.slice(hash + 1)];
}

function decodeUrlPart(value) {
  try { return decodeURIComponent(value); } catch { return value; }
}

const EXTERNAL = /^(?:[a-z][a-z\d+.-]*:|\/\/|\/)/i;

/**
 * @typedef {object} ReferenceBookLayout
 * @property {(chapterPath: string) => string[]} headingIds  the ids of a
 *   chapter's headings, in the order they were given
 * @property {(id: string, chapterPath: string) => string} htmlId  where an id
 *   raw HTML declares in a chapter ends up
 * @property {Set<string>} targets  every id the assembled document declares
 * @property {(url: string, chapterPath: string, options?: { image?: boolean }) => string} rewrite
 *   a link or image URL written in a chapter, as it reads in the assembled
 *   document: a link to a chapter file (`.md`/`.html`, any `#fragment`) or to
 *   a declared rule becomes `#<id>`; an image path becomes relative to the
 *   book; anything else is left alone
 */

/**
 * Lay out a book from what its renderer read of each chapter.
 *
 * @param {Array<{ path: string, anchor: string, headings: string[], htmlIds?: string[] }>} chapters
 *   in order: each chapter's path in the book, its anchor (from
 *   `assembleReferenceBook`), its heading texts in document order, and the
 *   ids its raw HTML declares
 * @returns {ReferenceBookLayout}
 */
export function layoutReferenceBook(chapters) {
  const anchors = new Map(chapters.map(chapter => [chapter.path, chapter.anchor]));
  const ids = new Map(chapters.map(chapter => [chapter.path, chapterHeadingIds(chapter.anchor, chapter.headings)]));
  // A link written against a chapter's title heading lands on the chapter.
  const titleSlugs = new Map(chapters.filter(chapter => chapter.headings.length > 0)
    .map(chapter => [chapter.path, referenceBookHeadingSlug(chapter.headings[0]) || 'section']));
  const anchorOf = chapterPath => anchors.get(chapterPath) ?? referenceChapterAnchor(chapterPath);
  const htmlId = (id, chapterPath) => referenceBookHtmlAnchor(id, anchorOf(chapterPath));
  const targets = new Set(chapters.flatMap(chapter => [
    ...ids.get(chapter.path),
    ...(chapter.htmlIds ?? []).map(id => htmlId(id, chapter.path)),
  ]));

  const fragmentAnchor = (target, fragment) => (fragment === titleSlugs.get(target)
    ? anchorOf(target)
    : `${anchorOf(target)}--${fragment}`);

  function rewrite(url, chapterPath, { image = false } = {}) {
    if (!url || EXTERNAL.test(url)) return url;
    const [encodedPathname, encodedFragment] = splitUrl(url);
    const pathname = decodeUrlPart(encodedPathname);
    const fragment = decodeUrlPart(encodedFragment);
    if (EXTERNAL.test(pathname)) return url;
    const chapterDir = dirname(chapterPath);

    if (!pathname) {
      if (!fragment) return url;
      if (fragment.startsWith('r-')) return `#${fragment}`;
      return `#${fragmentAnchor(chapterPath, fragment)}`;
    }

    // Some book preprocessors use an extensionless destination as a symbolic
    // rule reference. Rewrite it only when the assembled document actually
    // declares that rule, so ordinary extensionless web links remain untouched.
    const directRule = pathname.replace(/^\.\//, '');
    if (!fragment && targets.has(`r-${directRule}`)) return `#r-${directRule}`;

    const resolved = path.normalize(path.join(chapterDir, pathname));
    if (resolved === '..' || resolved.startsWith('../')) return url;
    if (/\.(?:md|html)$/i.test(resolved)) {
      const target = resolved.replace(/\.html$/i, '.md');
      if (fragment.startsWith('r-')) return `#${fragment}`;
      if (!fragment) return `#${anchorOf(target)}`;
      return `#${fragmentAnchor(target, fragment)}`;
    }
    if (!image) return url;
    // Resolution runs on the decoded path, but the emitted href has to keep the
    // original percent-encoding: `img/a%23b.png` written out decoded would be
    // read as the fragment `#b.png` on a truncated path, and the image 404s.
    const encodedResolved = path.normalize(path.join(chapterDir, encodedPathname));
    return `${encodedResolved}${encodedFragment ? `#${encodedFragment}` : ''}`;
  }

  return {
    headingIds: chapterPath => ids.get(chapterPath) ?? [],
    htmlId,
    targets,
    rewrite,
  };
}
