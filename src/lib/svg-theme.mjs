/** Theme rules travel with compiled SVGs: the site toggle wins over the OS,
 * standalone images follow the OS, and print keeps the light palette. */
import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { withSvgClass } from './svg-markup.mjs';

function themeScope(svg) {
  return `teaman-svg-${createHash('sha256').update(svg).digest('hex').slice(0, 16)}`;
}

// These are flat, compiler-generated paint rules, never arbitrary author CSS.
function darkRules(scope, rules) {
  const scopedSelectors = (root, selectors) => selectors.split(',').flatMap(selector => {
    const target = selector.trim();
    return target ? [`${root} ${target}`, `${root}:is(${target})`] : [root];
  }).join(',');
  const prefix = condition => rules.replace(/([^{}]+)\{([^{}]*)\}/g, (_, selectors, declarations) =>
    `${scopedSelectors(`${condition} .${scope}`, selectors)}{${declarations}}`,
  );
  const standalone = rules.replace(/([^{}]*)\{([^{}]*)\}/g, (_, selectors, declarations) =>
    `${scopedSelectors(`svg.${scope}:root:not([data-theme])`, selectors)}{${declarations}}`,
  );
  return `@media screen{${prefix(':root[data-theme="dark"]')}}` +
    `@media screen and (prefers-color-scheme:dark){${prefix(':root:not([data-theme])')}${standalone}}`;
}

/** D2 supplies coordinated light/dark palettes as flat rules in a media query.
 * Re-scope that query to support the explicit site toggle as well. */
export function themeD2Svg(svg) {
  const scope = themeScope(svg);
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
