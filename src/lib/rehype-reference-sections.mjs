/**
 * Group a rendered reference into per-chapter `<section>` elements so the
 * browser can skip layout and paint for the parts nobody is reading.
 *
 * A book-sized reference is one HTML document — the Rust Reference bundled with
 * the example vault is ~4.6MB across ~72k nodes — and the browser lays out and
 * paints all of it before the page is usable. `content-visibility: auto` fixes
 * that, but only for content it can treat as a unit, and the assembled document
 * is a flat run of thousands of siblings. Applying containment to each sibling
 * is worse than none at all (the bookkeeping costs more than the small blocks
 * save), so chapters are the right granularity: a handful of large groups.
 *
 * Each section also carries a `contain-intrinsic-size` estimate. Without one
 * the browser guesses, the document reports a fraction of its real height, and
 * the scrollbar stretches as chapters render. The estimate below is built from
 * the block structure rather than a single character rate so it holds for both
 * prose- and code-heavy references; `auto` means the browser replaces it with
 * the true height once a chapter has been rendered, so the estimate only has to
 * be close, and only until first paint of that chapter.
 */
import { relative, isAbsolute, sep } from 'path';

// Rough rendered geometry of the reader column (`max-w-[760px]`, serif prose).
// These only feed a first-paint size estimate that `auto` later corrects.
const PROSE_CHARS_PER_LINE = 88;
const PROSE_LINE_HEIGHT = 28;
const CODE_LINE_HEIGHT = 21;
const BLOCK_MARGIN = 18;
const TABLE_ROW_HEIGHT = 37;

const HEADING_HEIGHT = { h1: 52, h2: 44, h3: 36, h4: 30, h5: 27, h6: 26 };

function textOf(node) {
  if (node.type === 'text') return node.value ?? '';
  if (node.type === 'raw') return '';
  return (node.children ?? []).map(textOf).join('');
}

function countLines(value) {
  return value.split('\n').length;
}

function wrappedHeight(text, charsPerLine = PROSE_CHARS_PER_LINE, lineHeight = PROSE_LINE_HEIGHT) {
  return Math.max(1, Math.ceil(text.length / charsPerLine)) * lineHeight;
}

function hasClass(node, name) {
  const className = node.properties?.className;
  if (Array.isArray(className)) return className.includes(name);
  return typeof className === 'string' && className.split(/\s+/).includes(name);
}

/** Estimate the rendered height of one block-level element, in CSS pixels. */
function estimateBlockHeight(node) {
  if (node.type !== 'element') return 0;
  const tag = node.tagName;
  const text = textOf(node);

  // Grammar-anchor containers hold nothing but empty `<a>` link targets and
  // render at zero height; the generic estimate below would otherwise charge a
  // full prose line for every anchor in them.
  if (hasClass(node, 'reference-grammar-anchors')) return 0;

  if (tag in HEADING_HEIGHT) {
    return HEADING_HEIGHT[tag] + wrappedHeight(text) - PROSE_LINE_HEIGHT + BLOCK_MARGIN;
  }
  if (tag === 'pre') {
    // Code does not wrap in this layout, so line count is the whole story.
    return countLines(text.replace(/\n$/, '')) * CODE_LINE_HEIGHT + BLOCK_MARGIN * 2;
  }
  if (tag === 'table') {
    const rows = [];
    const walk = element => {
      for (const child of element.children ?? []) {
        if (child.type === 'element' && child.tagName === 'tr') rows.push(child);
        else walk(child);
      }
    };
    walk(node);
    return Math.max(1, rows.length) * TABLE_ROW_HEIGHT + BLOCK_MARGIN;
  }
  if (tag === 'ul' || tag === 'ol') {
    const items = (node.children ?? []).filter(
      child => child.type === 'element' && child.tagName === 'li',
    );
    return items.reduce((total, item) => total + wrappedHeight(textOf(item)), 0) + BLOCK_MARGIN;
  }
  if (tag === 'blockquote' || tag === 'figure' || tag === 'div') {
    const inner = (node.children ?? []).reduce(
      (total, child) => total + estimateBlockHeight(child),
      0,
    );
    return (inner || wrappedHeight(text)) + BLOCK_MARGIN;
  }
  if (tag === 'svg' || tag === 'img') return 320;
  if (tag === 'hr') return BLOCK_MARGIN * 2;

  return wrappedHeight(text) + BLOCK_MARGIN;
}

function isInside(root, path) {
  const rel = relative(root, path);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

/**
 * Wrap each `<h2>`-delimited chapter of a reference document in a contained
 * `<section>`. Applies only to files under `referencesRoot`; every other
 * collection passes through untouched.
 */
export function rehypeReferenceSections({ referencesRoot } = {}) {
  return (tree, file) => {
    const path = file?.path ?? file?.history?.[0];
    if (!referencesRoot || !path || !isInside(referencesRoot, path)) return;

    const children = tree.children ?? [];
    if (children.length === 0) return;

    const sections = [];
    let current = null;
    const open = () => {
      current = {
        type: 'element',
        tagName: 'section',
        properties: { className: ['reference-chapter'] },
        children: [],
      };
      sections.push(current);
    };

    for (const node of children) {
      const startsChapter = node.type === 'element' && node.tagName === 'h2';
      if (startsChapter || !current) open();
      current.children.push(node);
    }

    // A single section would contain the whole document, which is the case
    // containment cannot help with — leave such documents alone.
    if (sections.length < 2) return;

    for (const section of sections) {
      const height = section.children.reduce(
        (total, node) => total + estimateBlockHeight(node),
        0,
      );
      section.properties.style = `contain-intrinsic-size: auto ${Math.max(120, Math.round(height))}px`;
    }

    tree.children = sections;
  };
}
