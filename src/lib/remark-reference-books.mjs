import { dirname, posix as path } from 'path';
import { parseReferenceChapterMetadata, referenceChapterAnchor } from './reference-documents.mjs';

/**
 * The text mdBook derives a heading id from: its text and inline-code content,
 * joined. Raw HTML inside a heading contributes nothing, but the angle brackets
 * of `` `Box<T>` `` are code *content* rather than markup — stripping them as
 * tags would turn that heading into `box` and break every link to it.
 */
function headingText(node) {
  return (node.children ?? []).map(child => {
    if (child.type === 'html') return '';
    if (typeof child.value === 'string') return child.value;
    return headingText(child);
  }).join('');
}

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

function visit(node, callback) {
  callback(node);
  for (const child of node.children ?? []) visit(child, callback);
}

/**
 * Namespace ids declared by raw HTML in a chapter body (the Rust Reference uses
 * `<span id="field-less-enum">` as a link target), so they survive the join the
 * same way heading ids do. Rule anchors are already document-global.
 */
export function referenceBookHtmlAnchor(
  id,
  chapterPath,
  chapterAnchor = referenceChapterAnchor(chapterPath),
) {
  return id.startsWith('r-')
    ? id
    : `${chapterAnchor}--${id}`;
}

function namespaceHtmlIds(value, chapterPath, chapterAnchor) {
  return value.replace(
    /(\sid\s*=\s*)(["'])([^"']+)\2/gi,
    (_match, prefix, quote, id) =>
      `${prefix}${quote}${referenceBookHtmlAnchor(id, chapterPath, chapterAnchor)}${quote}`,
  );
}

function splitUrl(url) {
  const hash = url.indexOf('#');
  return hash === -1 ? [url, ''] : [url.slice(0, hash), url.slice(hash + 1)];
}

function decodeUrlPart(value) {
  try { return decodeURIComponent(value); } catch { return value; }
}

function chapterAnchorFor(chapterPath, chapterAnchors) {
  return chapterAnchors.get(chapterPath) ?? referenceChapterAnchor(chapterPath);
}

/**
 * Where `#fragment` of `target` ends up in the assembled document. A chapter's
 * own title heading keeps the bare chapter anchor — it is what a fragment-less
 * `file.md` link resolves to — so links written against that heading's mdBook
 * id have to land there rather than on a `--<title>` id that never exists.
 */
function fragmentAnchor(target, fragment, titleSlugs, chapterAnchors) {
  const anchor = chapterAnchorFor(target, chapterAnchors);
  return fragment === titleSlugs.get(target) ? anchor : `${anchor}--${fragment}`;
}

export function rewriteReferenceBookUrl(
  url,
  chapterPath,
  titleSlugs,
  image = false,
  chapterAnchors = new Map(),
  internalTargets = new Set(),
) {
  if (!url || /^(?:[a-z][a-z\d+.-]*:|\/\/|\/)/i.test(url)) return url;
  const [encodedPathname, encodedFragment] = splitUrl(url);
  const pathname = decodeUrlPart(encodedPathname);
  const fragment = decodeUrlPart(encodedFragment);
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/|\/)/i.test(pathname)) return url;
  const chapterDir = dirname(chapterPath);

  if (!pathname) {
    if (!fragment) return url;
    if (fragment.startsWith('r-')) return `#${fragment}`;
    return `#${fragmentAnchor(chapterPath, fragment, titleSlugs, chapterAnchors)}`;
  }

  // Some book preprocessors use an extensionless destination as a symbolic
  // rule reference. Rewrite it only when the assembled document actually
  // declares that rule, so ordinary extensionless web links remain untouched.
  const directRule = pathname.replace(/^\.\//, '');
  if (!fragment && internalTargets.has(`r-${directRule}`)) return `#r-${directRule}`;

  const resolved = path.normalize(path.join(chapterDir, pathname));
  if (resolved === '..' || resolved.startsWith('../')) return url;
  if (/\.(?:md|html)$/i.test(resolved)) {
    const target = resolved.replace(/\.html$/i, '.md');
    if (fragment.startsWith('r-')) return `#${fragment}`;
    if (!fragment) return `#${chapterAnchorFor(target, chapterAnchors)}`;
    return `#${fragmentAnchor(target, fragment, titleSlugs, chapterAnchors)}`;
  }
  if (!image) return url;
  // Resolution runs on the decoded path, but the emitted href has to keep the
  // original percent-encoding: `img/a%23b.png` written out decoded would be
  // read as the fragment `#b.png` on a truncated path, and the image 404s.
  const encodedResolved = path.normalize(path.join(chapterDir, encodedPathname));
  return `${encodedResolved}${encodedFragment ? `#${encodedFragment}` : ''}`;
}

/** The mdBook id of each chapter's own title heading, keyed by chapter path. */
function chapterTitleSlugs(tree) {
  const slugs = new Map();
  let chapterPath = null;

  for (const child of tree.children) {
    if (child.type === 'html') {
      const metadata = parseReferenceChapterMetadata(child.value);
      if (metadata) {
        chapterPath = metadata.path;
        continue;
      }
    }
    if (!chapterPath || slugs.has(chapterPath)) continue;
    visit(child, node => {
      if (node.type !== 'heading' || slugs.has(chapterPath)) return;
      slugs.set(chapterPath, referenceBookHeadingSlug(headingText(node)) || 'section');
    });
  }

  return slugs;
}

/** Fix chapter-local identifiers and links after reference chapters are joined. */
export function remarkReferenceBooks() {
  return tree => {
    const titleSlugs = chapterTitleSlugs(tree);
    const chapterAnchors = new Map();
    const internalTargets = new Set();
    visit(tree, node => {
      if (node.type !== 'html') return;
      const metadata = parseReferenceChapterMetadata(node.value);
      if (metadata) chapterAnchors.set(metadata.path, metadata.anchor);
      for (const match of node.value.matchAll(/\sid\s*=\s*(["'])([^"']+)\1/gi)) {
        internalTargets.add(match[2]);
      }
    });
    let chapterPath = null;
    let chapterAnchor = null;
    let firstHeading = false;
    let headingCounts = new Map();

    for (const child of tree.children) {
      if (child.type === 'html') {
        const metadata = parseReferenceChapterMetadata(child.value);
        if (metadata) {
          chapterPath = metadata.path;
          chapterAnchor = metadata.anchor;
          firstHeading = true;
          headingCounts = new Map();
          child.value = '';
          continue;
        }
      }
      if (!chapterPath) continue;

      visit(child, node => {
        const anchor = chapterAnchor;
        if (node.type === 'heading') {
          const base = referenceBookHeadingSlug(headingText(node)) || 'section';
          // The title still takes a slot: mdBook numbers a later heading with
          // the same text `<slug>-1`, and links were written against that.
          const count = headingCounts.get(base) ?? 0;
          headingCounts.set(base, count + 1);
          node.data ??= {};
          node.data.hProperties ??= {};
          node.data.hProperties.id = firstHeading
            ? anchor
            : `${anchor}--${base}${count ? `-${count}` : ''}`;
          firstHeading = false;
        }
        if (node.type === 'html') {
          node.value = namespaceHtmlIds(node.value, chapterPath, anchor);
        }
        if (node.type === 'definition' || node.type === 'link' || node.type === 'image') {
          node.url = rewriteReferenceBookUrl(
            node.url,
            chapterPath,
            titleSlugs,
            node.type === 'image',
            chapterAnchors,
            internalTargets,
          );
        }
        if (['definition', 'linkReference', 'imageReference', 'footnoteDefinition', 'footnoteReference'].includes(node.type)) {
          node.identifier = `${anchor}:${node.identifier}`;
        }
      });
    }
  };
}
