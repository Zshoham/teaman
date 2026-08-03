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
