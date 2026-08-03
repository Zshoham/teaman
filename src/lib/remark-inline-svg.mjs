/** Inlines local `.svg` markdown images (`![alt](/images/x.svg)`) into the page
 *  as raw HTML at build time. An SVG referenced through `<img>` renders in its
 *  own document — it can't see the page's `data-theme` attribute or CSS custom
 *  properties, so it could never follow the light/dark toggle. Inlined,
 *  `currentColor` and `var(--primary)`-style theme tokens resolve against the
 *  page and the graphic is theme-reactive for free.
 *
 *  In an Obsidian vault attachments live anywhere — next to the note, in an
 *  `attachments/` folder — so a relative URL resolves against the note's own
 *  directory first (the vfile carries the note path), then against `roots` in
 *  order (vault root, the CLI's staged public dir, `<vault>/public`, engine
 *  `resources/`). Remote URLs and non-SVG images pass through untouched; a
 *  local `.svg` that resolves to no file warns and stays an `<img>`. The SVG
 *  is the author's own vault content, inserted raw exactly like inline HTML
 *  in markdown, so it is not sanitized. */
import { existsSync, readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { escapeAttr } from './html-escape.mjs';
import { replaceChildren } from './mdast-walk.mjs';
import { svgRootOf, withSvgClass } from './svg-markup.mjs';

// A local `.svg` url → absolute file, first hit wins. `false` means "not ours
// to inline" (remote, non-svg); `null` means "should exist but doesn't" so the
// caller can warn.
function resolveSvg(url, roots, noteDir) {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(url)) return false;
  const path = decodeURIComponent(url.split(/[?#]/)[0]);
  if (!path.toLowerCase().endsWith('.svg')) return false;
  const rel = path.replace(/^\/+/, '');
  if (!rel) return false;
  const candidates = [
    ...(noteDir && !path.startsWith('/') ? [resolve(noteDir, path)] : []),
    ...roots.map((root) => join(root, rel)),
  ];
  return candidates.find(existsSync) ?? null;
}

// Trim to the root <svg> tag (dropping BOM/XML prolog/doctype/comments) and
// fold the markdown image's semantics into it: a `content-svg` class for the
// prose styles, and the alt text as both the accessible name and a nested
// <title> element — the svg equivalent of an <img> title, so hovering the
// graphic shows the alt as a native tooltip. Empty alt marks it `aria-hidden`,
// mirroring how an empty `alt=""` marks an <img> decorative.
export function decorateSvg(source, alt) {
  const root = svgRootOf(source);
  if (root === null) return null;
  let svg = withSvgClass(root, ['content-svg']).replace(/<svg\b[^>]*>/i, (tag) => {
    let out = tag;
    if (alt) {
      if (!/\brole\s*=/i.test(out)) out = out.replace(/<svg/i, '<svg role="img"');
      if (!/\baria-label\s*=/i.test(out)) {
        out = out.replace(/<svg/i, `<svg aria-label="${escapeAttr(alt)}"`);
      }
    } else if (!/\baria-(hidden|label)\s*=/i.test(out) && !/\brole\s*=/i.test(out)) {
      out = out.replace(/<svg/i, '<svg aria-hidden="true"');
    }
    return out;
  });
  // A <title> anywhere in the file (a root one, or per-shape tooltips the
  // author placed themselves) wins — don't stack a second tooltip on top.
  if (alt && !/<title[\s>]/i.test(svg)) {
    svg = svg.replace(/<svg\b[^>]*>/i, (tag) => `${tag}<title>${escapeAttr(alt)}</title>`);
  }
  return svg;
}

// A paragraph that is exactly one svg image is a block figure: the alt renders
// as a visible <figcaption> (picking up the prose caption styling), replacing
// the paragraph node so no <figure> ends up nested inside a <p>.
function renderBlock(svg, alt) {
  if (!alt) return svg;
  return `<figure class="content-figure">${svg}<figcaption>${escapeAttr(alt)}</figcaption></figure>`;
}

/** @param {{ roots?: string[] }} [options] */
export function remarkInlineSvg({ roots = [] } = {}) {
  return (tree, file) => {
    const notePath = file?.path ?? file?.history?.[0];
    const noteDir = notePath ? dirname(notePath) : undefined;

    // The decorated svg markup for an image node, or null to leave it alone.
    const inlineSvg = (image) => {
      const svgFile = resolveSvg(image.url, roots, noteDir);
      if (svgFile === false) return null;
      if (svgFile === null) {
        console.warn(`[teaman] svg image not found in vault: ${image.url}`);
        return null;
      }
      const svg = decorateSvg(readFileSync(svgFile, 'utf8'), image.alt ?? '');
      if (svg === null) {
        console.warn(`[teaman] ${image.url} has no <svg> root — left as <img>`);
      }
      return svg;
    };

    const isImage = (node) => node?.type === 'image' && typeof node.url === 'string';

    replaceChildren(tree, (node) => {
      if (node.type === 'paragraph' && node.children.length === 1 && isImage(node.children[0])) {
        const image = node.children[0];
        const svg = inlineSvg(image);
        // `null` either way: an image we couldn't inline is still ours, so the
        // walk must not descend and inline it a second time as a bare image.
        return svg === null ? null : { type: 'html', value: renderBlock(svg, image.alt ?? '') };
      }
      if (isImage(node)) {
        // An image flowing inside text stays inline: no figure, the alt
        // still surfaces as the svg <title> tooltip + aria-label.
        const svg = inlineSvg(node);
        return svg === null ? null : { type: 'html', value: svg };
      }
      return undefined;
    });
  };
}
