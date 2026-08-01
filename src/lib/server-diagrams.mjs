/**
 * Server-side SVG renderers for the diagram languages that the HTML site
 * renders in the browser. Reference PDFs cannot run that browser pass, so the
 * PDF build uses the same engines against a small jsdom surface and embeds the
 * resulting SVG bytes directly into Typst.
 */
import { createHash } from 'crypto';

const RENDER_TIMEOUT_MS = 30_000;

let domWindow;
let mermaidChain = Promise.resolve();
let plantumlChain = Promise.resolve();

function fontSize(font) {
  const match = /([0-9]+(?:\.[0-9]+)?)px/i.exec(String(font ?? ''));
  return match ? Number(match[1]) : 14;
}

// jsdom intentionally does not perform layout. Mermaid and PlantUML only need
// text measurements to lay out their SVGs, so provide deterministic estimates
// instead of pulling a native canvas implementation into the npm package.
function measureText(value, font = '14px sans-serif') {
  const size = fontSize(font);
  let units = 0;
  for (const character of String(value ?? '')) {
    if (/\s/.test(character)) units += 0.34;
    else if (/[ilI1|.,'`]/.test(character)) units += 0.3;
    else if (/[MW@#%&]/.test(character)) units += 0.9;
    else if (character.codePointAt(0) > 0xff) units += 1;
    else units += 0.58;
  }
  return {
    width: Math.max(1, units * size),
    actualBoundingBoxAscent: size * 0.78,
    actualBoundingBoxDescent: size * 0.22,
  };
}

function numberAttribute(element, name, fallback = 0) {
  const value = Number.parseFloat(element.getAttribute?.(name));
  return Number.isFinite(value) ? value : fallback;
}

function coordinateBox(values) {
  const coordinates = String(values ?? '').match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/gi)
    ?.map(Number)
    .filter(Number.isFinite) ?? [];
  if (coordinates.length < 2) return null;
  const x = [];
  const y = [];
  for (let index = 0; index + 1 < coordinates.length; index += 2) {
    x.push(coordinates[index]);
    y.push(coordinates[index + 1]);
  }
  return {
    x: Math.min(...x),
    y: Math.min(...y),
    width: Math.max(1, Math.max(...x) - Math.min(...x)),
    height: Math.max(1, Math.max(...y) - Math.min(...y)),
  };
}

function translatedBox(box, transform) {
  if (!transform) return box;
  const translate = /translate\(\s*([-+\d.e]+)(?:[ ,]+([-+\d.e]+))?\s*\)/i.exec(transform);
  if (!translate) return box;
  return {
    ...box,
    x: box.x + Number(translate[1]),
    y: box.y + Number(translate[2] ?? 0),
  };
}

function unionBoxes(boxes) {
  const present = boxes.filter(box => box && Number.isFinite(box.width) && Number.isFinite(box.height));
  if (present.length === 0) return null;
  const left = Math.min(...present.map(box => box.x));
  const top = Math.min(...present.map(box => box.y));
  const right = Math.max(...present.map(box => box.x + box.width));
  const bottom = Math.max(...present.map(box => box.y + box.height));
  return { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

function svgBoundingBox(element) {
  const tag = element.tagName?.toLowerCase();
  if (tag === 'text' || tag === 'tspan') {
    const size = fontSize(element.getAttribute?.('font-size'));
    const measured = measureText(element.textContent, `${size}px sans-serif`);
    return {
      x: numberAttribute(element, 'x'),
      y: numberAttribute(element, 'y') - measured.actualBoundingBoxAscent,
      width: measured.width,
      height: measured.actualBoundingBoxAscent + measured.actualBoundingBoxDescent,
    };
  }
  if (tag === 'rect' || tag === 'image' || tag === 'foreignobject') {
    return {
      x: numberAttribute(element, 'x'),
      y: numberAttribute(element, 'y'),
      width: numberAttribute(element, 'width'),
      height: numberAttribute(element, 'height'),
    };
  }
  if (tag === 'circle') {
    const radius = numberAttribute(element, 'r');
    return {
      x: numberAttribute(element, 'cx') - radius,
      y: numberAttribute(element, 'cy') - radius,
      width: radius * 2,
      height: radius * 2,
    };
  }
  if (tag === 'ellipse') {
    const radiusX = numberAttribute(element, 'rx');
    const radiusY = numberAttribute(element, 'ry');
    return {
      x: numberAttribute(element, 'cx') - radiusX,
      y: numberAttribute(element, 'cy') - radiusY,
      width: radiusX * 2,
      height: radiusY * 2,
    };
  }
  if (tag === 'line') {
    const x1 = numberAttribute(element, 'x1');
    const x2 = numberAttribute(element, 'x2');
    const y1 = numberAttribute(element, 'y1');
    const y2 = numberAttribute(element, 'y2');
    return {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      width: Math.max(1, Math.abs(x2 - x1)),
      height: Math.max(1, Math.abs(y2 - y1)),
    };
  }
  if (tag === 'polygon' || tag === 'polyline') {
    return coordinateBox(element.getAttribute?.('points')) ?? { x: 0, y: 0, width: 1, height: 1 };
  }
  if (tag === 'path') {
    // Exact Bézier extrema are unnecessary for Mermaid's final viewport: its
    // generated paths already include every endpoint/control point. Including
    // all coordinate pairs gives a conservative box and prevents clipping.
    return coordinateBox(element.getAttribute?.('d')) ?? { x: 0, y: 0, width: 1, height: 1 };
  }

  const children = Array.from(element.children ?? [])
    .filter(child => !['defs', 'style', 'marker'].includes(child.tagName?.toLowerCase()))
    .map(child => translatedBox(svgBoundingBox(child), child.getAttribute?.('transform')));
  const childBox = unionBoxes(children);
  if (childBox) return childBox;

  const size = fontSize(element.getAttribute?.('font-size'));
  const measured = measureText(element.textContent, `${size}px sans-serif`);
  return { x: 0, y: 0, width: measured.width, height: size * 1.2 };
}

async function ensureDiagramDom() {
  if (domWindow) return domWindow;

  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost/',
  });
  const window = dom.window;

  const globals = {
    window,
    document: window.document,
    location: window.location,
    DOMParser: window.DOMParser,
    HTMLElement: window.HTMLElement,
    SVGElement: window.SVGElement,
    Element: window.Element,
    Node: window.Node,
    CSSStyleSheet: window.CSSStyleSheet,
    XMLSerializer: window.XMLSerializer,
    ShadowRoot: window.ShadowRoot,
    HTMLIFrameElement: window.HTMLIFrameElement,
    CSS: window.CSS,
  };
  for (const [name, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value,
    });
  }

  window.HTMLCanvasElement.prototype.getContext = function getContext(kind) {
    if (kind !== '2d') return null;
    let font = '14px sans-serif';
    return {
      get font() { return font; },
      set font(value) { font = String(value); },
      measureText: value => measureText(value, font),
    };
  };
  window.SVGElement.prototype.getBBox = function getBBox() {
    return svgBoundingBox(this);
  };
  window.SVGElement.prototype.getComputedTextLength = function getComputedTextLength() {
    return measureText(this.textContent, this.getAttribute?.('font-size')).width;
  };

  domWindow = window;
  return window;
}

function serializeRender(work, chainName) {
  const chain = chainName === 'mermaid' ? mermaidChain : plantumlChain;
  const run = chain.then(work, work);
  if (chainName === 'mermaid') mermaidChain = run.catch(() => {});
  else plantumlChain = run.catch(() => {});
  return run;
}

/** Render a Mermaid definition to a light, print-friendly SVG. */
export function renderMermaidSvg(source) {
  return serializeRender(async () => {
    await ensureDiagramDom();
    const { default: mermaid } = await import('mermaid');
    mermaid.initialize({
      startOnLoad: false,
      theme: 'neutral',
      securityLevel: 'strict',
      suppressErrorRendering: true,
      fontFamily: 'sans-serif',
      htmlLabels: false,
      flowchart: { htmlLabels: false },
    });
    const id = `teaman-${createHash('sha256').update(source).digest('hex').slice(0, 12)}`;
    const { svg } = await mermaid.render(id, source);
    if (!svg) throw new Error('Mermaid produced an empty SVG');
    return svg;
  }, 'mermaid');
}

/** Render a PlantUML definition to a light, print-friendly SVG. */
export function renderPlantumlSvg(source) {
  return serializeRender(async () => {
    await ensureDiagramDom();
    await import('@plantuml/core/viz-global.js');
    const { renderToString } = await import('@plantuml/core');

    // The TeaVM build emits verbose timing logs for every render. Keep build
    // output focused while still allowing warnings and errors through.
    const originalLog = console.log;
    console.log = () => {};
    try {
      return await new Promise((resolve, reject) => {
        let settled = false;
        const finish = callback => value => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          callback(value);
        };
        const timer = setTimeout(
          finish(() => reject(new Error('PlantUML render timed out'))),
          RENDER_TIMEOUT_MS,
        );
        try {
          renderToString(
            source.split(/\r\n|\r|\n/),
            finish(svg => svg ? resolve(svg) : reject(new Error('PlantUML produced an empty SVG'))),
            finish(message => reject(new Error(String(message ?? 'PlantUML render failed')))),
            { dark: false },
          );
        } catch (error) {
          finish(reject)(error);
        }
      });
    } finally {
      console.log = originalLog;
    }
  }, 'plantuml');
}
