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

// `>` must be escaped too: a literal `>` inside an injected attribute value
// would end every later `<svg[^>]*>` opening-tag match early.
const escapeAttr = (value) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

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
  const start = source.search(/<svg[\s>]/i);
  if (start === -1) return null;
  let svg = source.slice(start).trim();
  svg = svg.replace(/<svg\b[^>]*>/i, (tag) => {
    let out = /\bclass\s*=\s*"/i.test(tag)
      ? tag.replace(/\bclass\s*=\s*"([^"]*)"/i, (_, cls) => `class="${cls} content-svg"`)
      : tag.replace(/<svg/i, '<svg class="content-svg"');
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

    const walk = (node) => {
      if (!node || !Array.isArray(node.children)) return;
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === 'paragraph' && child.children.length === 1 && isImage(child.children[0])) {
          const image = child.children[0];
          const svg = inlineSvg(image);
          if (svg !== null) {
            node.children[i] = { type: 'html', value: renderBlock(svg, image.alt ?? '') };
          }
        } else if (isImage(child)) {
          // An image flowing inside text stays inline: no figure, the alt
          // still surfaces as the svg <title> tooltip + aria-label.
          const svg = inlineSvg(child);
          if (svg !== null) node.children[i] = { type: 'html', value: svg };
        } else {
          walk(child);
        }
      }
    };
    walk(tree);
  };
}
