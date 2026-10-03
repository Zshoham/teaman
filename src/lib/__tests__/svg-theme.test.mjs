import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { themeAdaptSvg, themeD2Svg } from '../svg-theme.mjs';

function adapt(contents) {
  const source = `<svg xmlns="http://www.w3.org/2000/svg">${contents}</svg>`;
  const svg = themeAdaptSvg(source);
  const document = new JSDOM(svg, { contentType: 'image/svg+xml' }).window.document;
  return { svg, document };
}

describe('themeAdaptSvg', () => {
  it('adapts default ink and embeds theme rules with a standalone fallback', () => {
    const { svg, document } = adapt('<g stroke="#000" fill="black"><text>label</text></g>');
    expect(document.querySelector('g').getAttribute('stroke')).toBe('currentColor');
    expect(document.querySelector('g').getAttribute('fill')).toBe('currentColor');
    expect(document.documentElement.getAttribute('style')).toContain('fill:currentColor');
    expect(svg).toContain('prefers-color-scheme:dark');
    expect(svg).toContain('@media print');
  });

  it('keeps the light palette and mirrors colored paint lightness for dark mode', () => {
    const { svg, document } = adapt('<rect fill="#e1bee7" stroke="white"/><path style="fill:rgb(255, 205, 210);stroke: black"/>');
    expect(document.querySelector('rect').getAttribute('fill')).toBe('#e1bee7');
    expect(document.querySelector('path').getAttribute('style')).toContain('stroke:currentColor');
    expect(svg).toContain('fill:#3b1841 !important');
    expect(svg).toContain('fill:#320005 !important');
    expect(svg).toContain('stroke:var(--bg, #181818) !important');
    expect(svg).toContain(':root[data-theme="dark"]');
    expect(svg).toContain(':root:not([data-theme])');
  });

  it('preserves alpha, gradients, tokens, and semantic SVG paints', () => {
    const { svg, document } = adapt('<rect fill="rgba(200,200,200,0.5)"/><path fill="url(#gradient)" stroke="var(--primary)"/><path fill="none" stroke="transparent"/><linearGradient id="gradient"><stop stop-color="#eee"/></linearGradient>');
    expect(svg).toContain('fill:rgba(55,55,55,0.5) !important');
    expect(svg).toContain('stop-color:#111111 !important');
    expect(document.querySelector('path').getAttribute('fill')).toBe('url(#gradient)');
    expect(document.querySelector('path').hasAttribute('class')).toBe(false);
    expect(document.querySelectorAll('path')[1].hasAttribute('class')).toBe(false);
  });

  it('preserves mask luminance and clipping paints, including implicit mask fill', () => {
    const { document } = adapt('<defs><mask id="m"><rect fill="white"/><path fill="black"/><path/></mask><clipPath id="c"><path fill="#fff"/></clipPath></defs>');
    expect(document.querySelector('mask').getAttribute('fill')).toBe('black');
    expect(document.querySelector('mask rect').getAttribute('fill')).toBe('white');
    expect(document.querySelector('mask path').getAttribute('fill')).toBe('black');
    expect(document.querySelectorAll('defs [class]').length).toBe(0);
  });

  it('respects inline paint precedence and a mask’s inherited author paint', () => {
    const { document } = adapt('<g fill="white"><mask id="m"><path/></mask></g><rect fill="red" style="fill:blue"/>');
    expect(document.querySelector('mask').getAttribute('fill')).toBe('white');
    expect(document.querySelector('rect').classList.length).toBe(1);
  });

  it('preserves Typst’s intentional unfilled root', () => {
    const svg = themeAdaptSvg('<svg xmlns="http://www.w3.org/2000/svg" class="typst-doc"><style>svg{fill:none}</style><path stroke="#000"/></svg>');
    const document = new JSDOM(svg, { contentType: 'image/svg+xml' }).window.document;
    expect(document.documentElement.style.fill).toBe('');
  });

  it('scopes palettes deterministically so different diagrams cannot recolor each other', () => {
    const a = adapt('<rect fill="red"/>');
    const b = adapt('<rect fill="blue"/>');
    expect(a.document.documentElement.getAttribute('class')).not.toBe(b.document.documentElement.getAttribute('class'));
    expect(a.svg).toBe(adapt('<rect fill="red"/>').svg);
  });

  it('keeps inherited author colors on text and does not rewrite text content', () => {
    const { document } = adapt('<g fill="#336699"><text>fill:black</text></g>');
    expect(document.querySelector('text').hasAttribute('fill')).toBe(false);
    expect(document.querySelector('text').textContent).toBe('fill:black');
  });
});

describe('themeD2Svg', () => {
  it('connects the compiler dark palette to the site toggle and scopes all selectors', () => {
    const svg = themeD2Svg('<svg><svg class="d2-1"><style>.d2-1 .fill-N1{fill:#000;}@media screen and (prefers-color-scheme:dark){.d2-1 .fill-N1{fill:#eee;}.md,.appendix{color:white;}}</style></svg></svg>');
    expect(svg).toContain('.d2-1 .fill-N1{fill:#000;}');
    expect(svg).toContain(':root[data-theme="dark"] .teaman-svg-');
    expect(svg).toContain(':root:not([data-theme]) .teaman-svg-');
    expect(svg).toContain(':root:not([data-theme]) .md');
    expect(svg).not.toContain('}.md,.appendix{');
  });
});
