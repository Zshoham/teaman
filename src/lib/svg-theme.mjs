/** Theme rules travel with compiled SVGs: the site toggle wins over the OS,
 * standalone images follow the OS, and print keeps the light palette. */
import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { withSvgClass } from './svg-markup.mjs';

function themeScope(svg) {
  return `teaman-svg-${createHash('sha256').update(svg).digest('hex').slice(0, 16)}`;
}

const scopedSelectors = (root, selectors) => selectors.split(',').flatMap(selector => {
  const target = selector.trim();
  return target ? [`${root} ${target}`, `${root}:is(${target})`] : [root];
}).join(',');

// These are flat, compiler-generated paint rules, never arbitrary author CSS.
function darkRules(scope, rules) {
  const prefix = condition => rules.replace(/([^{}]+)\{([^{}]*)\}/g, (_, selectors, declarations) =>
    `${scopedSelectors(`${condition} .${scope}`, selectors)}{${declarations}}`,
  );
  const standalone = rules.replace(/([^{}]*)\{([^{}]*)\}/g, (_, selectors, declarations) =>
    `${scopedSelectors(`svg.${scope}:root:not([data-theme])`, selectors)}{${declarations}}`,
  );
  return `@media screen{${prefix(':root[data-theme="dark"]')}}` +
    `@media screen and (prefers-color-scheme:dark){${prefix(':root:not([data-theme])')}${standalone}}`;
}

// D2's default theme (0), color by color, in terms of the page: ink is the
// inherited text colour, fills are that ink mixed into the page background
// (opaque, so a shape inside a container stays lighter than the container),
// and the theme's one accent is the site's.
const pageMix = percent => `color-mix(in oklab,currentColor ${percent}%,var(--background,#FFFFFF))`;
const PAGE_PALETTE = new Map([
  ['#0A0F25', 'currentColor'],                                   // N1 · text
  ['#676C7E', 'color-mix(in oklab,currentColor 70%,transparent)'], // N2 · secondary text
  ['#9499AB', 'color-mix(in oklab,currentColor 50%,transparent)'], // N3
  ['#CFD2DD', pageMix(22)],                                      // N4
  ['#DEE1EB', pageMix(15)],                                      // N5
  ['#EEF1F8', pageMix(8)],                                       // N6
  ['#FFFFFF', 'var(--background,#FFFFFF)'],                      // N7 · label backdrops
  ['#0D32B2', 'currentColor'],                                   // B1, B2 · strokes, arrows
  ['#E3E9FD', pageMix(10)],                                      // B3, B4 · containers
  ['#EDF0FD', pageMix(6)],                                       // B5, AA4, AB4
  ['#F7F8FE', pageMix(3)],                                       // B6, AA5, AB5 · shapes
  ['#4A6FF3', 'var(--primary,#4A6FF3)'],                         // AA2 · accent
]);

/** Re-ink a default-theme D2 render from the page (see render-d2.mjs): drop
 * the canvas rect so the diagram sits on the page like TikZ and Typst do, and
 * restate every palette rule in page colours. The restatement is screen-only:
 * Typst's SVG reader (the reference PDF) knows neither `color-mix()` nor
 * custom properties and keeps D2's literal light palette, as print does. A
 * standalone copy (a Confluence attachment) follows the OS like the others. */
function pagePaletteSvg(svg, scope) {
  const withoutCanvas = svg.replace(/<rect\b(?=[^>]*\bclass="\s*fill-N7")(?=[^>]*\bstroke-width="0")[^>]*>/, '');
  const rules = [];
  for (const [, css] of withoutCanvas.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)) {
    for (const [, selectors, declarations] of css.matchAll(/([^{}]+)\{([^{}]*#[0-9a-f]{6}[^{}]*)\}/gi)) {
      const page = declarations.replace(/#[0-9a-f]{6}\b/gi, hex => PAGE_PALETTE.get(hex.toUpperCase()) ?? hex);
      rules.push(`${scopedSelectors(`.${scope}`, selectors)}{${page}}`);
    }
  }
  const style = `<style>@media screen{${rules.join('')}}` +
    `svg.${scope}:root{color:#0A0F25;}` +
    `@media screen and (prefers-color-scheme:dark){svg.${scope}:root{color:#eee;--background:#181818;}}</style>`;
  return withoutCanvas.replace(/<\/svg>\s*$/, `${style}</svg>`);
}

/** D2 supplies coordinated light/dark palettes as flat rules in a media query.
 * Re-scope that query to support the explicit site toggle as well. A diagram
 * that chose no palette is re-inked from the page instead. */
export function themeD2Svg(svg) {
  const scope = themeScope(svg);
  if (/^\s*<svg\b[^>]*\sdata-teaman-palette="page"/.test(svg)) {
    return withSvgClass(pagePaletteSvg(svg, scope), [scope]);
  }
  const themed = svg.replace(
    /@media screen and \(prefers-color-scheme:\s*dark\)\{((?:[^{}]|\{[^{}]*\})*)\}/g,
    (_, rules) => darkRules(scope, rules),
  );
  return withSvgClass(themed, [scope]);
}

let window;
function svgWindow() {
  return window ??= new JSDOM('').window;
}

// The compilers emit sRGB paints. Resolve named/rgb/hex forms through the CSS
// parser, then mirror HSL lightness while keeping hue, saturation and alpha.
// Unlike replacing black alone, this also darkens pale panels behind labels.
function darkPaint(value) {
  if (/^(?:none|transparent|currentcolor|inherit|initial|unset|revert|context-fill|context-stroke)$/i.test(value) || /(?:var|url)\(/i.test(value)) return null;
  const dom = svgWindow();
  const probe = dom.document.createElement('span');
  probe.style.color = value;
  if (!probe.style.color) return null;
  dom.document.body.append(probe);
  const resolved = dom.getComputedStyle(probe).color;
  probe.remove();
  const match = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(resolved);
  if (!match) return null;
  const rgb = match.slice(1, 4).map(Number);
  if (match[4] && Number(match[4]) !== 1) {
    const shift = 255 - Math.max(...rgb) - Math.min(...rgb);
    return `rgba(${rgb.map(channel => channel + shift).join(',')},${match[4]})`;
  }
  if (rgb.every(channel => channel === 0)) return 'currentColor';
  if (rgb.every(channel => channel === 255)) return 'var(--bg, #181818)';
  const shift = 255 - Math.max(...rgb) - Math.min(...rgb);
  return `#${rgb.map(channel => (channel + shift).toString(16).padStart(2, '0')).join('')}`;
}

/** Adapt typeset diagrams without changing geometry, masks, or light colors.
 * Literal paints remain usable by PDF/SVG consumers that do not implement CSS
 * media queries. Only default black ink uses the page's inherited foreground. */
export function themeAdaptSvg(svg) {
  const dom = svgWindow();
  const doc = new dom.DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;
  if (root.localName !== 'svg') return svg;
  const scope = themeScope(svg);
  root.classList.add(scope);
  for (const mask of root.querySelectorAll('mask')) {
    // Freeze inherited mask paint before replacing the ancestors' black ink.
    // Masks otherwise inherit currentColor too, changing what they reveal.
    for (const property of ['fill', 'stroke']) {
      if (mask.hasAttribute(property) || mask.style?.getPropertyValue(property)) continue;
      let inherited;
      for (let parent = mask.parentElement; parent && !inherited; parent = parent.parentElement) {
        inherited = parent.style?.getPropertyValue(property) || parent.getAttribute(property);
      }
      mask.setAttribute(property, inherited || (property === 'fill' ? 'black' : 'none'));
    }
  }
  const palette = new Map();
  const rules = [];
  const properties = ['fill', 'stroke', 'stop-color', 'flood-color'];

  for (const element of [root, ...root.querySelectorAll('*')]) {
    // Mask luminance and clipping geometry must never change with appearance.
    if (element.closest('mask, clipPath')) continue;
    const adapt = (property, paint) => {
      const value = paint.trim();
      if (!palette.has(value)) palette.set(value, darkPaint(value));
      const dark = palette.get(value);
      if (!dark) return paint;
      if (dark === 'currentColor') return 'currentColor';
      const name = `teaman-${property}-${Array.from(palette.keys()).indexOf(value)}`;
      element.classList.add(name);
      const rule = `.${name}{${property}:${dark} !important;}`;
      if (!rules.includes(rule)) rules.push(rule);
      return paint;
    };
    for (const property of properties) {
      if (element.hasAttribute(property) && !element.style?.getPropertyValue(property)) {
        element.setAttribute(property, adapt(property, element.getAttribute(property)));
      }
    }
    const style = element.getAttribute('style');
    if (style) element.setAttribute('style', style.replace(
      /(^|;)\s*(fill|stroke|stop-color|flood-color)\s*:\s*([^;!]+)(\s*!important)?/gi,
      (_, start, property, value, important = '') => `${start}${property}:${adapt(property.toLowerCase(), value)}${important}`,
    ));
  }

  // SVG's implicit fill is black. Put its replacement inside the artifact so
  // TikZ labels inherit it, including labels inside explicitly colored groups.
  // Typst explicitly declares `svg { fill: none }` in its compiler stylesheet.
  if (!root.classList.contains('typst-doc') && !root.hasAttribute('fill') && !root.style?.fill) {
    root.setAttribute('style', `${root.getAttribute('style') ?? ''};fill:currentColor`.replace(/^;/, ''));
  }
  const style = doc.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = `@media screen and (prefers-color-scheme:dark){svg.${scope}:root{color:#eee;}}` +
    `@media print{svg.${scope}{color:#000;}}` + darkRules(scope, rules.join(''));
  root.append(style);
  return new dom.XMLSerializer().serializeToString(root);
}
