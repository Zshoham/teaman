/**
 * Shared handling for SVG that gets inlined into a page — whether it came from
 * a vault `.svg` file (remark-inline-svg) or a build-time compiler
 * (remark-fence-svg). Both have to find the root tag in a file that may open
 * with a BOM, XML prolog, doctype or comments, and both merge classes into it.
 */

/** Trim a source to its root `<svg>` tag, or null when there isn't one. */
export function svgRootOf(source) {
  const start = source.search(/<svg[\s>]/i);
  return start === -1 ? null : source.slice(start).trim();
}

/**
 * Merge classes into an svg's opening tag, preserving any it already carries.
 * @param {string} svg  markup whose first tag is the `<svg>` root
 * @param {string[]} classes
 */
export function withSvgClass(svg, classes) {
  const added = classes.filter(Boolean).join(' ');
  return svg.replace(/<svg\b[^>]*>/i, (tag) =>
    /\bclass\s*=\s*"/i.test(tag)
      ? tag.replace(/\bclass\s*=\s*"([^"]*)"/i, (_, existing) => `class="${existing} ${added}"`)
      : tag.replace(/<svg/i, `<svg class="${added}"`),
  );
}

/**
 * Wrap a block-level svg in the scroller the prose styles give a minimum
 * rendered width: a wide diagram shrunk to a phone column would set its labels
 * at a few pixels, so below that width it keeps its size and scrolls sideways
 * inside the wrapper instead (see `.diagram-scroll` in global.css).
 *
 * `width` is the drawing's natural width in px, for an svg that sizes itself
 * (hand-written markup, often `width="100%"`) rather than through the
 * `content-svg` rules: the scroller hands it to the styles as
 * `--diagram-width`, so the floor never enlarges a drawing narrower than it.
 * @param {string} svg
 * @param {number | null} [width]
 */
export function diagramScroll(svg, width = null) {
  const style = width ? ` style="--diagram-width: ${width}px"` : '';
  return `<div class="diagram-scroll"${style}>${svg}</div>`;
}

const SVG_TAG = /<(\/?)svg(?=[\s/>])[^>]*?(\/?)>/gi;

/**
 * Where the svg a raw HTML block draws sits in it: the first top-level
 * `<svg>…</svg>` element, nested svg elements included, as `[start, end)`
 * offsets — or null when the block has no complete one. A hand-written
 * `<figure>` keeps its `<figcaption>` outside this span. The site wraps the
 * span in the diagram scroller and the reference PDF draws it, so both see
 * the same drawing.
 * @param {string} html
 * @returns {{ start: number, end: number } | null}
 */
export function rawSvgSpan(html) {
  let depth = 0;
  let start = -1;
  for (const match of html.matchAll(SVG_TAG)) {
    const [tag, closing, selfClosing] = match;
    if (closing) {
      if (depth > 0 && --depth === 0) return { start, end: match.index + tag.length };
    } else {
      if (depth === 0) start = match.index;
      if (!selfClosing) depth++;
      else if (depth === 0) return { start, end: match.index + tag.length };
    }
  }
  return null;
}

/**
 * The natural width, in px, of an svg's root tag: its `width` when that is
 * an absolute length in px (or unitless), else its viewBox width — the size
 * its text was set for. Null when neither says.
 * @param {string} svg  markup whose first tag is the `<svg>` root
 */
export function svgNaturalWidth(svg) {
  const root = svg.match(/^<svg\b[^>]*>/i)?.[0] ?? '';
  const width = root.match(/\swidth\s*=\s*["']?\s*(\d+(?:\.\d+)?)\s*(?:px)?\s*(?=["'\s/>])/i);
  if (width) return Number(width[1]) || null;
  const viewBox = root.match(/\sviewBox\s*=\s*["']\s*(?:[-+\d.e]+[\s,]+){2}(\d+(?:\.\d+)?)/i);
  return viewBox ? Number(viewBox[1]) || null : null;
}

/**
 * A raw HTML block with its svg (see rawSvgSpan) held in the diagram
 * scroller, as the pipeline holds svg images and compiled fences; a block
 * with none comes back unchanged.
 * @param {string} html
 */
export function withRawSvgScroll(html) {
  const span = rawSvgSpan(html);
  if (!span) return html;
  // Remark's SVG images and compiled fences already carry this wrapper.
  // Wrapping them again gives the inner scroller the drawing's full width,
  // so the outer one scrolls instead and the figure's sizing rules break.
  const before = html.slice(0, span.start);
  if (/<div class="diagram-scroll"(?: style="[^"]*")?>\s*$/.test(before)) return html;
  const svg = html.slice(span.start, span.end);
  return before + diagramScroll(svg, svgNaturalWidth(svg)) + html.slice(span.end);
}
