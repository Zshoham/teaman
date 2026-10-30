/**
 * Hold hand-written block svg in the diagram scroller.
 *
 * Svg images and compiled diagram fences reach the page already wrapped in
 * `.diagram-scroll` (svg-markup.mjs `diagramScroll`), which keeps a wide
 * drawing at --diagram-min-width on a phone and scrolls it instead of setting
 * its labels at a few pixels. An `<svg>` written straight into a note — on
 * its own or in a `<figure>` — is a raw HTML block, so it gets the same
 * scroller here, around the svg alone: a figure's caption stays put.
 *
 * Only raw HTML that stands as a block (a child of the document, a quote or
 * a list item) is touched; an svg inside a paragraph, heading or table cell is
 * inline markup, an icon rather than a drawing. Runs before Astro's own
 * rehype-raw, so the HTML is still a `raw` string here.
 */
import { withRawSvgScroll } from './svg-markup.mjs';

const BLOCK_PARENTS = new Set(['blockquote', 'li']);

function isBlockParent(node) {
  return node.type === 'root' || (node.type === 'element' && BLOCK_PARENTS.has(node.tagName));
}

function wrap(node) {
  if (!node.children) return;
  const block = isBlockParent(node);
  for (const child of node.children) {
    if (child.type === 'raw') {
      if (block) child.value = withRawSvgScroll(child.value);
    } else {
      wrap(child);
    }
  }
}

export function rehypeRawSvg() {
  return tree => wrap(tree);
}
